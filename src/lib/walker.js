import { statSync } from "node:fs";
import { resolve } from "node:path";
import { readSource, extractImports, extractExports } from "./parser.js";
import { resolveImport, isSupportedFile } from "./resolver.js";
import { loadAliases } from "./aliases.js";

// Cache keyed by "absolutePath::projectRoot" to avoid cross-project contamination.
const FILE_CACHE = new Map();

function cacheKey(absolutePath, projectRoot) {
  return projectRoot ? `${absolutePath}::${projectRoot}` : absolutePath;
}

function getCached(absolutePath, projectRoot) {
  let mtime;
  try { mtime = statSync(absolutePath).mtimeMs; } catch { return null; }
  const entry = FILE_CACHE.get(cacheKey(absolutePath, projectRoot));
  if (entry && entry.mtime === mtime) return entry;
  return null;
}

function setCached(absolutePath, projectRoot, source, imports, exports, lines) {
  let mtime;
  try { mtime = statSync(absolutePath).mtimeMs; } catch { return; }
  FILE_CACHE.set(cacheKey(absolutePath, projectRoot), { source, imports, exports, lines, mtime });
}

/**
 * Recursively walks the dependency tree from entryFile.
 * @param {string}  entryFile    - Absolute or relative path to start from
 * @param {number}  maxDepth     - Max recursion depth (default 5)
 * @param {boolean} includeSource - Whether to include source in returned nodes
 * @param {Set}     visited      - Already-visited paths (for cycle detection)
 * @param {number}  depth        - Current depth (internal, starts at 0)
 * @param {string|null} projectRoot - Root of the target project for alias resolution
 * @param {Map}     aliasMap     - Pre-loaded alias map (loaded once by the top-level call)
 */
export function walk(
  entryFile,
  maxDepth = 5,
  includeSource = true,
  visited = new Set(),
  depth = 0,
  projectRoot = null,
  aliasMap = null,
) {
  // Load aliases once at the top-level call; propagate down to recursive calls.
  const resolvedAliasMap = aliasMap ?? loadAliases(projectRoot);

  const result = new Map();
  const absolutePath = resolve(entryFile);

  if (visited.has(absolutePath) || depth > maxDepth) return result;
  visited.add(absolutePath);

  let source = null;
  let resolvedImports = [];
  let exports = [];
  let lines = 0;

  try {
    const cached = getCached(absolutePath, projectRoot);
    if (cached) {
      source = cached.source;
      resolvedImports = cached.imports;
      exports = cached.exports;
      lines = cached.lines;
    } else {
      source = readSource(absolutePath);
      const rawImports = extractImports(source);
      for (const imp of rawImports) {
        const resolved = resolveImport(imp, absolutePath, resolvedAliasMap);
        if (resolved && isSupportedFile(resolved)) resolvedImports.push(resolved);
      }
      exports = extractExports(source);
      lines = source.split("\n").length;
      setCached(absolutePath, projectRoot, source, resolvedImports, exports, lines);
    }
  } catch {
    // File unreadable — include node with source: null
  }

  result.set(absolutePath, {
    absolutePath,
    source: includeSource ? source : null,
    imports: resolvedImports,
    exports,
    lines,
    depth,
  });

  for (const child of resolvedImports) {
    if (!visited.has(child)) {
      const childMap = walk(child, maxDepth, includeSource, visited, depth + 1, projectRoot, resolvedAliasMap);
      for (const [k, v] of childMap) result.set(k, v);
    }
  }

  return result;
}
