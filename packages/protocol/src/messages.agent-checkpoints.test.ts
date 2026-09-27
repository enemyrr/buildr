import { describe, expect, test } from "vitest";

import {
  ServerInfoStatusPayloadSchema,
  SessionInboundMessageSchema,
  SessionOutboundMessageSchema,
} from "./messages.js";
import { WSOutboundMessageSchema as GeneratedWSOutboundMessageSchema } from "./generated/validation/ws-outbound.aot.js";

const AGENT_ID = "3f0c7f5e-2f4b-4d2a-9d8e-1a2b3c4d5e6f";

describe("agent.checkpoint schemas", () => {
  test("routes every request through the inbound session union", () => {
    const requests = [
      { type: "agent.checkpoint.list.request", agentId: AGENT_ID, requestId: "r1" },
      {
        type: "agent.checkpoint.get_turn_diff.request",
        agentId: AGENT_ID,
        turnIndex: 2,
        ignoreWhitespace: true,
        requestId: "r2",
      },
      {
        type: "agent.checkpoint.restore_files.request",
        agentId: AGENT_ID,
        turnIndex: 2,
        requestId: "r3",
      },
    ];
    for (const request of requests) {
      expect(SessionInboundMessageSchema.parse(request)).toEqual(request);
    }
  });

  test("routes every response through the outbound session union", () => {
    const responses = [
      {
        type: "agent.checkpoint.list.response",
        payload: {
          requestId: "r1",
          agentId: AGENT_ID,
          checkpoints: [
            {
              turnIndex: 1,
              messageId: "msg-1",
              startedAt: "2026-09-27T10:00:00Z",
              completedAt: "2026-09-27T10:01:00Z",
            },
            { turnIndex: 2, messageId: null, startedAt: "2026-09-27T10:02:00Z", completedAt: null },
          ],
          restoreFilesBlockedReason: "not_worktree",
          error: null,
        },
      },
      {
        type: "agent.checkpoint.get_turn_diff.response",
        payload: {
          requestId: "r2",
          agentId: AGENT_ID,
          turnIndex: 2,
          files: [
            {
              path: "src/a.ts",
              isNew: true,
              isDeleted: false,
              additions: 1,
              deletions: 0,
              hunks: [
                {
                  oldStart: 0,
                  oldCount: 0,
                  newStart: 1,
                  newCount: 1,
                  lines: [{ type: "add", content: "export {};" }],
                },
              ],
            },
          ],
          diffTooLarge: false,
          error: null,
        },
      },
      {
        type: "agent.checkpoint.restore_files.response",
        payload: { requestId: "r3", agentId: AGENT_ID, turnIndex: 2, ok: false, error: "busy" },
      },
    ];
    for (const response of responses) {
      expect(SessionOutboundMessageSchema.parse(response)).toEqual(response);
      const envelope = { type: "session", message: response };
      expect(GeneratedWSOutboundMessageSchema.safeParse(envelope).success).toBe(true);
    }
  });

  test("keeps the capability flag optional for older daemons", () => {
    const base = { status: "server_info", serverId: "server-1", features: {} };
    expect(ServerInfoStatusPayloadSchema.parse(base).features?.agentCheckpoints).toBeUndefined();
    expect(
      ServerInfoStatusPayloadSchema.parse({ ...base, features: { agentCheckpoints: true } })
        .features?.agentCheckpoints,
    ).toBe(true);
  });
});
