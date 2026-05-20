import { readFileSync } from "node:fs";

const FROM_REGEX = /\bfrom\s+['"]([^'"]+)['"]/g;
const SIDE_EFFECT_REGEX = /\bimport\s+['"]([^'"]+)['"]/g;
// Dynamic imports with template literals containing variables (e.g. import(`./p/${v}`))
// are intentionally ignored — they cannot be statically resolved.
const DYNAMIC_REGEX = /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
const CJS_REGEX = /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

function stripComments(source) {
  source = source.replace(/\/\*[\s\S]*?\*\//g, "");
  source = source.replace(/(?<!:)\/\/[^\n]*/g, "");
  return source;
}

export function readSource(absolutePath) {
  return readFileSync(absolutePath, "utf8");
}

export function extractImports(sourceCode) {
  const cleaned = stripComments(sourceCode);
  const imports = new Set();

  for (const regex of [FROM_REGEX, SIDE_EFFECT_REGEX, DYNAMIC_REGEX, CJS_REGEX]) {
    regex.lastIndex = 0;
    let match;
    while ((match = regex.exec(cleaned)) !== null) {
      const p = match[1];
      if (p.startsWith("./") || p.startsWith("../")) imports.add(p);
    }
  }

  return [...imports];
}

export function extractExports(sourceCode) {
  const names = new Set();
  const cleaned = stripComments(sourceCode);
  // export function/class/const/let/var/async function name
  const NAMED_RE = /^export\s+(?:async\s+)?(?:function\*?|const|let|var|class)\s+(\w+)/gm;
  // export { foo, bar as baz }
  const BRACE_RE = /^export\s*\{([^}]+)\}/gm;

  let m;
  while ((m = NAMED_RE.exec(cleaned)) !== null) names.add(m[1]);
  while ((m = BRACE_RE.exec(cleaned)) !== null) {
    for (const part of m[1].split(",")) {
      const name = part.trim().replace(/\s+as\s+\S+$/, "").trim();
      if (name) names.add(name);
    }
  }
  if (/^export\s+default\b/m.test(cleaned)) names.add("default");
  return [...names];
}
