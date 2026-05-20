import { z } from "zod";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { walk } from "../lib/walker.js";
import { getModifiedFiles } from "../lib/git.js";
import { buildGraph } from "../lib/graphBuilder.js";

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../");

export const mapDependenciesSchema = z.object({
  targetFile: z.string().min(1).optional().describe("Entry file (absolute or relative to `root`)"),
  onlyModified: z.boolean().optional().default(false).describe("If true, uses git-modified files as entry points"),
  format: z.enum(["markdown", "json", "graph"]).optional().default("markdown").describe("Output format: 'markdown' (tree), 'json' (raw), 'graph' (compact nodes+edges for AI)"),
  root: z.string().optional().describe("Absolute path to the project root (default: MCP server root)"),
});

export async function mapDependenciesHandler({ targetFile, onlyModified, format, root }) {
  const base = root ? resolve(root) : PROJECT_ROOT;
  let entryPoints = [];

  if (onlyModified) {
    entryPoints = getModifiedFiles(base);
    if (entryPoints.length === 0) {
      return { content: [{ type: "text", text: "Nessun file modificato nel working tree." }] };
    }
  } else if (targetFile) {
    entryPoints = [resolve(base, targetFile)];
  } else {
    return {
      content: [{ type: "text", text: "Errore: fornire `targetFile` oppure impostare `onlyModified: true`." }],
    };
  }

  const visited = new Set();
  const merged = new Map();

  for (const entry of entryPoints) {
    const map = walk(entry, 10, false, visited, 0, base);
    for (const [k, v] of map) merged.set(k, v);
  }

  const text =
    format === "json"    ? formatJson(entryPoints, merged) :
    format === "graph"   ? formatGraph(entryPoints, merged, base) :
    formatMarkdown(entryPoints, merged);

  return { content: [{ type: "text", text }] };
}

function formatGraph(entryPoints, map, root) {
  const { nodes, edges } = buildGraph(map, root);
  return JSON.stringify({ totalFiles: nodes.length, nodes, edges }, null, 2);
}

function formatJson(entryPoints, map) {
  const graph = {};
  for (const [path, node] of map) {
    graph[path] = { depth: node.depth, imports: node.imports };
  }
  return JSON.stringify({ entryPoints, totalFiles: map.size, graph }, null, 2);
}

function formatMarkdown(entryPoints, map) {
  const lines = [];
  lines.push("# Dependency Map");
  lines.push(`Entry points: **${entryPoints.length}** | Total files: **${map.size}**`);
  lines.push("\n## Dependency Tree\n");

  const visitedInTree = new Set();

  function renderTree(absolutePath, indentLevel) {
    const indent = "  ".repeat(indentLevel);
    if (visitedInTree.has(absolutePath)) {
      lines.push(`${indent}- \`${absolutePath}\` *(already visited)*`);
      return;
    }
    visitedInTree.add(absolutePath);
    lines.push(`${indent}- \`${absolutePath}\``);
    const node = map.get(absolutePath);
    if (node) {
      for (const child of node.imports) renderTree(child, indentLevel + 1);
    }
  }

  for (const entry of entryPoints) renderTree(entry, 0);

  lines.push("\n## Flat File List\n");
  let i = 1;
  for (const [path] of map) lines.push(`${i++}. \`${path}\``);

  return lines.join("\n");
}
