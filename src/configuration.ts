/**
 * @description An exclusion rule that uses basic string comparison functions (includes, startsWith,
 * endsWith, equals) to evaluate against a given string.
 */
export type StringRule = {
  type: 'string'
  /**
   * @description The value to compare against the operand that is being evaluated against this
   * rule.
   */
  value: string
  /**
   * @description Optional preference of how to compare the rule's `value` property to the thing
   * being compared. If omitted, defaults to `includes`.
   *
   * @default 'includes'
   */
  mode?: 'includes' | 'startsWith' | 'endsWith' | 'equals'
}

/**
 * @description An exclusion rule that uses a regular expression to evaluate against a given string.
 */
export type RegExpRule = {
  type: 'regexp'
  /**
   * @description The values to pass to the `RegExp` constructor function, e.g: `new
   * RegExp(value.source, value?.flags)`
   */
  value: {
    /**
     * @description The source string to use as the first argument passed to the `RegExp`
     * constructor function.
     */
    source: string
    /**
     * @description Optional RegExp flags (gimsuy) to use as the second argument passed to the
     * `RegExp` constructor function.
     */
    flags?: string
  }
}

export type MatchRule = StringRule | RegExpRule

/**
 * @description A rule that is applied against the content of the document itself, based around the
 * cursor's position in the document, as opposed to being applied against the TextMate Scopes at the
 * cursor's position.
 */
export type ContentRule = MatchRule & {
  /**
   * @description Optional. If specified, this number will be applied as an offset to the line
   * number at the caret position, expanding the range whose text content will be tested against the
   * rule specified in `value` to have a start line of `<currentLine> - <expandRangeByLines>` and an
   * end line of `<currentLine> + <expandRangeByLines>`.
   */
  expandRangeByLines?: number
}

export type TConfiguration = {
  /**
   * @description An (optional) array of glob patterns to match against the path of active file. If
   * any of the globs defined here matches the active file, Inline Suggestions will be inhibited.
   *
   * Uses [multimatch](https://www.npmjs.com/package/multimatch) under the hood, so any valid
   * multimatch pattern will work here.
   */
  'disable-copilot-comment-completions.globPatterns'?: string[]

  /**
   * @description This extension performs relatively expensive computations when processing the
   * [onDidChangeTextEditorSelection](https://code.visualstudio.com/api/references/vscode-api#:~:text=onDidChangeTextEditorSelection%3A%20Event%3CTextEditorSelectionChangeEvent%3E)
   * event.
   *
   * This setting allows you to throttle the rate at which these computations are performed. The
   * default value of `500` means that the computations will be performed at most once every 500ms.
   * Set this to `0` to disable throttling.
   *
   * If throttling is disabled, you may find that this Extension slows VSCode down during certain
   * operations, especially inside of large files (as this Extension has to tokenize the file when
   * it is changed, a bigger file means more processing to figure out what scopes are at the current
   * Caret position).
   *
   * @default 500
   */
  'disable-copilot-comment-completions.eventProcessingThrottleDelayMs'?: number

  /**
   * @description An array of rules to apply against the TextMate Scopes at the cursor position. If
   * any rule matches, Copilot's inline suggestions will be toggled off.
   *
   * @default [{ type: 'string'; value: 'comment'; mode: 'includes' }]
   *
   * @required
   */
  'disable-copilot-comment-completions.textMateRules': MatchRule[]

  /**
   * @description An (optional) array of Rules to apply against the content of the document itself,
   * based around the cursor's position.
   */
  'disable-copilot-comment-completions.contentRules'?: ContentRule[]

  /**
   * @description Whether or not you want the Extension to be enabled. You can also just uninstall
   * the extension, but hey, whatever floats your boat boss.
   *
   * @default true
   *
   * @required
   */
  'disable-copilot-comment-completions.active': boolean

  /**
   * @description When set to true, the Extension will create an Output Channel and log information
   * about what it's doing.
   */
  'disable-copilot-comment-completions.debug'?: boolean

  /**
   * @description Specifies where to save the changes to the `github.copilot.editor.enableAutoCompletions`
   * setting to. By default, VSCode will save the settings to the `WorkspaceFolder` settings if the
   * configuration is resource-specific, otherwise it will write to the `Workspace` settings. If you
   * want the extension to write it's changes to the global/user `settings.json` file, you should
   * specify `Global` here. By omiting this setting, you leave the choice up to VSCode, which will
   * result in the setting being wrote to your workspaces' settings.
   */
  'disable-copilot-comment-completions.configurationTarget'?: 'Workspace' | 'WorkspaceFolder' | 'Global'
}

export type TWorkspaceConfiguration = {
  [K in keyof TConfiguration as K extends `disable-copilot-comment-completions.${infer P}`
    ? P
    : never]: TConfiguration[K]
}
