import type { CompiledRule, Chunk } from "./types.ts"
import { matchLine } from "./rules.ts"

export interface ParseOptions {
  keepEmpty?: boolean  // default: false — filter out zero-line chunks
}

export function parse(
  content: string,
  rules: CompiledRule[],
  options: ParseOptions = {}
): Chunk[] {
  const keepEmpty = options.keepEmpty ?? false

  // Normalize line endings
  const allLines = content.replace(/\r\n/g, "\n").split("\n")

  if (allLines.length === 0 || (allLines.length === 1 && allLines[0] === "")) {
    return []
  }

  const chunks: Chunk[] = []
  let current: Chunk = newChunk(1)

  function sealCurrent() {
    if (keepEmpty || current.lines.length > 0) {
      chunks.push(current)
    }
  }

  for (let i = 0; i < allLines.length; i++) {
    const line = allLines[i] ?? ""

    if (rules.length === 0) {
      current.lines.push(line)
      continue
    }

    const match = matchLine(line, i, allLines, rules)

    if (!match) {
      current.lines.push(line)
      continue
    }

    const { splitBehavior, metadata, filename, rule } = match

    switch (splitBehavior) {
      case "before": {
        // Seal current chunk, start new chunk with this line
        sealCurrent()
        current = newChunk(chunks.length + 1)
        current.triggerRule = rule
        current.triggerLine = line
        Object.assign(current.metadata, metadata)
        if (filename) current.filename = filename
        current.lines.push(line)
        break
      }
      case "after": {
        // Add line to current chunk, then seal; next chunk is empty
        current.lines.push(line)
        current.triggerRule = rule
        current.triggerLine = line
        Object.assign(current.metadata, metadata)
        if (filename) current.filename = filename
        sealCurrent()
        current = newChunk(chunks.length + 1)
        break
      }
      case "exclude": {
        // Drop the line; seal current chunk, start empty new chunk
        sealCurrent()
        current = newChunk(chunks.length + 1)
        current.triggerRule = rule
        current.triggerLine = line
        Object.assign(current.metadata, metadata)
        if (filename) current.filename = filename
        break
      }
    }
  }

  // Seal the last chunk
  sealCurrent()

  // Re-number chunks sequentially (they may have gotten off if empty chunks were dropped)
  chunks.forEach((c, i) => { c.index = i + 1 })

  return chunks
}

function newChunk(index: number): Chunk {
  return { index, lines: [], metadata: {} }
}
