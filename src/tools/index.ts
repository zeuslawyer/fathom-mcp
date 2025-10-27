import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Fathom } from "fathom-typescript";
import { createFathomInstance, registerMeetingTools } from "./meetings.js";

export function registerTools(server: McpServer, fathomInstance?: Fathom) {
  const fathom = fathomInstance || createFathomInstance();
  registerMeetingTools(server, fathom);
}
