/**
 * Runtime compatibility shim.
 * Provides Bun-equivalent APIs that fall back to Node.js `fs/promises`
 * so the bundle runs under both Bun and Node.js (>= 18).
 */
import { readFile, writeFile } from "node:fs/promises"

const isBun = typeof globalThis.Bun !== "undefined"

/** argv without the runtime executable and script path */
export const argv: string[] = isBun ? Bun.argv : process.argv

/** Read a file as UTF-8 text */
export async function readText(path: string): Promise<string> {
  if (isBun) return Bun.file(path).text()
  return readFile(path, "utf8")
}

/** Write text or binary content to a file */
export async function writeContent(
  path: string,
  content: string | ArrayBuffer
): Promise<void> {
  if (isBun) {
    await Bun.write(path, content)
    return
  }
  const data =
    typeof content === "string" ? content : Buffer.from(content)
  await writeFile(path, data)
}
