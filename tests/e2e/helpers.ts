import { writeFileSync, mkdirSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { run } from "../../src/cli.ts"

// ─── Shared temp directory ────────────────────────────────────────────────────

export const TMP = join(tmpdir(), "markdown-split-e2e")
mkdirSync(TMP, { recursive: true })

/** Write a fixture file into TMP and return its path. */
export function fixture(name: string, content: string): string {
  const path = join(TMP, name)
  writeFileSync(path, content)
  return path
}

// ─── Standard two-chapter fixture ────────────────────────────────────────────

export const FIXTURE_CONTENT = [
  "# Book Title",
  "",
  "Intro paragraph.",
  "",
  "## Chapter One",
  "",
  "Chapter one content.",
  "",
  "## Chapter Two",
  "",
  "Chapter two content.",
].join("\n")

export const FIXTURE_PATH = fixture("fixture.md", FIXTURE_CONTENT)

// ─── dryRun helper ────────────────────────────────────────────────────────────

export interface DryRunResult {
  /** Output file paths — stem only, no directory or extension.
   *  Source: `[dry-run] /path/to/<stem>.md` lines. */
  paths: string[]

  /** Chunk names from the verbose summary.
   *  Source: `  [  N] <name> (N lines)` lines. */
  chunkNames: string[]

  /** Final summary line, e.g. `Would write 3 chunk(s) to "out/"`. */
  summary: string

  /** Warning/error messages from the CLI. */
  messages: string[]

  /** Raw captured output — use only when the structured fields above
   *  don't cover what you need (e.g. asserting on help text). */
  stdout: string

  exitCode: number
}

// [dry-run] /tmp/.../chunk-001.md  →  stem = "chunk-001"
const DRY_RUN_LINE = /^\[dry-run\] (.+)$/
// "  [  3] chapter-one (4 lines)"  →  name = "chapter-one"
const VERBOSE_CHUNK_LINE = /^\s+\[\s*\d+\]\s+(\S+)\s+\(\d+ lines\)/
const SUMMARY_LINE = /^(?:Would write|Wrote) \d+ chunk/

/**
 * Invoke the CLI with --dry-run prepended plus any extra args.
 * Captures all console output and intercepts process.exit.
 * No files are written to disk.
 */
export async function dryRun(args: string[]): Promise<DryRunResult> {
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
    await run(["bun", "index.ts", "--dry-run", ...args])
  } catch (e) {
    if (!(e instanceof Error) || e.message !== "__exit__") throw e
  } finally {
    console.log = orig
    console.warn = origWarn
    console.error = origError
    process.exit = origExit
  }

  const stdout = rawLines.join("\n")

  // Parse structured fields from the captured output
  const paths: string[] = []
  const chunkNames: string[] = []
  let summary = ""
  const messages: string[] = []

  for (const line of rawLines) {
    const dryMatch = DRY_RUN_LINE.exec(line)
    if (dryMatch) {
      // Extract stem: strip directory and extension
      const full = dryMatch[1] ?? ""
      const basename = full.split("/").at(-1) ?? full
      paths.push(basename.replace(/\.[^.]+$/, ""))
      continue
    }

    const verboseMatch = VERBOSE_CHUNK_LINE.exec(line)
    if (verboseMatch) {
      chunkNames.push(verboseMatch[1] ?? "")
      continue
    }

    if (SUMMARY_LINE.test(line)) {
      summary = line
      continue
    }

    if (line.trim()) {
      messages.push(line)
    }
  }

  return { paths, chunkNames, summary, messages, stdout, exitCode }
}
