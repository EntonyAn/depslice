# depslice

Dependency analysis tool for JavaScript and TypeScript projects.  
Works as a **CLI** for humans and as an **MCP server** for AI agents (Claude, etc.).

Instead of reading dozens of files one by one, depslice lets you load exactly the code that matters â€” the entry point you care about and everything it imports, recursively.

```
src/lib/walker.js  Â·  4 files  Â·  depth â‰¤ 5

src/lib/walker.js (101 ln)  â†’  walk
â”œâ”€â”€ src/lib/parser.js (55 ln)  â†’  readSource, extractImports, extractExports
â”œâ”€â”€ src/lib/resolver.js (65 ln)  â†’  isSupportedFile, resolveImport, probeExtensions
â””â”€â”€ src/lib/aliases.js (46 ln)  â†’  loadAliases
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

### `analyze` â€” dependency tree with source

Recursively follows all local imports from an entry file and prints a compact summary: file name, line count, and exported symbols.

```bash
depslice analyze <file> [--depth <n>] [--root <dir>] [--full]
```

```
$ depslice analyze src/lib/walker.js

src/lib/walker.js  Â·  4 files  Â·  depth â‰¤ 5

src/lib/walker.js (101 ln)  â†’  walk
â”œâ”€â”€ src/lib/parser.js (55 ln)  â†’  readSource, extractImports, extractExports
â”œâ”€â”€ src/lib/resolver.js (65 ln)  â†’  isSupportedFile, resolveImport, probeExtensions
â””â”€â”€ src/lib/aliases.js (46 ln)  â†’  loadAliases
```

Add `--full` to print the complete source of every file (useful for piping into an AI context):

```bash
depslice analyze src/auth/index.ts --full | pbcopy
```

### `map` â€” dependency structure without source

Shows the dependency tree without loading file contents. Faster and lighter than `analyze`.  
Supports `--modified` to use git-modified files as entry points automatically.

```bash
depslice map <file> [--root <dir>] [--format tree|json]
depslice map --modified [--root <dir>] [--format tree|json]
```

```
$ depslice map index.js

index.js  Â·  9 files

index.js (32 ln)
â”œâ”€â”€ src/tools/analyzeFeature.js (43 ln)
â”‚   â””â”€â”€ src/lib/walker.js (101 ln)
â”‚       â”œâ”€â”€ src/lib/parser.js (55 ln)
â”‚       â””â”€â”€ src/lib/resolver.js (65 ln)
â”‚           â””â”€â”€ src/lib/aliases.js (46 ln)
â”œâ”€â”€ src/tools/mapDependencies.js (84 ln)
â”‚   â”œâ”€â”€ src/lib/walker.js (101 ln)  â†‘ already shown
â”‚   â””â”€â”€ src/lib/git.js (27 ln)
â””â”€â”€ src/tools/findDependents.js (89 ln)
    â”œâ”€â”€ src/lib/parser.js (55 ln)  â†‘ already shown
    â””â”€â”€ src/lib/resolver.js (65 ln)  â†‘ already shown
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

### `dependents` â€” impact analysis

Finds every file that imports a given file. Use this before changing a shared module to understand the blast radius.

```bash
depslice dependents <file> [--transitive] [--depth <n>] [--root <dir>] [--scan-root <dir>]
```

```
$ depslice dependents src/lib/parser.js --transitive

src/lib/parser.js  Â·  scanned 10 files

Direct (2)
â”œâ”€â”€ src/lib/walker.js
â””â”€â”€ src/tools/findDependents.js

Transitive (4)
â”œâ”€â”€ src/cli/index.js  via walker.js
â”œâ”€â”€ src/tools/analyzeFeature.js  via walker.js
â”œâ”€â”€ src/tools/mapDependencies.js  via walker.js
â””â”€â”€ index.js  via findDependents.js
```

### Analyzing a project other than the current directory

Pass `--root` to point depslice at any project on your machine:

```bash
depslice analyze src/App.tsx --root /path/to/my-react-app
depslice map --modified --root /path/to/my-react-app
depslice dependents src/hooks/useAuth.ts --transitive --root /path/to/my-react-app
```

---

## MCP server (Claude Desktop)

depslice can run as an MCP server so AI agents (Claude, etc.) can call it directly.

### Setup

Add this to your `claude_desktop_config.json`:

**macOS / Linux** â€” `~/.config/Claude/claude_desktop_config.json`  
**Windows** â€” `%APPDATA%\Claude\claude_desktop_config.json`

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
| `analyze_feature` | Before reading files â€” loads full source of an entry point and all its dependencies |
| `map_dependencies` | To understand project structure without loading source; also works with `onlyModified: true` |
| `find_dependents` | Before modifying a shared file â€” returns every file that depends on it |

All tools accept a `root` parameter (absolute path to the project being analyzed).

### Telling Claude to use depslice automatically

Copy the `CLAUDE.md` file from this repo into the root of any project you want Claude to analyze with depslice. Claude Code reads this file automatically and will call the tools proactively instead of opening files one by one.

---

## How it works

depslice performs **static import analysis** â€” it parses `import`/`require` statements without executing the code.

**Supported:**
- ES modules (`import ... from '...'`)
- CommonJS (`require('...')`)
- Dynamic imports with static string (`import('./module')`)
- TypeScript path aliases (`@/`, `~/`, etc.) via `tsconfig.json` / `jsconfig.json`
- Extensions: `.js` `.ts` `.jsx` `.tsx` `.mjs` `.cjs` `.mts` `.cts`
- Barrel files / index resolution (`import './components'` â†’ `components/index.ts`)

**Not supported:**
- Dynamic imports with runtime variables (e.g. `` import(`./pages/${name}`) ``)
- `node_modules` (intentionally â€” only local project files)
- `export * from '...'` as a dependency hop

### Performance

File parsing results are cached in memory keyed by absolute path and last-modified time (`mtime`). Repeated calls on the same files are served from cache without re-reading disk. The cache is scoped per project root, so multiple projects can be analyzed in the same session without cross-contamination.

---

## Options reference

| Flag | Commands | Description |
|---|---|---|
| `--root <dir>` | all | Absolute path to the project root. Defaults to `cwd`. |
| `--depth <n>` | `analyze`, `graph`, `dependents` | Max recursion / BFS depth. Default: 5 (analyze/graph), 3 (dependents). |
| `--full` | `analyze` | Print full file source instead of compact summary. |
| `--modified` | `map` | Use git-modified files as entry points. |
| `--format <fmt>` | `map`, `graph` | `map`: `tree` (default) or `json`. `graph`: `html` (default, opens browser) or `json`. |
| `--transitive` | `dependents` | Include transitive dependents (BFS). |
| `--scan-root <dir>` | `dependents` | Subdirectory to scan. Defaults to `--root`. |

---

## Requirements

- **Node.js** 18 or later
- **Git** (only required for `--modified` / `onlyModified: true`)

---

## License

MIT

