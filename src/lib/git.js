import { execSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { isSupportedFile } from "./resolver.js";

// Resolve project root statically from this file's location (src/lib/git.js → ../../)
const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../");

export function getModifiedFiles(root = PROJECT_ROOT) {
  let output;
  try {
    output = execSync("git status --porcelain", { cwd: root, encoding: "utf8" });
  } catch {
    throw new Error("Impossibile eseguire git status. Assicurati di essere in un repository Git.");
  }

  if (!output.trim()) return [];

  return output
    .split("\n")
    .filter(Boolean)
    .map((line) => ({ status: line.slice(0, 2).trim(), filePath: line.slice(3).trim() }))
    .filter(({ status }) => !status.includes("D"))
    .map(({ filePath }) => resolve(root, filePath))
    .filter((p) => !p.includes("node_modules") && isSupportedFile(p));
}
