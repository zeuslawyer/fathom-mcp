import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { Fathom } from "fathom-typescript";

function init() {
  const server = new McpServer({
    name: "fathom-mcp",
    version: "0.0.1",
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

  server.tool("fathom-list-meetings", "List all Fathom meetings", {}, async () => {
    try {
      const meetings = await fathom.listMeetings({});
      return {
        content: [{ type: "text", text: JSON.stringify(meetings) }],
        structuredContent: meetings,
      };
    } catch (error) {
      console.error("Error fetching Fathom meetings:", error);
      return {
        content: [{ type: "text", text: `Error fetching meetings: ${error}` }],
        isError: true,
      };
    }
  });

  const stdioTransport = new StdioServerTransport();
  await server.connect(stdioTransport);
  console.error(`🟢Server connected\n`);
}

main().catch(error => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});

process.on("SIGINT", () => {
  console.error("\n🔴 Server disconnected\n");
  process.exit(0);
});
