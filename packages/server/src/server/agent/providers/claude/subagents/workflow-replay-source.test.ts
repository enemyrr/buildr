import { describe, expect, it } from "vitest";

import { ProviderSubagentStore } from "../../../provider-subagents/store.js";
import { foldSubagentObservations } from "./observation.js";
import {
  observeReplayWorkflows,
  parseClaudeWorkflowRun,
  type ClaudeWorkflowParentEntry,
} from "./workflow-replay-source.js";

const TOOL_CALL_ID = "toolu_01XskpjeASyuFyXC5qsLHYps";
const RUN_ID = "wf_4a0af4f7-f56";

function parentEntries(
  resultContent: unknown = `Workflow launched in background.\nRun ID: ${RUN_ID}`,
): ClaudeWorkflowParentEntry[] {
  return [
    {
      message: {
        content: [{ type: "tool_use", id: TOOL_CALL_ID, name: "Workflow", input: {} }],
      },
    },
    {
      message: {
        content: [
          {
            type: "tool_result",
            tool_use_id: TOOL_CALL_ID,
            content: resultContent,
          },
        ],
      },
    },
  ];
}

describe("Claude workflow replay", () => {
  it("parses the persisted run summary observed from Claude Code 2.1.220", () => {
    expect(
      parseClaudeWorkflowRun(
        JSON.stringify({
          runId: RUN_ID,
          timestamp: "2026-08-06T08:04:46.347Z",
          summary: "Runs one deterministic child and returns its structured result",
          workflowName: "paseo-workflow-one-child",
          status: "completed",
          startTime: 1786003484150,
          defaultModel: "claude-sonnet-5",
          totalTokens: 20_417,
          workflowProgress: [{ type: "workflow_phase", title: "Inspect" }],
        }),
      ),
    ).toEqual({
      runId: RUN_ID,
      timestamp: "2026-08-06T08:04:46.347Z",
      summary: "Runs one deterministic child and returns its structured result",
      workflowName: "paseo-workflow-one-child",
      status: "completed",
      startTime: 1786003484150,
      defaultModel: "claude-sonnet-5",
      totalTokens: 20_417,
      workflowProgress: [{ type: "workflow_phase", title: "Inspect" }],
    });
  });

  it("rebuilds the same generic completed descriptor through the parent Workflow call", () => {
    const observations = observeReplayWorkflows({
      workflows: [
        {
          runId: RUN_ID,
          summary: "Runs one deterministic child and returns its structured result",
          status: "completed",
          startTime: 1786003484150,
          defaultModel: "claude-sonnet-5",
          totalTokens: 20_417,
        },
      ],
      parentEntries: parentEntries(),
    });
    const store = new ProviderSubagentStore();
    for (const event of foldSubagentObservations(observations)) {
      store.apply("parent", "claude", event);
    }

    expect(store.get("parent", TOOL_CALL_ID)).toMatchObject({
      id: TOOL_CALL_ID,
      title: "Workflow",
      description: "Runs one deterministic child and returns its structured result",
      subtitle: "Workflow · Sonnet 5 · 20.4k tokens",
      status: "completed",
      toolCallId: TOOL_CALL_ID,
    });
  });

  it("rebuilds a workflow when Claude persists its result as structured text blocks", () => {
    const observations = observeReplayWorkflows({
      workflows: [{ runId: RUN_ID, summary: "Structured result workflow", status: "completed" }],
      parentEntries: parentEntries([
        {
          type: "text",
          text: `Workflow launched in background.\nRun ID: ${RUN_ID}`,
        },
      ]),
    });
    const store = new ProviderSubagentStore();
    for (const event of foldSubagentObservations(observations)) {
      store.apply("parent", "claude", event);
    }

    expect(store.get("parent", TOOL_CALL_ID)).toMatchObject({
      id: TOOL_CALL_ID,
      title: "Workflow",
      description: "Structured result workflow",
      status: "completed",
    });
  });

  it("replays the workflow result without exposing its script or child prompt", () => {
    const workflow = parseClaudeWorkflowRun(
      JSON.stringify({
        runId: RUN_ID,
        summary: "Inspect Paseo",
        status: "completed",
        result: { report: "What Paseo is\nA local-first coding-agent environment." },
        script: "SECRET WORKFLOW SOURCE",
        workflowProgress: [{ promptPreview: "SECRET CHILD PROMPT" }],
      }),
    );
    expect(workflow).not.toBeNull();
    if (!workflow) throw new Error("expected workflow");

    const observations = observeReplayWorkflows({
      workflows: [workflow],
      parentEntries: parentEntries(),
    });

    expect(observations).toContainEqual({
      kind: "timeline",
      id: TOOL_CALL_ID,
      item: {
        type: "assistant_message",
        text: "What Paseo is\nA local-first coding-agent environment.",
      },
    });
    expect(JSON.stringify(observations)).not.toContain("SECRET WORKFLOW SOURCE");
    expect(JSON.stringify(observations)).not.toContain("SECRET CHILD PROMPT");
  });

  it("replays each member as a child of the workflow with its own timeline", () => {
    const observations = observeReplayWorkflows({
      workflows: [
        {
          runId: RUN_ID,
          summary: "Build the Paper rebuild",
          status: "killed",
          workflowProgress: [
            {
              type: "workflow_agent",
              index: 1,
              label: "build:P09",
              agentId: "a1",
              state: "done",
              phaseTitle: "Build",
            },
            {
              type: "workflow_agent",
              index: 2,
              label: "verify:P09",
              agentId: "a2",
              state: "start",
            },
          ],
        },
      ],
      parentEntries: parentEntries(),
      membersByRunId: new Map([
        [
          RUN_ID,
          new Map([
            [
              "a1",
              [
                { type: "user", text: "[Workflow harness] Task follows:\n  Build P09" },
                { type: "assistant", text: "Built." },
              ],
            ],
          ]),
        ],
      ]),
      convertEntry: (entry) => [
        entry.type === "user"
          ? { type: "user_message", text: String(entry.text) }
          : { type: "assistant_message", text: String(entry.text) },
      ],
    });
    const store = new ProviderSubagentStore();
    for (const event of foldSubagentObservations(observations)) {
      store.apply("parent", "claude", event);
    }

    expect(store.get("parent", `${TOOL_CALL_ID}:a1`)).toMatchObject({
      title: "build:P09",
      subtitle: "Build",
      parentSubagentId: TOOL_CALL_ID,
      status: "completed",
    });
    // The snapshot left this member running; it ended when its workflow was stopped.
    expect(store.get("parent", `${TOOL_CALL_ID}:a2`)).toMatchObject({
      title: "verify:P09",
      status: "canceled",
    });
    expect(
      observations.filter(
        (observation) => observation.kind === "timeline" && observation.id === `${TOOL_CALL_ID}:a1`,
      ),
    ).toEqual([
      {
        kind: "timeline",
        id: `${TOOL_CALL_ID}:a1`,
        item: { type: "user_message", text: "Build P09" },
      },
      {
        kind: "timeline",
        id: `${TOOL_CALL_ID}:a1`,
        item: { type: "assistant_message", text: "Built." },
      },
    ]);
  });

  it("fails a nonterminal persisted run because its former runtime cannot update it", () => {
    const observations = observeReplayWorkflows({
      workflows: [{ runId: RUN_ID, summary: "Interrupted workflow", status: "running" }],
      parentEntries: parentEntries(),
    });

    expect(observations.at(-1)).toMatchObject({
      kind: "status",
      id: TOOL_CALL_ID,
      status: "failed",
    });
  });

  it("drops a run that no parent Workflow tool call declared", () => {
    expect(
      observeReplayWorkflows({
        workflows: [{ runId: RUN_ID, status: "completed" }],
        parentEntries: [],
      }),
    ).toEqual([]);
  });

  it.each(["", "not json", "[]", '{"status":"completed"}'])(
    "ignores malformed persisted content %j",
    (contents) => {
      expect(parseClaudeWorkflowRun(contents)).toBeNull();
    },
  );
});
