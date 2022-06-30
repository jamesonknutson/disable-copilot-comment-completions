# Change Log

All notable changes to the "disable-copilot-comment-completions" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [1.0.0]

- Initial release

## [1.0.1]

- Added [configuration options to customize where Copilot's Suggestions will be disabled](https://github.com/jamesonknutson/disable-copilot-comment-completions/issues/1). Available in the Configuration Option `disable-copilot-comment-completions.inhibitMatchers`. The configuration option accepts an Array of regex strings and/or objects with properties `expr` and optionally `flags` to set the flags. For example:
```json
{
  "disable-copilot-comment-completions.inhibitMatchers": [
    "\\bcomment\\b", // Would match against \bcomment\b
    {
      "expr": "someExpression",
      "flags": "i", // Would match against `someexpression` or `someExpression`, case insensitive
    }
  ]
}
```
- Added helper command to add new scopes to disable copilot's suggestions in (`disable-copilot-comment-completions.addScopes`), available in the Command Palette as `Add Scopes to Inhibit from Cursor`. Requires a Text Editor to be open.
- Added command to force-enable Inhibitor, `disable-copilot-comment-completions.enable` (command palette: `Disable Copilot Scope Inhibitor`)
- Added command to force-disable Inhibitor, `disable-copilot-comment-completions.disable` (command palette: `Enable Copilot Scope Inhibitor`)
- Renamed the display name of the command `GitHub Copilot: Toggle Inline Suggestions in Comments` to `Toggle Copilot Scope Inhibitor` in the command palette