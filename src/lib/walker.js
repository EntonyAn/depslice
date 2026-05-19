import { resolve } from "node:path";
import { readSource, extractImports } from "./parser.js";
import { resolveImport, isSupportedFile } from "./resolver.js";

export function walk(entryFile, maxDepth = 5, includeSource = true, visited = new Set(), depth = 0) {
  const result = new Map();
  const absolutePath = resolve(entryFile);

  if (visited.has(absolutePath) || depth > maxDepth) return result;
  visited.add(absolutePath);

  let source = null;
  let resolvedImports = [];

  try {
    source = readSource(absolutePath);
    const rawImports = extractImports(source);

    for (const imp of rawImports) {
      const resolved = resolveImport(imp, absolutePath);
      if (resolved && isSupportedFile(resolved)) resolvedImports.push(resolved);
    }
  } catch {
    // File unreadable — include node with source: null
  }

  result.set(absolutePath, {
    absolutePath,
    source: includeSource ? source : null,
    imports: resolvedImports,
    depth,
  });

  for (const child of resolvedImports) {
    if (!visited.has(child)) {
      const childMap = walk(child, maxDepth, includeSource, visited, depth + 1);
      for (const [k, v] of childMap) result.set(k, v);
    }
  }

  return result;
}
