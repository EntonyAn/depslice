import { existsSync } from "node:fs";
import { resolve, dirname, extname } from "node:path";

const EXTENSIONS = [".js", ".ts", ".jsx", ".tsx", ".mjs", ".cjs"];
const INDEX_NAMES = ["index.js", "index.ts", "index.jsx", "index.tsx", "index.mjs"];

export function isSupportedFile(absolutePath) {
  return EXTENSIONS.includes(extname(absolutePath));
}

export function resolveImport(importPath, fromFile) {
  if (!importPath.startsWith("./") && !importPath.startsWith("../")) return null;
  if (importPath.includes("node_modules")) return null;

  const base = resolve(dirname(fromFile), importPath);

  if (existsSync(base) && isSupportedFile(base)) return base;

  for (const ext of EXTENSIONS) {
    const candidate = base + ext;
    if (existsSync(candidate)) return candidate;
  }

  // TypeScript convention: import './foo.js' may resolve to './foo.ts'
  if (importPath.endsWith(".js")) {
    const tsCandidate = base.slice(0, -3) + ".ts";
    if (existsSync(tsCandidate)) return tsCandidate;
  }

  for (const indexName of INDEX_NAMES) {
    const candidate = resolve(base, indexName);
    if (existsSync(candidate)) return candidate;
  }

  return null;
}
