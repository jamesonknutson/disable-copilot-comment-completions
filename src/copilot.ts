import type { ConfigurationTarget } from 'vscode'
import { workspace } from 'vscode'

export type FlattenedCopilotSettings = {
  'github.copilot.inlineSuggest.enable': boolean | undefined
  'github.copilot.editor.enableAutoCompletions': boolean | undefined
  'github.copilot.nextEditSuggestions.enabled': boolean | undefined
}

function getKey(input: string) {
  return input.replace(/^github\.copilot\./gim, '')
}

export function getCopilotSettings(): FlattenedCopilotSettings {
  const config = workspace.getConfiguration('github.copilot')
  const output: FlattenedCopilotSettings = {
    'github.copilot.inlineSuggest.enable': config.get(getKey('github.copilot.inlineSuggest.enable')),
    'github.copilot.editor.enableAutoCompletions': config.get(getKey('github.copilot.editor.enableAutoCompletions')),
    'github.copilot.nextEditSuggestions.enabled': config.get(getKey('github.copilot.nextEditSuggestions.enabled')),
  }
  return output
}

export function setCopilotSettings(
  key: keyof FlattenedCopilotSettings,
  value: boolean | undefined,
  target?: ConfigurationTarget | boolean | null,
  overrideInLanguage?: boolean
) {
  const config = workspace.getConfiguration('github.copilot')
  return config.update(key.replace(/^github\.copilot\./gim, ''), value, target, overrideInLanguage)
}
