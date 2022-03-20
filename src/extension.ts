// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { HScopesAPI } from './hscopes';

const EXTENSION_ID = `disable-copilot-comment-completions`;

let   currentListener: vscode.Disposable | null = null;
let   command: vscode.Disposable | null         = null;
const status: vscode.StatusBarItem              = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 0);
status.command = `${EXTENSION_ID}.toggle`;
status.name    = `Copilot Comments`;

const knownScopes: string[] = [];
let extActive: boolean = true;
let inComment: boolean = false;

/**
 * Toggles or sets Copilot's Inline Suggest option. Will set to the specified value if `state` is a boolean,
 * otherwise will toggle. Returns Copilot's State after the operation.
 */
async function toggleCopilot (state?: boolean): Promise<boolean> {
  const copilot = vscode.workspace.getConfiguration('github.copilot.inlineSuggest');
  const curr    = copilot.get('enable');
  if (state === undefined || curr !== state) {
    const update = state ?? !curr;
    await copilot.update('enable', update, true);
    return update;
  }
  return curr;
}

function getNewListener (hsApi: HScopesAPI): vscode.Disposable {
  return vscode.window.onDidChangeTextEditorSelection(async e => {
    const currentlyInComment = e.selections.some(s => (hsApi.getScopeAt(e.textEditor.document, s.active)?.scopes ?? [])
      .some(s => knownScopes.includes(s) || s.includes('comment') ? knownScopes.push(s) && true : false));

    if (currentlyInComment !== inComment) {
      // state changed, update the copiloterino
      await toggleCopilot(!currentlyInComment);
      inComment = currentlyInComment;
    }
  })
}

async function toggleExtension (hsApi: HScopesAPI, state?: boolean): Promise<boolean> {
  extActive = state ?? !extActive;
  if (!extActive) {
    if (currentListener) currentListener?.dispose();

    status.text    = `Copilot Comments: Allowed`;
    status.tooltip = `Click to prevent copilot from getting in your head while writing comments`;
  } else {
    if (currentListener) currentListener?.dispose();
    currentListener = getNewListener(hsApi);

    status.text     = `Copilot Comments: Inhibited`;
    status.tooltip  = `Click to allow copilot to get into your head while writing comments`;
  }

  status.show()

  await toggleCopilot(true);
  await vscode.workspace.getConfiguration(EXTENSION_ID).update('active', extActive, true);
  return extActive;
}


export async function activate(context: vscode.ExtensionContext) {
  await toggleCopilot(true); // turn it on before the extension gets going
  const hscopes = vscode.extensions.getExtension(`draivin.hscopes`);
  if (!hscopes) {
    vscode.window.showErrorMessage(`Extension 'HyperScopes' is not loaded for some reason, install here: https://marketplace.visualstudio.com/items?itemName=draivin.hscopes`);
    return;
  } else if (!hscopes.isActive) {
    await hscopes.activate();
  }

  const hsApi: HScopesAPI = hscopes.exports;

  command = vscode.commands.registerCommand(`${EXTENSION_ID}.toggle`, async () => {
    await toggleExtension(hsApi);
  });
  
  if (extActive) await toggleExtension(hsApi, true);
}

// this method is called when your extension is deactivated
export function deactivate() {
  command?.dispose();
  currentListener?.dispose();
  status?.dispose();
}