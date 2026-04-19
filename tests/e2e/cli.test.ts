/**
 * E2E tests for CLI surface: help text, argument validation,
 * output formats, verbose flag, prefix/padding, and config file loading.
 */
import { describe, it, expect } from "bun:test"
import { dryRun, FIXTURE_PATH } from "./helpers.ts"

const BASIC_RULE = JSON.stringify({ pattern: "^## " })

// ─── Help ─────────────────────────────────────────────────────────────────────

describe("e2e — help", () => {
  it("prints help and exits 0 with --help", async () => {
    const { stdout, exitCode } = await dryRun(["--help"])
    expect(exitCode).toBe(0)
    expect(stdout).toContain("Usage: markdown-split")
    expect(stdout).toContain("Rule Fields")
    expect(stdout).toContain("splitBehavior")
  })

  it("exits 1 when --input is missing", async () => {
    const { messages, exitCode } = await dryRun(["-f", "md"])
    expect(exitCode).toBe(1)
    expect(messages.some((m) => m.includes("required"))).toBe(true)
  })
})

// ─── Argument validation ──────────────────────────────────────────────────────

describe("e2e — argument validation", () => {
  it("exits 1 when --input value looks like a flag", async () => {
    const { exitCode } = await dryRun(["-i", "--overwrite"])
    expect(exitCode).toBe(1)
  })

  it("exits 1 for an unknown argument", async () => {
    const { exitCode } = await dryRun(["-i", FIXTURE_PATH, "--unknown-flag"])
    expect(exitCode).toBe(1)
  })

  it("exits 1 when --index-pad is not a number", async () => {
    const { exitCode } = await dryRun(["-i", FIXTURE_PATH, "-r", BASIC_RULE, "--index-pad", "abc"])
    expect(exitCode).toBe(1)
  })

  it("exits 1 for invalid --rule JSON", async () => {
    const { exitCode } = await dryRun(["-i", FIXTURE_PATH, "-r", "{bad json}"])
    expect(exitCode).toBe(1)
  })
})

// ─── Output formats ───────────────────────────────────────────────────────────

describe("e2e — output format", () => {
  it("accepts --format md", async () => {
    const { exitCode } = await dryRun(["-i", FIXTURE_PATH, "-r", BASIC_RULE, "-f", "md"])
    expect(exitCode).toBe(0)
  })

  it("accepts --format json-array", async () => {
    const { exitCode } = await dryRun(["-i", FIXTURE_PATH, "-r", BASIC_RULE, "-f", "json-array"])
    expect(exitCode).toBe(0)
  })

  it("accepts --format json-files", async () => {
    const { exitCode } = await dryRun(["-i", FIXTURE_PATH, "-r", BASIC_RULE, "-f", "json-files"])
    expect(exitCode).toBe(0)
  })

  it("exits 1 for unknown format value", async () => {
    const { exitCode } = await dryRun(["-i", FIXTURE_PATH, "-r", BASIC_RULE, "-f", "xml"])
    expect(exitCode).toBe(1)
  })
})

// ─── Verbose flag ─────────────────────────────────────────────────────────────

describe("e2e — verbose flag", () => {
  it("populates chunkNames in the result", async () => {
    const rule = JSON.stringify({ pattern: "^## ", filenameStrategy: "heading" })
    const { chunkNames } = await dryRun(["-i", FIXTURE_PATH, "-r", rule, "-v"])
    expect(chunkNames.length).toBeGreaterThan(0)
  })
})

// ─── Prefix and index padding ─────────────────────────────────────────────────

describe("e2e — prefix and index padding", () => {
  it("uses custom --prefix in output paths", async () => {
    const { paths } = await dryRun(["-i", FIXTURE_PATH, "-r", BASIC_RULE, "--prefix", "part", "-v"])
    expect(paths.every((p) => p.startsWith("part-"))).toBe(true)
    expect(paths.every((p) => !p.startsWith("chunk-"))).toBe(true)
  })

  it("uses custom --index-pad in output paths", async () => {
    const { paths } = await dryRun(["-i", FIXTURE_PATH, "-r", BASIC_RULE, "--prefix", "p", "--index-pad", "5", "-v"])
    expect(paths[0]).toBe("p-00001")
  })
})

// ─── Config file ──────────────────────────────────────────────────────────────

describe("e2e — TS config file", () => {
  it("loads split.config.ts without error", async () => {
    // split.config.ts targets "^第.+回" which won't match the fixture,
    // so the whole file becomes one chunk — but loading must succeed.
    const { exitCode, summary } = await dryRun(["-i", FIXTURE_PATH, "-c", "split.config.ts"])
    expect(exitCode).toBe(0)
    expect(summary).toContain("chunk(s)")
  })
})
