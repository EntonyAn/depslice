import { z } from "zod";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readdirSync } from "node:fs";
import { readSource, extractImports } from "../lib/parser.js";
import { resolveImport, isSupportedFile } from "../lib/resolver.js";
import { loadAliases } from "../lib/aliases.js";

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../");

export const findDependentsSchema = z.object({
  targetFile: z.string().min(1).describe("File di cui trovare i dipendenti (assoluto o relativo a `root`)"),
  root: z.string().optional().describe("Directory radice del progetto da analizzare (default: root del server MCP)"),
  scanRoot: z.string().optional().describe("Sottodirectory da scansionare (default: uguale a `root`)"),
  transitive: z.boolean().optional().default(false).describe("Se true, include dipendenti transitivi"),
  maxDepth: z.number().int().min(1).max(10).optional().default(3).describe("Profondità massima per ricerca transitiva (default 3)"),
});

export function collectAllFiles(dir) {
  const results = [];
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return results; }
  for (const entry of entries) {
    const full = resolve(dir, entry.name);
    if (entry.isDirectory() && entry.name !== "node_modules" && !entry.name.startsWith(".")) {
      results.push(...collectAllFiles(full));
    } else if (entry.isFile() && isSupportedFile(full)) {
      results.push(full);
    }
  }
  return results;
}

export function buildReverseIndex(files, aliasMap = new Map()) {
  const index = new Map();
  for (const file of files) {
    let source;
    try { source = readSource(file); } catch { continue; }
    const rawImports = extractImports(source);
    for (const imp of rawImports) {
      const resolved = resolveImport(imp, file, aliasMap);
      if (!resolved) continue;
      if (!index.has(resolved)) index.set(resolved, new Set());
      index.get(resolved).add(file);
    }
  }
  return index;
}

export async function findDependentsHandler({ targetFile, root, scanRoot, transitive, maxDepth }) {
  const base = root ? resolve(root) : PROJECT_ROOT;
  const absoluteTarget = resolve(base, targetFile);
  const scanDir = scanRoot ? resolve(base, scanRoot) : base;

  const allFiles = collectAllFiles(scanDir);
  const aliasMap = loadAliases(base);
  const reverseIndex = buildReverseIndex(allFiles, aliasMap);

  let dependents;
  if (!transitive) {
    dependents = [...(reverseIndex.get(absoluteTarget) ?? [])];
  } else {
    dependents = [];
    const queue = [absoluteTarget];
    const seen = new Set([absoluteTarget]);
    let depth = 0;
    while (queue.length && depth < maxDepth) {
      const next = [];
      for (const node of queue) {
        for (const importer of (reverseIndex.get(node) ?? [])) {
          if (!seen.has(importer)) {
            seen.add(importer);
            dependents.push(importer);
            next.push(importer);
          }
        }
      }
      queue.splice(0, queue.length, ...next);
      depth++;
    }
  }

  const lines = [
    `# Dependents of \`${absoluteTarget}\``,
    `Scan root: \`${scanDir}\` | Files scanned: **${allFiles.length}**`,
    `Mode: ${transitive ? `transitive (maxDepth=${maxDepth})` : "direct"}`,
    `Found **${dependents.length}** dependent(s):\n`,
    ...dependents.map((d) => `- \`${d}\``),
  ];

  return { content: [{ type: "text", text: lines.join("\n") }] };
}
