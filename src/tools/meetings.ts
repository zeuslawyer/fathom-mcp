import { Fathom } from "fathom-typescript";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

/**
 * Fetches all meetings from Fathom API with pagination handling.
 * This utility function iterates through all pages to retrieve complete meeting data.
 *
 * @param fathom - Fathom SDK instance
 * @param includeSummary - Whether to include AI-generated summaries (increases response size)
 * @param includeTranscript - Whether to include full transcripts (significantly increases response size)
 * @returns Object containing all meetings array and error status
 */
export async function fetchAllMeetings(
  fathom: Fathom,
  includeSummary = false,
  includeTranscript = false
) {
  let allMeetings: any[] = [];
  let cursor: any = "";
  let hasMorePages = true;
  let hadError = false;

  // Paginate through all meetings
  while (hasMorePages) {
    try {
      const response = await fathom.listMeetings({
        cursor: cursor,
        includeSummary,
        includeTranscript,
      })
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

/**
 * Registers all Fathom meeting-related MCP tools.
 * Three main tools:
 * 1. search_meetings - Find meetings by keywords, participants, and date range
 * 2. fathom_get_summary - Get AI summary for a specific meeting
 * 3. fathom_get_transcript - Get full transcript for a specific meeting
 */
export function registerMeetingTools(server: McpServer, fathom: Fathom) {

  // Search meetings tool - primary tool for finding meetings
  server.tool(
    "search_meetings",
    "Search and filter Fathom meetings by participant names, meeting title/description keywords, and/or date range. Returns metadata only (title, participants, dates, URLs, recordingId). Use recordingId with fathom_get_summary or fathom_get_transcript to get detailed content.",
    {
      participantKeywords: z
        .array(z.string())
        .optional()
        .describe("Keywords to match against participant names/emails (e.g., ['John', 'smith@example.com'])"),
      titleKeywords: z
        .array(z.string())
        .optional()
        .describe("Keywords to match against meeting titles or descriptions (e.g., ['standup', 'planning'])"),
      startDate: z
        .string()
        .optional()
        .describe("Filter meetings on or after this date (ISO format: YYYY-MM-DD or natural language that the AI can parse)"),
      endDate: z
        .string()
        .optional()
        .describe("Filter meetings on or before this date (ISO format: YYYY-MM-DD or natural language that the AI can parse)"),
    },
    async (args) => {
      try {
        // Fetch all meetings (metadata only - no summary/transcript to minimize context)
        const { meetings: allMeetings, hadError } = await fetchAllMeetings(
          fathom,
          false, // Don't fetch summaries
          false  // Don't fetch transcripts
        );

        const filteredMeetings = allMeetings.filter((meeting) => {
          // Collect keywords from both filter types
          const allKeywords = [
            ...(args.participantKeywords || []),
            ...(args.titleKeywords || []),
          ];

          // Check keyword matching if any keywords provided
          let keywordMatch = true;
          if (allKeywords.length > 0) {
            keywordMatch = allKeywords.some((keyword) => {
              const keywordLower = keyword.toLowerCase();

              // Check participants (name and email)
              const foundInParticipants = meeting.calendarInvitees?.some(
                (invitee: any) =>
                  invitee.name?.toLowerCase().includes(keywordLower) ||
                  invitee.email?.toLowerCase().includes(keywordLower)
              );

              // Check meeting title and description
              const foundInTitle =
                meeting.title?.toLowerCase().includes(keywordLower) ||
                meeting.meetingTitle?.toLowerCase().includes(keywordLower);

              return foundInParticipants || foundInTitle;
            });
          }

          // Check date range filtering
          let dateMatch = true;
          if (args.startDate || args.endDate) {
            const meetingDate = meeting.scheduledStartTime;

            if (args.startDate) {
              const startDate = new Date(args.startDate);
              startDate.setHours(0, 0, 0, 0); // Start of day
              dateMatch = dateMatch && meetingDate >= startDate;
            }

            if (args.endDate) {
              const endDate = new Date(args.endDate);
              endDate.setHours(23, 59, 59, 999); // End of day
              dateMatch = dateMatch && meetingDate <= endDate;
            }
          }

          return keywordMatch && dateMatch;
        });

        // Format meetings with comprehensive metadata
        const formattedMeetings = filteredMeetings.map((m) => ({
          recordingId: m.recordingId,
          title: m.title,
          meetingTitle: m.meetingTitle,
          startedAt: m.scheduledStartTime?.toLocaleDateString(undefined, {
            year: "numeric",
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          }),
          endedAt: m.scheduledEndTime?.toLocaleDateString(undefined, {
            year: "numeric",
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          }),
          durationMinutes: Math.round(
            (m.scheduledEndTime?.getTime() - m.scheduledStartTime?.getTime()) / 1000 / 60
          ),
          url: m.url,
          shareUrl: m.shareUrl,
          participants: m.calendarInvitees,
        }));

        // TODO: Set ENABLE_ELICITATION to false if you want to disable asking users about summary/transcript
        const ENABLE_ELICITATION = true;

        let elicitationPrompt = "";
        if (ENABLE_ELICITATION && formattedMeetings.length > 0) {
          elicitationPrompt = "\n\nWould you like a summary or full transcript for any of these meetings? If so, please provide the recordingId.";
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(formattedMeetings, null, 2) + elicitationPrompt,
            },
          ],
          structuredContent: {
            meetings: formattedMeetings,
            count: formattedMeetings.length,
            elicitationPrompt: ENABLE_ELICITATION ? elicitationPrompt : undefined
          },
          isError: hadError,
        };
      } catch (error) {
        console.error("Error searching meetings:", error);
        return {
          content: [
            {
              type: "text",
              text: `Error searching meetings: ${error}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  // Get summary tool
  server.tool(
    "fathom_get_summary",
    "Given a recording ID from search_meetings, fetch the AI-generated summary of that meeting. Use this when the user wants a concise overview of meeting content.",
    { recordingId: z.number().describe("The Fathom recording ID from search_meetings") },
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
          content: [{ type: "text", text: JSON.stringify(summary, null, 2) }],
          structuredContent: summary,
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

  // Get transcript tool
  server.tool(
    "fathom_get_transcript",
    "Given a recording ID from search_meetings, fetch the complete transcript with speaker names and timestamps. Use this when the user needs the full verbatim conversation details.",
    { recordingId: z.number().describe("The Fathom recording ID from search_meetings") },
    async (args) => {
      try {
        // The SDK requires destinationUrl, but we want immediate response
        // Using empty string as a workaround to get direct response
        const response = await fathom.getRecordingTranscript({
          recordingId: args.recordingId,
          destinationUrl: "", // Empty string for direct response
        });

        // Check if response exists and has transcript property (direct response type)
        if (response && 'transcript' in response && response.transcript) {
          // Format transcript for better readability
          const formattedTranscript = response.transcript.map((item: any) => ({
            speaker: item.speaker?.name || "Unknown Speaker",
            speakerEmail: item.speaker?.email,
            text: item.text,
            timestamp: item.timestamp,
          }));

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(formattedTranscript, null, 2),
              },
            ],
            structuredContent: {
              recordingId: args.recordingId,
              transcript: formattedTranscript,
              totalSegments: formattedTranscript.length,
            },
          };
        } else {
          // Callback response type
          return {
            content: [
              {
                type: "text",
                text: "Transcript requested via callback. Response: " + JSON.stringify(response),
              },
            ],
            isError: false,
          };
        }
      } catch (error) {
        console.error("Error fetching meeting transcript:", error);
        return {
          content: [
            {
              type: "text",
              text: `Error fetching transcript: ${error}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}
