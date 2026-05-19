import { execSync } from "node:child_process";
import { resolve } from "node:path";
import { isSupportedFile } from "./resolver.js";

export function getModifiedFiles() {
  let output;
  try {
    output = execSync("git status --porcelain", { cwd: process.cwd(), encoding: "utf8" });
  } catch {
    throw new Error("Impossibile eseguire git status. Assicurati di essere in un repository Git.");
  }

  if (!output.trim()) return [];

  return output
    .split("\n")
    .filter(Boolean)
    .map((line) => ({ status: line.slice(0, 2).trim(), filePath: line.slice(3).trim() }))
    .filter(({ status }) => !status.includes("D"))
    .map(({ filePath }) => resolve(process.cwd(), filePath))
    .filter((p) => !p.includes("node_modules") && isSupportedFile(p));
}
