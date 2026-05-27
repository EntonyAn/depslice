# depslice

[![npm version](https://img.shields.io/npm/v/depslice)](https://www.npmjs.com/package/depslice)
[![npm downloads](https://img.shields.io/npm/dm/depslice)](https://www.npmjs.com/package/depslice)
[![license](https://img.shields.io/npm/l/depslice)](LICENSE)
[![node](https://img.shields.io/node/v/depslice)](package.json)
[![stars](https://img.shields.io/github/stars/entonyan/depslice?style=flat)](https://github.com/entonyan/depslice/stargazers)

**Dependency analysis for JavaScript and TypeScript projects.**  
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

## Quick start

```bash
npm install -g depslice

depslice map src/index.js          # see the full dependency tree
depslice graph src/index.js        # open interactive graph in browser
depslice benchmark src/index.js    # measure token savings vs naive AI
```

Every command has a short alias:

```bash
depslice m src/index.js            # map
depslice g src/index.js            # graph
depslice a src/index.js            # analyze
depslice b src/index.js            # benchmark
depslice d src/index.js            # dependents
```

No config. No setup. Works on any JS/TS project.

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

### Aliases

Every command has a one-letter alias:

| Alias | Command |
|---|---|
| `g` | `graph` |
| `m` | `map` |
| `a` | `analyze` |
| `b` | `benchmark` |
| `d` / `dep` | `dependents` |

```bash
depslice g src/index.js            # same as: depslice graph src/index.js
depslice b src/index.js --depth 3  # same as: depslice benchmark src/index.js --depth 3
```

> **Windows note:** depslice automatically sets the terminal to UTF-8 (`chcp 65001`) so tree characters render correctly in `cmd.exe`.

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

Opens a visual dependency graph in the browser. Nodes are colored by folder and fully interactive.

```bash
depslice graph <file> [--depth <n>] [--root <dir>] [--format html|json]
# or short alias:
depslice g <file>
```

```
$ depslice g src/index.js
Graph opened: /tmp/depslice-graph-1234567890.html
10 nodes · 14 edges · depth ≤ 5
```

**Each node shows at a glance:**
- Filename + file-type badge (`JS` / `TS` / `TSX` / `JSX`) color-coded by language
- Export count (`↑ N exp`) — how many symbols this file exports
- Import count (`→ N imp`) — how many local files it imports
- Line count

**Interactions:**
- **Click a node** — isolates it with an animated wave: the node lights up first, then its edges flow, then connected nodes appear
- **Highlighted edges** animate a flowing dash while a node is isolated
- **Search bar** — find and highlight files by name
- **Depth slider** — filter the graph by import depth in real time
- **Drag nodes** — reposition freely; layout is saved in `localStorage` per project
- **↺ Reset layout** — restore the auto-calculated column layout
- **Click background** — deselect and return to full graph view

Use `--format json` to get a compact `{ nodes, edges }` structure for AI agents or tooling:

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

## MCP server

depslice can run as an MCP server so AI agents (Claude, etc.) can call it directly.  
It comes in two flavours: **local** (reads your files directly) and **remote** (hosted in the cloud, analyzes GitHub repos).

---

### Local MCP (Claude Desktop)

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

Restart Claude Desktop after saving.

### Install from Smithery

depslice is available on [Smithery](https://smithery.ai/server/depslice) — install it in one click without editing any config file.

---

### Remote MCP (hosted, GitHub repos)

The remote server runs in the cloud and lets Claude analyze **any public GitHub repo** without installing anything.

**Connect Claude.ai:**

Go to *Settings → Integrations → Add MCP server* and enter:
```
https://depslice.up.railway.app/mcp
```

**Or add to `claude_desktop_config.json`:**
```json
{
  "mcpServers": {
    "depslice-remote": {
      "type": "http",
      "url": "https://depslice.up.railway.app/mcp"
    }
  }
}
```

Once connected, Claude can analyze any public GitHub repo:

> *"Map the dependencies of fastify/fastify"*  
> *"What files depend on lib/hooks.js in expressjs/express?"*

**Self-host:** deploy `server.js` to Railway, Render, or any Node.js platform:
```bash
# Railway (one command)
railway up

# Local test
node server.js   # http://localhost:3000/mcp
```

---

### Available MCP tools

| Tool | When the agent uses it |
|---|---|
| `analyze_feature` | Loads full source of an entry file and all its dependencies |
| `map_dependencies` | Dependency structure without source; works with `onlyModified: true` |
| `find_dependents` | Impact analysis — every file that imports a given file |

All tools accept:
- `root` — absolute path to a local project
- `githubRepo` — GitHub URL or `owner/repo` shorthand (remote server only)

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

### Performance

File parsing results are cached in memory keyed by absolute path and last-modified time (`mtime`). Repeated calls on the same files are served from cache without re-reading disk. The cache is scoped per project root, so multiple projects can be analyzed in the same session without cross-contamination.

---

## Limitations

depslice is intentionally focused on static local analysis. It does not:

- **Resolve `node_modules`** — only local project files are analyzed. This is by design: you want to understand *your* code, not library internals.
- **Execute code** — analysis is purely static. Dynamic import patterns with runtime variables (e.g. `` import(`./pages/${page}`) ``) are not followed.
- **Follow `export * from '...'`** — re-export hops are not treated as dependency edges.
- **Run tests or builds** — depslice only reads and parses files.

If you need a full call graph including `node_modules`, tools like [dependency-cruiser](https://github.com/sverweij/dependency-cruiser) may be a better fit.

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
