# git-slicer

Dependency analysis tool for JavaScript and TypeScript projects.  
Works as a **CLI** for humans and as an **MCP server** for AI agents (Claude, etc.).

Instead of reading dozens of files one by one, git-slicer lets you load exactly the code that matters — the entry point you care about and everything it imports, recursively.

```
src/lib/walker.js  ·  4 files  ·  depth ≤ 5

src/lib/walker.js (101 ln)  →  walk
├── src/lib/parser.js (55 ln)  →  readSource, extractImports, extractExports
├── src/lib/resolver.js (65 ln)  →  isSupportedFile, resolveImport, probeExtensions
└── src/lib/aliases.js (46 ln)  →  loadAliases
```

---

## Install

```bash
# run without installing
npx git-slicer analyze src/index.js

# or install globally
npm install -g git-slicer
```

**Requires Node.js 18 or later.**

---

## CLI usage

All commands accept an optional `--root <dir>` flag. If omitted, the current working directory is used.

### `analyze` — dependency tree with source

Recursively follows all local imports from an entry file and prints a compact summary: file name, line count, and exported symbols.

```bash
git-slicer analyze <file> [--depth <n>] [--root <dir>] [--full]
```

```
$ git-slicer analyze src/lib/walker.js

src/lib/walker.js  ·  4 files  ·  depth ≤ 5

src/lib/walker.js (101 ln)  →  walk
├── src/lib/parser.js (55 ln)  →  readSource, extractImports, extractExports
├── src/lib/resolver.js (65 ln)  →  isSupportedFile, resolveImport, probeExtensions
└── src/lib/aliases.js (46 ln)  →  loadAliases
```

Add `--full` to print the complete source of every file (useful for piping into an AI context):

```bash
git-slicer analyze src/auth/index.ts --full | pbcopy
```

### `map` — dependency structure without source

Shows the dependency tree without loading file contents. Faster and lighter than `analyze`.  
Supports `--modified` to use git-modified files as entry points automatically.

```bash
git-slicer map <file> [--root <dir>] [--format tree|json]
git-slicer map --modified [--root <dir>] [--format tree|json]
```

```
$ git-slicer map index.js

index.js  ·  9 files

index.js (32 ln)
├── src/tools/analyzeFeature.js (43 ln)
│   └── src/lib/walker.js (101 ln)
│       ├── src/lib/parser.js (55 ln)
│       └── src/lib/resolver.js (65 ln)
│           └── src/lib/aliases.js (46 ln)
├── src/tools/mapDependencies.js (84 ln)
│   ├── src/lib/walker.js (101 ln)  ↑ already shown
│   └── src/lib/git.js (27 ln)
└── src/tools/findDependents.js (89 ln)
    ├── src/lib/parser.js (55 ln)  ↑ already shown
    └── src/lib/resolver.js (65 ln)  ↑ already shown
```

### `dependents` — impact analysis

Finds every file that imports a given file. Use this before changing a shared module to understand the blast radius.

```bash
git-slicer dependents <file> [--transitive] [--depth <n>] [--root <dir>] [--scan-root <dir>]
```

```
$ git-slicer dependents src/lib/parser.js --transitive

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

### Analyzing a project other than the current directory

Pass `--root` to point git-slicer at any project on your machine:

```bash
git-slicer analyze src/App.tsx --root /path/to/my-react-app
git-slicer map --modified --root /path/to/my-react-app
git-slicer dependents src/hooks/useAuth.ts --transitive --root /path/to/my-react-app
```

---

## MCP server (Claude Desktop)

git-slicer can run as an MCP server so AI agents (Claude, etc.) can call it directly.

### Setup

Add this to your `claude_desktop_config.json`:

**macOS / Linux** — `~/.config/Claude/claude_desktop_config.json`  
**Windows** — `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "git-slicer": {
      "command": "npx",
      "args": ["git-slicer", "--mcp"],
      "cwd": "/path/to/your/project"
    }
  }
}
```

Or if installed globally:

```json
{
  "mcpServers": {
    "git-slicer": {
      "command": "node",
      "args": ["/path/to/git-slicer/index.js"],
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

### Telling Claude to use git-slicer automatically

Copy the `CLAUDE.md` file from this repo into the root of any project you want Claude to analyze with git-slicer. Claude Code reads this file automatically and will call the tools proactively instead of opening files one by one.

---

## How it works

git-slicer performs **static import analysis** — it parses `import`/`require` statements without executing the code.

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
| `--depth <n>` | `analyze`, `dependents` | Max recursion / BFS depth. Default: 5 (analyze), 3 (dependents). |
| `--full` | `analyze` | Print full file source instead of compact summary. |
| `--modified` | `map` | Use git-modified files as entry points. |
| `--format <fmt>` | `map` | Output format: `tree` (default) or `json`. |
| `--transitive` | `dependents` | Include transitive dependents (BFS). |
| `--scan-root <dir>` | `dependents` | Subdirectory to scan. Defaults to `--root`. |

---

## Requirements

- **Node.js** 18 or later
- **Git** (only required for `--modified` / `onlyModified: true`)

---

## License

MIT
