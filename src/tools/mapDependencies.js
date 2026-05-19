import { z } from "zod";
import { resolve } from "node:path";
import { walk } from "../lib/walker.js";
import { getModifiedFiles } from "../lib/git.js";

export const mapDependenciesSchema = z.object({
  targetFile: z.string().min(1).optional().describe("File di partenza (assoluto o relativo al cwd)"),
  onlyModified: z.boolean().optional().default(false).describe("Se true, usa i file modificati da git status come entry point"),
  format: z.enum(["markdown", "json"]).optional().default("markdown").describe("Formato output: 'markdown' o 'json'"),
});

export async function mapDependenciesHandler({ targetFile, onlyModified, format }) {
  let entryPoints = [];

  if (onlyModified) {
    entryPoints = getModifiedFiles();
    if (entryPoints.length === 0) {
      return { content: [{ type: "text", text: "Nessun file modificato nel working tree." }] };
    }
  } else if (targetFile) {
    entryPoints = [resolve(process.cwd(), targetFile)];
  } else {
    return {
      content: [{ type: "text", text: "Errore: fornire `targetFile` oppure impostare `onlyModified: true`." }],
    };
  }

  const visited = new Set();
  const merged = new Map();

  for (const entry of entryPoints) {
    const map = walk(entry, 10, false, visited);
    for (const [k, v] of map) merged.set(k, v);
  }

  const text = format === "json"
    ? formatJson(entryPoints, merged)
    : formatMarkdown(entryPoints, merged);

  return { content: [{ type: "text", text }] };
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
