import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Fathom } from "fathom-typescript";
import { registerMeetingTools } from "./meetings.js";

export function registerTools(server: McpServer, fathom: Fathom) {
  registerMeetingTools(server, fathom);
}
