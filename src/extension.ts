// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode'
import { ExtensionClass } from './extensionClass'

let extensionClass: ExtensionClass | undefined = undefined

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
  console.log(`Activated! Good!`)
  extensionClass = new ExtensionClass(context)
	context.subscriptions.push(extensionClass)
}

// this method is called when your extension is deactivated
export function deactivate() {
  if (extensionClass) {
    extensionClass.dispose()
  }
  console.log(`Deactivated. Sadge.`)
}