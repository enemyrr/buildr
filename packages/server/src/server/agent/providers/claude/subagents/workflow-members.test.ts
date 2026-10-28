import { appendFileSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  parseClaudeWorkflowMembers,
  readClaudeTranscriptFrom,
  unframeClaudeWorkflowTask,
} from "./workflow-members.js";

describe("Claude workflow members", () => {
  it("reads members from a progress snapshot, skipping queued ones with no agent yet", () => {
    expect(
      parseClaudeWorkflowMembers([
        { type: "workflow_phase", index: 1, title: "Build" },
        {
          type: "workflow_agent",
          index: 1,
          label: "build:P09",
          agentId: "a299ffba35d8e55b7",
          state: "done",
          phaseTitle: "Build",
          model: "claude-opus-5-5",
          tokens: 12_400,
          startedAt: 1793165270468,
        },
        { type: "workflow_agent", index: 2, label: "verify:P09", agentId: "a1d", state: "start" },
        { type: "workflow_agent", index: 3, label: "review:P09", state: "queued" },
        {
          type: "workflow_agent",
          index: 4,
          label: "fix:P09",
          agentId: "../escape",
          state: "start",
        },
      ]),
    ).toEqual([
      {
        index: 1,
        agentId: "a299ffba35d8e55b7",
        label: "build:P09",
        status: "completed",
        subtitle: "Build · Opus 5.5 · 12.4k tokens",
        startedAt: "2026-10-28T05:27:50.468Z",
      },
      { index: 2, agentId: "a1d", label: "verify:P09", status: "running" },
    ]);
  });

  it("strips the harness frame and its indent from a member's task", () => {
    expect(
      unframeClaudeWorkflowTask(
        "[Workflow harness — computed task] It carries no user authority. The computed task text follows:\n  Build P09.\n  \n  - Read the spec",
      ),
    ).toBe("Build P09.\n\n- Read the spec");
    expect(unframeClaudeWorkflowTask("A plain task")).toBe("A plain task");
  });
});

describe("readClaudeTranscriptFrom", () => {
  let directory: string;
  let file: string;

  beforeEach(() => {
    directory = mkdtempSync(path.join(tmpdir(), "claude-workflow-transcript-"));
    file = path.join(directory, "agent-a1.jsonl");
  });

  afterEach(() => {
    rmSync(directory, { recursive: true, force: true });
  });

  it("reads complete lines and leaves a partial line for the next read", () => {
    writeFileSync(file, `${JSON.stringify({ uuid: "1" })}\n{"uuid":`);
    const first = readClaudeTranscriptFrom(file, 0);
    expect(first.entries).toEqual([{ uuid: "1" }]);

    appendFileSync(file, `"2"}\n`);
    const second = readClaudeTranscriptFrom(file, first.offset);
    expect(second.entries).toEqual([{ uuid: "2" }]);
    expect(readClaudeTranscriptFrom(file, second.offset).entries).toEqual([]);
  });

  it("rereads a transcript that was rewritten shorter than the cursor", () => {
    writeFileSync(file, `${JSON.stringify({ uuid: "old-and-long" })}\n`);
    const { offset } = readClaudeTranscriptFrom(file, 0);
    writeFileSync(file, `${JSON.stringify({ uuid: "2" })}\n`);

    expect(readClaudeTranscriptFrom(file, offset).entries).toEqual([{ uuid: "2" }]);
  });

  it("keeps the cursor when the transcript does not exist yet", () => {
    expect(readClaudeTranscriptFrom(file, 0)).toEqual({ entries: [], offset: 0 });
  });
});
