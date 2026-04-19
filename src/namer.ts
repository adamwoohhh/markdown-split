import type { Chunk, CliOptions, FilenameStrategy } from "./types.ts"

export function assignFilenames(chunks: Chunk[], options: CliOptions): void {
  const seen = new Map<string, number>()

  for (const chunk of chunks) {
    // If parser already set a direct filename (from function rule), keep it
    // but still run through collision detection
    const base = chunk.filename ?? deriveBase(chunk, options)
    chunk.filename = dedup(base, seen)
  }
}

function deriveBase(chunk: Chunk, options: CliOptions): string {
  const rule = chunk.triggerRule
  const strategy: FilenameStrategy = rule?.filenameStrategy ?? "index"
  const template = rule?.filenameTemplate

  switch (strategy) {
    case "index":
      return indexName(chunk.index, options)

    case "heading": {
      const title = extractHeading(chunk.lines)
      if (title) return slugify(title)
      // Fallback to index if no heading found
      return indexName(chunk.index, options)
    }

    case "match": {
      const trigger = chunk.triggerLine ?? ""
      // Strip leading # characters (markdown headings)
      const text = trigger.replace(/^#{1,6}\s*/, "").trim()
      if (text) return slugify(text)
      return indexName(chunk.index, options)
    }

    case "template": {
      if (!template) return indexName(chunk.index, options)
      return interpolate(template, chunk, options)
    }
  }
}

function indexName(index: number, options: CliOptions): string {
  const pad = options.indexPad ?? 3
  return `${options.prefix}-${String(index).padStart(pad, "0")}`
}

function extractHeading(lines: string[]): string | null {
  for (const line of lines) {
    const m = line.match(/^#{1,6}\s+(.+)/)
    if (m) return (m[1] ?? "").trim() || null
  }
  return null
}

function interpolate(template: string, chunk: Chunk, options: CliOptions): string {
  const heading = extractHeading(chunk.lines)
  const slug = heading ? slugify(heading) : indexName(chunk.index, options)
  const title = chunk.metadata["title"] ?? heading ?? ""

  return template
    .replace(/\{index\}/g, String(chunk.index).padStart(options.indexPad ?? 3, "0"))
    .replace(/\{slug\}/g, slug)
    .replace(/\{title\}/g, slugify(title))
    .replace(/\{(\w+)\}/g, (_, key: string) => chunk.metadata[key] ?? "")
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, "")  // keep Unicode letters/digits/spaces/hyphens
    .replace(/[\s_]+/g, "-")             // spaces/underscores → hyphens
    .replace(/-+/g, "-")                 // collapse multiple hyphens
    .replace(/^-+|-+$/g, "")            // trim leading/trailing hyphens
    || "untitled"
}

function dedup(base: string, seen: Map<string, number>): string {
  if (!seen.has(base)) {
    seen.set(base, 1)
    return base
  }
  const count = seen.get(base)! + 1
  seen.set(base, count)
  return `${base}-${count}`
}
