import { z } from "zod";
import { resolve, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { walk } from "../lib/walker.js";

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../");

export const analyzeFeatureSchema = z.object({
  entryFile: z.string().min(1).describe("Percorso del file di ingresso (assoluto o relativo a `root`)"),
  maxDepth: z.number().int().min(1).max(20).optional().default(5).describe("Profondità massima di ricorsione (default 5)"),
  root: z.string().optional().describe("Directory radice da cui risolvere i path relativi (default: root del server MCP)"),
});

const EXT_LANG = {
  ".js": "js", ".mjs": "js", ".cjs": "js",
  ".ts": "ts",
  ".jsx": "jsx",
  ".tsx": "tsx",
};

export async function analyzeFeatureHandler({ entryFile, maxDepth, root }) {
  const base = root ? resolve(root) : PROJECT_ROOT;
  const absoluteEntry = resolve(base, entryFile);
  const map = walk(absoluteEntry, maxDepth, true, new Set(), 0, base);

  const lines = [];
  lines.push(`# Dependency Analysis: \`${absoluteEntry}\``);
  lines.push(`Found **${map.size}** file(s) — max depth: ${maxDepth}\n`);

  for (const [, node] of map) {
    lines.push("---\n");
    lines.push(`## \`${node.absolutePath}\` (depth: ${node.depth})\n`);
    if (node.source === null) {
      lines.push("_[unreadable]_\n");
    } else {
      const lang = EXT_LANG[extname(node.absolutePath)] ?? "text";
      lines.push("```" + lang);
      lines.push(node.source);
      lines.push("```\n");
    }
  }

  return { content: [{ type: "text", text: lines.join("\n") }] };
}
