import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { Fathom } from "fathom-typescript";
import { readFileSync } from "fs";
import { registerTools } from "./tools/index.js";

function init() {
  const packageJsonPath = new URL("../package.json", import.meta.url);
  const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));
  const VERSION = packageJson.version;

  const server = new McpServer({
    name: "fathom-mcp",
    description:
      "A Model Context Protocol (MCP) server that integrates with Fathom AI's API to fetch meeting/call metadata,  summarize meeting recordings and fetch transcripts where requested.",
    version: VERSION,
    logging: true,
  });

  const fathom = new Fathom({
    security: {
      apiKeyAuth: process.env.FATHOM_API_KEY,
    },
  });

  return { server, fathom };
}

async function main() {
  const { server, fathom } = init();

  // Register all tools
  registerTools(server, fathom);

  const stdioTransport = new StdioServerTransport();
  await server.connect(stdioTransport);
  console.error(`🟢Server connected\n`);
}

main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});

process.on("SIGINT", () => {
  console.error("\n🔴 Server disconnected\n");
  process.exit(0);
});
