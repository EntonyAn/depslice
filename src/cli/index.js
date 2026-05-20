#!/usr/bin/env node
import { resolve, relative, dirname, basename } from "node:path";
import { tmpdir } from "node:os";
import { writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { walk } from "../lib/walker.js";
import { getModifiedFiles } from "../lib/git.js";
import { collectAllFiles, buildReverseIndex } from "../tools/findDependents.js";
import { loadAliases } from "../lib/aliases.js";
import { buildGraph, generateHtml } from "../lib/graphBuilder.js";
import { runBenchmark } from "../lib/benchmark.js";

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../");
const CWD = process.cwd();

const HELP = `
depslice — dependency analysis tool

USAGE
  depslice <command> [options]

COMMANDS
  analyze <file>              Show dependency tree with exports and line counts
  map <file>                  Show dependency structure (no source, no exports)
  map --modified              Map dependencies of git-modified files
  graph <file>                Open interactive dependency graph in the browser
  dependents <file>           Find all files that import a given file

GLOBAL OPTIONS
  --root <dir>                Root directory of the project to analyze.
                              File arguments are resolved relative to this.
                              Defaults to the current working directory.

OPTIONS
  analyze:
    --depth <n>               Max recursion depth (default: 5)
    --full                    Print full source instead of compact summary

  map:
    --modified                Use git-modified files as entry points
    --format <fmt>            Output format: tree (default) or json

  graph:
    --depth <n>               Max recursion depth (default: 5)
    --format <fmt>            Output format: html (default, opens browser) or json

  benchmark:
    --depth <n>               Max recursion depth (default: 5)

  dependents:
    --transitive              Include transitive dependents
    --depth <n>               Max BFS depth for transitive search (default: 3)
    --scan-root <dir>         Subdirectory to scan (default: same as --root)

EXAMPLES
  depslice analyze src/index.js
  depslice analyze src/index.js --root /path/to/other-project
  depslice map src/lib/parser.js
  depslice map --modified --root /path/to/other-project
  depslice graph src/index.js
  depslice graph src/index.js --format json
  depslice benchmark src/index.js
  depslice dependents src/lib/parser.js --transitive
  depslice dependents src/utils/format.ts --root /path/to/other-project --transitive
`;

// â”€â”€â”€ helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function rel(absolutePath) {
  const r = relative(CWD, absolutePath);
  return r.startsWith("..") ? absolutePath : r;
}

function parseArgs(argv) {
  const flags = {};
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith("--")) { flags[key] = next; i++; }
      else flags[key] = true;
    } else {
      positional.push(a);
    }
  }
  return { flags, positional };
}

function die(msg) {
  process.stderr.write(`Error: ${msg}\n`);
  process.exit(1);
}

function resolveRoot(flagRoot) {
  if (flagRoot) return resolve(flagRoot);
  // Default: cwd so the CLI works on the project the user is inside
  return CWD;
}

// â”€â”€â”€ tree renderer â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function renderTree(map, absolutePath, prefix, isLast, visited, showExports) {
  const node = map.get(absolutePath);
  const connector = isLast ? "â””â”€â”€ " : "â”œâ”€â”€ ";
  const continuation = isLast ? "    " : "â”‚   ";

  const name = rel(absolutePath).replace(/\\/g, "/");
  const lineInfo = node?.lines ? ` (${node.lines} ln)` : "";
  const exportsInfo = showExports && node?.exports?.length
    ? `  â†’  ${node.exports.join(", ")}`
    : "";

  const alreadyVisited = visited.has(absolutePath);
  const suffix = alreadyVisited ? "  â†‘ already shown" : "";

  process.stdout.write(`${prefix}${connector}${name}${lineInfo}${exportsInfo}${suffix}\n`);

  if (alreadyVisited || !node) return;
  visited.add(absolutePath);

  const children = node.imports.filter((c) => map.has(c));
  for (let i = 0; i < children.length; i++) {
    renderTree(map, children[i], prefix + continuation, i === children.length - 1, visited, showExports);
  }
}

function renderRoot(map, absolutePath, visited, showExports) {
  const node = map.get(absolutePath);
  const name = rel(absolutePath).replace(/\\/g, "/");
  const lineInfo = node?.lines ? ` (${node.lines} ln)` : "";
  const exportsInfo = showExports && node?.exports?.length
    ? `  â†’  ${node.exports.join(", ")}`
    : "";
  process.stdout.write(`${name}${lineInfo}${exportsInfo}\n`);
  if (!node) return;
  visited.add(absolutePath);
  const children = node.imports.filter((c) => map.has(c));
  for (let i = 0; i < children.length; i++) {
    renderTree(map, children[i], "", i === children.length - 1, visited, showExports);
  }
}

// â”€â”€â”€ commands â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async function cmdAnalyze(file, { depth = 5, full = false, root }) {
  const entry = resolve(root, file);
  const map = walk(entry, depth, full, new Set(), 0, root);

  if (full) {
    for (const [, node] of map) {
      process.stdout.write(`\n${"â”€".repeat(60)}\n`);
      process.stdout.write(`${rel(node.absolutePath)} (depth ${node.depth})\n`);
      process.stdout.write(`${"â”€".repeat(60)}\n`);
      process.stdout.write(node.source ?? "[unreadable]\n");
    }
    return;
  }

  process.stdout.write(`${rel(entry).replace(/\\/g, "/")}  Â·  ${map.size} file${map.size !== 1 ? "s" : ""}  Â·  depth â‰¤ ${depth}\n\n`);
  renderRoot(map, entry, new Set(), true);
}

async function cmdMap(file, { modified = false, format = "tree", root }) {
  let entryPoints;
  if (modified) {
    entryPoints = getModifiedFiles(root);
    if (entryPoints.length === 0) { process.stdout.write("No modified files in working tree.\n"); return; }
  } else {
    if (!file) die("missing file argument\n\nUsage: depslice map <file> | depslice map --modified");
    entryPoints = [resolve(root, file)];
  }

  const visited = new Set();
  const merged = new Map();
  for (const entry of entryPoints) {
    const m = walk(entry, 10, false, visited, 0, root);
    for (const [k, v] of m) merged.set(k, v);
  }

  if (format === "json") {
    const graph = {};
    for (const [p, node] of merged) graph[p] = { depth: node.depth, imports: node.imports };
    process.stdout.write(JSON.stringify({ entryPoints, totalFiles: merged.size, graph }, null, 2) + "\n");
    return;
  }

  const label = modified ? `${entryPoints.length} modified file(s)` : rel(entryPoints[0]).replace(/\\/g, "/");
  process.stdout.write(`${label}  Â·  ${merged.size} file${merged.size !== 1 ? "s" : ""}\n\n`);

  const treeVisited = new Set();
  for (const entry of entryPoints) {
    renderRoot(merged, entry, treeVisited, false);
  }
}

function fmt(n) { return n.toLocaleString("en-US").padStart(8); }
function pct(saved, total) { return ((saved / total) * 100).toFixed(1).padStart(5) + "%"; }
function bar(ratio, width = 28) {
  const filled = Math.round(ratio * width);
  return "█".repeat(filled) + "░".repeat(width - filled);
}

async function cmdBenchmark(file, { depth = 5, root }) {
  const entry = resolve(root, file);
  const result = runBenchmark(entry, root, depth);

  const { naive, map, summary, mapAndSummary, fullSource } = result.strategies;
  const W = 62;
  const line = "─".repeat(W);

  process.stdout.write(`\ndepslice benchmark  ·  ${result.entry}  ·  ${result.fileCount} files\n`);
  process.stdout.write(`${line}\n`);
  process.stdout.write(`${"Strategy".padEnd(38)} ${"Calls".padStart(5)}  ${"Tokens".padStart(8)}\n`);
  process.stdout.write(`${line}\n`);

  const rows = [naive, map, summary, mapAndSummary, fullSource];
  for (const s of rows) {
    const isBest = s.tokens === Math.min(...rows.map(r => r.tokens));
    const marker = isBest ? " ◀" : "  ";
    process.stdout.write(`${s.label.padEnd(38)} ${String(s.calls).padStart(5)}  ${fmt(s.tokens)}${marker}\n`);
  }

  process.stdout.write(`${line}\n`);
  process.stdout.write("\nToken savings vs naive\n\n");

  const strategies = [map, summary, mapAndSummary, fullSource];
  for (const s of strategies) {
    const saved = naive.tokens - s.tokens;
    const ratio = saved / naive.tokens;
    process.stdout.write(`  ${s.label.padEnd(36)} ${pct(saved, naive.tokens)}  ${bar(ratio)}\n`);
  }

  process.stdout.write("\n");

  // Cost at typical rates
  const rates = [
    { name: "Claude Sonnet  ($3/1M in)", usd: 3 / 1_000_000 },
    { name: "GPT-4o         ($2.50/1M in)", usd: 2.5 / 1_000_000 },
  ];
  process.stdout.write("Cost savings per query (input tokens)\n\n");
  for (const rate of rates) {
    const naiveCost  = (naive.tokens * rate.usd).toFixed(4);
    const smartCost  = (mapAndSummary.tokens * rate.usd).toFixed(4);
    const savedCost  = ((naive.tokens - mapAndSummary.tokens) * rate.usd).toFixed(4);
    process.stdout.write(`  ${rate.name}\n`);
    process.stdout.write(`    naive $${naiveCost}  →  depslice $${smartCost}  (saves $${savedCost} per query)\n`);
    const perDay100 = ((naive.tokens - mapAndSummary.tokens) * rate.usd * 100).toFixed(2);
    process.stdout.write(`    × 100 queries/day  →  $${perDay100}/day  ·  $${(perDay100 * 30).toFixed(0)}/month\n\n`);
  }
}

async function cmdGraph(file, { depth = 5, format = "html", root }) {
  const entry = resolve(root, file);
  const map = walk(entry, depth, false, new Set(), 0, root);
  const { nodes, edges } = buildGraph(map, root);

  if (format === "json") {
    process.stdout.write(JSON.stringify({ nodes, edges }, null, 2) + "\n");
    return;
  }

  const html = generateHtml({ nodes, edges });
  const outFile = resolve(tmpdir(), `depslice-graph-${Date.now()}.html`);
  writeFileSync(outFile, html, "utf8");

  const opener =
    process.platform === "win32" ? `start "" "${outFile}"` :
    process.platform === "darwin" ? `open "${outFile}"` :
    `xdg-open "${outFile}"`;

  execSync(opener, { stdio: "ignore", shell: true });
  process.stdout.write(`Graph opened: ${outFile}\n`);
  process.stdout.write(`${nodes.length} nodes · ${edges.length} edges · depth ≤ ${depth}\n`);
}

async function cmdDependents(file, { transitive = false, depth = 3, scanRoot, root }) {
  const absoluteTarget = resolve(root, file);
  const scanDir = scanRoot ? resolve(root, scanRoot) : root;

  const allFiles = collectAllFiles(scanDir);
  const aliasMap = loadAliases(root);
  const reverseIndex = buildReverseIndex(allFiles, aliasMap);

  const direct = [...(reverseIndex.get(absoluteTarget) ?? [])];

  process.stdout.write(`${rel(absoluteTarget).replace(/\\/g, "/")}  Â·  scanned ${allFiles.length} files\n\n`);

  if (!transitive) {
    if (direct.length === 0) { process.stdout.write("No dependents found.\n"); return; }
    process.stdout.write(`Direct (${direct.length})\n`);
    for (let i = 0; i < direct.length; i++) {
      const connector = i === direct.length - 1 ? "â””â”€â”€ " : "â”œâ”€â”€ ";
      process.stdout.write(`${connector}${rel(direct[i]).replace(/\\/g, "/")}\n`);
    }
    return;
  }

  const via = new Map();
  const transitiveList = [];
  const queue = [absoluteTarget];
  const seen = new Set([absoluteTarget]);
  let d = 0;

  while (queue.length && d < depth) {
    const next = [];
    for (const node of queue) {
      for (const importer of (reverseIndex.get(node) ?? [])) {
        if (!seen.has(importer)) {
          seen.add(importer);
          via.set(importer, node);
          transitiveList.push(importer);
          next.push(importer);
        }
      }
    }
    queue.splice(0, queue.length, ...next);
    d++;
  }

  const transitiveOnly = transitiveList.filter((f) => !direct.includes(f));
  const total = direct.length + transitiveOnly.length;

  if (total === 0) { process.stdout.write("No dependents found.\n"); return; }

  if (direct.length > 0) {
    process.stdout.write(`Direct (${direct.length})\n`);
    for (let i = 0; i < direct.length; i++) {
      const connector = i === direct.length - 1 ? "â””â”€â”€ " : "â”œâ”€â”€ ";
      process.stdout.write(`${connector}${rel(direct[i]).replace(/\\/g, "/")}\n`);
    }
  }

  if (transitiveOnly.length > 0) {
    process.stdout.write(`\nTransitive (${transitiveOnly.length})\n`);
    for (let i = 0; i < transitiveOnly.length; i++) {
      const connector = i === transitiveOnly.length - 1 ? "â””â”€â”€ " : "â”œâ”€â”€ ";
      const viaNode = via.get(transitiveOnly[i]);
      const viaLabel = viaNode ? `  via ${basename(viaNode)}` : "";
      process.stdout.write(`${connector}${rel(transitiveOnly[i]).replace(/\\/g, "/")}${viaLabel}\n`);
    }
  }
}

// â”€â”€â”€ main â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async function main() {
  const [command, ...rest] = process.argv.slice(2);

  if (!command || command === "--help" || command === "-h") {
    process.stdout.write(HELP);
    process.exit(0);
  }

  const { flags, positional } = parseArgs(rest);
  const root = resolveRoot(flags.root);

  if (command === "analyze") {
    const file = positional[0];
    if (!file) die("missing file argument\n\nUsage: depslice analyze <file>");
    await cmdAnalyze(file, { depth: flags.depth ? Number(flags.depth) : 5, full: flags.full === true, root });

  } else if (command === "map") {
    await cmdMap(positional[0], { modified: flags.modified === true, format: flags.format ?? "tree", root });

  } else if (command === "benchmark") {
    const file = positional[0];
    if (!file) die("missing file argument\n\nUsage: depslice benchmark <file>");
    await cmdBenchmark(file, { depth: flags.depth ? Number(flags.depth) : 5, root });

  } else if (command === "graph") {
    const file = positional[0];
    if (!file) die("missing file argument\n\nUsage: depslice graph <file>");
    await cmdGraph(file, { depth: flags.depth ? Number(flags.depth) : 5, format: flags.format ?? "html", root });

  } else if (command === "dependents") {
    const file = positional[0];
    if (!file) die("missing file argument\n\nUsage: depslice dependents <file>");
    await cmdDependents(file, {
      transitive: flags.transitive === true,
      depth: flags.depth ? Number(flags.depth) : 3,
      scanRoot: flags["scan-root"] ?? undefined,
      root,
    });

  } else {
    die(`unknown command "${command}"\n\nRun depslice --help for usage`);
  }
}

main().catch((err) => {
  process.stderr.write(`${err.message}\n`);
  process.exit(1);
});

