import z from 'zod'

/**
 * An exclusion rule that uses basic string comparison functions (includes/string,
 * startsWith, endsWith, equals) to evaluate against a given string.
 *
 * @example <caption>Rule that case-insensitively checks for the presence of the substring 'foo' (all forms are equivalent)</caption>
 * ```json
 * { "type": "string", "ignoreCase": true, "value": "foo" }
 * { "type": "includes", "ignoreCase": true, "value": "foo" }
 * { "ignoreCase": true, "value": "foo" }
 * ```
 */
export type StringRule = {
  /**
   * The condition that is used to compare `StringRule.value` against whatever is
   * being compared. The value `string` is a synonym for `includes`, and is provided
   * to keep backwards compatibility with earlier versions of this Extension. If omitted,
   * the default value is `includes`.
   *
   * @optional
   * @default 'includes'
   */
  type?: 'string' | 'includes' | 'startsWith' | 'endsWith' | 'equals'
  /**
   * The value to compare against the operand that is being evaluated against this rule.
   */
  value: string
  /**
   * Optional. If true, the rule will be evaluated case-insensitively.
   *
   * @default false
   */
  ignoreCase?: boolean
}

export type NormalizedStringRule = Omit<StringRule, 'type'> & {
  type: 'includes' | 'startsWith' | 'endsWith' | 'equals'
}

/**
 * An exclusion rule that uses a regular expression to evaluate against a given string.
 *
 * @example
```jsonc
// Rule that matches against the pattern `/^meta\.import\.ts$/` (all forms are equivalent)
{ "type": "regexp", "value": { "source": "^meta\\.import\\.ts$" } }
{ "type": "matches", "value": { "source": "^meta\\.import\\.ts$" } }
{ "value": { "source": "^meta\\.import\\.ts$" } }
```
 */
export type RegExpRule = {
  /**
   * The type of the rule to apply. This property is no longer used as a Rule can be identified
   * as a RegExp rule by the shape of the `value` property, but it is kept for backwards compatibility
   * with the original `RegExpRule` type.
   *
   * @optional
   */
  type?: 'regexp' | 'matches'
  value: {
    /**
     * The source string to use as the first argument passed to the `RegExp` constructor function.
     */
    source: string
    /**
     * Optional RegExp flags (`[gimsuy]`) to use as the second argument passed to the `RegExp` constructor function.
     *
     * @optional
     * @default undefined
     */
    flags?: string | undefined
  }
}

export type NormalizedRegExpRule = Omit<RegExpRule, 'type'> & { type: 'regexp' }

export type MatchRule = StringRule | RegExpRule
export type NormalizedMatchRule = NormalizedStringRule | NormalizedRegExpRule

/**
 * A rule that is applied against the content of the document itself, based around the cursor's
 * position in the document, as opposed to being applied against the TextMate Scopes at the cursor's
 * position.
 */
export type ContentRule = MatchRule & {
  /**
   * Optional. If specified, this number will be applied as an offset to the line number at the caret
   * position, expanding the range whose text content will be tested against the rule specified in `value`
   * to have a start line of `<currentLine> - <expandRangeByLines>` and an end line of
   * `<currentLine> + <expandRangeByLines>`.
   */
  expandRangeByLines?: number
}

export namespace Rules {
  export namespace v2_0_1 {
    export type StringRule = z.infer<typeof StringRuleSchema>
    export const StringRuleSchema = z.object({
      type: z.enum([ 'string', 'includes', 'startsWith', 'endsWith', 'equals' ]).optional(),
      value: z.string(),
      ignoreCase: z.boolean().optional(),
    })

    export type RegExpRule = z.infer<typeof RegExpRuleSchema>
    export const RegExpRuleSchema = z.object({
      type: z.enum([ 'regexp', 'matches' ]).optional(),
      value: z.object({
        source: z.string(),
        flags: z.string().optional(),
      }),
    })

    export type Rule = z.infer<typeof RuleSchema>
    export const RuleSchema = z.discriminatedUnion('value', [ StringRuleSchema, RegExpRuleSchema ])
  }

  export namespace v2_0_0 {
    export type StringRule = z.infer<typeof StringRuleSchema>
    export const StringRuleSchema = z.object({
      type: z.literal('string'),
      value: z.string(),
      mode: z.enum([ 'includes', 'startsWith', 'endsWith', 'equals' ]).optional(),
    })

    export type RegExpRule = z.infer<typeof RegExpRuleSchema>
    export const RegExpRuleSchema = z.object({
      type: z.literal('regexp'),
      value: z.object({
        source: z.string(),
        flags: z.string().optional(),
      }),
    })

    export type Rule = z.infer<typeof RuleSchema>
    export const RuleSchema = z.discriminatedUnion('type', [ StringRuleSchema, RegExpRuleSchema ])
    export function migrate(input: Rule): v2_0_1.StringRule | v2_0_1.RegExpRule {
      if (input.type === 'string') {
        const type = input.type ?? 'includes'
        return {
          ...input,
          type: type === 'string' ? 'includes' : type,
          ignoreCase: false,
        }
      } else {
        return {
          ...input,
          type: 'regexp',
          value: {
            source: input.value.source,
            flags: input.value.flags,
          },
        }
      }
    }
  }

  export namespace v1_0_2 {
    export type Rule = string | { expr: string; flags?: string }
    export const RuleSchema = z.union([ z.string(), z.object({ expr: z.string(), flags: z.string().optional() }) ])

    export function migrate(input: Rule): v2_0_0.RegExpRule {
      return {
        type: 'regexp',
        value: {
          source: typeof input === 'string' ? input : input.expr,
          flags: typeof input === 'string' ? undefined : input.flags,
        },
      }
    }
  }
}

export function tryParseSchema<Z extends z.ZodTypeAny>(schema: Z, input: unknown): z.infer<Z> | null {
  const parsed = schema.safeParse(input)
  if (parsed.success) {
    return parsed.data
  }
  return null
}

export function migrate(input: unknown): Rules.v2_0_1.Rule | null {
  let rule: any = tryParseSchema(Rules.v2_0_1.RuleSchema, input)
  if (rule) return rule

  rule = tryParseSchema(Rules.v2_0_0.RuleSchema, input)
  if (rule) return Rules.v2_0_0.migrate(rule)

  rule = tryParseSchema(Rules.v1_0_2.RuleSchema, input)
  if (rule) return migrate(Rules.v1_0_2.migrate(rule))

  return null
}
