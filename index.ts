import { run } from "./src/cli.ts"

run(Bun.argv).catch((e) => {
  console.error("[fatal]", e instanceof Error ? e.message : e)
  process.exit(1)
})
