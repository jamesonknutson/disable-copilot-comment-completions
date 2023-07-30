import {
  MatchRule,
  NormalizedMatchRule,
  NormalizedRegExpRule,
  NormalizedStringRule,
  RegExpRule,
  StringRule,
} from './configuration'

type OldRule = string | { expr: string; flags?: string }

export function isStringRule(input: MatchRule): input is StringRule {
  return typeof input.value === 'string'
}

export function isRegExpRule(input: MatchRule): input is RegExpRule {
  return typeof input.value === 'object' && input.value !== null
}

export function normalizeRegExpRule(input: RegExpRule): NormalizedRegExpRule {
  return {
    ...input,
    type: 'regexp',
  }
}

export function normalizeStringRule(input: StringRule): NormalizedStringRule {
  const type = input.type ?? 'includes'

  return {
    ...input,
    type: type === 'string' ? 'includes' : type,
    ignoreCase: input.ignoreCase ?? false,
  }
}

export function normalizeRule(input: StringRule): NormalizedStringRule
export function normalizeRule(input: RegExpRule): NormalizedRegExpRule
export function normalizeRule(input: MatchRule): NormalizedMatchRule
export function normalizeRule(input: MatchRule): NormalizedMatchRule {
  return isStringRule(input) ? normalizeStringRule(input) : normalizeRegExpRule(input)
}

export function createPredicateFromRule(rule: MatchRule): (input: string) => boolean {
  const normalized = normalizeRule(rule)
  if (normalized.type === 'regexp') {
    const re = new RegExp(normalized.value.source, normalized.value.flags)
    return (input: string) => re.test(input)
  }

  const { type, ignoreCase } = normalized
  const value = ignoreCase ? normalized.value.toLowerCase() : normalized.value
  return (input: string) => {
    input = ignoreCase ? input.toLowerCase() : input
    switch (type) {
      case 'includes':
        return input.includes(value)
      case 'startsWith':
        return input.startsWith(value)
      case 'endsWith':
        return input.endsWith(value)
      case 'equals':
        return input === value
    }
  }
}

export function areRulesEquivalent(a: MatchRule, b: MatchRule): boolean {
  if (a.type === 'string' && b.type === 'string') {
    const normalizedA = normalizeStringRule(a)
    const normalizedB = normalizeStringRule(b)
    return normalizedA.type === normalizedB.type && normalizedA.value === normalizedB.value
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
    value: typeof oldRule === 'string' ? { source: oldRule } : { source: oldRule.expr, flags: oldRule.flags },
  }
}
