import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { analyzeFeatureSchema, analyzeFeatureHandler } from "./src/tools/analyzeFeature.js";
import { mapDependenciesSchema, mapDependenciesHandler } from "./src/tools/mapDependencies.js";
import { findDependentsSchema, findDependentsHandler } from "./src/tools/findDependents.js";

const server = new McpServer({ name: "depslice", version: "1.0.0" });

server.tool(
  "analyze_feature",
  `Call this tool BEFORE reading individual files when you need to understand a module or feature.
Given an entry file, it recursively follows all local imports and returns the full source of every file in the dependency tree — in a single call.

USE THIS WHEN:
- You need to understand how a feature or module works end-to-end
- You are about to refactor, debug, or extend a piece of code and need full context
- A user asks "how does X work?" and X is a file or entry point

AVOID reading files one-by-one with Read/cat — use this instead to collect all relevant code in one shot and save context tokens.

Params: entryFile (path relative to root), root (absolute path to the project root, required for projects other than this server), maxDepth (default 5).`,
  analyzeFeatureSchema.shape,
  analyzeFeatureHandler
);

server.tool(
  "map_dependencies",
  `Call this tool to get a structural overview of a codebase or module WITHOUT loading full source code.
Returns a dependency tree (file → imports → imports of imports...) as a compact map.

USE THIS WHEN:
- You need to understand the architecture or coupling of a project before diving in
- You want to know which files are involved in a feature without reading all of them yet
- A user asks "what files does X depend on?" or "show me the structure of this module"
- You want to find which files changed (onlyModified: true) to scope a review or a fix

Use map_dependencies first to orient yourself, then use analyze_feature on the specific entry point you care about.

Params: targetFile OR onlyModified (uses git status), root (absolute project path), format (markdown or json).`,
  mapDependenciesSchema.shape,
  mapDependenciesHandler
);

server.tool(
  "find_dependents",
  `Call this tool to answer "what breaks if I change this file?" — i.e. impact analysis.
Given a target file, it scans the entire codebase and returns every file that imports it, directly or transitively.

USE THIS WHEN:
- You are about to modify a shared utility, hook, type, or lib file and need to know the blast radius
- A user asks "who uses X?" or "what depends on Y?"
- You want to assess the risk of a change before making it
- You need to find all callers of a module to update them

With transitive: true it returns the full upstream chain, showing via which intermediate file each dependent reaches the target.

Params: targetFile (path relative to root), root (absolute project path), transitive (default false), maxDepth (default 3), scanRoot (subdirectory to scan, default: root).`,
  findDependentsSchema.shape,
  findDependentsHandler
);

const transport = new StdioServerTransport();
await server.connect(transport);
