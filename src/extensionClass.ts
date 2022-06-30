import * as vscode from 'vscode'
import { HScopesAPI, Token } from './hscopes.d'

export class ExtensionClass {
  public  readonly hscopes     : HScopesAPI
  public  readonly context     : vscode.ExtensionContext
  public  copilotConfiguration : CopilotConfiguration
  public  copilotInhibited     = false
  private parsedConfiguration : ParsedCommentsConfiguration | undefined
  private knownMatches         : Array<{ expr: string; scope: string; }> = []
  private disposable           : vscode.Disposable | undefined
  
  public get configuration(): ParsedCommentsConfiguration {
    if (!this.parsedConfiguration) {
      this.parsedConfiguration = this.getCommentConfiguration()
    }
    return this.parsedConfiguration
  }
  
  public get active() {
    return this.configuration.active
  }
  
  public constructor(extension: vscode.ExtensionContext) {
    this.copilotConfiguration = this.getCopilotConfiguration()
    this.parsedConfiguration  = this.getCommentConfiguration()
    this.context              = extension
    this.hscopes              = this.setupHScopes()
    this.disposable           = this.setupDisposables()
  }
  
  private setupHScopes(): HScopesAPI {
    const hscopes = vscode.extensions.getExtension(`draivin.hscopes`)
    if (!hscopes) {
      throw new Error(`Extension 'draivin.hscopes' is not present.`)
    }
    
    return hscopes.exports as HScopesAPI
  }
  
  private getCommentConfiguration(): ParsedCommentsConfiguration {
    const configuration              = vscode.workspace.getConfiguration(`disable-copilot-comment-completions`)
    const raw: CommentsConfiguration = {
      active         : configuration.get<boolean>(`active`) ?? true,
      inhibitMatchers : configuration.get<(string | { expr: string; flags?: string; })[]>(`inhibitMatchers`) ?? [ '\\bcomment\\b' ],
    }
    
    const parsed: ParsedCommentsConfiguration = {
      active         : raw.active,
      inhibitMatchers : raw.inhibitMatchers.reduce((acc, matcher, index, array) => {
        try {
          const newMatcher = new RegExp(
            typeof matcher === 'string' ? matcher : matcher.expr,
            typeof matcher === 'string' ? undefined : matcher?.flags
          )
          return [ ...acc, newMatcher ]
        } catch (error) {
          vscode.window.showErrorMessage(`Failed to parse Expression at Index ${index} of ${array.length - 1}, error: ${error?.toString() ?? 'Unknown Error'}`)
        }
        
        return acc
      }, [] as RegExp[]),
    }
    
    return parsed
  }
  
  private getCopilotConfiguration(): CopilotConfiguration {
    const config        = vscode.workspace.getConfiguration(`github.copilot`)
    const enable        = config.get<Record<string, boolean>>(`enable`)
    const inlineSuggest = config.get<boolean>(`inlineSuggest.enable`)
    return {
      enable        : enable ?? { '*': true },
      inlineSuggest : { enable: inlineSuggest ?? true }
    }
  }
  
  private commandEnable(): void {
    vscode.workspace.getConfiguration(`disable-copilot-comment-completions`).update(`active`, true, true)
  }
  
  private commandDisable(): void {
    vscode.workspace.getConfiguration(`disable-copilot-comment-completions`).update(`active`, false, true)
  }
  
  private commandToggle(): void {
    const current = vscode.workspace.getConfiguration(`disable-copilot-comment-completions`).get<boolean>(`active`) ?? true
    vscode.workspace.getConfiguration(`disable-copilot-comment-completions`).update(`active`, !current, true)
  }
  
  private tokenIsInhibited (token: Token, matchers: RegExp[]): boolean {
    const knownScopes = this.knownMatches.map(({ scope }) => scope)
    if (knownScopes.some(known => token.scopes.includes(known))) {
      return true
    }
    
    const matchedAgainst = token.scopes.reduce((matched, scope) => {
      return matchers.reduce((matched, expr) => {
        return expr.test(scope) ? [ ...matched, { expr, scope } ] : matched
      }, matched)
    }, [] as Array<{ expr: RegExp; scope: string; }>)
    
    if (matchedAgainst.length > 0) {
      this.knownMatches = [ ...this.knownMatches, ...matchedAgainst.map(({ expr, scope }) => ({ expr: expr.source, scope })) ]
      return true
    }
    return false
  }
  
  private copilotToggle(): void {
    return this.copilotInhibited
      ? this.copilotBeFree()
      : this.copilotShutup()
  }
  
  private copilotShutup(): void {
    this.copilotInhibited = true
    vscode.workspace.getConfiguration(`github.copilot`).update(`inlineSuggest.enable`, false, true)
  }
  
  private copilotBeFree(): void {
    this.copilotInhibited = false
    vscode.workspace.getConfiguration(`github.copilot`).update(`inlineSuggest.enable`, true, true)
  }
  
  private async selectionListener(event: vscode.TextEditorSelectionChangeEvent): Promise<void> {
    const { active, inhibitMatchers } = this.configuration
    if (!active || inhibitMatchers.length === 0) return
    
    const editor    = event.textEditor
    const document  = editor.document
    const selection = editor.selection
    const token     = this.hscopes.getScopeAt(document, selection.active)
    if (!token || token.scopes.length === 0) return
    
    const shouldInhibit = this.tokenIsInhibited(token, inhibitMatchers)
    if (shouldInhibit && !this.copilotInhibited) {
      this.copilotShutup()
    } else if (!shouldInhibit && this.copilotInhibited) {
      this.copilotBeFree()
    }
  }
  
  private configurationListener(event: vscode.ConfigurationChangeEvent): void {
    if (event.affectsConfiguration(`disable-copilot-comment-completions`)) {
      this.parsedConfiguration = this.getCommentConfiguration()
      
      // Update known matches array to exclude any expressions that are no longer valid or enabled
      if (this.knownMatches.length > 0) {
        const expressions = this.configuration.inhibitMatchers.map(matcher => matcher.source)
        this.knownMatches = this.knownMatches.filter(m => expressions.includes(m.expr))
      }
    } else if (event.affectsConfiguration(`github.copilot.enable`)) {
      this.copilotConfiguration = this.getCopilotConfiguration()
    }
  }
  
  private setupDisposables(): vscode.Disposable {
    const configListener = vscode.workspace.onDidChangeConfiguration(this.configurationListener, this)
    
    const commandListeners = [
      vscode.commands.registerCommand(`disable-copilot-comment-completions.enable`, this.commandEnable, this),
      vscode.commands.registerCommand(`disable-copilot-comment-completions.disable`, this.commandDisable, this),
      vscode.commands.registerCommand(`disable-copilot-comment-completions.toggle`, this.commandToggle, this),
      vscode.commands.registerCommand(`disable-copilot-comment-completions.addScopes`, this.copilotAddScope, this),
    ]
    
    const selectionListener = vscode.window.onDidChangeTextEditorSelection(this.selectionListener, this)
    
    return vscode.Disposable.from(
      configListener,
      ...commandListeners,
      selectionListener
    )
  }
  
  private async copilotAddScope(): Promise<void> {
    function escapeRegExp(string: string) {
      return new RegExp(`^` + string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$')
    }
    
    const editor = vscode.window.activeTextEditor
    if (!editor) return
    
    const document  = editor.document
    const selection = editor.selection
    const token     = this.hscopes.getScopeAt(document, selection.active)
    if (!token || token.scopes.length === 0) return
    
    const inhibitMatchers = this.configuration.inhibitMatchers
    const inhibitStrings  = inhibitMatchers.map(expr => expr.source)
    const scopes          = token.scopes
    const addScopes       = await vscode.window.showQuickPick(scopes, {
      canPickMany : true,
      title       : `Select the Scopes you wish to have Copilot Inline Suggestions be inhibited in. (Developer > Inspect Tokens and Scopes)`
    })
    
    if (addScopes && addScopes.length) {
      const matchers = addScopes.map(escapeRegExp)
      const unique   = matchers.filter(matcher => !inhibitStrings.includes(matcher.source))
      if (unique.length > 0) {
        const configuration = vscode.workspace.getConfiguration(`disable-copilot-comment-completions`)
        const originalArray = configuration.get<(string | { expr: string; flags?: string; })[]>(`inhibitMatchers`) ?? []
        const newArray      = [ ...originalArray, ...unique.map(matcher => matcher.source) ]
        configuration.update(`inhibitMatchers`, newArray, true)
      }
    }
  }
  
  public dispose(): void {
    if (this.copilotInhibited) this.copilotBeFree()
    if (this.disposable) {
      this.disposable.dispose()
    }
  }
}

interface CopilotConfiguration {
  enable        : { [languageID: string]: boolean }
  inlineSuggest : { enable: boolean }
}

interface ParsedCommentsConfiguration {
  active         : boolean
  inhibitMatchers : RegExp[]
}

interface CommentsConfiguration {
  active         : boolean
  inhibitMatchers : (string | { expr: string; flags?: string; })[]
}