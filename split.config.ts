import type { Config } from "./src/types.ts"

export default {
  rules: [
    {
      id: "h2-regex",
      pattern: "^## ",
      splitBehavior: "before",
      filenameStrategy: "heading",
      priority: 5,
    },
    {
      type: "function" as const,
      id: "triple-blank-lines",
      priority: 3,
      fn(line, lineIndex, allLines) {
        if (
          line.trim() === "" &&
          allLines[lineIndex - 1]?.trim() === "" &&
          allLines[lineIndex - 2]?.trim() === ""
        ) {
          return { splitBehavior: "exclude" as const }
        }
        return null
      },
      filenameStrategy: "index" as const,
    },
  ],
  output: {
    format: "md" as const,
    dir: "./out",
    overwrite: true,
  },
} satisfies Config
