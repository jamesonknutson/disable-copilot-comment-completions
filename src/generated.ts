import { TWorkspaceConfiguration as Configuration } from './configuration'

declare module 'vscode' {
  type ExtensionCommands =
    | 'disable-copilot-comment-completions.enable'
    | 'disable-copilot-comment-completions.disable'
    | 'disable-copilot-comment-completions.toggle'
    | 'disable-copilot-comment-completions.addScopes'
  export namespace commands {
    export function executeCommand<T = unknown>(command: ExtensionCommands, ...rest: any[]): Thenable<T>
    export function registerCommand(
      command: ExtensionCommands,
      callback: (...args: any[]) => any,
      thisArg?: any
    ): Disposable
    export function registerTextEditorCommand(
      command: ExtensionCommands,
      callback: (textEditor: TextEditor, edit: TextEditorEdit, ...args: any[]) => void,
      thisArg?: any
    ): Disposable
  }

  export namespace workspace {
    export function getConfiguration(
      section: 'disable-copilot-comment-completions',
      scope?: ConfigurationScope | null
    ): {
      /**
       * Return a value from this configuration.
       *
       * @param section Configuration name, supports _dotted_ names.
       * @return The value `section` denotes or `undefined`.
       */
      get<K extends keyof Configuration, T extends Configuration[K]>(section: K): T | undefined

      /**
       * Return a value from this configuration.
       *
       * @param section Configuration name, supports _dotted_ names.
       * @param defaultValue A value should be returned when no value could be found, is `undefined`.
       * @return The value `section` denotes or the default.
       */
      get<K extends keyof Configuration, T extends Configuration[K]>(section: K, defaultValue: T): T

      /**
       * Check if this configuration has a certain value.
       *
       * @param section Configuration name, supports _dotted_ names.
       * @return `true` if the section doesn't resolve to `undefined`.
       */
      has<K extends keyof Configuration>(section: K): boolean

      /**
       * Retrieve all information about a configuration setting. A configuration value
       * often consists of a *default* value, a global or installation-wide value,
       * a workspace-specific value, folder-specific value
       * and language-specific values (if {@link WorkspaceConfiguration} is scoped to a language).
       *
       * Also provides all language ids under which the given configuration setting is defined.
       *
       * *Note:* The configuration name must denote a leaf in the configuration tree
       * (`editor.fontSize` vs `editor`) otherwise no result is returned.
       *
       * @param section Configuration name, supports _dotted_ names.
       * @return Information about a configuration setting or `undefined`.
       */
      inspect<K extends keyof Configuration, T extends Configuration[K]>(
        section: K
      ):
        | {
            key: K

            defaultValue?: T
            globalValue?: T
            workspaceValue?: T
            workspaceFolderValue?: T

            defaultLanguageValue?: T
            globalLanguageValue?: T
            workspaceLanguageValue?: T
            workspaceFolderLanguageValue?: T

            languageIds?: string[]
          }
        | undefined

      /**
       * Update a configuration value. The updated configuration values are persisted.
       *
       * A value can be changed in
       *
       * - {@link ConfigurationTarget.Global Global settings}: Changes the value for all instances of the editor.
       * - {@link ConfigurationTarget.Workspace Workspace settings}: Changes the value for current workspace, if available.
       * - {@link ConfigurationTarget.WorkspaceFolder Workspace folder settings}: Changes the value for settings from one of the {@link workspace.workspaceFolders Workspace Folders} under which the requested resource belongs to.
       * - Language settings: Changes the value for the requested languageId.
       *
       * *Note:* To remove a configuration value use `undefined`, like so: `config.update('somekey', undefined)`
       *
       * @param section Configuration name, supports _dotted_ names.
       * @param value The new value.
       * @param configurationTarget The {@link ConfigurationTarget configuration target} or a boolean value.
       *	- If `true` updates {@link ConfigurationTarget.Global Global settings}.
       *	- If `false` updates {@link ConfigurationTarget.Workspace Workspace settings}.
       *	- If `undefined` or `null` updates to {@link ConfigurationTarget.WorkspaceFolder Workspace folder settings} if configuration is resource specific,
       * 	otherwise to {@link ConfigurationTarget.Workspace Workspace settings}.
       * @param overrideInLanguage Whether to update the value in the scope of requested languageId or not.
       *	- If `true` updates the value under the requested languageId.
       *	- If `undefined` updates the value under the requested languageId only if the configuration is defined for the language.
       * @throws error while updating
       *	- configuration which is not registered.
       *	- window configuration to workspace folder
       *	- configuration to workspace or workspace folder when no workspace is opened.
       *	- configuration to workspace folder when there is no workspace folder settings.
       *	- configuration to workspace folder when {@link WorkspaceConfiguration} is not scoped to a resource.
       */
      update<K extends keyof Configuration, T extends Configuration[K]>(
        section: K,
        value: T,
        configurationTarget?: ConfigurationTarget | boolean | null,
        overrideInLanguage?: boolean
      ): Thenable<void>
    } & Readonly<Record<string, string>>
  }
}
