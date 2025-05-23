/* eslint-disable no-async-promise-executor */

import { join, normalize } from 'node:path'
import glob from 'multimatch'
import { Tagged } from 'type-fest'
import type { ConfigurationScope } from 'vscode'
import {
  ConfigurationChangeEvent,
  ConfigurationTarget,
  Disposable,
  LogOutputChannel,
  QuickPickItem,
  Selection,
  StatusBarAlignment,
  StatusBarItem,
  TextDocument,
  TextEditorSelectionChangeEvent,
  Uri,
  WorkspaceConfiguration,
  commands,
  extensions,
  window,
  workspace,
} from 'vscode'
import { MatchRule, RegExpRule, StringRule, type TConfigurationTarget } from './configuration'
import { setCopilotConfigState } from './copilot'
import { HScopesAPI } from './hscopes'
import { areRulesEquivalent, convertOldRuleFormat, createPredicateFromRule, isOldRuleFormat } from './rule'

type GlobPattern = Tagged<string, 'GlobPattern'>
type ExcludedPath = Tagged<string, 'ExcludedPath'>

type ManagerCache = {
  excludedGlobs: Map<ExcludedPath, boolean>
  excludedScopes: Map<string, boolean>
  textMateRules: Array<(input: string) => boolean>
  contentRules: Array<(document: TextDocument, selection: Selection) => boolean>
}

interface IManager {
  hscopes: HScopesAPI
}

export class Manager {
  public static get configuration() {
    const cfg = workspace.getConfiguration(Manager.extensionId)
    return {
      debug: cfg.get(`debug`, false) as boolean | undefined,
      active: cfg.get(`active`, true) as boolean,
      configurationTarget: cfg.get('configurationTarget', 'Global') as TConfigurationTarget,
      eventProcessingThrottleDelayMs: cfg.get(`eventProcessingThrottleDelayMs`, 500),
      globPatterns: cfg.get(`globPatterns`),
      contentRules: cfg.get(`contentRules`),
      textMateRules: cfg.get(`textMateRules`, [
        {
          type: 'string',
          value: 'comment',
          mode: 'includes',
        },
        {
          type: 'string',
          value: 'punctuation.definition',
          mode: 'includes',
        },
      ]) as MatchRule[],
    }
  }

  public static readonly extensionId = `disable-copilot-comment-completions` as const

  private static _hscopes?: HScopesAPI
  private static _instance?: Manager

  public static async convertOldConfiguration() {
    const typedConfig = workspace.getConfiguration(`disable-copilot-comment-completions`)
    const untypedConfig = typedConfig as WorkspaceConfiguration
    const inhibitMatchers = untypedConfig.get(`inhibitMatchers`)
    if (inhibitMatchers === undefined) return

    const promises = [untypedConfig.update(`inhibitMatchers`, undefined, true)]

    if (Array.isArray(inhibitMatchers)) {
      const textMateRules = inhibitMatchers.reduce((acc: Array<MatchRule>, value) => {
        if (isOldRuleFormat(value)) {
          acc.push(convertOldRuleFormat(value))
        }
        return acc
      }, [])

      if (textMateRules.length > 0) {
        const newRules = [...Manager.configuration.textMateRules, ...textMateRules].reduce(
          (acc: MatchRule[], rule, index, array) => {
            const otherRules = array.slice(index + 1)
            if (!otherRules.some((otherRule) => areRulesEquivalent(rule, otherRule))) {
              acc.push(rule)
            }

            return acc
          },
          []
        )

        promises.push(typedConfig.update(`textMateRules`, newRules, true))
      }
    }

    return await Promise.all(promises)
  }

  public static async getInstance(): Promise<Manager> {
    // eslint-disable-next-line no-async-promise-executor
    // biome-ignore lint/suspicious/noAsyncPromiseExecutor: <explanation>
    return (Manager._instance ??= await new Promise<Manager>(async (resolve) => {
      const hscopes = await Manager.getHScopes()

      return resolve(
        new Manager({
          hscopes,
        })
      )
    }))
  }

  private createLogger = (fnName: string) => {
    return (...args: any[]) => this.logMessage(fnName, ...args)
  }

  private static async getHScopes(): Promise<HScopesAPI> {
    return (Manager._hscopes ??= await new Promise<HScopesAPI>((resolve, reject) => {
      const extension = extensions.getExtension<HScopesAPI>(`draivin.hscopes`)
      if (!extension) {
        const errorMessage = `Required Dependency 'draivin.hscopes' is not installed. Please install it from the VSCode Extensions Marketplace and reload the window.`
        return window.showErrorMessage(errorMessage).then(() => reject(errorMessage))
      }

      return extension.activate().then(
        (api) => resolve(api),
        (err) => window.showErrorMessage(`Error loading 'draivin.hscopes': ${err}`).then(() => reject(err))
      )
    }))
  }

  private constructor(opts: IManager) {
    this.hscopes = opts.hscopes
    this.statusBarItem = this.createStatusBarItem()
    this.outputChannel = window.createOutputChannel(`Silence Github Copilot Suggestions`, { log: true })
    this.disposable = Disposable.from(...this.bindEvents(), this.statusBarItem, this.outputChannel)
    this.resetCache()
  }

  private readonly hscopes: HScopesAPI
  private readonly outputChannel: LogOutputChannel
  private readonly statusBarItem: StatusBarItem

  private cache!: ManagerCache
  private isExtensionDisablingCopilot = false

  public disposable: Disposable

  public get configuration() {
    return Manager.configuration
  }

  private get extensionId() {
    return Manager.extensionId
  }

  private get textMateRules() {
    return this.cache.textMateRules
  }

  /**
   * Binds extension event handlers to events, e.g. registers commands, etc.
   */
  private bindEvents() {
    let prevSelectionFnCallTimestamp = 0

    return [
      commands.registerCommand(`${this.extensionId}.addScopes`, this.onAddScopesCommand, this),
      workspace.onDidChangeConfiguration(this.onDidChangeConfiguration, this),
      /* window.onDidChangeActiveTextEditor((event) => {
        if (!event) {
          this.logMessage(`window.onDidChangeActiveTextEditor`, `Moved to no text editor.`)
          return
        }

        const { document, options, selection } = event
        const selectionText = document.getText(selection)
        const activeLine = document.lineAt(selection.active)
        this.logMessage(`window.onDidChangeActiveTextEditor`, `Selection Text: ${selectionText}`)
        this.logMessage(`window.onDidChangeActiveTextEditor`, `Line Number: ${activeLine.lineNumber}`)
        this.logMessage(`window.onDidChangeActiveTextEditor`, `Line Text: ${activeLine.text}`)
      }, this),
      workspace.onDidChangeTextDocument((event) => {
        if (event.document.uri.scheme === 'output') {
          return
        }

        this.logMessage(`workspace.onDidChangeTextDocument`, event)
      }, this), */
      window.onDidChangeTextEditorSelection((event) => {
        const delayMs = this.configuration.eventProcessingThrottleDelayMs
        const now = Date.now()
        if (typeof delayMs !== 'number' || delayMs <= 0 || now - prevSelectionFnCallTimestamp >= delayMs) {
          return this.onDidChangeTextEditorSelection(event)
        }
      }, this),
    ]
  }

  /**
   * Utility Function that tags a {@link Uri.fsPath URI's `fsPath`} property as the Tagged
   * {@link ExcludedPath} type.
   *
   * @param {Uri} uri - The URI to extract the `fsPath` from.
   * @return {ExcludedPath}
   */
  private createExcludedPath(uri: Uri): ExcludedPath {
    return uri.fsPath as ExcludedPath
  }

  /**
   * Utility Function that creates a {@link GlobPattern} from a Glob String and the {@link Uri URI}
   * it is relative to.
   *
   * @param {string} matcher - The Glob Matcher to create the Glob Pattern with.
   * @param {Uri} relativeToURI - The URI to make the `matcher` relative to.
   * @return {GlobPattern} A string that is safe to use as a Glob Pattern input.
   */
  private createGlobPattern(matcher: string, relativeToURI: Uri): GlobPattern {
    const workspaceFolder = workspace.getWorkspaceFolder(relativeToURI)
    if (!workspaceFolder?.uri.fsPath) {
      return normalize(matcher).replace(/\\/g, '/') as GlobPattern
    }

    return normalize(join(workspaceFolder.uri.fsPath, matcher)).replace(/\\/g, '/') as GlobPattern
  }

  private createStatusBarItem() {
    const statusBarItem = window.createStatusBarItem(`${this.extensionId}.statusBarItem`, StatusBarAlignment.Right)
    statusBarItem.name = `GH Copilot Suggestions`
    statusBarItem.tooltip = `GH Copilot Suggestions Enabled`
    statusBarItem.text = `$(check) Suggestions Enabled`
    statusBarItem.show()
    return statusBarItem
  }

  /**
   * Given a {@link TextDocument `TextDocument`} and a {@link Selection `Selection`}, checks if
   * the Selection is excluded due to any ContentRules matching against it.
   *
   * @param {TextDocument} document - The TextDocument that contains the Selection.
   * @param {Selection} selection - The Selection to check for excluded TextMate Scopes.
   * @return {boolean} Whether or not Inline Suggestions should be disabled
   */
  private isSelectionContentExcluded(document: TextDocument, selection: Selection): boolean {
    return this.cache.contentRules.some((rule) => rule(document, selection))
  }

  /**
   * Given a {@link TextDocument `TextDocument`} and a {@link Selection `Selection`}, checks if
   * the Selection contains any excluded TextMate Scopes at the active position.
   *
   * @param {TextDocument} document - The TextDocument that contains the Selection.
   * @param {Selection} selection - The Selection to check for excluded TextMate Scopes.
   * @return {boolean} Whether or not Inline Suggestions should be disabled
   */
  private isSelectionScopeExcluded(document: TextDocument, selection: Selection): boolean {
    return (this.hscopes.getScopeAt(document, selection.active)?.scopes ?? []).some((scope) => {
      const cachedResult = this.cache.excludedScopes.get(scope)
      if (typeof cachedResult !== 'undefined') {
        return cachedResult
      }

      const result = this.textMateRules.some((rule) => rule(scope))
      this.cache.excludedScopes.set(scope, result)
      return result
    })
  }

  /**
   * Given a {@link Uri URI}, checks to see if any of the {@link this.configuration.globPatterns User Configured Glob Patterns}
   * exclude the Document based off the path of the URI itself.
   *
   * @param {Uri} uri - The URI to check for Glob Pattern exclusion
   * @return {boolean} Whether or not Inline Suggestions should be disabled if the active Document is the specified URI.
   */
  private isURIExcluded(uri: Uri): boolean {
    const { globPatterns } = this.configuration
    if (!globPatterns || !globPatterns.length) return false

    const excludedPath = this.createExcludedPath(uri)
    const cachedResult = this.cache.excludedGlobs.get(excludedPath)
    if (typeof cachedResult !== 'undefined') return cachedResult

    const result =
      glob(
        excludedPath,
        globPatterns.map((matcher) => this.createGlobPattern(matcher, uri))
      ).length > 0
    this.cache.excludedGlobs.set(excludedPath, result)

    return result
  }

  /**
   * Bound to the `disable-copilot-comment-completions.addScopes` command. Opens a QuickPick Menu
   * in the Editor to allow the User to add and/or remove TextMate Rules based on the Scopes at the current
   * caret position.
   */
  private async onAddScopesCommand() {
    const editor = window.activeTextEditor
    if (!editor)
      return await window.showErrorMessage(
        `The Editor must be open with an active Selection in order to display scopes that can be added.`
      )

    const { document, selection } = editor
    const caretScopes = [...new Set(this.hscopes.getScopeAt(document, selection.active)?.scopes ?? [])]
    if (!caretScopes.length) return await window.showErrorMessage(`No scopes found at the current selection.`)

    const { regexp, string } = this.configuration.textMateRules.reduce(
      (acc, rule) => {
        if (typeof rule === 'object' && 'type' in rule && rule.type === 'string') {
          acc.string.push(rule)
        } else {
          acc.regexp.push(rule)
        }
        return acc
      },
      {
        regexp: [] as RegExpRule[],
        string: [] as StringRule[],
      }
    )

    const stringRulesNotAtCaret = string.filter((item) => item.type === 'string' && !caretScopes.includes(item.value))
    const stringRulesAtCaret = string.filter((item) => item.type === 'string' && caretScopes.includes(item.value))
    const finalRules = [...regexp, ...stringRulesNotAtCaret]

    const quickPickItems = caretScopes.map(
      (scope): QuickPickItem => ({
        label: scope,
        picked: stringRulesAtCaret.some(({ value }) => value === scope),
      })
    )

    const selectedItems = await window.showQuickPick(quickPickItems, {
      canPickMany: true,
      placeHolder: `'comment.line.js', 'comment.block.js', ...`,
      title: `Select TextMate Scopes to Disable Copilot Suggestions within`,
    })

    if (!selectedItems) return

    selectedItems.forEach((item) => {
      finalRules.push({ type: 'string', value: item.label, mode: 'equals' })
    })

    return await workspace.getConfiguration(this.extensionId).update(`textMateRules`, finalRules)
  }

  /**
   * Bound to the {@link workspace.onDidChangeConfiguration `onDidChangeConfiguration`} event. Clears the
   * cached settings if the configuration change event affects the extension's settings.
   */
  private onDidChangeConfiguration(event: ConfigurationChangeEvent) {
    if (event.affectsConfiguration(this.extensionId)) {
      this.logMessage(`onDidChangeConfiguration`, `Configuration change detected, resetting cached exclusions`)
      this.resetCache()
    }
  }

  /**
   * Bounds to the {@link window.onDidChangeTextEditorSelection `onDidChangeTextEditorSelection`} event. Runs the
   * main logic of the Extension, namely checking to see whether or not the current caret position is in an area where
   * Inline Suggestions should be enabled or disabled, and updates Copilot's settings accordingly if needed.
   */
  private readonly onDidChangeTextEditorSelection = (event: TextEditorSelectionChangeEvent) => {
    const {
      textEditor: { document, selection },
    } = event

    // const selectionText = document.getText(selection)
    // const activeLine = document.lineAt(selection.active)

    // this.logMessage(`onDidChangeTextEditorSelection`, `Selection Text: ${selectionText}`)
    // this.logMessage(`onDidChangeTextEditorSelection`, `Line Number: ${activeLine.lineNumber}`)
    // this.logMessage(`onDidChangeTextEditorSelection`, `Line Text: ${activeLine.text}`)

    // If the Document itself is excluded, disable Copilot if necessary and return early.
    if (this.isURIExcluded(document.uri)) {
      this.logMessage(
        `onDidChangeTextEditorSelection`,
        `Copilot should be silenced, glob pattern exclusion rule found for URI: ${document.uri.fsPath}`
      )
      if (!this.isExtensionDisablingCopilot) {
        this.updateCopilotState(false, `Excluded URI`, document)
      }
      return
    }

    // If the main Selection of the Text Editor contains an excluded TextMate Scope, disable Copilot if necessary and return early.
    // If any of the Selections contain an Excluded TextMate Scope, disable Copilot if necessary and return early.
    if (this.isSelectionScopeExcluded(document, selection)) {
      this.logMessage(
        `onDidChangeTextEditorSelection`,
        `Copilot should be silenced, textmate exclusion rule found at cursor`
      )
      if (!this.isExtensionDisablingCopilot) {
        this.updateCopilotState(false, `Excluded Scope`, document)
      }
      return
    }

    if (this.isSelectionContentExcluded(document, selection)) {
      this.logMessage(
        `onDidChangeTextEditorSelection`,
        `Copilot should be silenced, content exclusion rule found at cursor`
      )
      if (!this.isExtensionDisablingCopilot) {
        this.updateCopilotState(false, `Excluded Content`, document)
      }
      return
    }

    this.logMessage(
      `onDidChangeTextEditorSelection`,
      `Copilot should not be silenced, no matching exclusion rules found`
    )

    // If we've made it this far, none of our exclusions matched, so we can
    // re-enable Copilot if necessary.
    if (this.isExtensionDisablingCopilot) {
      this.updateCopilotState(true, `No exclusions matched.`, document)
    }
  }

  private resetCache() {
    return (this.cache = {
      excludedGlobs: new Map(),
      excludedScopes: new Map(),
      textMateRules: this.configuration.textMateRules.map((rule) => createPredicateFromRule(rule)),
      contentRules: (this.configuration.contentRules ?? []).map((rule) => {
        const predicate = createPredicateFromRule(rule)
        return (document: TextDocument, selection: Selection) => {
          const startRange = document.lineAt(Math.max(selection.active.line - (rule.expandRangeByLines ?? 0), 0)).range
          const endRange = document.lineAt(
            Math.min(selection.active.line + (rule.expandRangeByLines ?? 0), document.lineCount - 1)
          ).range
          const range = startRange.union(endRange)
          const text = document.getText(range)
          return predicate(text)
        }
      }),
    })
  }

  /**
   * Utility Function that sets the VSCode Setting value of `github.copilot.editor.enableAutoCompletions` to
   * the specified state (and sets the `isExtensionDisablingCopilot` property accordingly).
   *
   * @param {boolean} state - The desired state of the `github.copilot.editor.enableAutoCompletions` setting.
   * @return {Promise<void>} A promise that resolves once the update has completed.
   */
  public async updateCopilotState(
    state: boolean,
    reason: string,
    scope: ConfigurationScope | undefined | null
  ): Promise<void> {
    const log = this.createLogger('updateCopilotState')
    log(`Setting Copilot Inline Suggestions to: ${state}, Reason: ${reason}`)

    this.statusBarItem.tooltip = state
      ? `GH Copilot Suggestions Enabled`
      : `GH Copilot Suggestions Disabled (reason: ${reason})`
    this.statusBarItem.text = state ? `$(check) Suggestions Enabled` : `$(x) Suggestions Disabled`

    let target: ConfigurationTarget | null = null
    switch (Manager.configuration.configurationTarget) {
      case 'Global':
        target = ConfigurationTarget.Global
        await log(`Using configuration target: Global`)
        break
      case 'Workspace':
        target = ConfigurationTarget.Workspace
        await log(`Using configuration target: Workspace`)
        break
      case 'WorkspaceFolder':
        target = ConfigurationTarget.WorkspaceFolder
        await log(`Using configuration target: WorkspaceFolder`)
        break
      default:
        await log(`Using configuration target: null`)
        target = null
    }

    // To set the copilot state, we now need to directly edit the value of:
    // - github.copilot.enable[<current language id>]: <boolean>

    log(`Adding 'setCopilotConfigState(state, { target, scope })' with state ${state} to call stack.`)
    const thenables = [
      // setCopilotSettings('github.copilot.inlineSuggest.enable', state, target),
      // setCopilotSettings('github.copilot.editor.enableAutoCompletions', state, target),
      setCopilotConfigState(state, { target, scope }),
    ]

    if (state === false) {
      log(`Adding 'commands.executeCommand("editor.action.inlineSuggest.hide")' to call stack`)
      thenables.push(commands.executeCommand(`editor.action.inlineSuggest.hide`))
    }

    await Promise.all(thenables)
    this.isExtensionDisablingCopilot = !state
  }

  private logMessage(fnName: string, ...args: any[]) {
    if (!this.configuration.debug) {
      return
    }

    const strings = args.map((s) => (typeof s === 'string' ? s : String(s)))
    const outputMsg = strings.length > 1 ? `\n\t${strings.join('\n\t')}` : strings[0]!
    this.outputChannel.appendLine(`[${fnName}]: ${outputMsg}`)
  }
}
