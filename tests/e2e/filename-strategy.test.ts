/**
 * E2E tests for all four filenameStrategy options:
 * "index", "heading", "match", "template"
 */
import { describe, it, expect } from "bun:test"
import { dryRun, fixture, FIXTURE_PATH } from "./helpers.ts"

// ─── "index" ──────────────────────────────────────────────────────────────────

describe('e2e — filenameStrategy "index"', () => {
  // fixture: preamble + ## Chapter One + ## Chapter Two → 3 chunks
  const rule = JSON.stringify({ pattern: "^## ", splitBehavior: "before", filenameStrategy: "index" })

  it("generates sequentially numbered filenames with default prefix", async () => {
    const { chunkNames } = await dryRun(["-i", FIXTURE_PATH, "-r", rule, "-v"])
    expect(chunkNames).toContain("chunk-001")
    expect(chunkNames).toContain("chunk-002")
    expect(chunkNames).toContain("chunk-003")
  })

  it("respects --prefix", async () => {
    const { chunkNames } = await dryRun(["-i", FIXTURE_PATH, "-r", rule, "--prefix", "section", "-v"])
    expect(chunkNames).toContain("section-001")
    expect(chunkNames).toContain("section-002")
    expect(chunkNames.some((n) => n.startsWith("chunk-"))).toBe(false)
  })

  it("respects --index-pad", async () => {
    const { chunkNames } = await dryRun(["-i", FIXTURE_PATH, "-r", rule, "--index-pad", "5", "-v"])
    expect(chunkNames).toContain("chunk-00001")
    expect(chunkNames).toContain("chunk-00002")
  })

  it("dry-run paths end with .md for md format", async () => {
    const { stdout } = await dryRun(["-i", FIXTURE_PATH, "-r", rule])
    const dryLines = stdout.split("\n").filter((l) => l.startsWith("[dry-run]"))
    expect(dryLines.every((l) => l.endsWith(".md"))).toBe(true)
  })

  it("dry-run paths end with .json for json-files format", async () => {
    const { stdout } = await dryRun(["-i", FIXTURE_PATH, "-r", rule, "-f", "json-files"])
    const dryLines = stdout.split("\n").filter((l) => l.startsWith("[dry-run]"))
    expect(dryLines.every((l) => l.endsWith(".json"))).toBe(true)
  })
})

// ─── "heading" ────────────────────────────────────────────────────────────────

describe('e2e — filenameStrategy "heading"', () => {
  const rule = JSON.stringify({ pattern: "^## ", splitBehavior: "before", filenameStrategy: "heading" })

  it("derives filename from the first heading in each chunk", async () => {
    const { chunkNames } = await dryRun(["-i", FIXTURE_PATH, "-r", rule, "-v"])
    expect(chunkNames).toContain("chapter-one")
    expect(chunkNames).toContain("chapter-two")
  })

  it("falls back to index naming for chunks without a heading", async () => {
    const input = fixture("heading-no-preamble-heading.md", "plain preamble\n## Section\ncontent")
    const { chunkNames } = await dryRun(["-i", input, "-r", rule, "-v"])
    expect(chunkNames).toContain("chunk-001") // preamble has no heading → index
    expect(chunkNames).toContain("section")
  })

  it("picks up any heading level (h1–h6) inside the chunk", async () => {
    const input = fixture("heading-h3.md", "### Deep Title\ncontent")
    // rule matches "^## " but the chunk may contain any heading for naming purposes
    const ruleH3 = JSON.stringify({ pattern: "^### ", splitBehavior: "before", filenameStrategy: "heading" })
    const { chunkNames } = await dryRun(["-i", input, "-r", ruleH3, "-v"])
    expect(chunkNames).toContain("deep-title")
  })

  it("deduplicates identical headings with -2, -3 suffixes", async () => {
    const input = fixture("heading-dedup.md", "## Title\ncontent\n## Title\nmore\n## Title\nend")
    const { chunkNames } = await dryRun(["-i", input, "-r", rule, "-v"])
    expect(chunkNames).toContain("title")
    expect(chunkNames).toContain("title-2")
    expect(chunkNames).toContain("title-3")
  })
})

// ─── "match" ──────────────────────────────────────────────────────────────────

describe('e2e — filenameStrategy "match"', () => {
  const rule = JSON.stringify({ pattern: "^## ", splitBehavior: "before", filenameStrategy: "match" })

  it("slugifies the trigger line as the filename", async () => {
    const input = fixture("match-basic.md", "preamble\n## 你好 世界\ncontent\n## Foo Bar\nmore")
    const { chunkNames } = await dryRun(["-i", input, "-r", rule, "-v"])
    expect(chunkNames).toContain("你好-世界")
    expect(chunkNames).toContain("foo-bar")
  })

  it("strips leading # characters from the trigger line", async () => {
    const input = fixture("match-strip.md", "## Deep Section\ncontent")
    const { chunkNames } = await dryRun(["-i", input, "-r", rule, "-v"])
    expect(chunkNames).toContain("deep-section")
    expect(chunkNames.some((n) => n.startsWith("--"))).toBe(false)
  })

  it("falls back to index when the trigger line is empty after stripping", async () => {
    const ruleEmpty = JSON.stringify({ pattern: "^##$", splitBehavior: "before", filenameStrategy: "match" })
    const input = fixture("match-empty.md", "## Hello\ncontent")
    const { chunkNames } = await dryRun(["-i", input, "-r", ruleEmpty, "-v"])
    expect(chunkNames).toContain("chunk-001")
  })

  it("deduplicates colliding match-based filenames", async () => {
    const input = fixture("match-dedup.md", "## Same\na\n## Same\nb")
    const { chunkNames } = await dryRun(["-i", input, "-r", rule, "-v"])
    expect(chunkNames).toContain("same")
    expect(chunkNames).toContain("same-2")
  })
})

// ─── "template" ───────────────────────────────────────────────────────────────

describe('e2e — filenameStrategy "template"', () => {
  it("interpolates {index} and {slug}", async () => {
    const rule = JSON.stringify({
      pattern: "^## ",
      splitBehavior: "before",
      filenameStrategy: "template",
      filenameTemplate: "ch-{index}-{slug}",
    })
    const input = fixture("tpl-index-slug.md", "## Hello World\ncontent\n## Foo Bar\nmore")
    const { chunkNames } = await dryRun(["-i", input, "-r", rule, "-v"])
    expect(chunkNames).toContain("ch-001-hello-world")
    expect(chunkNames).toContain("ch-002-foo-bar")
  })

  it("interpolates {title} from metadataExtract", async () => {
    const rule = JSON.stringify({
      pattern: "^## (?<title>.+)",
      splitBehavior: "before",
      filenameStrategy: "template",
      filenameTemplate: "post-{title}",
      metadataExtract: { title: "title" },
    })
    const input = fixture("tpl-meta-title.md", "## My Chapter\ncontent")
    const { chunkNames } = await dryRun(["-i", input, "-r", rule, "-v"])
    expect(chunkNames).toContain("post-my-chapter")
  })

  it("interpolates {title} falling back to the first heading in the chunk", async () => {
    const rule = JSON.stringify({
      pattern: "^## ",
      splitBehavior: "before",
      filenameStrategy: "template",
      filenameTemplate: "sec-{title}",
    })
    const input = fixture("tpl-heading-fallback.md", "## Great Section\ncontent")
    const { chunkNames } = await dryRun(["-i", input, "-r", rule, "-v"])
    expect(chunkNames).toContain("sec-great-section")
  })

  it("replaces unknown placeholders with empty string", async () => {
    const rule = JSON.stringify({
      pattern: "^## ",
      splitBehavior: "before",
      filenameStrategy: "template",
      filenameTemplate: "pre-{unknown}-suf",
    })
    const input = fixture("tpl-unknown.md", "## Section\ncontent")
    const { chunkNames } = await dryRun(["-i", input, "-r", rule, "-v"])
    expect(chunkNames).toContain("pre--suf")
  })

  it("falls back to index when filenameTemplate is omitted", async () => {
    const rule = JSON.stringify({
      pattern: "^## ",
      splitBehavior: "before",
      filenameStrategy: "template",
    })
    const input = fixture("tpl-missing.md", "## Section\ncontent")
    const { chunkNames } = await dryRun(["-i", input, "-r", rule, "-v"])
    expect(chunkNames).toContain("chunk-001")
  })
})
