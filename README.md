# markdown-split

将大 Markdown 文件按自定义规则拆分为多个小文件，支持输出 `.md` 或 `.json` 格式。

## 安装

```bash
bun install
```

## 快速开始

```bash
# 按 H2 标题拆分，文件名取标题文字
bun run index.ts -i book.md -o parts/ \
  -r '{"pattern":"^## ","splitBehavior":"before","filenameStrategy":"heading"}'

# 预览（不写入文件）
bun run index.ts -i book.md -o parts/ \
  -r '{"pattern":"^## ","filenameStrategy":"heading"}' --dry-run
```

## CLI 参数

```
Options:
  -i, --input <file>        输入 .md 文件（必需）
  -o, --output-dir <dir>    输出目录，相对于当前工作目录（默认："."）
  -f, --format <fmt>        输出格式：md | json-array | json-files（默认：md）
  -c, --config <file>       配置文件路径（.json、.ts、.js、.mjs）
  -r, --rule <json>         内联规则 JSON 字符串（可重复使用）
      --prefix <str>        index 策略的文件名前缀（默认："chunk"）
      --index-pad <n>       序号补零位数（默认：3）
      --dry-run             预览输出路径，不实际写入文件
      --overwrite           允许覆盖已有输出文件
      --keep-empty          保留空 chunk（默认过滤）
  -v, --verbose             打印每个 chunk 的详细信息
  -h, --help                显示帮助信息
```

## 规则字段（Rule Fields）

每条规则是一个 JSON 对象，通过 `-r` 传入，或写在配置文件的 `rules` 数组中。

| 字段 | 说明 |
|---|---|
| `type` | `"regex"`（默认，可省略）或 `"function"`。函数规则仅支持 `.ts`/`.js` 配置文件。 |
| `id` | 可选字符串标签，出现在警告/错误信息中。 |
| `pattern` | [regex] 匹配每行的正则表达式字符串。示例：`"^## "` |
| `flags` | [regex] 正则标志（默认 `""`）。`"g"` 标志会被自动剥除。 |
| `fn` | [function] JS 函数 `(line, lineIndex, allLines) => result \| null`，返回 `{ splitBehavior, metadata?, filename? }` 表示切分，返回 `null`/`false` 表示跳过。 |
| `splitBehavior` | 匹配行的处理方式（默认 `"before"`）：<br>`"before"` — 匹配行作为**新 chunk 的首行**<br>`"after"` — 匹配行作为**当前 chunk 的末行**，之后切分<br>`"exclude"` — 匹配行**丢弃**，在此切分 |
| `filenameStrategy` | 输出文件名策略（默认 `"index"`）：<br>`"index"` — 序号，如 `chunk-001`<br>`"heading"` — chunk 内第一个标题的 slug<br>`"match"` — 触发切分那行的 slug<br>`"template"` — 自定义模板字符串 |
| `filenameTemplate` | [strategy: template] 模板占位符：`{index}`、`{slug}`、`{title}`、`{<key>}`（任意 metadata 键） |
| `priority` | 整数（默认 `0`）。同一行多规则命中时，优先级最高者获胜；相同则取先定义的。 |
| `metadataExtract` | [regex] 命名捕获组 → metadata 键的映射，用于提取行内数据到 chunk 元信息。 |

## 输出格式

| 格式 | 说明 |
|---|---|
| `md` | 每个 chunk 输出一个 `.md` 文件，内容与源文件一致 |
| `json-files` | 每个 chunk 输出一个 `.json` 文件：`{ index, filename, metadata, content }` |
| `json-array` | 所有 chunk 合并为单个 `.json` 文件（以输入文件名命名） |

### json-files 示例

每个 chunk 单独输出为一个 JSON 文件，适合需要逐文件处理的场景：

```bash
markdown-split -i book.md -o out/ -f json-files \
  -r '{"pattern":"^## ","splitBehavior":"before","filenameStrategy":"heading"}'
```

输出目录结构：

```
out/
  chapter-one.json
  chapter-two.json
  ...
```

每个文件的内容结构：

```json
{
  "index": 1,
  "filename": "chapter-one",
  "metadata": {},
  "content": "## Chapter One\n\nChapter one content."
}
```

如果使用了 `metadataExtract` 提取字段，`metadata` 会包含对应数据：

```bash
markdown-split -i book.md -o out/ -f json-files \
  -r '{"pattern":"^## (?<title>.+)","splitBehavior":"before","filenameStrategy":"heading","metadataExtract":{"title":"title"}}'
```

```json
{
  "index": 1,
  "filename": "chapter-one",
  "metadata": { "title": "Chapter One" },
  "content": "## Chapter One\n\nChapter one content."
}
```

### json-array 示例

所有 chunk 合并输出为单个 JSON 文件，适合批量导入或进一步程序化处理：

```bash
markdown-split -i book.md -o out/ -f json-array \
  -r '{"pattern":"^## ","splitBehavior":"before","filenameStrategy":"heading"}'
```

输出为 `out/book.json`，内容为数组：

```json
[
  {
    "index": 1,
    "filename": "chapter-one",
    "metadata": {},
    "content": "## Chapter One\n\nChapter one content."
  },
  {
    "index": 2,
    "filename": "chapter-two",
    "metadata": {},
    "content": "## Chapter Two\n\nChapter two content."
  }
]
```

## 配置文件

支持两种格式：

### JSON 配置（仅支持正则规则）

```json
{
  "rules": [
    {
      "id": "h1-split",
      "pattern": "^# ",
      "splitBehavior": "before",
      "filenameStrategy": "heading",
      "priority": 10
    },
    {
      "id": "divider",
      "pattern": "^---\\s*$",
      "splitBehavior": "exclude"
    }
  ],
  "output": {
    "format": "md",
    "dir": "./output",
    "prefix": "part",
    "indexPad": 3,
    "overwrite": false
  }
}
```

### TS/JS 配置（支持函数规则）

```typescript
// split.config.ts
import type { Config } from './src/types.ts'

export default {
  rules: [
    {
      id: "h2-split",
      pattern: "^## ",
      splitBehavior: "before",
      filenameStrategy: "heading",
      priority: 5,
    },
    {
      type: "function" as const,
      id: "triple-blank",
      priority: 3,
      fn(line, lineIndex, allLines) {
        // 连续三行空行时切分
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
```

使用：

```bash
markdown-split -i big.md -c split.config.ts
```

## 使用示例

```bash
# 按 H2 切分，文件名取标题
markdown-split -i book.md -o parts/ \
  -r '{"pattern":"^## ","splitBehavior":"before","filenameStrategy":"heading"}'

# 按 H1 切分，after 模式（标题归当前 chunk 末尾），自定义模板命名
markdown-split -i book.md -o out/ \
  -r '{"pattern":"^# ","splitBehavior":"after","filenameStrategy":"template","filenameTemplate":"ch-{index}-{slug}"}'

# 用命名捕获组提取标题到 metadata，输出 JSON 数组
markdown-split -i book.md -o out/ -f json-array \
  -r '{"pattern":"^# (?<title>.+)","metadataExtract":{"title":"title"},"filenameStrategy":"template","filenameTemplate":"{title}"}'

# 按水平线（---）切分，丢弃分隔行
markdown-split -i notes.md -o parts/ \
  -r '{"pattern":"^---\\s*$","splitBehavior":"exclude"}'

# 使用 TS 配置文件，输出 JSON 数组，dry-run 预览
markdown-split -i big.md -f json-array -c split.config.ts --dry-run

# 使用 JSON 配置，允许覆盖已有输出
markdown-split -i big.md -c config.json --overwrite
```

## 开发

```bash
# 运行（开发模式）
bun run start

# 类型检查
bun run typecheck

# 运行测试
bun test

# 构建为 Node.js 兼容产物
bun run build

# 构建独立二进制（macOS x64）
bun run build:bin
```

## 技术栈

- 运行时：[Bun](https://bun.com) v1.3+（也可通过 `bun run build` 构建为 Node.js 兼容产物）
- 语言：TypeScript（strict 模式，`noUncheckedIndexedAccess`）
- 测试：`bun test`
