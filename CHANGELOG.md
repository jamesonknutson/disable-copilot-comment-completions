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

## [1.0.2]

- Some minor bug fixes

## [2.0.0]

- ⚠ **BREAKING CHANGE**: Removed the setting `disable-copilot-comment-completions.inhibitMatchers`, it's role is now accomplished by the `disable-copilot-comment-completions.textMateRules` setting.

- Extension fully re-written from the ground up, optimizing for performance and efficiency (internally, this is implemented in the form of intelligently caching results, amongst other things)

- Exclusion rules can now accept a variety of different evaluation modes, e.g. you can use RegExp (just as you could previously), as well as simple string comparison evaluation (e.g. `startsWith`, `endsWith`, `includes`, `equals`)

- Added new setting (`disable-copilot-comment-completions.textMateRules`), these rules are matched against the TextMate Scopes at the Cursor Position

- Added new setting (`disable-copilot-comment-completions.contentRules`), these rules are matched against the Text Content at the Cursor Position

- Added new setting (`disable-copilot-comment-completions.globPatternRules`), these rules are matched against the current Document's file path as Glob Patterns

- Added new setting (`disable-copilot-comment-completions.debug`), when set to true the Extension will output some logging information to the VSCode Output View (titled `Disable Copilot Suggestions`)

- Added new setting (`disable-copilot-comment-completions.eventProcessingThrottleDelayMs`), can be used to add a throttle to ignore selection change events that occur within <X> milliseconds of the last time the Extension evaluated it's exclusion rules. Seems to increase performance handsomely

- Added an Element to VSCode's Status Bar that indicates the current 'state' of the Extension (whether it is silencing Copilot's suggestions or not), you can hover over it for some limited information as to why it is doing whatever it is doing as well (intended mainly for quick debugging purposes when testing out new settings).

- Improved robustness of caching techniques used internally by the Extension to increase performance