import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerMeetingTools } from "./meetings.js";

export function registerTools(server: McpServer) {
  registerMeetingTools(server);
}
