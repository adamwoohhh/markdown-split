// ─── Split behavior ──────────────────────────────────────────────────────────

export type SplitBehavior = "before" | "after" | "exclude"
// before:  matched line becomes the first line of the NEW chunk
// after:   matched line is the last line of the CURRENT chunk, then split
// exclude: matched line is dropped; split happens here

// ─── Filename strategy ────────────────────────────────────────────────────────

export type FilenameStrategy = "index" | "heading" | "match" | "template"
// index:   chunk-001, chunk-002, ...
// heading: slugified text of the first heading in the chunk
// match:   slugified text of the trigger line
// template: user-defined template string, e.g. "section-{index}-{slug}"

// ─── Function rule result ────────────────────────────────────────────────────

export interface FunctionRuleResult {
  splitBehavior: SplitBehavior
  metadata?: Record<string, string>  // injected directly into chunk.metadata
  filename?: string                  // bypass filenameStrategy entirely
}

// ─── Rule definitions (user-facing) ──────────────────────────────────────────

export interface RegexSplitRule {
  type?: "regex"
  id?: string
  pattern: string
  flags?: string                        // default: ""
  splitBehavior?: SplitBehavior         // default: "before"
  filenameStrategy?: FilenameStrategy   // default: "index"
  filenameTemplate?: string             // used when strategy === "template"
  priority?: number                     // default: 0; higher wins
  metadataExtract?: Record<string, string>  // named capture group → metadata key
}

export interface FunctionSplitRule {
  type: "function"
  id?: string
  fn: (
    line: string,
    lineIndex: number,
    allLines: readonly string[]
  ) => FunctionRuleResult | null | false
  filenameStrategy?: FilenameStrategy   // fallback when fn doesn't return filename
  filenameTemplate?: string
  priority?: number
}

export type AnyRule = RegexSplitRule | FunctionSplitRule

// ─── Compiled internal rule forms ────────────────────────────────────────────

export interface CompiledRegexRule {
  kind: "regex"
  id: string
  regex: RegExp
  splitBehavior: SplitBehavior
  filenameStrategy: FilenameStrategy
  filenameTemplate?: string
  priority: number
  metadataExtract: Record<string, string>
  original: RegexSplitRule
}

export interface CompiledFunctionRule {
  kind: "function"
  id: string
  fn: FunctionSplitRule["fn"]
  filenameStrategy: FilenameStrategy
  filenameTemplate?: string
  priority: number
  original: FunctionSplitRule
}

export type CompiledRule = CompiledRegexRule | CompiledFunctionRule

// ─── Match result from the rule engine ───────────────────────────────────────

export interface RuleMatch {
  rule: CompiledRule
  splitBehavior: SplitBehavior
  metadata: Record<string, string>
  filename?: string       // only set when fn returns it directly
  regexMatch?: RegExpMatchArray
}

// ─── Chunk ────────────────────────────────────────────────────────────────────

export interface Chunk {
  index: number                        // 1-based
  lines: string[]
  triggerRule?: CompiledRule
  triggerLine?: string
  metadata: Record<string, string>
  filename?: string                    // resolved by namer before writing
}

// ─── JSON output formats ──────────────────────────────────────────────────────

export interface JsonChunk {
  index: number
  filename: string
  metadata: Record<string, string>
  content: string
}

// ─── Config file schema ───────────────────────────────────────────────────────

export interface OutputConfig {
  format?: "md" | "json-array" | "json-files"
  dir?: string
  prefix?: string
  indexPad?: number
  overwrite?: boolean
}

export interface ConfigFile {
  rules: AnyRule[]
  output?: OutputConfig
}

// Re-export as Config for use in .config.ts files
export type Config = ConfigFile

// ─── Resolved CLI options ─────────────────────────────────────────────────────

export interface CliOptions {
  input: string
  outputDir: string
  format: "md" | "json-array" | "json-files"
  rules: AnyRule[]
  prefix: string
  indexPad: number
  dryRun: boolean
  overwrite: boolean
  keepEmpty: boolean
  verbose: boolean
}
