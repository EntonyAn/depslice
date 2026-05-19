import { readFileSync } from "node:fs";

const FROM_REGEX = /\bfrom\s+['"]([^'"]+)['"]/g;
const SIDE_EFFECT_REGEX = /\bimport\s+['"]([^'"]+)['"]/g;
const DYNAMIC_REGEX = /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
const CJS_REGEX = /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

export function readSource(absolutePath) {
  return readFileSync(absolutePath, "utf8");
}

export function extractImports(sourceCode) {
  const imports = new Set();

  for (const regex of [FROM_REGEX, SIDE_EFFECT_REGEX, DYNAMIC_REGEX, CJS_REGEX]) {
    regex.lastIndex = 0;
    let match;
    while ((match = regex.exec(sourceCode)) !== null) {
      const p = match[1];
      if (p.startsWith("./") || p.startsWith("../")) imports.add(p);
    }
  }

  return [...imports];
}
