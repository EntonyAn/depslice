import { relative } from "node:path";

export function buildGraph(map, root = null) {
  const nodes = [];
  const edges = [];
  const seen  = new Set();

  for (const [absPath, node] of map) {
    const id = root ? relative(root, absPath).replace(/\\/g, "/") : absPath;
    if (!seen.has(id)) {
      seen.add(id);
      nodes.push({
        id,
        lines:       node.lines ?? 0,
        depth:       node.depth ?? 0,
        exportCount: node.exports?.length ?? 0,
        importCount: node.imports.filter(i => map.has(i)).length,
        ext:         id.split('.').pop().toLowerCase(),
      });
    }
    for (const imp of node.imports) {
      if (map.has(imp)) {
        const toId = root ? relative(root, imp).replace(/\\/g, "/") : imp;
        edges.push({ from: id, to: toId });
      }
    }
  }
  // Compute importedBy count (blast-radius indicator) for each node
  const importedByCount = new Map();
  for (const e of edges) {
    importedByCount.set(e.to, (importedByCount.get(e.to) ?? 0) + 1);
  }
  for (const n of nodes) {
    n.importedBy = importedByCount.get(n.id) ?? 0;
  }

  return { nodes, edges };
}

function folderKey(id) {
  const p = id.split("/");
  if (p.length <= 1) return "(root)";
  if (p.length === 2) return p[0];
  return p[0] + "/" + p[1];
}

export function generateHtml({ nodes, edges }) {
  const data       = JSON.stringify({ nodes, edges });
  const folders    = [...new Set(nodes.map(n => folderKey(n.id)))].sort();
  const folderData = JSON.stringify(folders);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>depslice — dependency graph</title>
<style>
* { margin:0; padding:0; box-sizing:border-box; }
body {
  background:#0d1117; color:#e6edf3;
  font-family: ui-monospace,'Cascadia Code',monospace;
  overflow:hidden; display:flex; flex-direction:column; height:100vh;
}

/* ── Top bar ── */
#topbar {
  height:44px; background:#161b22; border-bottom:1px solid #21262d;
  display:flex; align-items:center; padding:0 14px; gap:12px;
  flex-shrink:0; z-index:10;
}
#tl-title { font-size:12px; color:#8b949e; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
#tl-title strong { color:#e6edf3; }
#search-wrap {
  display:flex; align-items:center; gap:7px;
  background:#0d1117; border:1px solid #30363d; border-radius:6px;
  padding:5px 10px; flex:1; max-width:260px;
}
#search-wrap svg { flex-shrink:0; }
#search {
  background:none; border:none; outline:none; color:#e6edf3;
  font:12px ui-monospace,monospace; width:100%;
}
#search::placeholder { color:#484f58; }
#depth-wrap {
  display:flex; align-items:center; gap:8px;
  font-size:11px; color:#8b949e; margin-left:auto; white-space:nowrap;
}
#depth-slider { width:90px; accent-color:#58a6ff; cursor:pointer; }
#depth-label  { min-width:30px; color:#e6edf3; font-size:11px; }

/* ── Layout ── */
#main { display:flex; flex:1; overflow:hidden; }

/* ── Sidebar ── */
#sidebar {
  width:230px; flex-shrink:0; background:#161b22;
  border-right:1px solid #21262d;
  display:flex; flex-direction:column; overflow:hidden;
}
#sb-header { padding:11px 14px; border-bottom:1px solid #21262d; flex-shrink:0; }
#sb-header strong { font-size:12px; color:#e6edf3; display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
#sb-header span   { font-size:10px; color:#8b949e; }
#folder-list { flex:1; overflow-y:auto; padding:4px 0; }
#folder-list::-webkit-scrollbar { width:3px; }
#folder-list::-webkit-scrollbar-thumb { background:#30363d; border-radius:2px; }
.fg { }
.fh {
  display:flex; align-items:center; gap:7px; padding:6px 14px;
  cursor:pointer; font-size:11px; color:#8b949e; user-select:none;
  transition:background .1s;
}
.fh:hover { background:#1c2128; color:#c9d1d9; }
.fdot  { width:8px; height:8px; border-radius:50%; flex-shrink:0; }
.fname { flex:1; font-weight:600; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.fcount{ background:#21262d; border-radius:10px; padding:1px 6px; font-size:10px; flex-shrink:0; }
.fchev { font-size:9px; transition:transform .15s; flex-shrink:0; }
.fh.closed .fchev { transform:rotate(-90deg); }
.fi {
  display:flex; align-items:center; gap:6px;
  padding:4px 14px 4px 30px; cursor:pointer; font-size:11px; color:#8b949e;
  transition:background .1s; border-left:2px solid transparent;
}
.fi:hover  { background:#1c2128; color:#e6edf3; }
.fi.active { background:#1c2128; color:#58a6ff; border-left-color:#58a6ff; }
.fi.dimmed { opacity:.2; }
.fn  { flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.fln { font-size:10px; color:#484f58; flex-shrink:0; }
#sb-footer {
  padding:10px 14px; border-top:1px solid #21262d;
  font-size:10px; color:#484f58; line-height:1.9; flex-shrink:0;
}

/* ── Graph area ── */
#graph-wrap { flex:1; overflow:auto; position:relative; background:#0d1117; }
#graph-wrap::-webkit-scrollbar { width:6px; height:6px; }
#graph-wrap::-webkit-scrollbar-track  { background:transparent; }
#graph-wrap::-webkit-scrollbar-thumb  { background:#21262d; border-radius:3px; }
#graph-svg { display:block; overflow:visible; }

/* ── SVG elements ── */
.edge { fill:none; stroke-width:1.5; opacity:0.45; transition:opacity .25s ease, stroke-width .2s ease; }
.edge.dim { opacity:.03; }
.edge.hl  { opacity:1; stroke-width:2.5; stroke-dasharray:6 4; animation:edge-flow 0.5s linear infinite; }
@keyframes edge-flow { to { stroke-dashoffset:-20; } }

.node-g { cursor:grab; transition:filter .2s ease; }
.node-g:hover { filter:drop-shadow(0 0 7px rgba(88,166,255,0.3)); }
.node-g.hl    { filter:drop-shadow(0 0 12px rgba(88,166,255,0.55)); }
.node-g.dim   { filter:none; }
.node-g.dragging { cursor:grabbing; }
.node-rect {
  rx:6; ry:6;
  fill:#161b22; stroke:#30363d; stroke-width:1.5;
  transition:stroke .15s, fill .15s, opacity .15s;
}
.node-g:hover .node-rect { fill:#1c2128; stroke:#58a6ff; }
.node-g.hl .node-rect    { stroke-width:2.5; fill:#1c2128; }
.node-g.dim .node-rect        { opacity:.1; }
.node-g.dim .node-bar         { opacity:.1; }
.node-g.dim .node-folder      { opacity:.1; }
.node-g.dim .node-name        { opacity:.1; }
.node-g.dim .node-meta        { opacity:.1; }
.node-g.dim .node-badge-text  { opacity:.1; }
.node-g.dim .node-divider     { opacity:.1; }
.node-g.dim .node-sizebg      { opacity:.1; }
.node-g.dim .node-sizefill    { opacity:.1; }
.node-rect  { transition:stroke .2s, fill .2s, opacity .25s; }
.node-bar   { transition:opacity .25s; }
.node-name  { transition:opacity .25s; }
.node-meta  { transition:opacity .25s; }

.node-bar      { transition:opacity .15s; }
.node-folder   { font-size:8.5px; fill:#484f58; transition:opacity .15s; }
.node-name     { font-size:11px;  fill:#c9d1d9; transition:opacity .15s; font-weight:600; }
.node-meta     { font-size:9px;   fill:#484f58; transition:opacity .15s; }
.node-badge-text { font-size:8.5px; font-weight:700; }
.node-divider  { stroke:#21262d; stroke-width:1; }
.node-sizebg   { fill:#1c2128; transition:opacity .15s; }
.node-sizefill { transition:opacity .15s, width .3s ease; }

/* column depth label */
.col-label { font-size:10px; fill:#30363d; text-anchor:middle; }

/* tooltip */
.tt {
  position:fixed; background:#161b22; border:1px solid #30363d;
  border-radius:6px; padding:9px 13px; font-size:11px; line-height:1.8;
  pointer-events:none; opacity:0; transition:opacity .12s;
  max-width:300px; white-space:nowrap; z-index:100;
}
.tt-name { color:#e6edf3; font-weight:600; display:block; margin-bottom:2px; }
.tt-meta { color:#8b949e; display:block; }

#hint {
  position:fixed; bottom:12px; right:14px;
  font-size:10px; color:#21262d; line-height:1.9; pointer-events:none;
}
#btn-reset {
  background:#21262d; border:1px solid #30363d; color:#8b949e;
  border-radius:6px; padding:4px 10px; font-size:11px;
  cursor:pointer; flex-shrink:0; transition:color .12s, border-color .12s;
}
#btn-reset:hover { color:#e6edf3; border-color:#58a6ff; }
</style>
</head>
<body>

<div id="topbar">
  <div id="tl-title"><strong id="tl-entry"></strong>&nbsp;<span id="tl-stats"></span></div>
  <div id="search-wrap">
    <svg width="12" height="12" viewBox="0 0 16 16" fill="#484f58">
      <path d="M10.68 11.74a6 6 0 01-7.922-8.982 6 6 0 018.982 7.922l3.04 3.04-.92.92-3.18-3.18zm-5.68.26a5 5 0 100-10 5 5 0 000 10z"/>
    </svg>
    <input id="search" type="text" placeholder="Search file…" autocomplete="off" spellcheck="false">
  </div>
  <div id="depth-wrap">
    <span>Depth</span>
    <input id="depth-slider" type="range" min="0" value="10">
    <span id="depth-label">all</span>
  </div>
  <button id="btn-reset" title="Reset node positions">↺ Reset layout</button>
</div>

<div id="main">
  <div id="sidebar">
    <div id="sb-header">
      <strong id="sb-entry"></strong>
      <span id="sb-stats"></span>
    </div>
    <div id="folder-list"></div>
    <div id="sb-footer"></div>
  </div>
  <div id="graph-wrap">
    <svg id="graph-svg">
      <defs>
        <marker id="arr"    markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L0,8 L8,4z" fill="#6e7681"/></marker>
        <marker id="arr-hl" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L0,8 L8,4z" fill="#58a6ff"/></marker>
      </defs>
    </svg>
  </div>
</div>

<div class="tt" id="tt"></div>
<div id="hint">click to isolate &nbsp;·&nbsp; scroll to pan</div>

<script>
const DATA    = ${data};
const FOLDERS = ${folderData};

// ── Layout constants ──────────────────────────────────────────────────────
const NW = 210;   // node width
const NH = 64;    // node height
const CW = 255;   // column width (center to center)
const RH = 76;    // row height
const PX = 40;    // left/right padding
const PY = 50;    // top/bottom padding

const STORAGE_KEY = "depslice-pos-v2-" + NW + "x" + NH + "-" + (DATA.nodes[0]?.id ?? "graph");

// ── Palette ───────────────────────────────────────────────────────────────
const PAL = ["#58a6ff","#3fb950","#d2a8ff","#ffa657","#f78166","#79c0ff","#56d364","#e3b341","#ff7b72","#a5d6ff","#bc8cff","#ffb86c"];
const fColor = new Map(FOLDERS.map((f,i) => [f, PAL[i % PAL.length]]));

function fkey(id) {
  const p = id.split("/");
  if (p.length<=1) return "(root)";
  if (p.length===2) return p[0];
  return p[0]+"/"+p[1];
}
const ncolor = d => fColor.get(fkey(d.id)) ?? "#8b949e";
const bname  = id => id.split("/").pop();

// ── Folder prefix (dim breadcrumb) ───────────────────────────────────────
function folderPrefix(id) {
  const parts = id.split("/");
  if (parts.length <= 1) return "";
  return parts.slice(0, -1).join("/");
}

// ── importedBy criticality color ─────────────────────────────────────────
function critColor(n) {
  if (n <= 0) return "#484f58";   // unused / entry point
  if (n === 1) return "#6e7681";  // low
  if (n <= 3)  return "#e3b341";  // medium  (yellow)
  if (n <= 6)  return "#ffa657";  // high    (orange)
  return "#f78166";               // critical (red)
}

// ── File-type badge ───────────────────────────────────────────────────────
function extBadge(ext) {
  switch (ext) {
    case "ts":  case "mts": case "cts": return { label:"TS",  bg:"#3178c6", fg:"#fff" };
    case "tsx":                          return { label:"TSX", bg:"#61dafb", fg:"#0d1117" };
    case "jsx":                          return { label:"JSX", bg:"#61dafb", fg:"#0d1117" };
    case "mjs": case "cjs":             return { label:"MJS", bg:"#f0db4f", fg:"#323330" };
    case "js":                           return { label:"JS",  bg:"#f0db4f", fg:"#323330" };
    default:                             return { label: ext.toUpperCase().slice(0,3), bg:"#30363d", fg:"#8b949e" };
  }
}



// ── Pre-compute max lines for relative size bar ───────────────────────────
const maxLines = Math.max(...DATA.nodes.map(n => n.lines), 1);

// ── Group nodes by depth ──────────────────────────────────────────────────
const byDepth = new Map();
DATA.nodes.forEach(n => {
  if (!byDepth.has(n.depth)) byDepth.set(n.depth, []);
  byDepth.get(n.depth).push(n);
});
const maxDepth  = Math.max(...DATA.nodes.map(n=>n.depth));
const maxPerCol = Math.max(...[...byDepth.values()].map(v=>v.length));

// Barycenter sort to reduce edge crossings (3 passes)
for (let pass=0; pass<3; pass++) {
  byDepth.forEach((nodes, depth) => {
    if (depth===0) return;
    nodes.forEach(n => {
      const preds = DATA.edges.filter(e=>e.to===n.id).map(e=>e.from);
      if (!preds.length) return;
      const srcNodes = preds.map(pid => byDepth.get(depth-1)?.findIndex(x=>x.id===pid) ?? 0);
      n._bary = srcNodes.reduce((a,b)=>a+b,0)/srcNodes.length;
    });
    nodes.sort((a,b)=>(a._bary??0)-(b._bary??0));
  });
}

// Assign pixel positions
const totalH = Math.max(maxPerCol * RH + PY*2, 400);
const totalW = (maxDepth+1) * CW + PX*2;

byDepth.forEach((nodes, depth) => {
  const colH  = nodes.length * RH;
  const startY = (totalH - colH) / 2;
  nodes.forEach((n, i) => {
    n.px = PX + depth * CW;
    n.py = startY + i * RH + RH/2;
  });
});

// ── SVG setup ─────────────────────────────────────────────────────────────
const svgEl  = document.getElementById("graph-svg");
const defsEl = svgEl.querySelector("defs");
svgEl.setAttribute("width",  totalW);
svgEl.setAttribute("height", totalH);

const NS = "http://www.w3.org/2000/svg";

function hashStr(s) {
  let h = 0;
  for (const c of s) h = Math.imul(31, h) + c.charCodeAt(0) | 0;
  return (h >>> 0).toString(36);
}
function el(tag, attrs={}, parent=null) {
  const e = document.createElementNS(NS, tag);
  Object.entries(attrs).forEach(([k,v]) => e.setAttribute(k,v));
  if (parent) parent.appendChild(e);
  return e;
}
function txt(str, attrs={}, parent=null) {
  const e = el("text", attrs, parent);
  e.textContent = str;
  return e;
}

// ── Column depth labels ───────────────────────────────────────────────────
byDepth.forEach((_, depth) => {
  txt("depth "+depth, { x: PX + depth*CW + NW/2, y: 22, class:"col-label" }, svgEl);
});

// ── Edges ─────────────────────────────────────────────────────────────────
const edgeGroup = el("g", {}, svgEl);
const edgeEls   = new Map(); // "from→to" → path element
const gradEls   = new Map(); // "from→to" → linearGradient element

DATA.edges.forEach(e => {
  const src = DATA.nodes.find(n=>n.id===e.from);
  const tgt = DATA.nodes.find(n=>n.id===e.to);
  if (!src||!tgt) return;

  // Per-edge gradient: source folder color → target folder color
  const gid  = "gr" + hashStr(e.from + "→" + e.to);
  const x1=src.px+NW, y1=src.py, x2=tgt.px, y2=tgt.py, mx=(x1+x2)/2;
  const grad = el("linearGradient", {
    id: gid, gradientUnits:"userSpaceOnUse",
    x1, y1, x2, y2
  }, defsEl);
  el("stop", { offset:"0%",   "stop-color": ncolor(src) }, grad);
  el("stop", { offset:"100%", "stop-color": ncolor(tgt) }, grad);
  gradEls.set(e.from+"→"+e.to, grad);

  const d = "M"+x1+","+y1+" C"+mx+","+y1+" "+mx+","+y2+" "+x2+","+y2;
  const path = el("path", { d, class:"edge", stroke:"url(#"+gid+")", "marker-end":"url(#arr)" }, edgeGroup);
  edgeEls.set(e.from+"→"+e.to, path);
});

// ── Nodes ─────────────────────────────────────────────────────────────────
const nodeGroup = el("g", {}, svgEl);
const nodeEls   = new Map(); // id → g element
const fiEls     = new Map(); // id → sidebar item

DATA.nodes.forEach((n, i) => {
  const g = el("g", { class:"node-g", transform:"translate("+n.px+","+(n.py-NH/2)+")" }, nodeGroup);

  // ── Background + left bar ─────────────────────────────────────────────
  el("rect", { class:"node-rect", width:NW, height:NH }, g);
  el("rect", { class:"node-bar", x:0, y:0, width:4, height:NH, rx:3, ry:3, fill:ncolor(n) }, g);

  // ── File-type badge (top-right) ───────────────────────────────────────
  const badge = extBadge(n.ext);
  const badgeW = badge.label.length <= 2 ? 22 : 30;
  const badgeX = NW - badgeW - 6;
  el("rect", { x:badgeX, y:5, width:badgeW, height:14, rx:3, ry:3, fill:badge.bg }, g);
  txt(badge.label, { class:"node-badge-text", x:badgeX + badgeW/2, y:15, "text-anchor":"middle", fill:badge.fg }, g);

  // ── Row 1: folder prefix (dim) + filename ─────────────────────────────
  const folder = folderPrefix(n.id);
  const fname  = bname(n.id);
  if (folder) {
    txt(folder + "/", { class:"node-folder", x:12, y:14 }, g);
    txt(fname, { class:"node-name", x:12, y:25 }, g);
  } else {
    txt(fname, { class:"node-name", x:12, y:21 }, g);
  }

  // ── Divider ───────────────────────────────────────────────────────────
  el("line", { class:"node-divider", x1:6, y1:32, x2:NW-6, y2:32 }, g);

  // ── Row 2: exports · imports · importedBy (color-coded) · lines ───────
  const metaY = 43;
  txt("↑"+n.exportCount,   { class:"node-meta", x:12,  y:metaY }, g);
  txt("exp",               { class:"node-meta", x:24,  y:metaY, fill:"#30363d" }, g);
  txt("→"+n.importCount,   { class:"node-meta", x:52,  y:metaY }, g);
  txt("imp",               { class:"node-meta", x:64,  y:metaY, fill:"#30363d" }, g);
  txt("←"+n.importedBy,    { class:"node-meta", x:96,  y:metaY, fill:critColor(n.importedBy) }, g);
  txt("used",              { class:"node-meta", x:108, y:metaY, fill:"#30363d" }, g);
  txt(n.lines+"ln",        { class:"node-meta", x:NW-8, y:metaY, "text-anchor":"end" }, g);

  // ── Size bar (relative to largest file in graph) ──────────────────────
  const barX = 6, barY = 52, barH = 5, barMaxW = NW - 12;
  const barW = Math.max(4, Math.round((n.lines / maxLines) * barMaxW));
  el("rect", { class:"node-sizebg",   x:barX, y:barY, width:barMaxW, height:barH, rx:2, ry:2 }, g);
  el("rect", { class:"node-sizefill", x:barX, y:barY, width:barW,    height:barH, rx:2, ry:2,
    fill:ncolor(n), opacity:"0.55" }, g);

  g.addEventListener("mousedown",  e => startDrag(e, n, g));
  g.addEventListener("mouseenter", e => showTip(e, n));
  g.addEventListener("mousemove",  e => moveTip(e));
  g.addEventListener("mouseleave", () => hideTip());

  nodeEls.set(n.id, g);
});

// ── HUD ───────────────────────────────────────────────────────────────────
const entryNode = DATA.nodes.find(n=>n.depth===0);
document.getElementById("tl-entry").textContent = entryNode?.id ?? "";
document.getElementById("tl-stats").textContent = "· "+DATA.nodes.length+" files · "+DATA.edges.length+" imports";
document.getElementById("sb-entry").textContent = entryNode?.id ?? "";
document.getElementById("sb-stats").textContent = DATA.nodes.length+" files · "+DATA.edges.length+" imports";
document.getElementById("sb-footer").innerHTML  =
  DATA.nodes.length+" files &nbsp;·&nbsp; "+DATA.edges.length+" imports<br>"+
  FOLDERS.length+" folders &nbsp;·&nbsp; max depth "+maxDepth;

// ── Depth slider ──────────────────────────────────────────────────────────
const dSlider = document.getElementById("depth-slider");
const dLabel  = document.getElementById("depth-label");
dSlider.max   = maxDepth; dSlider.value = maxDepth;
let curDepth  = maxDepth;

dSlider.addEventListener("input", () => {
  curDepth = +dSlider.value;
  dLabel.textContent = curDepth===maxDepth ? "all" : "≤"+curDepth;
  applyDepth();
});

function applyDepth() {
  DATA.nodes.forEach(n => {
    const vis = n.depth <= curDepth;
    nodeEls.get(n.id).style.display = vis ? "" : "none";
    const fi = fiEls.get(n.id);
    if (fi) fi.style.display = vis ? "" : "none";
  });
  DATA.edges.forEach(e => {
    const src = DATA.nodes.find(n=>n.id===e.from);
    const tgt = DATA.nodes.find(n=>n.id===e.to);
    const vis = src && tgt && src.depth<=curDepth && tgt.depth<=curDepth;
    const ep  = edgeEls.get(e.from+"→"+e.to);
    if (ep) ep.style.display = vis ? "" : "none";
  });
}

// ── Sidebar builder ───────────────────────────────────────────────────────
const byFolder = new Map();
DATA.nodes.forEach(n => {
  const k = fkey(n.id);
  if (!byFolder.has(k)) byFolder.set(k,[]);
  byFolder.get(k).push(n);
});

const flEl = document.getElementById("folder-list");
byFolder.forEach((files, folder) => {
  const col = fColor.get(folder)??"#8b949e";
  const grp = document.createElement("div"); grp.className="fg";
  const hdr = document.createElement("div"); hdr.className="fh";
  hdr.innerHTML='<span class="fdot" style="background:'+col+'"></span>'+
    '<span class="fname">'+folder+'</span>'+
    '<span class="fcount">'+files.length+'</span>'+
    '<span class="fchev">▾</span>';
  const lst = document.createElement("div"); lst.className="fl";

  files.sort((a,b)=>a.depth-b.depth||a.id.localeCompare(b.id)).forEach(n => {
    const fi = document.createElement("div"); fi.className="fi"; fi.dataset.id=n.id;
    fi.innerHTML='<span class="fn">'+bname(n.id)+'</span><span class="fln">'+n.lines+'ln</span>';
    fi.addEventListener("click",      ()=>focusNode(n.id));
    fi.addEventListener("mouseenter", ()=>hoverSb(n.id));
    fi.addEventListener("mouseleave", ()=>unhoverSb());
    lst.appendChild(fi);
    fiEls.set(n.id, fi);
  });

  hdr.addEventListener("click",()=>{
    hdr.classList.toggle("closed");
    lst.style.display=hdr.classList.contains("closed")?"none":"";
  });
  grp.appendChild(hdr); grp.appendChild(lst); flEl.appendChild(grp);
});

// ── One-shot entrance animation (JS-driven, never re-triggers) ───────────
nodeEls.forEach((g, id) => { g.style.opacity = "0"; });
let _ni = 0;
nodeEls.forEach((g) => {
  const delay = _ni++ * 22;
  setTimeout(() => {
    g.style.transition = "opacity 0.28s ease-out";
    g.style.opacity    = "1";
    setTimeout(() => { g.style.transition = ""; }, 320);
  }, delay);
});

// ── Restore saved positions (if any) ─────────────────────────────────────
if (loadPositions()) {
  applyPositions();
  updateSvgBounds();
}

// ── Tooltip ───────────────────────────────────────────────────────────────
const ttEl = document.getElementById("tt");
let tipNode = null;

function showTip(e, n) {
  tipNode = n;
  const badge = extBadge(n.ext);
  const critLabel = n.importedBy === 0 ? "entry point"
    : n.importedBy <= 1 ? "low impact"
    : n.importedBy <= 3 ? "shared module"
    : n.importedBy <= 6 ? "high impact"
    : "critical — change carefully";
  ttEl.innerHTML =
    '<span class="tt-name">'+n.id+'</span>'+
    '<span class="tt-meta">'+n.lines+' lines &nbsp;·&nbsp; depth '+n.depth+
      ' &nbsp;·&nbsp; <span style="background:'+badge.bg+';color:'+badge.fg+
      ';padding:1px 5px;border-radius:3px;font-size:9px;font-weight:700;">'+badge.label+'</span></span>'+
    '<span class="tt-meta">↑ '+n.exportCount+' exports &nbsp;·&nbsp; → '+n.importCount+' imports</span>'+
    '<span class="tt-meta" style="color:'+critColor(n.importedBy)+'">← imported by '+n.importedBy+
      ' &nbsp;·&nbsp; '+critLabel+'</span>';
  ttEl.style.opacity="1";
  moveTip(e);
}
function moveTip(e) {
  ttEl.style.left=(e.clientX+14)+"px";
  ttEl.style.top =(e.clientY-10)+"px";
}
function hideTip() { tipNode=null; ttEl.style.opacity="0"; }

// ── SVG bounds ────────────────────────────────────────────────────────────
function updateSvgBounds() {
  let maxX = 0, maxY = 0;
  DATA.nodes.forEach(n => {
    maxX = Math.max(maxX, n.px + NW + PX);
    maxY = Math.max(maxY, n.py + NH/2 + PY);
  });
  svgEl.setAttribute("width",  Math.max(maxX, totalW));
  svgEl.setAttribute("height", Math.max(maxY, totalH));
}

// ── Positions: localStorage ───────────────────────────────────────────────
function savePositions() {
  const pos = {};
  DATA.nodes.forEach(n => { pos[n.id] = { px: n.px, py: n.py }; });
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(pos)); } catch(e) {}
}

function loadPositions() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const pos = JSON.parse(raw);
    let any = false;
    DATA.nodes.forEach(n => {
      if (pos[n.id]) { n.px = pos[n.id].px; n.py = pos[n.id].py; any = true; }
    });
    return any;
  } catch(e) { return false; }
}

function applyPositions() {
  DATA.nodes.forEach(n => {
    const g = nodeEls.get(n.id);
    if (g) g.setAttribute("transform", "translate("+n.px+","+(n.py-NH/2)+")");
  });
  // redraw all edges
  const seen = new Set();
  DATA.edges.forEach(e => { if (!seen.has(e.from)) { redrawEdges(e.from); seen.add(e.from); } });
}

function resetPositions() {
  try { localStorage.removeItem(STORAGE_KEY); } catch(e) {}
  // Recalculate default layout
  byDepth.forEach((nodes, depth) => {
    const colH  = nodes.length * RH;
    const startY = (totalH - colH) / 2;
    nodes.forEach((n, i) => {
      n.px = PX + depth * CW;
      n.py = startY + i * RH + RH/2;
    });
  });
  applyPositions();
  updateSvgBounds();
  resetAll();
}

// ── Drag ──────────────────────────────────────────────────────────────────
function redrawEdges(id) {
  DATA.edges.forEach(edge => {
    if (edge.from !== id && edge.to !== id) return;
    const src = DATA.nodes.find(x => x.id === edge.from);
    const tgt = DATA.nodes.find(x => x.id === edge.to);
    if (!src || !tgt) return;
    const ep = edgeEls.get(edge.from + "→" + edge.to);
    if (!ep) return;
    const x1=src.px+NW, y1=src.py, x2=tgt.px, y2=tgt.py, mx=(x1+x2)/2;
    ep.setAttribute("d","M"+x1+","+y1+" C"+mx+","+y1+" "+mx+","+y2+" "+x2+","+y2);
    // keep gradient aligned with updated node position
    const grad = gradEls.get(edge.from + "→" + edge.to);
    if (grad) {
      grad.setAttribute("x1", x1); grad.setAttribute("y1", y1);
      grad.setAttribute("x2", x2); grad.setAttribute("y2", y2);
    }
  });
}

function startDrag(e, n, gEl) {
  e.stopPropagation();
  e.preventDefault();

  const origPx = n.px, origPy = n.py;
  const startX = e.clientX,  startY = e.clientY;
  let moved = false;

  gEl.classList.add("dragging");
  hideTip();

  function onMove(ev) {
    const dx = ev.clientX - startX, dy = ev.clientY - startY;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) moved = true;
    n.px = origPx + dx;
    n.py = origPy + dy;
    gEl.setAttribute("transform", "translate("+n.px+","+(n.py-NH/2)+")");
    redrawEdges(n.id);
    updateSvgBounds();
  }

  function onUp(ev) {
    document.removeEventListener("mousemove", onMove);
    document.removeEventListener("mouseup",   onUp);
    gEl.classList.remove("dragging");
    if (!moved) {
      // Treat as click: stop the synthetic click from bubbling to graph-wrap
      gEl.addEventListener("click", e => e.stopPropagation(), { once: true });
      focusNode(n.id);
    } else {
      savePositions();
      updateSvgBounds();
    }
  }

  document.addEventListener("mousemove", onMove);
  document.addEventListener("mouseup",   onUp);
}

// ── Isolation ─────────────────────────────────────────────────────────────
let isolated = null;

function resetAll() {
  isolated = null;
  nodeEls.forEach(g  => g.classList.remove("dim","hl"));
  edgeEls.forEach(ep => {
    ep.classList.remove("dim","hl");
    ep.setAttribute("marker-end","url(#arr)");
    ep.style.strokeDasharray = "";
    ep.style.animation = "";
  });
  fiEls.forEach(fi => fi.classList.remove("active","dimmed"));
  applyDepth();
}

function isolateNode(id) {
  isolated = id;

  // Build connected set
  const conn = new Set([id]);
  DATA.edges.forEach(e => {
    if (e.from===id) conn.add(e.to);
    if (e.to===id)   conn.add(e.from);
  });

  // Step 1 (t=0): everything dim, clicked node highlight immediately
  nodeEls.forEach((g, nid) => {
    g.classList.add("dim");
    g.classList.remove("hl");
  });
  edgeEls.forEach((ep, key) => {
    ep.classList.add("dim");
    ep.classList.remove("hl");
    ep.setAttribute("marker-end","url(#arr)");
  });
  fiEls.forEach((fi, fid) => {
    fi.classList.add("dimmed");
    fi.classList.remove("active");
  });

  nodeEls.get(id)?.classList.remove("dim");
  nodeEls.get(id)?.classList.add("hl");
  fiEls.get(id)?.classList.remove("dimmed");
  fiEls.get(id)?.classList.add("active");

  // Step 2 (t=100ms): highlight edges with flow animation
  setTimeout(() => {
    edgeEls.forEach((ep, key) => {
      const [fr, to] = key.split("→");
      if (fr===id || to===id) {
        ep.classList.remove("dim");
        ep.classList.add("hl");
        ep.setAttribute("marker-end","url(#arr-hl)");
      }
    });
  }, 100);

  // Step 3 (t=200ms): reveal connected nodes with a wave
  setTimeout(() => {
    conn.forEach(nid => {
      if (nid === id) return;
      nodeEls.get(nid)?.classList.remove("dim");
      fiEls.get(nid)?.classList.remove("dimmed");
    });

    // scroll into view
    const n = DATA.nodes.find(x => x.id===id);
    if (n) {
      const wrap = document.getElementById("graph-wrap");
      wrap.scrollTo({
        left: Math.max(0, n.px - wrap.clientWidth/2  + NW/2),
        top:  Math.max(0, n.py - wrap.clientHeight/2),
        behavior: "smooth"
      });
    }
  }, 200);
}

function focusNode(id) {
  if (isolated===id) { resetAll(); return; }
  isolateNode(id);
}
function hoverSb(id) {
  if (isolated) return;
  nodeEls.get(id)?.classList.add("hl");
}
function unhoverSb() {
  if (isolated) return;
  nodeEls.forEach(g => g.classList.remove("hl"));
}

document.getElementById("graph-wrap").addEventListener("click", resetAll);
document.getElementById("btn-reset").addEventListener("click", e => {
  e.stopPropagation();
  resetPositions();
});

// ── Search ────────────────────────────────────────────────────────────────
document.getElementById("search").addEventListener("input", function(){
  const q = this.value.trim().toLowerCase();
  if (!q) { resetAll(); return; }
  const m = new Set(DATA.nodes.filter(n=>n.id.toLowerCase().includes(q)).map(n=>n.id));
  nodeEls.forEach((g,id)  => { g.classList.toggle("dim",!m.has(id)); g.classList.toggle("hl",m.has(id)); });
  edgeEls.forEach((ep,key)=> { const [fr,to]=key.split("→"); ep.classList.toggle("dim",!m.has(fr)&&!m.has(to)); });
  fiEls.forEach((fi,id)   => { fi.classList.toggle("active",m.has(id)); fi.classList.toggle("dimmed",!m.has(id)); });
});
</script>
</body>
</html>`;
}
