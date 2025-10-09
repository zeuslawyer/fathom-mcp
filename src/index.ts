import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { Fathom } from "fathom-typescript";
import { z } from "zod";
import { readFileSync } from "fs";
import { join } from "path";

function init() {
  const packageJson = JSON.parse(readFileSync(join(__dirname, "..", "package.json"), "utf8"));
  const VERSION = packageJson.version;

  const server = new McpServer({
    name: "fathom-mcp",
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
  const noInput = {};

  server.tool("fathom_list_meetings", "List all Fathom meetings", noInput, async () => {
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

  server.tool(
    "fathom_get_summary",
    "given the recording id, returns the meeting summary from Fathom AI, with a timeout of 15 seconds",
    { recordingId: z.number().describe("The fathom recording id") },
    async args => {
      try {
        const summary = await fathom.getRecordingSummary(
          {
            recordingId: args.recordingId,
          },
          {
            timeoutMs: 15000,
          }
        );
        return {
          content: [{ type: "text", text: JSON.stringify(summary) }],
          // structuredContent: summary,
        };
      } catch (error) {
        console.error("Error fetching meeting summary:", error);
        return {
          content: [{ type: "text", text: `Error fetching summary: ${error}` }],
          isError: true,
        };
      }
    }
  );

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
