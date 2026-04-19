/**
 * E2E tests for JSON output formats: json-array and json-files.
 * Covers both the dry-run surface and actual written file content.
 */
import { describe, it, expect, afterAll } from "bun:test"
import { join } from "node:path"
import { rmSync, readFileSync, mkdirSync } from "node:fs"
import { tmpdir } from "node:os"
import { run } from "../../src/cli.ts"
import { fixture, FIXTURE_PATH } from "./helpers.ts"
import { dryRun } from "./helpers.ts"
import type { JsonChunk } from "../../src/types.ts"

// ─── Temp dir for real writes ─────────────────────────────────────────────────

const JSON_TMP = join(tmpdir(), "markdown-split-json-e2e")
mkdirSync(JSON_TMP, { recursive: true })

afterAll(() => {
  rmSync(JSON_TMP, { recursive: true, force: true })
})

let outDirIndex = 0
function nextOutDir(): string {
  const dir = join(JSON_TMP, `run-${++outDirIndex}`)
  mkdirSync(dir, { recursive: true })
  return dir
}

/** Invoke the CLI without --dry-run, capturing stdout. */
async function realRun(args: string[]): Promise<{ exitCode: number; stdout: string }> {
  const rawLines: string[] = []
  const orig = console.log
  const origWarn = console.warn
  const origError = console.error
  console.log = (...a: unknown[]) => rawLines.push(a.join(" "))
  console.warn = (...a: unknown[]) => rawLines.push(a.join(" "))
  console.error = (...a: unknown[]) => rawLines.push(a.join(" "))

  let exitCode = 0
  const origExit = process.exit
  process.exit = ((code: number) => {
    exitCode = code ?? 0
    throw new Error("__exit__")
  }) as never

  try {
    await run(["bun", "index.ts", ...args])
  } catch (e) {
    if (!(e instanceof Error) || e.message !== "__exit__") throw e
  } finally {
    console.log = orig
    console.warn = origWarn
    console.error = origError
    process.exit = origExit
  }

  return { exitCode, stdout: rawLines.join("\n") }
}

// ─── json-array: dry-run surface ─────────────────────────────────────────────

describe("e2e — json-array dry-run surface", () => {
  const rule = JSON.stringify({ pattern: "^## ", splitBehavior: "before" })

  it("emits exactly one [dry-run] line (not one per chunk)", async () => {
    const res = await dryRun(["-i", FIXTURE_PATH, "-r", rule, "-f", "json-array"])
    const { stdout } = res
    const dryLines = stdout.split("\n").filter((l) => l.startsWith("[dry-run]"))
    expect(dryLines).toHaveLength(1)

    console.log('=====\n', res);
  })

  it("dry-run line includes the chunk count", async () => {
    const { stdout } = await dryRun(["-i", FIXTURE_PATH, "-r", rule, "-f", "json-array"])
    const [dryLine] = stdout.split("\n").filter((l) => l.startsWith("[dry-run]"))
    expect(dryLine).toContain("3 chunks")
  })

  it("dry-run line names the output file after the input file stem with .json extension", async () => {
    const { stdout } = await dryRun(["-i", FIXTURE_PATH, "-r", rule, "-f", "json-array"])
    const [dryLine] = stdout.split("\n").filter((l) => l.startsWith("[dry-run]"))
    expect(dryLine).toMatch(/fixture\.json/)
  })

  it("exits 0", async () => {
    const { exitCode } = await dryRun(["-i", FIXTURE_PATH, "-r", rule, "-f", "json-array"])
    expect(exitCode).toBe(0)
  })
})

// ─── json-array: real write content ──────────────────────────────────────────

describe("e2e — json-array written content", () => {
  const rule = JSON.stringify({ pattern: "^## ", splitBehavior: "before", filenameStrategy: "heading" })

  it("writes a single .json file named after the input", async () => {
    const outDir = nextOutDir()
    const { exitCode } = await realRun(["-i", FIXTURE_PATH, "-r", rule, "-f", "json-array", "-o", outDir, "--overwrite"])
    expect(exitCode).toBe(0)
    const outFile = join(outDir, "fixture.json")
    expect(() => readFileSync(outFile)).not.toThrow()
  })

  it("output file contains a JSON array", async () => {
    const outDir = nextOutDir()
    await realRun(["-i", FIXTURE_PATH, "-r", rule, "-f", "json-array", "-o", outDir, "--overwrite"])
    const parsed = JSON.parse(readFileSync(join(outDir, "fixture.json"), "utf8"))
    expect(Array.isArray(parsed)).toBe(true)
  })

  it("array length matches the number of chunks", async () => {
    const outDir = nextOutDir()
    await realRun(["-i", FIXTURE_PATH, "-r", rule, "-f", "json-array", "-o", outDir, "--overwrite"])
    const parsed: JsonChunk[] = JSON.parse(readFileSync(join(outDir, "fixture.json"), "utf8"))
    expect(parsed).toHaveLength(3) // preamble + Chapter One + Chapter Two
  })

  it("each element has index, filename, metadata, and content fields", async () => {
    const outDir = nextOutDir()
    await realRun(["-i", FIXTURE_PATH, "-r", rule, "-f", "json-array", "-o", outDir, "--overwrite"])
    const parsed: JsonChunk[] = JSON.parse(readFileSync(join(outDir, "fixture.json"), "utf8"))
    for (const chunk of parsed) {
      expect(typeof chunk.index).toBe("number")
      expect(typeof chunk.filename).toBe("string")
      expect(typeof chunk.metadata).toBe("object")
      expect(typeof chunk.content).toBe("string")
    }
  })

  it("index is 1-based and sequential", async () => {
    const outDir = nextOutDir()
    await realRun(["-i", FIXTURE_PATH, "-r", rule, "-f", "json-array", "-o", outDir, "--overwrite"])
    const parsed: JsonChunk[] = JSON.parse(readFileSync(join(outDir, "fixture.json"), "utf8"))
    expect(parsed.map((c) => c.index)).toEqual([1, 2, 3])
  })

  it("filenames reflect the heading strategy", async () => {
    const outDir = nextOutDir()
    await realRun(["-i", FIXTURE_PATH, "-r", rule, "-f", "json-array", "-o", outDir, "--overwrite"])
    const parsed: JsonChunk[] = JSON.parse(readFileSync(join(outDir, "fixture.json"), "utf8"))
    const names = parsed.map((c) => c.filename)
    expect(names).toContain("chapter-one")
    expect(names).toContain("chapter-two")
  })

  it("content field contains the original markdown text", async () => {
    const outDir = nextOutDir()
    await realRun(["-i", FIXTURE_PATH, "-r", rule, "-f", "json-array", "-o", outDir, "--overwrite"])
    const parsed: JsonChunk[] = JSON.parse(readFileSync(join(outDir, "fixture.json"), "utf8"))
    const chapterOne = parsed.find((c) => c.filename === "chapter-one")!
    expect(chapterOne.content).toContain("## Chapter One")
    expect(chapterOne.content).toContain("Chapter one content.")
  })

  it("content ends with a newline", async () => {
    const outDir = nextOutDir()
    await realRun(["-i", FIXTURE_PATH, "-r", rule, "-f", "json-array", "-o", outDir, "--overwrite"])
    const parsed: JsonChunk[] = JSON.parse(readFileSync(join(outDir, "fixture.json"), "utf8"))
    for (const chunk of parsed) {
      expect(chunk.content.endsWith("\n")).toBe(true)
    }
  })

  it("populates metadata from metadataExtract", async () => {
    const ruleWithMeta = JSON.stringify({
      pattern: "^## (?<title>.+)",
      splitBehavior: "before",
      filenameStrategy: "index",
      metadataExtract: { title: "title" },
    })
    const outDir = nextOutDir()
    await realRun(["-i", FIXTURE_PATH, "-r", ruleWithMeta, "-f", "json-array", "-o", outDir, "--overwrite"])
    const parsed: JsonChunk[] = JSON.parse(readFileSync(join(outDir, "fixture.json"), "utf8"))
    const chapterOne = parsed.find((c) => c.metadata?.title === "Chapter One")
    const chapterTwo = parsed.find((c) => c.metadata?.title === "Chapter Two")
    expect(chapterOne).toBeDefined()
    expect(chapterTwo).toBeDefined()
  })
})

// ─── json-files: dry-run surface ─────────────────────────────────────────────

describe("e2e — json-files dry-run surface", () => {
  const rule = JSON.stringify({ pattern: "^## ", splitBehavior: "before" })

  it("emits one [dry-run] line per chunk", async () => {
    const { stdout } = await dryRun(["-i", FIXTURE_PATH, "-r", rule, "-f", "json-files"])
    const dryLines = stdout.split("\n").filter((l) => l.startsWith("[dry-run]"))
    expect(dryLines).toHaveLength(3) // preamble + two chapters
  })

  it("every dry-run line ends with .json", async () => {
    const { stdout } = await dryRun(["-i", FIXTURE_PATH, "-r", rule, "-f", "json-files"])
    const dryLines = stdout.split("\n").filter((l) => l.startsWith("[dry-run]"))
    expect(dryLines.every((l) => l.endsWith(".json"))).toBe(true)
  })

  it("exits 0", async () => {
    const { exitCode } = await dryRun(["-i", FIXTURE_PATH, "-r", rule, "-f", "json-files"])
    expect(exitCode).toBe(0)
  })
})

// ─── json-files: real write content ──────────────────────────────────────────

describe("e2e — json-files written content", () => {
  const rule = JSON.stringify({ pattern: "^## ", splitBehavior: "before", filenameStrategy: "heading" })

  it("writes one .json file per chunk", async () => {
    const outDir = nextOutDir()
    await realRun(["-i", FIXTURE_PATH, "-r", rule, "-f", "json-files", "-o", outDir, "--overwrite"])
    // expect three files: preamble (chunk-001.json) + chapter-one.json + chapter-two.json
    expect(() => readFileSync(join(outDir, "chapter-one.json"))).not.toThrow()
    expect(() => readFileSync(join(outDir, "chapter-two.json"))).not.toThrow()
  })

  it("each file is valid JSON with the correct shape", async () => {
    const outDir = nextOutDir()
    await realRun(["-i", FIXTURE_PATH, "-r", rule, "-f", "json-files", "-o", outDir, "--overwrite"])
    const chunk: JsonChunk = JSON.parse(readFileSync(join(outDir, "chapter-one.json"), "utf8"))
    expect(typeof chunk.index).toBe("number")
    expect(chunk.filename).toBe("chapter-one")
    expect(typeof chunk.metadata).toBe("object")
    expect(typeof chunk.content).toBe("string")
  })

  it("index reflects chunk position in source order", async () => {
    const outDir = nextOutDir()
    await realRun(["-i", FIXTURE_PATH, "-r", rule, "-f", "json-files", "-o", outDir, "--overwrite"])
    const one: JsonChunk = JSON.parse(readFileSync(join(outDir, "chapter-one.json"), "utf8"))
    const two: JsonChunk = JSON.parse(readFileSync(join(outDir, "chapter-two.json"), "utf8"))
    expect(one.index).toBeLessThan(two.index)
  })

  it("content field contains the original markdown text", async () => {
    const outDir = nextOutDir()
    await realRun(["-i", FIXTURE_PATH, "-r", rule, "-f", "json-files", "-o", outDir, "--overwrite"])
    const chunk: JsonChunk = JSON.parse(readFileSync(join(outDir, "chapter-two.json"), "utf8"))
    expect(chunk.content).toContain("## Chapter Two")
    expect(chunk.content).toContain("Chapter two content.")
  })

  it("content ends with a newline", async () => {
    const outDir = nextOutDir()
    await realRun(["-i", FIXTURE_PATH, "-r", rule, "-f", "json-files", "-o", outDir, "--overwrite"])
    const chunk: JsonChunk = JSON.parse(readFileSync(join(outDir, "chapter-one.json"), "utf8"))
    expect(chunk.content.endsWith("\n")).toBe(true)
  })

  it("populates metadata from metadataExtract", async () => {
    const ruleWithMeta = JSON.stringify({
      pattern: "^## (?<title>.+)",
      splitBehavior: "before",
      filenameStrategy: "index",
      metadataExtract: { title: "title" },
    })
    const outDir = nextOutDir()
    await realRun(["-i", FIXTURE_PATH, "-r", ruleWithMeta, "-f", "json-files", "-o", outDir, "--overwrite"])
    const chunk: JsonChunk = JSON.parse(readFileSync(join(outDir, "chunk-002.json"), "utf8"))
    expect(chunk.metadata.title).toBe("Chapter One")
  })
})

// ─── json-array: single-chunk input ──────────────────────────────────────────

describe("e2e — json-array with no rule matches", () => {
  it("produces a single-element array when nothing matches", async () => {
    const input = fixture("no-match-json.md", "# Title\n\nSome content without any H2.")
    const rule = JSON.stringify({ pattern: "^## " })
    const outDir = nextOutDir()
    await realRun(["-i", input, "-r", rule, "-f", "json-array", "-o", outDir, "--overwrite"])
    const parsed: JsonChunk[] = JSON.parse(
      readFileSync(join(outDir, "no-match-json.json"), "utf8")
    )
    expect(parsed).toHaveLength(1)
    expect(parsed[0]!.index).toBe(1)
    expect(parsed[0]!.content).toContain("# Title")
  })
})
