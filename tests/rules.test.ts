import { describe, it, expect } from "bun:test"
import { compileRules, matchLine } from "../src/rules.ts"

// ─── compileRules ─────────────────────────────────────────────────────────────

describe("compileRules", () => {
  it("compiles a basic regex rule with defaults", () => {
    const [rule] = compileRules([{ pattern: "^## " }])
    expect(rule.kind).toBe("regex")
    expect(rule.splitBehavior).toBe("before")
    expect(rule.filenameStrategy).toBe("index")
    expect(rule.priority).toBe(0)
  })

  it("compiles a function rule", () => {
    const fn = () => null
    const [rule] = compileRules([{ type: "function", fn }])
    expect(rule.kind).toBe("function")
    expect(rule.priority).toBe(0)
    expect(rule.filenameStrategy).toBe("index")
  })

  it("sorts rules by priority descending", () => {
    const rules = compileRules([
      { pattern: "low", priority: 1 },
      { pattern: "high", priority: 10 },
      { pattern: "mid", priority: 5 },
    ])
    expect(rules.map((r) => r.priority)).toEqual([10, 5, 1])
  })

  it("preserves insertion order for equal-priority rules (stable sort)", () => {
    const rules = compileRules([
      { id: "a", pattern: "a", priority: 5 },
      { id: "b", pattern: "b", priority: 5 },
    ])
    expect(rules[0]?.id).toBe("a")
    expect(rules[1]?.id).toBe("b")
  })

  it("strips the 'g' flag with a warning", () => {
    const warnSpy: string[] = []
    const orig = console.warn
    console.warn = (...args: unknown[]) => { warnSpy.push(String(args[0])) }
    const [rule] = compileRules([{ pattern: "foo", flags: "gi" }])
    console.warn = orig
    if (rule.kind !== "regex") throw new Error("expected regex rule")
    expect(rule.regex.flags).not.toContain("g")
    expect(warnSpy.some((w) => w.includes('"g" flag removed'))).toBe(true)
  })

  it("throws on invalid regex pattern", () => {
    expect(() => compileRules([{ pattern: "[invalid" }])).toThrow()
  })

  it("throws when function rule is missing fn", () => {
    expect(() =>
      compileRules([{ type: "function", fn: undefined as never }])
    ).toThrow()
  })
})

// ─── matchLine ────────────────────────────────────────────────────────────────

describe("matchLine", () => {
  const allLines = ["## Hello", "content"]

  it("returns null when no rules match", () => {
    const rules = compileRules([{ pattern: "^# " }])
    expect(matchLine("## Hello", 0, allLines, rules)).toBeNull()
  })

  it("returns the matching rule", () => {
    const rules = compileRules([{ pattern: "^## " }])
    const result = matchLine("## Hello", 0, allLines, rules)
    expect(result).not.toBeNull()
    expect(result?.splitBehavior).toBe("before")
  })

  it("picks the highest-priority rule when multiple match", () => {
    const rules = compileRules([
      { id: "low", pattern: "^## ", priority: 1 },
      { id: "high", pattern: "^#", priority: 10 },
    ])
    const result = matchLine("## Hello", 0, allLines, rules)
    expect(result?.rule.id).toBe("high")
  })

  it("extracts named capture groups into metadata", () => {
    const rules = compileRules([{
      pattern: "^## (?<title>.+)",
      metadataExtract: { title: "title" },
    }])
    const result = matchLine("## Hello World", 0, allLines, rules)
    expect(result?.metadata["title"]).toBe("Hello World")
  })

  it("calls function rule with correct arguments", () => {
    const calls: [string, number, readonly string[]][] = []
    const rules = compileRules([{
      type: "function",
      fn(line, idx, lines) {
        calls.push([line, idx, lines])
        return null
      },
    }])
    matchLine("foo", 3, allLines, rules)
    expect(calls[0]).toEqual(["foo", 3, allLines])
  })

  it("returns function rule result when fn returns a value", () => {
    const rules = compileRules([{
      type: "function",
      fn: (line) => line === "SPLIT" ? { splitBehavior: "exclude" } : null,
    }])
    expect(matchLine("SPLIT", 0, [], rules)?.splitBehavior).toBe("exclude")
    expect(matchLine("other", 0, [], rules)).toBeNull()
  })

  it("wraps function rule errors with line context", () => {
    const rules = compileRules([{
      type: "function",
      fn: () => { throw new Error("boom") },
    }])
    expect(() => matchLine("x", 5, [], rules)).toThrow("line 5")
  })
})
