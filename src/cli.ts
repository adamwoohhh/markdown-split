import { resolve } from "node:path"
import type { AnyRule, CliOptions } from "./types.ts"
import { loadConfigFile, mergeConfig } from "./config.ts"
import { compileRules } from "./rules.ts"
import { parse } from "./parser.ts"
import { assignFilenames } from "./namer.ts"
import { writeChunks, ensureDir } from "./writer.ts"

const HELP = `
Usage: bun run index.ts [options]

Options:
  -i, --input <file>        Input .md file (required)
  -o, --output-dir <dir>    Output directory (default: ".")
  -f, --format <fmt>        Output format: md | json-array | json-files (default: md)
  -c, --config <file>       Config file path (.json, .ts, .js, .mjs)
  -r, --rule <json>         Inline rule as JSON string (repeatable)
      --prefix <str>        Filename prefix (default: "chunk")
      --index-pad <n>       Zero-padding width for index numbers (default: 3)
      --dry-run             Print output paths without writing files
      --overwrite           Allow overwriting existing output files
      --keep-empty          Keep zero-line chunks (filtered by default)
  -v, --verbose             Print per-chunk details
  -h, --help                Show this help message

Examples:
  # Split on H2 headings, output as MD files with heading-based filenames
  bun run index.ts -i big.md -o parts/ \\
    -r '{"pattern":"^## ","splitBehavior":"before","filenameStrategy":"heading"}'

  # Use a config file, output as a single JSON array
  bun run index.ts -i big.md -f json-array -c split.config.ts

  # Preview filenames without writing
  bun run index.ts -i big.md -c config.json --dry-run
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
  })

  if (options.rules.length === 0) {
    console.warn("[warn] No rules defined — the entire file will be a single chunk")
  }

  // ─── Read input file ────────────────────────────────────────────────────────
  const inputPath = resolve(options.input)
  let content: string
  try {
    content = await Bun.file(inputPath).text()
  } catch {
    fatal(`Cannot read input file: ${inputPath}`)
  }

  // ─── Parse ──────────────────────────────────────────────────────────────────
  const compiledRules = compileRules(options.rules)
  const chunks = parse(content!, compiledRules, { keepEmpty: options.keepEmpty })

  if (chunks.length === 0) {
    console.log("No chunks produced (empty input or all chunks were filtered)")
    return
  }

  if (options.rules.length > 0 && chunks.length === 1) {
    console.warn("[warn] No rules matched — the entire file became a single chunk")
  }

  // ─── Name chunks ────────────────────────────────────────────────────────────
  assignFilenames(chunks, options)

  // ─── Create output dir ──────────────────────────────────────────────────────
  if (!options.dryRun) {
    await ensureDir(options.outputDir)
  }

  // ─── Write ──────────────────────────────────────────────────────────────────
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
