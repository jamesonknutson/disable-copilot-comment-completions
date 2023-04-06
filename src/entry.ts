import * as vscode from 'vscode'
import { Manager } from './extension'

export async function activate(context: vscode.ExtensionContext) {
  console.log(`[${Manager.extensionId}]: Entry point activate function reached`)
  await Manager.convertOldConfiguration()
  const instance = await Manager.getInstance()
  context.subscriptions.push(instance.disposable)
}

export async function deactivate() {
  console.log(
    `[${Manager.extensionId}]: Entry point deactivate function reached`
  )
  await Manager.setCopilotState(true)
}
