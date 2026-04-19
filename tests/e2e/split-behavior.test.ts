/**
 * E2E tests for the three splitBehavior modes:
 * "before", "after", "exclude" — and the empty-chunk filter.
 */
import { describe, it, expect } from "bun:test"
import { dryRun, fixture, FIXTURE_PATH } from "./helpers.ts"

// ─── splitBehavior: "before" ──────────────────────────────────────────────────

describe('e2e — splitBehavior "before"', () => {
  const rule = JSON.stringify({ pattern: "^## ", splitBehavior: "before", filenameStrategy: "heading" })

  it("produces preamble chunk + one chunk per heading", async () => {
    const { chunkNames, summary } = await dryRun(["-i", FIXTURE_PATH, "-r", rule, "-v"])
    expect(summary).toContain("3 chunk(s)")
    expect(chunkNames).toContain("chapter-one")
    expect(chunkNames).toContain("chapter-two")
  })

  it("emits one dry-run path per chunk", async () => {
    const { paths } = await dryRun(["-i", FIXTURE_PATH, "-r", rule])
    expect(paths).toHaveLength(3)
  })

  it("matched line is the first line of the new chunk, not the old one", async () => {
    const input = fixture("before-first-line.md", "intro\n## Heading\ncontent")
    const { chunkNames, summary } = await dryRun(["-i", input, "-r", rule, "-v"])
    expect(summary).toContain("2 chunk(s)")
    expect(chunkNames).toContain("heading") // second chunk named from its heading
  })
})

// ─── splitBehavior: "after" ───────────────────────────────────────────────────

describe('e2e — splitBehavior "after"', () => {
  const rule = JSON.stringify({ pattern: "^---$", splitBehavior: "after" })

  it("matched line is the last line of the current chunk", async () => {
    const input = fixture("after-basic.md", "intro\n---\nnext section")
    const { summary } = await dryRun(["-i", input, "-r", rule, "-v"])
    expect(summary).toContain("2 chunk(s)")
  })

  it("does not produce a trailing empty chunk when last line matches", async () => {
    const input = fixture("after-trailing.md", "content\n---")
    const { summary } = await dryRun(["-i", input, "-r", rule, "-v"])
    expect(summary).toContain("1 chunk(s)")
  })
})

// ─── splitBehavior: "exclude" ─────────────────────────────────────────────────

describe('e2e — splitBehavior "exclude"', () => {
  const rule = JSON.stringify({ pattern: "^---$", splitBehavior: "exclude" })

  it("drops the separator line and splits", async () => {
    const input = fixture("exclude-sep.md", "Section A\n---\nSection B\n---\nSection C")
    const { summary, paths } = await dryRun(["-i", input, "-r", rule, "-v"])
    expect(summary).toContain("3 chunk(s)")
    expect(paths).toHaveLength(3)
  })

  it("does not create an empty chunk when file starts with the separator", async () => {
    const input = fixture("exclude-first.md", "---\ncontent")
    const { summary } = await dryRun(["-i", input, "-r", rule, "-v"])
    expect(summary).toContain("1 chunk(s)")
  })

  it("does not create empty chunks for consecutive separators", async () => {
    const input = fixture("exclude-consecutive.md", "a\n---\n---\nb")
    const { summary } = await dryRun(["-i", input, "-r", rule, "-v"])
    expect(summary).toContain("2 chunk(s)")
  })
})

// ─── Empty-chunk filter ───────────────────────────────────────────────────────

describe("e2e — empty chunk filter", () => {
  const rule = JSON.stringify({ pattern: "^## ", splitBehavior: "before", filenameStrategy: "heading" })

  it("skips blank-only pre-match content (no empty file)", async () => {
    const input = fixture("blank-preamble.md", "\n\n## Only Section\ncontent")
    const { paths, chunkNames, summary } = await dryRun(["-i", input, "-r", rule, "-v"])
    expect(summary).toContain("1 chunk(s)")
    expect(paths).not.toContain("chunk-001")    // no empty preamble file
    expect(chunkNames).not.toContain("chunk-001")
  })

  it("no empty chunk when the very first line matches", async () => {
    const input = fixture("immediate-match.md", "## First\ncontent")
    const { paths, summary } = await dryRun(["-i", input, "-r", rule, "-v"])
    expect(summary).toContain("1 chunk(s)")
    expect(paths).toHaveLength(1)
  })
})
