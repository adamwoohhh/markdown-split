import { join, basename } from "node:path"
import type { Chunk, JsonChunk, CliOptions } from "./types.ts"

export async function writeChunks(
  chunks: Chunk[],
  inputPath: string,
  options: CliOptions
): Promise<void> {
  const { format, outputDir, dryRun, overwrite } = options

  if (format === "json-array") {
    await writeJsonArray(chunks, inputPath, outputDir, dryRun, overwrite)
  } else if (format === "json-files") {
    await writeJsonFiles(chunks, outputDir, dryRun, overwrite)
  } else {
    await writeMdFiles(chunks, outputDir, dryRun, overwrite)
  }
}

async function writeMdFiles(
  chunks: Chunk[],
  outputDir: string,
  dryRun: boolean,
  overwrite: boolean
): Promise<void> {
  const paths = chunks.map((c) => join(outputDir, `${c.filename!}.md`))
  checkConflicts(paths, overwrite)

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i]
    const outPath = paths[i]
    const content = chunk.lines.join("\n") + "\n"

    if (dryRun) {
      console.log(`[dry-run] ${outPath}`)
      console.log(chunk.lines.slice(0, 3).map((l) => `  ${l}`).join("\n"))
      if (chunk.lines.length > 3) console.log(`  ... (${chunk.lines.length} lines total)`)
    } else {
      await Bun.write(outPath, content)
    }
  }
}

async function writeJsonFiles(
  chunks: Chunk[],
  outputDir: string,
  dryRun: boolean,
  overwrite: boolean
): Promise<void> {
  const paths = chunks.map((c) => join(outputDir, `${c.filename!}.json`))
  checkConflicts(paths, overwrite)

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i]
    const outPath = paths[i]
    const jsonChunk: JsonChunk = {
      index: chunk.index,
      filename: chunk.filename!,
      metadata: chunk.metadata,
      content: chunk.lines.join("\n") + "\n",
    }

    if (dryRun) {
      console.log(`[dry-run] ${outPath}`)
    } else {
      await Bun.write(outPath, JSON.stringify(jsonChunk, null, 2))
    }
  }
}

async function writeJsonArray(
  chunks: Chunk[],
  inputPath: string,
  outputDir: string,
  dryRun: boolean,
  overwrite: boolean
): Promise<void> {
  const inputBase = basename(inputPath).replace(/\.md$/i, "")
  const outPath = join(outputDir, `${inputBase}.json`)
  checkConflicts([outPath], overwrite)

  const jsonChunks: JsonChunk[] = chunks.map((c) => ({
    index: c.index,
    filename: c.filename!,
    metadata: c.metadata,
    content: c.lines.join("\n") + "\n",
  }))

  if (dryRun) {
    console.log(`[dry-run] ${outPath} (${chunks.length} chunks)`)
  } else {
    await Bun.write(outPath, JSON.stringify(jsonChunks, null, 2))
  }
}

function checkConflicts(paths: string[], overwrite: boolean): void {
  if (overwrite) return

  const { existsSync } = require("node:fs") as typeof import("node:fs")
  const existing = paths.filter((p) => existsSync(p))

  if (existing.length > 0) {
    throw new Error(
      `Output files already exist (use --overwrite to allow):\n${existing.map((p) => `  ${p}`).join("\n")}`
    )
  }
}

export async function ensureDir(dir: string): Promise<void> {
  const { mkdirSync } = require("node:fs") as typeof import("node:fs")
  mkdirSync(dir, { recursive: true })
}
