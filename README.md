## Features

Prevents Github Copilot from providing inline suggestions in comments.

Works by looking at the TextMate Scopes at the Cursor position (`Developer > Inspect Scopes and Tokens`) and checking if any scope contains the string 'comment'. If so, extension will temporarily disable Copilot's `github.copilot.inlineSuggest.enable` setting until the cursor moves out of the comment.

The Extension can be toggled on or off using the `disable-copilot-comment-completions.toggle` Command (Command Palette: `Toggle Copilot Comment Completions`), and/or set in your settings.json file using the setting key: `disable-copilot-comment-completions.active` (boolean).

This should work in all files and all languages, as long as the language conforms to standard TextMate symbol/syntax class names. If it doesn't work for you for some reason, make an issue on Github and I can try to fix it for you (or just fork it and fix it yourself, this extension is like 3 lines of code).

\!\[Demonstration\]\(media/demo.mp4\) ([GfyCat link if the video doesn't work](https://gfycat.com/quaintplayfulharrierhawk))

## Requirements

1. [Github Copilot (obviously).](https://marketplace.visualstudio.com/items?itemName=GitHub.copilot)
2. [HyperScopes](https://marketplace.visualstudio.com/items?itemName=draivin.hscopes) - This extension is used to grab the scopes of wherever you're typing. You need to install it before this extension can work.

## Extension Settings

* `disable-copilot-comment-completions.active`: enable/disable this extension (defaults to true)

## Commands

* `disable-copilot-comment-completions.toggle`: Toggles `disable-copilot-comment-completions.active` state (disables or enables the extension's functionality). You can bind this to a keyboard shortcut if you'd like. You can also disable/enable the extension by clicking the status bar item on the bottom right.

## Known Issues

So far, so good (nothing).

## Release Notes

### 1.0.0

Initial release. Fly, little angel, fly...