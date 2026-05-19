import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { analyzeFeatureSchema, analyzeFeatureHandler } from "./src/tools/analyzeFeature.js";
import { mapDependenciesSchema, mapDependenciesHandler } from "./src/tools/mapDependencies.js";

const server = new McpServer({ name: "mcp-server", version: "1.0.0" });

server.tool(
  "analyze_feature",
  "Legge ricorsivamente le dipendenze di un file e ne restituisce il sorgente in Markdown",
  analyzeFeatureSchema.shape,
  analyzeFeatureHandler
);

server.tool(
  "map_dependencies",
  "Mappa la struttura delle dipendenze tra file senza restituire il sorgente completo",
  mapDependenciesSchema.shape,
  mapDependenciesHandler
);

const transport = new StdioServerTransport();
await server.connect(transport);
