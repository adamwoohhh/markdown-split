import { resolve } from "node:path"
import type { AnyRule, CliOptions } from "./types.ts"
import { loadConfigFile, mergeConfig } from "./config.ts"
import { compileRules } from "./rules.ts"
import { parse } from "./parser.ts"
import { assignFilenames } from "./namer.ts"
import { writeChunks, ensureDir } from "./writer.ts"
import { argv, readText } from "./compat.ts"

const HELP = `
Usage: markdown-split [options]

Options:
  -i, --input <file>        Input .md file (required)
  -o, --output-dir <dir>    Output directory, relative to cwd (default: ".")
  -f, --format <fmt>        Output format: md | json-array | json-files (default: md)
  -c, --config <file>       Config file path (.json, .ts, .js, .mjs)
  -r, --rule <json>         Inline rule as JSON string (repeatable)
      --prefix <str>        Filename prefix for index strategy (default: "chunk")
      --index-pad <n>       Zero-padding width for index numbers (default: 3)
      --dry-run             Print output paths without writing files
      --overwrite           Allow overwriting existing output files
      --keep-empty          Keep zero-line chunks (filtered by default)
  -v, --verbose             Print per-chunk details
      --debug               Print internal pipeline steps to stderr
  -h, --help                Show this help message

────────────────────────────────────────────────────────────────
Rule Fields
────────────────────────────────────────────────────────────────
Each rule is a JSON object (via -r) or an entry in the config file's "rules" array.

  type              "regex" (default, may be omitted) | "function"
                    Determines whether the rule matches by regex or a JS function.
                    "function" rules are only supported in .ts/.js config files.

  id                Optional string label. Used in warning/error messages.

  pattern           [regex only] Regular expression string to match against each line.
                    Example: "^## " matches any line starting with "## ".

  flags             [regex only] Regex flags string (default: "").
                    Example: "i" for case-insensitive matching.
                    Note: the "g" flag is automatically stripped (breaks line matching).

  fn                [function only] A JS function (line, lineIndex, allLines) => result | null
                    Return { splitBehavior, metadata?, filename? } to split, or null/false to skip.
                    Example: split when three consecutive blank lines are found.

  splitBehavior     What to do when the rule matches a line (default: "before"):
                      "before"  — the matched line becomes the first line of the NEW chunk
                      "after"   — the matched line is the last line of the CURRENT chunk, then split
                      "exclude" — the matched line is dropped; the split happens here

  filenameStrategy  How to name the output file for each chunk (default: "index"):
                      "index"    — sequential number: chunk-001, chunk-002, ...
                      "heading"  — slugified text of the first heading (# / ## / ...) in the chunk
                      "match"    — slugified text of the line that triggered the split
                      "template" — custom template string (see filenameTemplate below)

  filenameTemplate  [strategy: "template" only] Template string with placeholders:
                      {index}   — zero-padded chunk index
                      {slug}    — slugified first heading of the chunk
                      {title}   — same as slug (or from metadata.title if set)
                      {<key>}   — any key from chunk metadata
                    Example: "chapter-{index}-{title}"

  priority          Integer (default: 0). When multiple rules match the same line,
                    the rule with the highest priority wins. Ties go to the first-defined rule.

  metadataExtract   [regex only] Map from named capture group → metadata key.
                    Allows extracting data from the matched line into chunk metadata.
                    Example: pattern "^# (?<title>.+)", metadataExtract: { "title": "title" }
                    → chunk.metadata.title = the captured heading text

────────────────────────────────────────────────────────────────
Output Formats (-f / --format)
────────────────────────────────────────────────────────────────
  md           One .md file per chunk. Content is verbatim from the source.
  json-files   One .json file per chunk: { index, filename, metadata, content }
  json-array   Single .json file (named after input): array of all chunk objects

────────────────────────────────────────────────────────────────
Examples
────────────────────────────────────────────────────────────────
  # Split on H2 headings; name files after the heading text
  markdown-split -i book.md -o parts/ \\
    -r '{"pattern":"^## ","splitBehavior":"before","filenameStrategy":"heading"}'

  # Split after every H1; name files with a custom template
  markdown-split -i book.md -o out/ \\
    -r '{"pattern":"^# ","splitBehavior":"after","filenameStrategy":"template","filenameTemplate":"ch-{index}-{slug}"}'

  # Extract title from heading via named capture group into metadata
  markdown-split -i book.md -o out/ -f json-array \\
    -r '{"pattern":"^# (?<title>.+)","metadataExtract":{"title":"title"},"filenameStrategy":"template","filenameTemplate":"{title}"}'

  # Split on horizontal rules (---), drop the separator line
  markdown-split -i notes.md -o parts/ \\
    -r '{"pattern":"^---\\\\s*$","splitBehavior":"exclude"}'

  # Use a .ts config file with function rules; output as JSON array; dry-run preview
  markdown-split -i big.md -f json-array -c split.config.ts --dry-run

  # Use a JSON config file and allow overwriting existing output
  markdown-split -i big.md -c config.json --overwrite
`

export async function run(argv: string[]): Promise<void> {
  const args = argv.slice(2)  // strip bun executable + script path

  if (args.includes("-h") || args.includes("--help") || args.length === 0) {
    console.log(HELP)
    process.exit(0)
  }

  // ─── Parse arguments ────────────────────────────────────────────────────────
  let input: string | undefined
  let outputDir: string | undefined
  let format: CliOptions["format"] | undefined
  let configPath: string | undefined
  let prefix: string | undefined
  let indexPad: number | undefined
  let dryRun: boolean | undefined
  let overwrite: boolean | undefined
  let keepEmpty: boolean | undefined
  let verbose: boolean | undefined
  let debug: boolean | undefined
  const inlineRules: AnyRule[] = []

  let i = 0

  function requireValue(flag: string): string {
    const value = args[i + 1]
    if (value === undefined || value.startsWith("-")) {
      fatal(`Missing value for ${flag}`)
    }
    i++
    return value
  }

  for (; i < args.length; i++) {
    const arg = args[i]
    switch (arg) {
      case "-i":
      case "--input":
        input = requireValue(arg)
        break
      case "-o":
      case "--output-dir":
        outputDir = requireValue(arg)
        break
      case "-f":
      case "--format":
        format = requireValue(arg) as CliOptions["format"]
        break
      case "-c":
      case "--config":
        configPath = requireValue(arg)
        break
      case "-r":
      case "--rule": {
        const raw = requireValue(arg)
        try {
          const parsed = JSON.parse(raw)
          if (!parsed.pattern && parsed.type !== "function") {
            throw new Error('Inline rule must have a "pattern" field (or type "function")')
          }
          inlineRules.push(parsed as AnyRule)
        } catch (e) {
          fatal(`Invalid --rule JSON: ${(e as Error).message}\n  Input: ${raw}`)
        }
        break
      }
      case "--prefix":
        prefix = requireValue(arg)
        break
      case "--index-pad":
        indexPad = parseInt(requireValue(arg), 10)
        if (isNaN(indexPad)) fatal("--index-pad must be a number")
        break
      case "--dry-run":
        dryRun = true
        break
      case "--overwrite":
        overwrite = true
        break
      case "--keep-empty":
        keepEmpty = true
        break
      case "-v":
      case "--verbose":
        verbose = true
        break
      case "--debug":
        debug = true
        break
      default:
        fatal(`Unknown argument: ${arg}`)
    }
  }

  if (!input) fatal("--input (-i) is required")

  // Validate format
  const validFormats = ["md", "json-array", "json-files"]
  if (format && !validFormats.includes(format)) {
    fatal(`Invalid --format "${format}". Must be one of: ${validFormats.join(", ")}`)
  }

  // ─── Load config file ───────────────────────────────────────────────────────
  let configFile = undefined
  if (configPath) {
    try {
      configFile = await loadConfigFile(configPath)
    } catch (e) {
      fatal((e as Error).message)
    }
  }

  // ─── Merge options ──────────────────────────────────────────────────────────
  const options = mergeConfig({
    input: input!,
    outputDir,
    format,
    inlineRules,
    configFile,
    prefix,
    indexPad,
    dryRun,
    overwrite,
    keepEmpty,
    verbose,
    debug,
  })

  const dbg = options.debug ? (msg: string) => console.error(`[debug] ${msg}`) : () => {}

  dbg(`input: ${resolve(options.input)}`)
  dbg(`format: ${options.format}  outputDir: ${options.outputDir}  dryRun: ${options.dryRun}`)

  dbg('─── config ───')
  dbg(`config files: ${JSON.stringify(configFile)}`)
  dbg(`config inline: ${JSON.stringify({ input, outputDir, format, prefix, indexPad, dryRun, overwrite, keepEmpty, verbose, debug })}`)
  dbg(`config: ${JSON.stringify(options)}`)
  dbg('');

  dbg(`rules: ${options.rules.length} (${options.rules.map((r) => ("pattern" in r ? r.pattern : r.id ?? "fn")).join(", ") || "none"})`)

  if (options.rules.length === 0) {
    console.warn("[warn] No rules defined — the entire file will be a single chunk")
  }

  // ─── Read input file ────────────────────────────────────────────────────────
  const inputPath = resolve(options.input)
  let content: string
  try {
    content = await readText(inputPath)
  } catch {
    fatal(`Cannot read input file: ${inputPath}`)
  }

  const lineCount = content!.split("\n").length
  dbg(`read ${lineCount} line(s) from ${inputPath}`)

  // ─── Parse ──────────────────────────────────────────────────────────────────
  const compiledRules = compileRules(options.rules)
  dbg(`compiled ${compiledRules.length} rule(s)`)

  const chunks = parse(content!, compiledRules, { keepEmpty: options.keepEmpty })
  dbg(`parsed → ${chunks.length} chunk(s)`)

  if (chunks.length === 0) {
    console.log("No chunks produced (empty input or all chunks were filtered)")
    return
  }

  if (options.rules.length > 0 && chunks.every((c) => !c.triggerRule)) {
    console.warn("[warn] No rules matched — the entire file became a single chunk")
  }

  // ─── Name chunks ────────────────────────────────────────────────────────────
  assignFilenames(chunks, options)
  dbg(`named chunks: ${chunks.map((c) => c.filename).join(", ")}`)

  // ─── Create output dir ──────────────────────────────────────────────────────
  if (!options.dryRun) {
    try {
      await ensureDir(options.outputDir)
    } catch (e) {
      fatal(`Cannot create output directory "${options.outputDir}": ${(e as Error).message}`)
    }
    dbg(`ensured output dir: ${options.outputDir}`)
  }

  // ─── Write ──────────────────────────────────────────────────────────────────
  dbg(`writing ${chunks.length} chunk(s) as ${options.format}…`)
  try {
    await writeChunks(chunks, inputPath, options)
  } catch (e) {
    fatal((e as Error).message)
  }

  // ─── Summary ────────────────────────────────────────────────────────────────
  if (options.verbose) {
    for (const chunk of chunks) {
      console.log(
        `  [${String(chunk.index).padStart(3)}] ${chunk.filename} (${chunk.lines.length} lines)` +
        (Object.keys(chunk.metadata).length > 0 ? ` meta=${JSON.stringify(chunk.metadata)}` : "")
      )
    }
  }

  const action = options.dryRun ? "Would write" : "Wrote"
  console.log(`${action} ${chunks.length} chunk(s) to "${options.outputDir}"`)
}

function fatal(msg: string): never {
  console.error(`[error] ${msg}`)
  process.exit(1)
}
