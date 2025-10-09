import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { Fathom } from "fathom-typescript";
import { z } from "zod";
import { readFileSync } from "fs";
import { join } from "path";

function init() {
  const packageJson = JSON.parse(
    readFileSync(join(__dirname, "..", "package.json"), "utf8")
  );
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

async function fetchAllMeetings(
  fathom: Fathom,
  includeSummary = false,
  includeTranscript = false
) {
  let allMeetings: any[] = [];
  let cursor: any = "";
  let hasMorePages = true;
  let hadError = false;

  while (hasMorePages) {
    try {
      const response = await fathom.listMeetings({
        cursor: cursor,
        includeSummary,
        includeTranscript,
      });

      allMeetings = [...allMeetings, ...response.result.items];
      cursor = response.result.nextCursor;
      hasMorePages = !!cursor;
    } catch (error) {
      console.error("Error fetching meetings:", error);
      hadError = true;
      break;
    }
  }

  return { meetings: allMeetings, hadError };
}

async function main() {
  const { server, fathom } = init();
  const noInput = {};

  server.tool(
    "fathom_list_meetings",
    "Fetch a List of Fathom calls/meetings and returns key details and metadata. If the result has more than 12 items prompt the user to provide meeting title or participant keywords to filter the results using the other tool for filtering meetings",
    noInput,
    async () => {
      try {
        const meetings = (
          await fathom.listMeetings({
            cursor: "",
          })
        ).result.items.map((m) => {
          return {
            meetingTitle: m.meetingTitle,
            recordingId: m.recordingId,
            startedAt: m.scheduledStartTime.toLocaleDateString("En-AU", {
              year: "numeric",
              month: "short",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            }),
            duration:
              m.scheduledEndTime.getTime() - m.scheduledStartTime.getTime(),
            url: m.url,
            participants: m.calendarInvitees,
          };
        });
        return {
          content: [{ type: "text", text: JSON.stringify(meetings) }],
          structuredContent: { meetings },
        };
      } catch (error) {
        console.error("Error fetching Fathom meetings:", error);
        return {
          content: [
            {
              type: "text",
              text: `Error fetching meetings: ${error}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "filter_all_meetings",
    "Fetch all Fathom meetings and filter on user-provided participant names and/or meeting title keywords. Includes summaries by default but only include transcripts if specifically requested by the user",
    {
      participantKeywords: z
        .array(z.string())
        .optional()
        .describe("Keywords to match against participant names/emails"),
      titleKeywords: z
        .array(z.string())
        .optional()
        .describe("Keywords to match against meeting titles"),
      includeSummary: z
        .boolean()
        .optional()
        .default(true)
        .describe(
          "Whether to include call summaries in the fetched data. Defaults to true"
        ),
      includeTranscript: z
        .boolean()
        .optional()
        .default(false)
        .describe("Whether to include transcripts in the fetched data"),
    },
    async (args) => {
      try {
        const { meetings: allMeetings, hadError } = await fetchAllMeetings(
          fathom,
          args.includeSummary,
          args.includeTranscript
        );

        const filteredMeetings = allMeetings.filter((meeting) => {
          // Collect all keywords from both filter types into one array
          const allKeywords = [
            ...(args.participantKeywords || []),
            ...(args.titleKeywords || []),
          ];

          // If no keywords provided, don't filter (return all meetings)
          if (allKeywords.length === 0) {
            return true;
          }

          // Check if ANY keyword matches ANYWHERE in the meeting
          // (participants, title, or meeting title)
          const hasMatch = allKeywords.some((keyword) => {
            const keywordLower = keyword.toLowerCase();

            // Check participants (name and email)
            const foundInParticipants = meeting.calendarInvitees?.some(
              (invitee: any) =>
                invitee.name?.toLowerCase().includes(keywordLower) ||
                invitee.email?.toLowerCase().includes(keywordLower)
            );

            // Check meeting title
            const foundInTitle =
              meeting.title?.toLowerCase().includes(keywordLower) ||
              meeting.meetingTitle?.toLowerCase().includes(keywordLower);

            // Match if found in EITHER location
            return foundInParticipants || foundInTitle;
          });

          return hasMatch;
        });

        const formattedMeetings = filteredMeetings.map((m) => ({
          meetingTitle: m.meetingTitle || m.title,
          recordingId: m.recordingId,
          startedAt: m.scheduledStartTime?.toLocaleDateString(undefined, {
            year: "numeric",
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          }),
          scheduledEndTime: m.scheduledEndTime?.toLocaleDateString(undefined, {
            year: "numeric",
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          }),
          url: m.url,
          shareUrl: m.shareUrl,
          participants: m.calendarInvitees,
          summary: m.defaultSummary || "no summary available",
        }));

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(formattedMeetings),
            },
          ],
          structuredContent: { meetings: formattedMeetings },
          isError: hadError,
        };
      } catch (error) {
        console.error("Error filtering meetings:", error);
        return {
          content: [
            {
              type: "text",
              text: `Error filtering meetings: ${error}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "fathom_get_summary",
    "given the recording id, returns the meeting summary from Fathom AI, with a timeout of 15 seconds",
    { recordingId: z.number().describe("The fathom recording id") },
    async (args) => {
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
          content: [
            {
              type: "text",
              text: `Error fetching summary: ${error}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

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
