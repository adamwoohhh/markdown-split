#!/usr/bin/env bun
// npm bin entry point — requires Bun runtime (https://bun.sh).
// Runs the bundled dist file directly via Bun.
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))
await import(join(__dirname, "..", "dist", "markdown-split.js"))
