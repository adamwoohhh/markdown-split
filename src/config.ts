import { resolve } from "node:path"
import type { ConfigFile, AnyRule, CliOptions, OutputConfig } from "./types.ts"
import { readText } from "./compat.ts"

export async function loadConfigFile(configPath: string): Promise<ConfigFile> {
  const absPath = resolve(configPath)

  if (configPath.endsWith(".json")) {
    const text = await readText(absPath)
    try {
      return JSON.parse(text) as ConfigFile
    } catch (e) {
      throw new Error(`Failed to parse config file "${configPath}": ${(e as Error).message}`)
    }
  }

  // .ts / .js / .mjs — dynamic import (Bun supports TS natively)
  try {
    const mod = await import(absPath)
    const config = mod.default ?? mod
    return config as ConfigFile
  } catch (e) {
    throw new Error(`Failed to load config file "${configPath}": ${(e as Error).message}`)
  }
}

/**
 * Merge CLI inline rules with config file rules and output settings.
 * CLI options always take precedence over config file settings.
 */
export function mergeConfig(
  cliOptions: Partial<CliOptions> & { input: string; inlineRules: AnyRule[]; configFile?: ConfigFile },
): CliOptions {
  const cfg = cliOptions.configFile
  const cfgOutput: OutputConfig = cfg?.output ?? {}
  const cfgRules: AnyRule[] = cfg?.rules ?? []

  // Inline CLI rules take precedence and are appended after config rules
  const rules: AnyRule[] = [...cfgRules, ...cliOptions.inlineRules]

  return {
    input: cliOptions.input,
    outputDir: cliOptions.outputDir ?? cfgOutput.dir ?? ".",
    format: cliOptions.format ?? cfgOutput.format ?? "md",
    rules,
    prefix: cliOptions.prefix ?? cfgOutput.prefix ?? "chunk",
    indexPad: cliOptions.indexPad ?? cfgOutput.indexPad ?? 3,
    dryRun: cliOptions.dryRun ?? false,
    overwrite: cliOptions.overwrite !== undefined ? cliOptions.overwrite : (cfgOutput.overwrite ?? false),
    keepEmpty: cliOptions.keepEmpty ?? false,
    verbose: cliOptions.verbose ?? false,
  }
}
