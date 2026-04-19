import type {
  AnyRule,
  CompiledRule,
  CompiledRegexRule,
  CompiledFunctionRule,
  RuleMatch,
  FunctionSplitRule,
} from "./types.ts"

let ruleCounter = 0

function nextId(prefix: string): string {
  return `${prefix}-${++ruleCounter}`
}

export function compileRules(rules: AnyRule[]): CompiledRule[] {
  const compiled: CompiledRule[] = rules.map((rule, i) => {
    if (rule.type === "function") {
      return compileFunctionRule(rule, i)
    }
    // type === "regex" or omitted
    return compileRegexRule(rule, i)
  })

  // Sort descending by priority; ties keep original order (stable sort)
  compiled.sort((a, b) => b.priority - a.priority)
  return compiled
}

function compileRegexRule(rule: AnyRule & { type?: "regex" | undefined }, index: number): CompiledRegexRule {
  if (!("pattern" in rule) || typeof rule.pattern !== "string") {
    throw new Error(
      `Rule at index ${index} (id: ${rule.id ?? "unknown"}) is missing a "pattern" field`
    )
  }

  let flags = rule.flags ?? ""
  if (flags.includes("g")) {
    flags = flags.replace(/g/g, "")
    console.warn(
      `[rules] Rule "${rule.id ?? index}" had the "g" flag removed — stateful global regexes break line matching`
    )
  }

  let regex: RegExp
  try {
    regex = new RegExp(rule.pattern, flags)
  } catch (e) {
    throw new Error(
      `Rule "${rule.id ?? index}" has an invalid regex pattern "${rule.pattern}": ${(e as Error).message}`
    )
  }

  return {
    kind: "regex",
    id: rule.id ?? nextId("regex"),
    regex,
    splitBehavior: rule.splitBehavior ?? "before",
    filenameStrategy: rule.filenameStrategy ?? "index",
    filenameTemplate: rule.filenameTemplate,
    priority: rule.priority ?? 0,
    metadataExtract: rule.metadataExtract ?? {},
    original: rule,
  }
}

function compileFunctionRule(rule: FunctionSplitRule, index: number): CompiledFunctionRule {
  if (typeof rule.fn !== "function") {
    throw new Error(
      `Function rule at index ${index} (id: ${rule.id ?? "unknown"}) is missing a "fn" field`
    )
  }
  return {
    kind: "function",
    id: rule.id ?? nextId("fn"),
    fn: rule.fn,
    filenameStrategy: rule.filenameStrategy ?? "index",
    filenameTemplate: rule.filenameTemplate,
    priority: rule.priority ?? 0,
    original: rule,
  }
}

/**
 * Test a single line against all compiled rules.
 * Returns the first (highest priority) match, or null if no rule matches.
 */
export function matchLine(
  line: string,
  lineIndex: number,
  allLines: readonly string[],
  rules: CompiledRule[]
): RuleMatch | null {
  for (const rule of rules) {
    if (rule.kind === "regex") {
      const m = line.match(rule.regex)
      if (m) {
        const metadata: Record<string, string> = {}
        if (m.groups) {
          for (const [captureGroup, metaKey] of Object.entries(rule.metadataExtract)) {
            if (m.groups[captureGroup] !== undefined) {
              metadata[metaKey] = m.groups[captureGroup]
            }
          }
        }
        return {
          rule,
          splitBehavior: rule.splitBehavior,
          metadata,
          regexMatch: m,
        }
      }
    } else {
      // function rule
      let result: ReturnType<CompiledFunctionRule["fn"]>
      try {
        result = rule.fn(line, lineIndex, allLines)
      } catch (e) {
        throw new Error(
          `Function rule "${rule.id}" threw an error on line ${lineIndex}: ${(e as Error).message}`
        )
      }
      if (result !== null && result !== false) {
        return {
          rule,
          splitBehavior: result.splitBehavior,
          metadata: result.metadata ?? {},
          filename: result.filename,
        }
      }
    }
  }
  return null
}
