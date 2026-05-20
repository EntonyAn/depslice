import { relative } from "node:path";
import { walk } from "./walker.js";

// ── Token estimation ───────────────────────────────────────────────────────
// Standard approximation used by OpenAI and Anthropic: 1 token ≈ 4 chars.
// Close enough for benchmarking purposes without adding tiktoken as a dep.
function tokens(text) {
  return Math.ceil((text ?? "").length / 4);
}

// Realistic overhead per tool call: the model pays tokens for
// the tool request JSON + response wrapper, even before reading content.
// Measured empirically on Claude tool use: ~180–220 tokens per call.
const TOOL_OVERHEAD = 200;

// ── Output formatters (reproduce what each tool actually returns) ──────────

function formatNaiveRead(source, filePath) {
  // Simulates what a Read tool call returns: path header + source content
  return `File: ${filePath}\n${source ?? "[unreadable]"}`;
}

function formatMapOutput(map, root) {
  const lines = [];
  const visited = new Set();

  function renderNode(absPath, prefix, isLast) {
    const node = map.get(absPath);
    const id = relative(root, absPath).replace(/\\/g, "/");
    const connector = prefix === "" ? "" : isLast ? "└── " : "├── ";
    const continuation = prefix === "" ? "" : isLast ? "    " : "│   ";
    const lineInfo = node?.lines ? ` (${node.lines} ln)` : "";
    const already = visited.has(absPath) ? "  → already shown" : "";

    lines.push(`${prefix}${connector}${id}${lineInfo}${already}`);
    if (visited.has(absPath) || !node) return;
    visited.add(absPath);

    const children = node.imports.filter(c => map.has(c));
    children.forEach((child, i) =>
      renderNode(child, prefix + continuation, i === children.length - 1)
    );
  }

  const entry = [...map.keys()][0];
  renderNode(entry, "", true);
  return lines.join("\n");
}

function formatAnalyzeSummary(map, root) {
  // Compact one-line-per-file summary: what analyze_feature returns without --full
  const lines = [];
  for (const [absPath, node] of map) {
    const id = relative(root, absPath).replace(/\\/g, "/");
    const exp = node.exports?.length ? `  →  ${node.exports.join(", ")}` : "";
    lines.push(`${id} (${node.lines} ln)${exp}`);
  }
  return lines.join("\n");
}

function formatFullSource(map, root) {
  // What analyze_feature returns with includeSource: true
  const parts = [];
  for (const [absPath, node] of map) {
    const id = relative(root, absPath).replace(/\\/g, "/");
    parts.push(`${"─".repeat(60)}\n${id} (depth ${node.depth})\n${"─".repeat(60)}\n${node.source ?? "[unreadable]"}`);
  }
  return parts.join("\n\n");
}

// ── Core benchmark ─────────────────────────────────────────────────────────

export function runBenchmark(entryFile, root, maxDepth = 5) {
  const map = walk(entryFile, maxDepth, true, new Set(), 0, root);

  // Strategy A — Naive: agent reads every file individually with Read tool
  let naiveTokens = 0;
  for (const [absPath, node] of map) {
    const id = relative(root, absPath).replace(/\\/g, "/");
    const output = formatNaiveRead(node.source, id);
    naiveTokens += tokens(output) + TOOL_OVERHEAD;
  }

  // Strategy B — depslice map only (compact tree, no source)
  const mapText = formatMapOutput(map, root);
  const mapTokens = tokens(mapText) + TOOL_OVERHEAD;

  // Strategy C — depslice analyze summary (exports + line counts, no source)
  const summaryText = formatAnalyzeSummary(map, root);
  const summaryTokens = tokens(summaryText) + TOOL_OVERHEAD;

  // Strategy D — depslice map + analyze summary (recommended AI workflow)
  const mapAndSummaryTokens = mapTokens + summaryTokens;

  // Strategy E — depslice analyze with full source (1 call instead of N)
  const fullSourceText = formatFullSource(map, root);
  const fullSourceTokens = tokens(fullSourceText) + TOOL_OVERHEAD;

  return {
    fileCount: map.size,
    entry: relative(root, entryFile).replace(/\\/g, "/"),
    strategies: {
      naive:         { label: "Naive  (read files 1-by-1)",      calls: map.size, tokens: naiveTokens },
      map:           { label: "depslice  map",                    calls: 1,        tokens: mapTokens },
      summary:       { label: "depslice  analyze (summary)",      calls: 1,        tokens: summaryTokens },
      mapAndSummary: { label: "depslice  map + summary",          calls: 2,        tokens: mapAndSummaryTokens },
      fullSource:    { label: "depslice  analyze (full source)",   calls: 1,        tokens: fullSourceTokens },
    },
  };
}
