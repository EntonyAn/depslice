import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

// Per-root cache: avoid re-reading tsconfig on every call.
const ALIAS_CACHE = new Map();

/**
 * Reads tsconfig.json or jsconfig.json from `root` and returns
 * a Map<aliasPrefix, absoluteBaseDir[]> derived from compilerOptions.paths.
 * Returns an empty Map if no config is found or if parsing fails.
 */
export function loadAliases(root) {
  if (!root) return new Map();

  const normalized = resolve(root);
  if (ALIAS_CACHE.has(normalized)) return ALIAS_CACHE.get(normalized);

  const aliasMap = new Map();

  for (const cfgName of ["tsconfig.json", "jsconfig.json"]) {
    const cfgPath = resolve(normalized, cfgName);
    if (!existsSync(cfgPath)) continue;

    let cfg;
    try {
      cfg = JSON.parse(readFileSync(cfgPath, "utf8"));
    } catch {
      continue;
    }

    const paths = cfg?.compilerOptions?.paths ?? {};
    const baseUrl = resolve(normalized, cfg?.compilerOptions?.baseUrl ?? ".");

    for (const [alias, targets] of Object.entries(paths)) {
      const prefix = alias.replace(/\/\*$/, "");
      const resolvedTargets = targets.map((t) => resolve(baseUrl, t.replace(/\/\*$/, "")));
      aliasMap.set(prefix, resolvedTargets);
    }

    break;
  }

  ALIAS_CACHE.set(normalized, aliasMap);
  return aliasMap;
}
