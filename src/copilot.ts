import type { WorkspaceConfiguration } from 'vscode'
import type { ConfigurationScope } from 'vscode'
import { ConfigurationTarget } from 'vscode'
import { workspace } from 'vscode'

export interface CopilotStateOptions {
  scope?: ConfigurationScope | undefined | null
  target?: ConfigurationTarget | boolean | null
  overrideInLanguage?: boolean
}

export interface GetCopilotStateOptions extends Pick<CopilotStateOptions, 'scope'> {
  config?: WorkspaceConfiguration
}

function getValue(languageId: string): unknown {
  const record = workspace.getConfiguration('github.copilot').get('enable')
  if (typeof record === 'object' && record !== null) {
    if (languageId in record) {
      // @ts-expect-error TS(7053): Element implicitly has an 'any' type because expression o...
      return record[languageId]
    }
  }
}

export function getCopilotConfigState({ scope, config }: GetCopilotStateOptions = {}) {
  const usingConfig = config ? config : workspace.getConfiguration('github.copilot', scope)
  const languageId = scope && 'languageId' in scope ? scope.languageId : null

  const enabledObject = usingConfig.get('enable')
  if (typeof enabledObject === 'object' && enabledObject !== null) {
    if (languageId !== null) {
      // @ts-expect-error TS(7053): Element implicitly has an 'any' type because expression o...
      const langValue = enabledObject?.[languageId]
      if (typeof langValue === 'boolean') {
        return langValue
      }
    }

    // @ts-expect-error TS(7053): Element implicitly has an 'any' type because expression o...
    const globalValue = enabledObject?.['*']
    if (typeof globalValue === 'boolean') {
      return globalValue
    }
  }

  return true
}

export function setCopilotConfigState(state: boolean, options: CopilotStateOptions) {
  const config = workspace.getConfiguration('github.copilot', options?.scope)
  const languageId = options.scope && 'languageId' in options.scope ? options.scope.languageId : null

  const enabledRecord = config.get('enable')
  const updatedRecord =
    typeof enabledRecord === 'object' && enabledRecord !== null
      ? { ...enabledRecord, [languageId ?? '*']: state }
      : { [languageId ?? '*']: state }

  return config.update('enable', updatedRecord, options.target, options.overrideInLanguage)
}
