import { describe, it, expect } from "bun:test"
import { parse } from "../src/parser.ts"
import { compileRules } from "../src/rules.ts"
import type { CompiledRule } from "../src/types.ts"

function rules(patterns: { pattern: string; splitBehavior?: "before" | "after" | "exclude" }[]): CompiledRule[] {
  return compileRules(patterns)
}

// ─── Empty / no-rule cases ────────────────────────────────────────────────────

describe("parse — empty / no-rule", () => {
  it("returns [] for empty string", () => {
    expect(parse("", [], {})).toEqual([])
  })

  it("returns [] for a string that is only a newline", () => {
    expect(parse("\n", [], {})).toEqual([])
  })

  it("returns the whole file as one chunk when no rules are given", () => {
    const chunks = parse("line1\nline2\nline3", [], {})
    expect(chunks).toHaveLength(1)
    expect(chunks[0]?.lines).toEqual(["line1", "line2", "line3"])
  })

  it("normalises Windows line endings", () => {
    const chunks = parse("a\r\nb\r\nc", [], {})
    expect(chunks[0]?.lines).toEqual(["a", "b", "c"])
  })
})

// ─── splitBehavior: "before" ──────────────────────────────────────────────────

describe('parse — splitBehavior "before"', () => {
  const r = rules([{ pattern: "^## ", splitBehavior: "before" }])

  it("splits before the matched line", () => {
    const chunks = parse("intro\n## A\ncontent", r)
    expect(chunks).toHaveLength(2)
    expect(chunks[0]?.lines).toEqual(["intro"])
    expect(chunks[1]?.lines).toEqual(["## A", "content"])
  })

  it("does not create an empty chunk when the very first line matches", () => {
    const chunks = parse("## A\ncontent", r)
    expect(chunks).toHaveLength(1)
    expect(chunks[0]?.lines[0]).toBe("## A")
  })

  it("does not create an empty chunk when leading blank lines precede first match", () => {
    const chunks = parse("\n\n## A\ncontent", r)
    expect(chunks).toHaveLength(1)
    expect(chunks[0]?.lines[0]).toBe("## A")
  })

  it("handles consecutive matches (each heading is its own chunk)", () => {
    const chunks = parse("## A\n## B\ncontent", r)
    expect(chunks).toHaveLength(2)
    expect(chunks[0]?.lines).toEqual(["## A"])
    expect(chunks[1]?.lines).toEqual(["## B", "content"])
  })

  it("numbers chunks sequentially after empty-chunk filtering", () => {
    const chunks = parse("## A\ncontent\n## B\nmore", r)
    expect(chunks.map((c) => c.index)).toEqual([1, 2])
  })

  it("sets triggerLine on each chunk", () => {
    const chunks = parse("intro\n## A\ncontent", r)
    expect(chunks[0]?.triggerLine).toBeUndefined()
    expect(chunks[1]?.triggerLine).toBe("## A")
  })
})

// ─── splitBehavior: "after" ───────────────────────────────────────────────────

describe('parse — splitBehavior "after"', () => {
  const r = rules([{ pattern: "^---$", splitBehavior: "after" }])

  it("includes the matched line in the current chunk, then splits", () => {
    const chunks = parse("intro\n---\nnext", r)
    expect(chunks).toHaveLength(2)
    expect(chunks[0]?.lines).toEqual(["intro", "---"])
    expect(chunks[1]?.lines).toEqual(["next"])
  })

  it("does not create a trailing empty chunk when last line matches", () => {
    const chunks = parse("intro\n---", r)
    expect(chunks).toHaveLength(1)
    expect(chunks[0]?.lines).toEqual(["intro", "---"])
  })

  it("creates a first chunk of just the separator when first line matches", () => {
    // The "after" separator belongs to the current (initial) chunk
    const chunks = parse("---\ncontent", r)
    expect(chunks).toHaveLength(2)
    expect(chunks[0]?.lines).toEqual(["---"])
    expect(chunks[1]?.lines).toEqual(["content"])
  })
})

// ─── splitBehavior: "exclude" ─────────────────────────────────────────────────

describe('parse — splitBehavior "exclude"', () => {
  const r = rules([{ pattern: "^---$", splitBehavior: "exclude" }])

  it("drops the matched line and splits", () => {
    const chunks = parse("intro\n---\nnext", r)
    expect(chunks).toHaveLength(2)
    expect(chunks[0]?.lines).toEqual(["intro"])
    expect(chunks[1]?.lines).toEqual(["next"])
  })

  it("does not create an empty chunk when first line matches", () => {
    const chunks = parse("---\ncontent", r)
    expect(chunks).toHaveLength(1)
    expect(chunks[0]?.lines).toEqual(["content"])
  })

  it("does not create empty chunks for consecutive separators", () => {
    const chunks = parse("a\n---\n---\nb", r)
    expect(chunks).toHaveLength(2)
    expect(chunks[0]?.lines).toEqual(["a"])
    expect(chunks[1]?.lines).toEqual(["b"])
  })
})

// ─── keepEmpty option ─────────────────────────────────────────────────────────

describe("parse — keepEmpty", () => {
  const r = rules([{ pattern: "^## ", splitBehavior: "before" }])

  it("retains all-blank pre-chunks when keepEmpty is true", () => {
    const chunks = parse("\n## A\ncontent", r, { keepEmpty: true })
    expect(chunks).toHaveLength(2)
    expect(chunks[0]?.lines).toEqual([""])
  })

  it("retains trailing empty chunk when keepEmpty is true", () => {
    const r2 = rules([{ pattern: "^---$", splitBehavior: "after" }])
    const chunks = parse("intro\n---", r2, { keepEmpty: true })
    expect(chunks).toHaveLength(2)
    expect(chunks[1]?.lines).toEqual([])
  })
})

// ─── metadata extraction ──────────────────────────────────────────────────────

describe("parse — metadata extraction", () => {
  it("extracts named capture groups into chunk metadata", () => {
    const r = compileRules([{
      pattern: "^## (?<title>.+)",
      metadataExtract: { title: "title" },
    }])
    const chunks = parse("## Hello World\ncontent", r)
    expect(chunks[0]?.metadata["title"]).toBe("Hello World")
  })
})

// ─── function rules ───────────────────────────────────────────────────────────

describe("parse — function rules", () => {
  it("splits when fn returns a result", () => {
    const r = compileRules([{
      type: "function",
      fn: (line) => line === "SPLIT" ? { splitBehavior: "exclude" } : null,
    }])
    const chunks = parse("a\nSPLIT\nb", r)
    expect(chunks).toHaveLength(2)
    expect(chunks[0]?.lines).toEqual(["a"])
    expect(chunks[1]?.lines).toEqual(["b"])
  })

  it("passes allLines context allowing look-around", () => {
    // Split when two consecutive blank lines are found
    const r = compileRules([{
      type: "function",
      fn: (line, i, all) =>
        line === "" && all[i - 1] === ""
          ? { splitBehavior: "exclude" }
          : null,
    }])
    const chunks = parse("a\n\n\nb", r)
    expect(chunks).toHaveLength(2)
  })

  it("fn-provided filename is passed through to chunk", () => {
    const r = compileRules([{
      type: "function",
      fn: (line) =>
        line.startsWith("##")
          ? { splitBehavior: "before", filename: "custom-name" }
          : null,
    }])
    const chunks = parse("## X\ncontent", r)
    expect(chunks[0]?.filename).toBe("custom-name")
  })
})

// ─── priority / multiple rules ────────────────────────────────────────────────

describe("parse — rule priority", () => {
  it("higher-priority rule wins when multiple match", () => {
    const r = compileRules([
      { id: "low", pattern: "^#", splitBehavior: "before", priority: 1 },
      { id: "high", pattern: "^## ", splitBehavior: "exclude", priority: 10 },
    ])
    // "## B" matches both; "exclude" (high priority) should win
    const chunks = parse("## A\n## B\ncontent", r)
    // "## A" → before (low wins over high for this line? No — high matches too)
    // Actually "## A" matches both "^#" and "^## "; high priority (exclude) wins
    // "## B" same — exclude
    expect(chunks.every((c) => !c.lines.some((l) => l.startsWith("##")))).toBe(true)
  })
})
