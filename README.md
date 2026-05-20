# depslice

[![npm version](https://img.shields.io/npm/v/depslice)](https://www.npmjs.com/package/depslice)
[![npm downloads](https://img.shields.io/npm/dm/depslice)](https://www.npmjs.com/package/depslice)
[![license](https://img.shields.io/npm/l/depslice)](LICENSE)
[![node](https://img.shields.io/node/v/depslice)](package.json)

**Dependency analysis tool for JavaScript and TypeScript projects.**  
Works as a **CLI** for humans and as an **MCP server** for AI agents (Claude, etc.).

> *Claude reads 15 files to understand a feature. depslice needs 1.*

```
src/lib/walker.js  ·  4 files  ·  depth ≤ 5

src/lib/walker.js (101 ln)  →  walk
├── src/lib/parser.js (55 ln)  →  readSource, extractImports, extractExports
├── src/lib/resolver.js (65 ln)  →  isSupportedFile, resolveImport, probeExtensions
└── src/lib/aliases.js (46 ln)  →  loadAliases
```

---

## Why depslice

Every time an AI agent opens a file it consumes context window. Without depslice, an agent exploring a 10-file feature reads each file individually — paying the full token cost of every line of source code.

depslice gives the agent the full dependency structure in a single call, at a fraction of the cost.

**Measured on a real project (`depslice` itself):**

| Strategy | Calls | Tokens | Savings |
|---|---|---|---|
| Naive (read files 1-by-1) | 10 | 10,466 | — |
| depslice map | 1 | 328 | **96.9%** |
| depslice map + summary | 2 | 690 | **93.4%** |

Run it on your own project:

```bash
depslice benchmark src/index.js
```

---

## Install

```bash
# run without installing
npx depslice analyze src/index.js

# or install globally
npm install -g depslice
```

**Requires Node.js 18 or later.**

---

## CLI usage

All commands accept an optional `--root <dir>` flag. If omitted, the current working directory is used.

### `analyze` — dependency tree with source

Recursively follows all local imports from an entry file and prints a compact summary: file name, line count, and exported symbols.

```bash
depslice analyze <file> [--depth <n>] [--root <dir>] [--full]
```

```
$ depslice analyze src/lib/walker.js

src/lib/walker.js  ·  4 files  ·  depth ≤ 5

src/lib/walker.js (101 ln)  →  walk
├── src/lib/parser.js (55 ln)  →  readSource, extractImports, extractExports
├── src/lib/resolver.js (65 ln)  →  isSupportedFile, resolveImport, probeExtensions
└── src/lib/aliases.js (46 ln)  →  loadAliases
```

Add `--full` to print the complete source of every file (useful for piping into an AI context):

```bash
depslice analyze src/auth/index.ts --full | pbcopy
```

### `map` — dependency structure without source

Shows the dependency tree without loading file contents. Faster and lighter than `analyze`.  
Supports `--modified` to use git-modified files as entry points automatically.

```bash
depslice map <file> [--root <dir>] [--format tree|json]
depslice map --modified [--root <dir>] [--format tree|json]
```

```
$ depslice map index.js

index.js  ·  9 files

index.js (32 ln)
├── src/tools/analyzeFeature.js (43 ln)
│   └── src/lib/walker.js (101 ln)
│       ├── src/lib/parser.js (55 ln)
│       └── src/lib/resolver.js (65 ln)
│           └── src/lib/aliases.js (46 ln)
├── src/tools/mapDependencies.js (84 ln)
│   ├── src/lib/walker.js (101 ln)  → already shown
│   └── src/lib/git.js (27 ln)
└── src/tools/findDependents.js (89 ln)
    ├── src/lib/parser.js (55 ln)  → already shown
    └── src/lib/resolver.js (65 ln)  → already shown
```

### `graph` — interactive dependency graph

Opens a visual dependency graph in the browser. Nodes are colored by folder, sized by line count, and fully interactive.

```bash
depslice graph <file> [--depth <n>] [--root <dir>] [--format html|json]
```

```
$ depslice graph src/index.js
Graph opened: /tmp/depslice-graph-1234567890.html
10 nodes · 14 edges · depth ≤ 5
```

Features:
- **Click a node** to isolate it and its direct connections — everything else dims
- **Click a folder** in the legend to highlight all files in that folder
- **Search bar** to find and highlight files by name
- **Scroll** to zoom, **drag** to pan, nodes are draggable

Use `--format json` to get a compact `{ nodes, edges }` structure instead of opening the browser — useful for piping into other tools or AI agents:

```bash
depslice graph src/index.js --format json
```

### `dependents` — impact analysis

Finds every file that imports a given file. Use this before changing a shared module to understand the blast radius.

```bash
depslice dependents <file> [--transitive] [--depth <n>] [--root <dir>] [--scan-root <dir>]
```

```
$ depslice dependents src/lib/parser.js --transitive

src/lib/parser.js  ·  scanned 10 files

Direct (2)
├── src/lib/walker.js
└── src/tools/findDependents.js

Transitive (4)
├── src/cli/index.js  via walker.js
├── src/tools/analyzeFeature.js  via walker.js
├── src/tools/mapDependencies.js  via walker.js
└── index.js  via findDependents.js
```

### `benchmark` — measure token savings

Measures exactly how many tokens an AI agent would consume with and without depslice, on your actual project files.

```bash
depslice benchmark <file> [--depth <n>] [--root <dir>]
```

```
$ depslice benchmark src/index.js

depslice benchmark  ·  src/index.js  ·  10 files
──────────────────────────────────────────────────────────────
Strategy                               Calls    Tokens
──────────────────────────────────────────────────────────────
Naive  (read files 1-by-1)                10    10,466
depslice  map                              1       328 ◀
depslice  analyze (summary)                1       362
depslice  map + summary                    2       690
depslice  analyze (full source)            1     8,982
──────────────────────────────────────────────────────────────

Token savings vs naive

  depslice  map                         96.9%  ███████████████████████████░
  depslice  map + summary               93.4%  ██████████████████████████░░

Cost savings per query (Claude Sonnet @ $3/1M tokens)
  naive $0.0314  →  depslice $0.0021  (saves $0.0293 per query)
  × 100 queries/day  →  $2.93/day  ·  $88/month
```

### Analyzing a project other than the current directory

Pass `--root` to point depslice at any project on your machine:

```bash
depslice analyze src/App.tsx --root /path/to/my-react-app
depslice map --modified --root /path/to/my-react-app
depslice dependents src/hooks/useAuth.ts --transitive --root /path/to/my-react-app
depslice benchmark src/index.ts --root /path/to/my-react-app
```

---

## MCP server (Claude Desktop)

depslice can run as an MCP server so AI agents (Claude, etc.) can call it directly.

### Setup

Add this to your `claude_desktop_config.json`:

**macOS / Linux** — `~/.config/Claude/claude_desktop_config.json`  
**Windows** — `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "depslice": {
      "command": "npx",
      "args": ["depslice", "--mcp"],
      "cwd": "/path/to/your/project"
    }
  }
}
```

Or if installed globally:

```json
{
  "mcpServers": {
    "depslice": {
      "command": "node",
      "args": ["/path/to/depslice/index.js"],
      "cwd": "/path/to/your/project"
    }
  }
}
```

Restart Claude Desktop after saving.

### Available MCP tools

| Tool | When the agent uses it |
|---|---|
| `analyze_feature` | Before reading files — loads full source of an entry point and all its dependencies |
| `map_dependencies` | To understand project structure without loading source; also works with `onlyModified: true` |
| `find_dependents` | Before modifying a shared file — returns every file that depends on it |

All tools accept a `root` parameter (absolute path to the project being analyzed).

### Telling Claude to use depslice automatically

Copy the `CLAUDE.md` file from this repo into the root of any project you want Claude to analyze with depslice. Claude Code reads this file automatically and will call the tools proactively instead of opening files one by one.

---

## How it works

depslice performs **static import analysis** — it parses `import`/`require` statements without executing the code.

**Supported:**
- ES modules (`import ... from '...'`)
- CommonJS (`require('...')`)
- Dynamic imports with static string (`import('./module')`)
- TypeScript path aliases (`@/`, `~/`, etc.) via `tsconfig.json` / `jsconfig.json`
- Extensions: `.js` `.ts` `.jsx` `.tsx` `.mjs` `.cjs` `.mts` `.cts`
- Barrel files / index resolution (`import './components'` → `components/index.ts`)

**Not supported:**
- Dynamic imports with runtime variables (e.g. `` import(`./pages/${name}`) ``)
- `node_modules` (intentionally — only local project files)
- `export * from '...'` as a dependency hop

### Performance

File parsing results are cached in memory keyed by absolute path and last-modified time (`mtime`). Repeated calls on the same files are served from cache without re-reading disk. The cache is scoped per project root, so multiple projects can be analyzed in the same session without cross-contamination.

---

## Options reference

| Flag | Commands | Description |
|---|---|---|
| `--root <dir>` | all | Absolute path to the project root. Defaults to `cwd`. |
| `--depth <n>` | `analyze`, `graph`, `benchmark`, `dependents` | Max recursion / BFS depth. Default: 5 (analyze/graph/benchmark), 3 (dependents). |
| `--full` | `analyze` | Print full file source instead of compact summary. |
| `--modified` | `map` | Use git-modified files as entry points. |
| `--format <fmt>` | `map`, `graph` | `map`: `tree` (default) or `json`. `graph`: `html` (default) or `json`. |
| `--transitive` | `dependents` | Include transitive dependents (BFS). |
| `--scan-root <dir>` | `dependents` | Subdirectory to scan. Defaults to `--root`. |

---

## Requirements

- **Node.js** 18 or later
- **Git** (only required for `--modified` / `onlyModified: true`)

---

## License

MIT
