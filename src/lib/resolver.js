import { existsSync } from "node:fs";
import { resolve, dirname, extname } from "node:path";

const EXTENSIONS = [".js", ".ts", ".jsx", ".tsx", ".mjs", ".cjs", ".mts", ".cts"];
const INDEX_NAMES = ["index.js", "index.ts", "index.jsx", "index.tsx", "index.mjs", "index.mts", "index.cts"];
const TS_REMAPS = { ".js": ".ts", ".mjs": ".mts", ".cjs": ".cts" };

export function isSupportedFile(absolutePath) {
  return EXTENSIONS.includes(extname(absolutePath));
}

function probeExtensions(base) {
  if (existsSync(base) && isSupportedFile(base)) return base;

  for (const ext of EXTENSIONS) {
    const candidate = base + ext;
    if (existsSync(candidate)) return candidate;
  }

  for (const [jsExt, tsExt] of Object.entries(TS_REMAPS)) {
    if (base.endsWith(jsExt)) {
      const candidate = base.slice(0, -jsExt.length) + tsExt;
      if (existsSync(candidate)) return candidate;
    }
  }

  for (const indexName of INDEX_NAMES) {
    const candidate = resolve(base, indexName);
    if (existsSync(candidate)) return candidate;
  }

  return null;
}

export { probeExtensions };

/**
 * Resolves an import path to an absolute file path.
 * @param {string} importPath - The raw import string (e.g. "./foo", "@/utils/bar")
 * @param {string} fromFile   - Absolute path of the file containing the import
 * @param {Map}    aliasMap   - Alias map from loadAliases(projectRoot); pass new Map() for no aliases
 */
export function resolveImport(importPath, fromFile, aliasMap = new Map()) {
  if (importPath.includes("node_modules")) return null;

  // Relative import
  if (importPath.startsWith("./") || importPath.startsWith("../")) {
    const base = resolve(dirname(fromFile), importPath);
    return probeExtensions(base);
  }

  // Alias import (e.g. @/components/Button)
  for (const [prefix, baseDirs] of aliasMap) {
    if (importPath === prefix || importPath.startsWith(prefix + "/")) {
      const suffix = importPath.slice(prefix.length).replace(/^\//, "");
      for (const baseDir of baseDirs) {
        const resolved = probeExtensions(resolve(baseDir, suffix));
        if (resolved) return resolved;
      }
    }
  }

  return null;
}
