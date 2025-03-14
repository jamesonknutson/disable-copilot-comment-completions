import glob from 'multimatch'
import { join, normalize } from 'path'
import { Opaque } from 'type-fest'
import {
  ConfigurationChangeEvent,
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
import {
  areRulesEquivalent,
  convertOldRuleFormat,
  createPredicateFromRule,
  isOldRuleFormat,
} from './rule'
import { ContentRule, MatchRule, RegExpRule, StringRule } from './configuration'
import { HScopesAPI } from './hscopes'

type GlobPattern = Opaque<string, 'GlobPattern'>
type ExcludedPath = Opaque<string, 'ExcludedPath'>

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
  // #region Static Props & Accessors

  public static get configuration() {
    const cfg = workspace.getConfiguration(this.extensionId)
    return {
      debug: cfg.get(`debug`, false) as boolean | undefined,
      active: cfg.get(`active`, true) as boolean,
      eventProcessingThrottleDelayMs: cfg.get(
        `eventProcessingThrottleDelayMs`,
        500
      ),
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

  public static readonly extensionId =
    `disable-copilot-comment-completions` as const

  private static _hscopes?: HScopesAPI
  private static _instance?: Manager

  // #endregion Static Props & Accessors

  // #region Static Methods

  public static async convertOldConfiguration() {
    const typedConfig = workspace.getConfiguration(
      `disable-copilot-comment-completions`
    )
    const untypedConfig = typedConfig as WorkspaceConfiguration
    const inhibitMatchers = untypedConfig.get(`inhibitMatchers`)
    if (inhibitMatchers === undefined) return

    const promises = [ untypedConfig.update(`inhibitMatchers`, undefined, true) ]

    if (Array.isArray(inhibitMatchers)) {
      const textMateRules = inhibitMatchers.reduce(
        (acc: Array<MatchRule>, value) =>
          isOldRuleFormat(value) ? [ ...acc, convertOldRuleFormat(value) ] : acc,
        []
      )

      if (textMateRules.length > 0) {
        const newRules = [
          ...this.configuration.textMateRules,
          ...textMateRules,
        ].reduce((acc: MatchRule[], rule, index, array) => {
          const otherRules = array.slice(index + 1)
          return otherRules.some((otherRule) =>
            areRulesEquivalent(rule, otherRule)
          )
            ? acc
            : [ ...acc, rule ]
        }, [])

        promises.push(typedConfig.update(`textMateRules`, newRules, true))
      }
    }

    return await Promise.all(promises)
  }

  public static async getInstance(): Promise<Manager> {
    // eslint-disable-next-line no-async-promise-executor
    return (this._instance ??= await new Promise<Manager>(async (resolve) => {
      const hscopes = await Manager.getHScopes()

      return resolve(
        new Manager({
          hscopes,
        })
      )
    }))
  }

  /**
   * Utility function that sets the state of `github.copilot.inlineSuggest.enable` to the specified
   * boolean value.
   *
   * @param {boolean} state - The desired state of the `github.copilot.inlineSuggest.enable` setting.
   * @return {Promise<void>} A promise that resolves once the update has completed.
   */
  public static async setCopilotState(state: boolean): Promise<void> {
    return await workspace.getConfiguration(`github.copilot`).update(`inlineSuggest.enable`, state, true)
  }

  private static async getHScopes(): Promise<HScopesAPI> {
    return (this._hscopes ??= await new Promise<HScopesAPI>(
      (resolve, reject) => {
        const extension = extensions.getExtension<HScopesAPI>(`draivin.hscopes`)
        if (!extension) {
          const errorMessage = `Required Dependency 'draivin.hscopes' is not installed. Please install it from the VSCode Extensions Marketplace and reload the window.`
          return window
            .showErrorMessage(errorMessage)
            .then(() => reject(errorMessage))
        }

        return extension.activate().then(
          (api) => resolve(api),
          (err) =>
            window
              .showErrorMessage(`Error loading 'draivin.hscopes': ${err}`)
              .then(() => reject(err))
        )
      }
    ))
  }

  // #endregion Static Methods

  // #region Constructors

  private constructor(opts: IManager) {
    this.hscopes = opts.hscopes
    this.statusBarItem = this.createStatusBarItem()
    this.outputChannel = window.createOutputChannel(
      `Silence Github Copilot Suggestions`,
      { log: true }
    )
    this.disposable = Disposable.from(
      ...this.bindEvents(),
      this.statusBarItem,
      this.outputChannel
    )
    this.resetCache()
  }

  // #endregion Constructors

  // #region Instance Props & Accessors

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

  // #endregion Instance Props & Accessors

  // #region Instance Methods

  /**
   * Binds extension event handlers to events, e.g. registers commands, etc.
   */
  private bindEvents() {
    let prevSelectionFnCallTimestamp = 0
    return [
      commands.registerCommand(
        `${this.extensionId}.addScopes`,
        this.onAddScopesCommand,
        this
      ),
      workspace.onDidChangeConfiguration(this.onDidChangeConfiguration, this),
      window.onDidChangeTextEditorSelection((event) => {
        const delayMs = this.configuration.eventProcessingThrottleDelayMs
        const now = Date.now()
        if (delayMs === undefined || delayMs <= 0) {
          return this.onDidChangeTextEditorSelection(event)
        } else if (now - prevSelectionFnCallTimestamp >= delayMs) {
          prevSelectionFnCallTimestamp = now
          return this.onDidChangeTextEditorSelection(event)
        }
      }),
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

    return normalize(join(workspaceFolder.uri.fsPath, matcher)).replace(
      /\\/g,
      '/'
    ) as GlobPattern
  }

  private createStatusBarItem() {
    const statusBarItem = window.createStatusBarItem(
      `${this.extensionId}.statusBarItem`,
      StatusBarAlignment.Right
    )
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
  private isSelectionContentExcluded(
    document: TextDocument,
    selection: Selection
  ): boolean {
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
  private isSelectionScopeExcluded(
    document: TextDocument,
    selection: Selection
  ): boolean {
    return (
      this.hscopes.getScopeAt(document, selection.active)?.scopes ?? []
    ).some((scope) => {
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
        globPatterns.map((matcher: string) => this.createGlobPattern(matcher, uri))
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
    const caretScopes = [
      ...new Set(
        this.hscopes.getScopeAt(document, selection.active)?.scopes ?? []
      ),
    ]
    if (!caretScopes.length)
      return await window.showErrorMessage(
        `No scopes found at the current selection.`
      )

    const { regexp, string } = this.configuration.textMateRules.reduce(
      (acc, rule) => {
        if (
          typeof rule === 'object' &&
          'type' in rule &&
          rule.type === 'string'
        ) {
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

    const stringRulesNotAtCaret = string.filter(
      (item) => item.type === 'string' && !caretScopes.includes(item.value)
    )
    const stringRulesAtCaret = string.filter(
      (item) => item.type === 'string' && caretScopes.includes(item.value)
    )
    const finalRules = [ ...regexp, ...stringRulesNotAtCaret ]

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

    return await workspace.getConfiguration(this.extensionId).update(`textMateRules`, finalRules, true)
  }

  /**
   * Bound to the {@link workspace.onDidChangeConfiguration `onDidChangeConfiguration`} event. Clears the
   * cached settings if the configuration change event affects the extension's settings.
   */
  private onDidChangeConfiguration(event: ConfigurationChangeEvent) {
    if (event.affectsConfiguration(this.extensionId)) {
      this.logMessage(
        `onDidChangeConfiguration`,
        `Configuration change detected, resetting cached exclusions`
      )
      this.resetCache()
    }
  }

  /**
   * Bounds to the {@link window.onDidChangeTextEditorSelection `onDidChangeTextEditorSelection`} event. Runs the
   * main logic of the Extension, namely checking to see whether or not the current caret position is in an area where
   * Inline Suggestions should be enabled or disabled, and updates Copilot's settings accordingly if needed.
   */
  private onDidChangeTextEditorSelection(
    event: TextEditorSelectionChangeEvent
  ) {
    const {
      textEditor: { document, selection },
    } = event

    // If the Document itself is excluded, disable Copilot if necessary and return early.
    if (this.isURIExcluded(document.uri)) {
      this.logMessage(
        `onDidChangeTextEditorSelection`,
        `Copilot should be silenced, glob pattern exclusion rule found for URI: ${document.uri.fsPath}`
      )
      if (!this.isExtensionDisablingCopilot) {
        this.updateCopilotState(false, `Excluded URI`)
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
        this.updateCopilotState(false, `Excluded Scope`)
      }
      return
    }

    if (this.isSelectionContentExcluded(document, selection)) {
      this.logMessage(
        `onDidChangeTextEditorSelection`,
        `Copilot should be silenced, content exclusion rule found at cursor`
      )
      if (!this.isExtensionDisablingCopilot) {
        this.updateCopilotState(false, `Excluded Content`)
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
      this.updateCopilotState(true, `No exclusions matched.`)
    }
  }

  private resetCache() {
    return (this.cache = {
      excludedGlobs: new Map(),
      excludedScopes: new Map(),
      textMateRules: this.configuration.textMateRules.map(rule => createPredicateFromRule(rule)),
      contentRules: (this.configuration.contentRules ?? []).map((rule: ContentRule) => {
        const predicate = createPredicateFromRule(rule)
        return (document: TextDocument, selection: Selection) => {
          const startRange = document.lineAt(
            Math.max(selection.active.line - (rule.expandRangeByLines ?? 0), 0)
          ).range
          const endRange = document.lineAt(
            Math.min(
              selection.active.line + (rule.expandRangeByLines ?? 0),
              document.lineCount - 1
            )
          ).range
          const range = startRange.union(endRange)
          const text = document.getText(range)
          return predicate(text)
        }
      }),
    })
  }

  /**
   * Utility Function that sets the VSCode Setting value of `github.copilot.inlineSuggest.enable` to
   * the specified state (and sets the `isExtensionDisablingCopilot` property accordingly).
   *
   * @param {boolean} state - The desired state of the `github.copilot.inlineSuggest.enable` setting.
   * @return {Promise<void>} A promise that resolves once the update has completed.
   */
  private async updateCopilotState(
    state: boolean,
    reason: string
  ): Promise<void> {
    this.logMessage(
      `updateCopilotState`,
      `Setting Copilot Inline Suggestions to: ${state}`,
      `Reason: ${reason}`
    )
    this.statusBarItem.tooltip = state
      ? `GH Copilot Suggestions Enabled`
      : `GH Copilot Suggestions Disabled (reason: ${reason})`
    this.statusBarItem.text = state
      ? `$(check) Suggestions Enabled`
      : `$(x) Suggestions Disabled`
    await Manager.setCopilotState(state)
    this.isExtensionDisablingCopilot = !state
  }

  private logMessage(fnName: string, ...args: string[]) {
    if (!this.configuration.debug) return
    const argsString = args.length === 1 ? args[0] : `\n\t${args.join('\n\t')}`
    this.outputChannel.appendLine(`[${fnName}]: ${argsString}`)
  }

  // #endregion Instance Methods
}
