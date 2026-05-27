/**
 * depslice — remote HTTP MCP server
 *
 * Exposes the same tools as the stdio server, plus GitHub repo support.
 * When a tool receives a `githubRepo` param it clones the repo to a temp
 * directory, runs the analysis, and cleans up automatically.
 *
 * Usage:
 *   node server.js              # port 3000
 *   PORT=8080 node server.js    # custom port
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createServer } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execSync } from "node:child_process";
import { z } from "zod";

import { analyzeFeatureSchema, analyzeFeatureHandler } from "./src/tools/analyzeFeature.js";
import { mapDependenciesSchema, mapDependenciesHandler } from "./src/tools/mapDependencies.js";
import { findDependentsSchema, findDependentsHandler } from "./src/tools/findDependents.js";

const PORT = Number(process.env.PORT ?? 3000);

// ── GitHub clone helper ──────────────────────────────────────────────────────

/** Clone a public GitHub repo to a temp dir. Returns the temp path. */
function cloneRepo(githubRepo) {
  // Validate: must look like a GitHub URL or owner/repo shorthand
  let url = githubRepo.trim();
  if (!url.startsWith("http")) {
    // shorthand: "owner/repo"
    if (/^[\w.-]+\/[\w.-]+$/.test(url)) {
      url = `https://github.com/${url}.git`;
    } else {
      throw new Error(`Invalid repo: "${githubRepo}". Use a GitHub URL or "owner/repo".`);
    }
  }
  if (!url.endsWith(".git")) url += ".git";

  const dir = mkdtempSync(join(tmpdir(), "depslice-"));
  try {
    execSync(`git clone --depth 1 --quiet "${url}" "${dir}"`, { stdio: "pipe", timeout: 30_000 });
  } catch (err) {
    rmSync(dir, { recursive: true, force: true });
    throw new Error(`Failed to clone ${url}: ${err.message}`);
  }
  return dir;
}

/** Run a tool handler with optional GitHub cloning. Cleans up after. */
async function withRepo(args, handler) {
  const { githubRepo, ...rest } = args;
  if (!githubRepo) return handler(rest);

  const tmpDir = cloneRepo(githubRepo);
  try {
    return await handler({ ...rest, root: tmpDir });
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

// ── Build one MCP server per request (stateless) ─────────────────────────────

function buildMcpServer() {
  const server = new McpServer({ name: "depslice", version: "1.0.0" });

  // ── analyze_feature ────────────────────────────────────────────────────────
  server.tool(
    "analyze_feature",
    `Load the full source of an entry file and all its dependencies in one shot.
Accepts an optional githubRepo param (GitHub URL or "owner/repo") to analyze a remote codebase without installing anything locally.

Params: entryFile, root (local path), githubRepo (GitHub URL/shorthand), maxDepth (default 5).`,
    {
      ...analyzeFeatureSchema.shape,
      githubRepo: z.string().optional().describe(
        'GitHub repo URL or "owner/repo" shorthand. If provided, the repo is cloned and analyzed remotely.'
      ),
    },
    async (args) => withRepo(args, analyzeFeatureHandler)
  );

  // ── map_dependencies ───────────────────────────────────────────────────────
  server.tool(
    "map_dependencies",
    `Get a structural dependency map of a codebase without loading source code.
Accepts an optional githubRepo param to analyze a remote GitHub repo directly.

Params: targetFile OR onlyModified, root (local path), githubRepo (GitHub URL/shorthand), format (markdown|json).`,
    {
      ...mapDependenciesSchema.shape,
      githubRepo: z.string().optional().describe(
        'GitHub repo URL or "owner/repo" shorthand.'
      ),
    },
    async (args) => withRepo(args, mapDependenciesHandler)
  );

  // ── find_dependents ────────────────────────────────────────────────────────
  server.tool(
    "find_dependents",
    `Find every file that imports a given file — impact analysis before a change.
Accepts an optional githubRepo param to analyze a remote GitHub repo directly.

Params: targetFile, root (local path), githubRepo (GitHub URL/shorthand), transitive (default false), maxDepth (default 3).`,
    {
      ...findDependentsSchema.shape,
      githubRepo: z.string().optional().describe(
        'GitHub repo URL or "owner/repo" shorthand.'
      ),
    },
    async (args) => withRepo(args, findDependentsHandler)
  );

  return server;
}

// ── HTTP server ───────────────────────────────────────────────────────────────

const httpServer = createServer(async (req, res) => {
  // CORS — allow Claude.ai and other MCP clients
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, mcp-session-id");

  if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }

  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", name: "depslice" }));
    return;
  }

  if (req.url === "/mcp" || req.url?.startsWith("/mcp?")) {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined, // stateless
    });

    const server = buildMcpServer();

    res.on("close", () => server.close().catch(() => {}));

    try {
      await server.connect(transport);
      await transport.handleRequest(req, res);
    } catch (err) {
      if (!res.headersSent) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: err.message }));
      }
    }
    return;
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Not found. Use POST /mcp" }));
});

httpServer.listen(PORT, () => {
  console.log(`depslice MCP server running on http://localhost:${PORT}/mcp`);
  console.log(`Health check: http://localhost:${PORT}/health`);
});
