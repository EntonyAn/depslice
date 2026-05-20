import { relative } from "node:path";

/**
 * Converts a walk() Map into a { nodes, edges } graph structure.
 * nodes: [{ id, lines, depth }]
 * edges: [{ from, to }]
 */
export function buildGraph(map, root = null) {
  const nodes = [];
  const edges = [];
  const seen = new Set();

  for (const [absPath, node] of map) {
    const id = root
      ? relative(root, absPath).replace(/\\/g, "/")
      : absPath;

    if (!seen.has(id)) {
      seen.add(id);
      nodes.push({ id, lines: node.lines ?? 0, depth: node.depth ?? 0 });
    }

    for (const imp of node.imports) {
      if (map.has(imp)) {
        const toId = root
          ? relative(root, imp).replace(/\\/g, "/")
          : imp;
        edges.push({ from: id, to: toId });
      }
    }
  }

  return { nodes, edges };
}

/**
 * Returns the top-level folder of a path like "src/lib/parser.js" → "src/lib"
 * Used for folder-based coloring.
 */
function folderKey(id) {
  const parts = id.split("/");
  if (parts.length <= 1) return "(root)";
  if (parts.length === 2) return parts[0];
  return parts[0] + "/" + parts[1];
}

/**
 * Generates a self-contained interactive HTML dependency graph.
 * Features: folder colors, click-to-isolate, search bar.
 */
export function generateHtml({ nodes, edges }) {
  const data = JSON.stringify({ nodes, edges });

  // Pre-compute folder palette
  const folders = [...new Set(nodes.map(n => folderKey(n.id)))].sort();
  const folderData = JSON.stringify(folders);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>depslice — dependency graph</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { background: #0d1117; color: #e6edf3; font-family: ui-monospace, monospace; overflow: hidden; }
  svg#graph { width: 100vw; height: 100vh; display: block; }
  #search-wrap svg { width: 14px; height: 14px; flex-shrink: 0; }

  .link { stroke: #30363d; stroke-width: 1.5; opacity: 0.8; transition: opacity 0.2s; }
  .link.dimmed { opacity: 0.05; }

  .node circle { stroke-width: 2; cursor: pointer; transition: opacity 0.2s; }
  .node circle.dimmed { opacity: 0.08; }
  .node circle.highlighted { stroke-width: 3; filter: drop-shadow(0 0 6px currentColor); }

  .node text {
    font-size: 11px; fill: #8b949e; pointer-events: none;
    dominant-baseline: middle; transition: opacity 0.2s;
  }
  .node text.dimmed { opacity: 0.08; }
  .node text.highlighted { fill: #e6edf3; font-weight: 600; }

  /* HUD top-left */
  #hud {
    position: fixed; top: 16px; left: 16px;
    background: #161b22cc; border: 1px solid #30363d; border-radius: 8px;
    padding: 10px 14px; font-size: 12px; line-height: 1.9; backdrop-filter: blur(4px);
  }
  #hud strong { color: #e6edf3; font-size: 13px; display: block; }

  /* Search bar */
  #search-wrap {
    position: fixed; top: 16px; left: 50%; transform: translateX(-50%);
    display: flex; align-items: center; gap: 8px;
    background: #161b22cc; border: 1px solid #30363d; border-radius: 8px;
    padding: 7px 12px; backdrop-filter: blur(4px);
  }
  #search { background: none; border: none; outline: none; color: #e6edf3;
    font: 13px ui-monospace, monospace; width: 220px; }
  #search::placeholder { color: #484f58; }
  #search-count { font-size: 11px; color: #8b949e; white-space: nowrap; }

  /* Legend bottom-left */
  #legend {
    position: fixed; bottom: 16px; left: 16px;
    background: #161b22cc; border: 1px solid #30363d; border-radius: 8px;
    padding: 10px 14px; font-size: 11px; color: #8b949e; line-height: 2;
    backdrop-filter: blur(4px); max-height: 50vh; overflow-y: auto;
  }
  .leg { display: flex; align-items: center; gap: 7px; cursor: pointer; }
  .leg:hover { color: #e6edf3; }
  .leg-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }

  /* Hint bottom-right */
  #hint {
    position: fixed; bottom: 16px; right: 16px;
    font-size: 11px; color: #484f58; text-align: right; line-height: 1.8;
  }

  /* Tooltip */
  .tooltip {
    position: fixed; background: #161b22; border: 1px solid #30363d;
    border-radius: 6px; padding: 8px 12px; font-size: 12px; line-height: 1.7;
    pointer-events: none; opacity: 0; transition: opacity 0.15s;
    max-width: 340px; white-space: nowrap; z-index: 10;
  }
  .tooltip strong { color: #e6edf3; display: block; margin-bottom: 2px; }
  .tip-folder { color: #8b949e; }
</style>
</head>
<body>

<div id="hud">
  <strong id="entry-label"></strong>
  <span id="stats-label"></span>
</div>

<div id="search-wrap">
  <svg width="14" height="14" viewBox="0 0 16 16" fill="#484f58">
    <path d="M10.68 11.74a6 6 0 01-7.922-8.982 6 6 0 018.982 7.922l3.04 3.04-.92.92-3.18-3.18zm-5.68.26a5 5 0 100-10 5 5 0 000 10z"/>
  </svg>
  <input id="search" type="text" placeholder="Search file…" autocomplete="off" spellcheck="false">
  <span id="search-count"></span>
</div>

<div id="legend"></div>

<div id="hint">click node to isolate · click again to reset<br>scroll to zoom · drag to pan</div>

<div class="tooltip" id="tooltip"></div>

<svg id="graph">
  <defs>
    <marker id="arrow" markerWidth="7" markerHeight="7" refX="5.5" refY="3.5" orient="auto">
      <path d="M0,0 L0,7 L7,3.5 z" fill="#444c56"/>
    </marker>
  </defs>
  <g id="root"></g>
</svg>

<script src="https://d3js.org/d3.v7.min.js"></script>
<script>
const DATA   = ${data};
const FOLDERS = ${folderData};

// ── Palette ──────────────────────────────────────────────────────────────
const PALETTE = [
  "#58a6ff","#3fb950","#d2a8ff","#ffa657","#f78166",
  "#79c0ff","#56d364","#e3b341","#ff7b72","#a5d6ff"
];
const folderColor = new Map(FOLDERS.map((f, i) => [f, PALETTE[i % PALETTE.length]]));

function folderKey(id) {
  const p = id.split("/");
  if (p.length <= 1) return "(root)";
  if (p.length === 2) return p[0];
  return p[0] + "/" + p[1];
}
const nodeColor = d => folderColor.get(folderKey(d.id)) ?? "#8b949e";
const radius    = d => Math.max(8, Math.min(26, Math.sqrt(d.lines || 10) * 0.95));

// ── Setup ─────────────────────────────────────────────────────────────────
const W = window.innerWidth, H = window.innerHeight;
const svg = d3.select("#graph");
const g   = d3.select("#root");

svg.call(d3.zoom().scaleExtent([0.05, 6]).on("zoom", e => g.attr("transform", e.transform)));

// HUD
const entry = DATA.nodes.find(n => n.depth === 0);
document.getElementById("entry-label").textContent = entry?.id ?? "";
document.getElementById("stats-label").textContent =
  DATA.nodes.length + " files · " + DATA.edges.length + " imports";

// Legend
const legendEl = document.getElementById("legend");
FOLDERS.forEach(f => {
  const div = document.createElement("div");
  div.className = "leg";
  div.innerHTML =
    '<span class="leg-dot" style="background:' + folderColor.get(f) + '"></span>' +
    '<span>' + f + '</span>';
  div.addEventListener("click", () => isolateFolder(f));
  legendEl.appendChild(div);
});

// ── Simulation ────────────────────────────────────────────────────────────
const links = DATA.edges.map(e => ({ source: e.from, target: e.to }));

const sim = d3.forceSimulation(DATA.nodes)
  .force("link",    d3.forceLink(links).id(d => d.id).distance(130).strength(0.5))
  .force("charge",  d3.forceManyBody().strength(-350))
  .force("center",  d3.forceCenter(W / 2, H / 2))
  .force("collide", d3.forceCollide().radius(d => radius(d) + 14));

// ── Render ────────────────────────────────────────────────────────────────
const link = g.append("g")
  .selectAll("line").data(links).enter().append("line")
  .attr("class", "link")
  .attr("marker-end", "url(#arrow)");

const node = g.append("g")
  .selectAll("g").data(DATA.nodes).enter().append("g")
  .attr("class", "node")
  .call(d3.drag()
    .on("start", (e, d) => { if (!e.active) sim.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; })
    .on("drag",  (e, d) => { d.fx = e.x; d.fy = e.y; })
    .on("end",   (e, d) => { if (!e.active) sim.alphaTarget(0); d.fx = null; d.fy = null; })
  );

const circles = node.append("circle")
  .attr("r",      d => radius(d))
  .attr("fill",   d => nodeColor(d) + "22")
  .attr("stroke", d => nodeColor(d));

const labels = node.append("text")
  .attr("x", d => radius(d) + 6)
  .text(d => d.id.split("/").pop());

// ── Tooltip ───────────────────────────────────────────────────────────────
const tip = document.getElementById("tooltip");
node.on("mousemove", (e, d) => {
  const out = links.filter(l => (l.source?.id ?? l.source) === d.id).length;
  const inc = links.filter(l => (l.target?.id ?? l.target) === d.id).length;
  tip.innerHTML =
    "<strong>" + d.id + "</strong>" +
    '<span class="tip-folder">' + folderKey(d.id) + "</span><br>" +
    d.lines + " lines &nbsp;·&nbsp; depth " + d.depth + "<br>" +
    "→ imports " + out + " &nbsp;·&nbsp; ← imported by " + inc;
  tip.style.opacity = "1";
  tip.style.left = (e.clientX + 16) + "px";
  tip.style.top  = (e.clientY - 10) + "px";
}).on("mouseleave", () => { tip.style.opacity = "0"; });

// ── Click to isolate ──────────────────────────────────────────────────────
let isolated = null;

function resetAll() {
  circles.classed("dimmed", false).classed("highlighted", false);
  labels.classed("dimmed", false).classed("highlighted", false);
  link.classed("dimmed", false);
  isolated = null;
}

node.on("click", (e, d) => {
  e.stopPropagation();
  if (isolated === d.id) { resetAll(); return; }
  isolated = d.id;

  const connectedIds = new Set([d.id]);
  links.forEach(l => {
    const s = l.source?.id ?? l.source;
    const t = l.target?.id ?? l.target;
    if (s === d.id) connectedIds.add(t);
    if (t === d.id) connectedIds.add(s);
  });

  circles.classed("dimmed",      nd => !connectedIds.has(nd.id))
         .classed("highlighted", nd => nd.id === d.id);
  labels.classed("dimmed",      nd => !connectedIds.has(nd.id))
        .classed("highlighted", nd => connectedIds.has(nd.id));
  link.classed("dimmed", l => {
    const s = l.source?.id ?? l.source;
    const t = l.target?.id ?? l.target;
    return s !== d.id && t !== d.id;
  });
});

svg.on("click", resetAll);

// ── Isolate by folder (legend click) ─────────────────────────────────────
function isolateFolder(folder) {
  const ids = new Set(DATA.nodes.filter(n => folderKey(n.id) === folder).map(n => n.id));
  isolated = folder;
  circles.classed("dimmed",      nd => !ids.has(nd.id))
         .classed("highlighted", nd => ids.has(nd.id));
  labels.classed("dimmed",      nd => !ids.has(nd.id))
        .classed("highlighted", nd => ids.has(nd.id));
  link.classed("dimmed", l => {
    const s = l.source?.id ?? l.source;
    const t = l.target?.id ?? l.target;
    return !ids.has(s) && !ids.has(t);
  });
}

// ── Search ────────────────────────────────────────────────────────────────
const searchInput = document.getElementById("search");
const searchCount = document.getElementById("search-count");

searchInput.addEventListener("input", () => {
  const q = searchInput.value.trim().toLowerCase();
  if (!q) { resetAll(); searchCount.textContent = ""; return; }

  const matched = new Set(DATA.nodes.filter(n => n.id.toLowerCase().includes(q)).map(n => n.id));
  searchCount.textContent = matched.size + " match" + (matched.size !== 1 ? "es" : "");

  circles.classed("dimmed",      nd => !matched.has(nd.id))
         .classed("highlighted", nd => matched.has(nd.id));
  labels.classed("dimmed",      nd => !matched.has(nd.id))
        .classed("highlighted", nd => matched.has(nd.id));
  link.classed("dimmed", l => {
    const s = l.source?.id ?? l.source;
    const t = l.target?.id ?? l.target;
    return !matched.has(s) && !matched.has(t);
  });
});

// ── Tick ──────────────────────────────────────────────────────────────────
sim.on("tick", () => {
  link
    .attr("x1", d => d.source.x)
    .attr("y1", d => d.source.y)
    .attr("x2", d => {
      const dx = d.target.x - d.source.x, dy = d.target.y - d.source.y;
      const dist = Math.sqrt(dx*dx + dy*dy) || 1;
      return d.target.x - dx / dist * (radius(d.target) + 8);
    })
    .attr("y2", d => {
      const dx = d.target.x - d.source.x, dy = d.target.y - d.source.y;
      const dist = Math.sqrt(dx*dx + dy*dy) || 1;
      return d.target.y - dy / dist * (radius(d.target) + 8);
    });

  node.attr("transform", d => "translate(" + d.x + "," + d.y + ")");
});
</script>
</body>
</html>`;
}
