import { MatchRule, RegExpRule, StringRule } from './configuration'

type OldRule = string | { expr: string; flags?: string }

export function normalizeStringRule(rule: StringRule): Required<StringRule> {
  return {
    type: 'string',
    value: rule.value,
    mode: rule.mode ?? 'includes',
  }
}

export function createPredicateFromRule(
  rule: MatchRule
): (input: string) => boolean {
  switch (rule.type) {
    case 'string':
      return createPredicateFromStringRule(rule)
    case 'regexp':
      return createPredicateFromRegExpRule(rule)
  }
}

export function areRulesEquivalent(a: MatchRule, b: MatchRule): boolean {
  if (a.type === 'string' && b.type === 'string') {
    const normalizedA = normalizeStringRule(a)
    const normalizedB = normalizeStringRule(b)
    return (
      normalizedA.mode === normalizedB.mode &&
      normalizedA.value === normalizedB.value
    )
  } else if (a.type === 'regexp' && b.type === 'regexp') {
    return a.value.source === b.value.source && a.value.flags === b.value.flags
  }

  return false
}

export function isOldRuleFormat(input: unknown): input is OldRule {
  return (
    typeof input === 'string' ||
    (!!input &&
      typeof input === 'object' &&
      'expr' in input &&
      typeof input.expr === 'string' &&
      ('flags' in input ? typeof input.flags === 'string' : true))
  )
}

export function convertOldRuleFormat(oldRule: OldRule): MatchRule {
  return {
    type: 'regexp',
    value:
      typeof oldRule === 'string'
        ? { source: oldRule }
        : { source: oldRule.expr, flags: oldRule.flags },
  }
}

function createPredicateFromStringRule(
  rule: StringRule
): (input: string) => boolean {
  const normalizedRule = normalizeStringRule(rule)
  switch (normalizedRule.mode) {
    case 'includes':
      return (input) => input.includes(normalizedRule.value)
    case 'startsWith':
      return (input) => input.startsWith(normalizedRule.value)
    case 'endsWith':
      return (input) => input.endsWith(normalizedRule.value)
    case 'equals':
      return (input) => input === rule.value
  }
}

function createPredicateFromRegExpRule(
  rule: RegExpRule
): (input: string) => boolean {
  const re =
    typeof rule.value === 'string'
      ? new RegExp(rule.value)
      : new RegExp(rule.value.source, rule.value.flags)
  return (input) => re.test(input)
}
