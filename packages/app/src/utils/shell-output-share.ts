import type { ToolCallDetail } from "@getpaseo/protocol/agent-types";

type ShellDetail = Extract<ToolCallDetail, { type: "shell" }>;

// Formats a shell run as a message the agent can read.
export function formatShellOutputShare(detail: ShellDetail): string {
  const output = (detail.output ?? "").replace(/^\n+|\s+$/g, "");
  const longestFence = Math.max(0, ...(output.match(/`{3,}/g) ?? []).map((run) => run.length));
  const fence = "`".repeat(Math.max(3, longestFence + 1));
  const exit =
    detail.exitCode === undefined || detail.exitCode === null
      ? ""
      : ` (exit code ${detail.exitCode})`;
  return `I ran \`${detail.command}\`${exit}:\n\n${fence}\n${output}\n${fence}`;
}
