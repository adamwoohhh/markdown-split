import { describe, it, expect } from "bun:test"
import { slugify, assignFilenames } from "../src/namer.ts"
import { compileRules } from "../src/rules.ts"
import type { Chunk, CliOptions } from "../src/types.ts"

function makeOptions(overrides: Partial<CliOptions> = {}): CliOptions {
  return {
    input: "input.md",
    outputDir: ".",
    format: "md",
    rules: [],
    prefix: "chunk",
    indexPad: 3,
    dryRun: false,
    overwrite: false,
    keepEmpty: false,
    verbose: false,
    ...overrides,
  }
}

function makeChunk(overrides: Partial<Chunk> & { index: number }): Chunk {
  return { lines: [], metadata: {}, ...overrides }
}

// ─── slugify ──────────────────────────────────────────────────────────────────

describe("slugify", () => {
  it("lowercases text", () => {
    expect(slugify("Hello World")).toBe("hello-world")
  })

  it("replaces spaces with hyphens", () => {
    expect(slugify("foo bar baz")).toBe("foo-bar-baz")
  })

  it("collapses multiple spaces/hyphens", () => {
    expect(slugify("foo  --  bar")).toBe("foo-bar")
  })

  it("removes special characters", () => {
    expect(slugify("Hello, World!")).toBe("hello-world")
  })

  it("trims leading and trailing hyphens", () => {
    expect(slugify("  hello  ")).toBe("hello")
  })

  it("returns 'untitled' for blank input", () => {
    expect(slugify("")).toBe("untitled")
    expect(slugify("!@#$%")).toBe("untitled")
  })

  it("preserves CJK and other Unicode letters", () => {
    expect(slugify("第一回 开篇")).toBe("第一回-开篇")
    expect(slugify("你好 世界")).toBe("你好-世界")
  })
})

// ─── strategy: "index" ────────────────────────────────────────────────────────

describe('assignFilenames — strategy "index"', () => {
  it("generates padded index filenames", () => {
    const chunks = [
      makeChunk({ index: 1 }),
      makeChunk({ index: 2 }),
      makeChunk({ index: 3 }),
    ]
    assignFilenames(chunks, makeOptions())
    expect(chunks.map((c) => c.filename)).toEqual(["chunk-001", "chunk-002", "chunk-003"])
  })

  it("respects custom prefix and indexPad", () => {
    const chunks = [makeChunk({ index: 1 })]
    assignFilenames(chunks, makeOptions({ prefix: "part", indexPad: 2 }))
    expect(chunks[0]?.filename).toBe("part-01")
  })
})

// ─── strategy: "heading" ──────────────────────────────────────────────────────

describe('assignFilenames — strategy "heading"', () => {
  const [rule] = compileRules([{ pattern: "^## ", filenameStrategy: "heading" }])

  it("uses the first heading in the chunk", () => {
    const chunks = [makeChunk({ index: 1, triggerRule: rule, lines: ["## Hello World", "content"] })]
    assignFilenames(chunks, makeOptions())
    expect(chunks[0]?.filename).toBe("hello-world")
  })

  it("falls back to index when chunk has no heading", () => {
    const chunks = [makeChunk({ index: 1, triggerRule: rule, lines: ["no heading here"] })]
    assignFilenames(chunks, makeOptions())
    expect(chunks[0]?.filename).toBe("chunk-001")
  })

  it("uses any heading level (h1-h6)", () => {
    for (let level = 1; level <= 6; level++) {
      const heading = "#".repeat(level) + " Title"
      const chunks = [makeChunk({ index: 1, triggerRule: rule, lines: [heading] })]
      assignFilenames(chunks, makeOptions())
      expect(chunks[0]?.filename).toBe("title")
    }
  })
})

// ─── strategy: "match" ────────────────────────────────────────────────────────

describe('assignFilenames — strategy "match"', () => {
  const [rule] = compileRules([{ pattern: "^## ", filenameStrategy: "match" }])

  it("slugifies the trigger line", () => {
    const chunks = [makeChunk({ index: 1, triggerRule: rule, triggerLine: "## Hello World" })]
    assignFilenames(chunks, makeOptions())
    expect(chunks[0]?.filename).toBe("hello-world")
  })

  it("strips leading # characters from trigger line", () => {
    const chunks = [makeChunk({ index: 1, triggerRule: rule, triggerLine: "### Deep Section" })]
    assignFilenames(chunks, makeOptions())
    expect(chunks[0]?.filename).toBe("deep-section")
  })

  it("falls back to index when trigger line is empty after stripping", () => {
    const chunks = [makeChunk({ index: 1, triggerRule: rule, triggerLine: "" })]
    assignFilenames(chunks, makeOptions())
    expect(chunks[0]?.filename).toBe("chunk-001")
  })
})

// ─── strategy: "template" ─────────────────────────────────────────────────────

describe('assignFilenames — strategy "template"', () => {
  const [rule] = compileRules([{
    pattern: "^## ",
    filenameStrategy: "template",
    filenameTemplate: "ch-{index}-{slug}",
  }])

  it("interpolates {index} and {slug}", () => {
    const chunks = [makeChunk({ index: 3, triggerRule: rule, lines: ["## Hello World"] })]
    assignFilenames(chunks, makeOptions())
    expect(chunks[0]?.filename).toBe("ch-003-hello-world")
  })

  it("interpolates {title} from metadata", () => {
    const [r] = compileRules([{
      pattern: "^## ",
      filenameStrategy: "template",
      filenameTemplate: "{title}",
    }])
    const chunks = [makeChunk({ index: 1, triggerRule: r, metadata: { title: "My Chapter" } })]
    assignFilenames(chunks, makeOptions())
    expect(chunks[0]?.filename).toBe("my-chapter")
  })

  it("interpolates arbitrary metadata keys", () => {
    const [r] = compileRules([{
      pattern: "^## ",
      filenameStrategy: "template",
      filenameTemplate: "{category}-{index}",
    }])
    const chunks = [makeChunk({ index: 1, triggerRule: r, metadata: { category: "intro" } })]
    assignFilenames(chunks, makeOptions())
    expect(chunks[0]?.filename).toBe("intro-001")
  })

  it("falls back to index when template is not set", () => {
    const [r] = compileRules([{ pattern: "^## ", filenameStrategy: "template" }])
    const chunks = [makeChunk({ index: 2, triggerRule: r })]
    assignFilenames(chunks, makeOptions())
    expect(chunks[0]?.filename).toBe("chunk-002")
  })
})

// ─── collision deduplication ──────────────────────────────────────────────────

describe("assignFilenames — deduplication", () => {
  const [rule] = compileRules([{ pattern: "^## ", filenameStrategy: "heading" }])

  it("appends -2, -3 for colliding filenames", () => {
    const chunks = [
      makeChunk({ index: 1, triggerRule: rule, lines: ["## Title"] }),
      makeChunk({ index: 2, triggerRule: rule, lines: ["## Title"] }),
      makeChunk({ index: 3, triggerRule: rule, lines: ["## Title"] }),
    ]
    assignFilenames(chunks, makeOptions())
    expect(chunks.map((c) => c.filename)).toEqual(["title", "title-2", "title-3"])
  })
})

// ─── direct filename from fn rule ────────────────────────────────────────────

describe("assignFilenames — fn-provided filename", () => {
  it("preserves filename already set on chunk (from function rule)", () => {
    const chunks = [makeChunk({ index: 1, filename: "custom-name" })]
    assignFilenames(chunks, makeOptions())
    expect(chunks[0]?.filename).toBe("custom-name")
  })

  it("still deduplicates fn-provided filenames", () => {
    const chunks = [
      makeChunk({ index: 1, filename: "custom" }),
      makeChunk({ index: 2, filename: "custom" }),
    ]
    assignFilenames(chunks, makeOptions())
    expect(chunks.map((c) => c.filename)).toEqual(["custom", "custom-2"])
  })
})
