import { run } from "./src/cli.ts"
import { argv } from "./src/compat.ts"

run(argv).catch((e) => {
  console.error("[fatal]", e instanceof Error ? e.message : e)
  process.exit(1)
})
