import type { TerminalManager } from "../../terminal/terminal-manager.js";
import { buildStringCommandShellInvocation } from "../../utils/string-command-shell.js";
import type { AgentTimelineItem } from "./agent-sdk-types.js";

const CAPTURE_INTERVAL_MS = 500;

export interface RunAgentShellCommandOptions {
  agentId: string;
  command: string;
  cwd: string;
  terminalManager: Pick<TerminalManager, "createTerminal" | "captureTerminal" | "killTerminal">;
  emitLiveTimelineItem: (item: AgentTimelineItem) => Promise<void>;
  appendTimelineItem: (item: AgentTimelineItem) => Promise<unknown>;
  captureIntervalMs?: number;
}

type ShellStatus = "running" | "completed" | "failed" | "canceled";

// Running commands by call id, so a stop request from any client reaches the terminal.
const stopByCallId = new Map<string, () => void>();

// Returns false when no command with that call id is running.
export function stopAgentShellCommand(callId: string): boolean {
  const stop = stopByCallId.get(callId);
  stop?.();
  return stop !== undefined;
}

// Agent shell terminals live in their own scope so workspace terminal lists, and the
// tabs built from them, never include them.
export function agentShellTerminalScope(agentId: string): string {
  return `agent-shell:${agentId}`;
}

// Appends the part of `tail` that `captured` doesn't already end with. The terminal is
// gone by the time its exit fires, so the last capture can miss the final lines.
export function mergeOutputTail(captured: string[], tail: string[]): string[] {
  for (let overlap = Math.min(captured.length, tail.length); overlap > 0; overlap -= 1) {
    const capturedEnd = captured.slice(captured.length - overlap);
    if (capturedEnd.every((line, index) => line === tail[index])) {
      return [...captured, ...tail.slice(overlap)];
    }
  }
  return [...captured, ...tail];
}

// Waits for a start signal so the runner's listeners are attached before a fast command
// finishes. Reports the exit code with the shell-integration command-finished sequence,
// then holds the terminal open so the full screen can be captured before it closes.
export function buildAgentShellScript(command: string): string {
  return [
    "read -rs _",
    command,
    "__paseo_status=$?",
    `printf '\\033]633;D;%d\\007' "$__paseo_status"`,
    "read -r _",
    'exit "$__paseo_status"',
  ].join("\n");
}

function resolveShellInvocation(command: string): { shell: string; args: string[] } {
  // Windows shells don't get the wrapper; their output falls back to the exit tail.
  if (process.platform === "win32") return buildStringCommandShellInvocation({ command });
  return { shell: "bash", args: ["-c", buildAgentShellScript(command)] };
}

function trimTrailingBlankLines(lines: string[]): string[] {
  let end = lines.length;
  while (end > 0 && lines[end - 1]?.trim() === "") end -= 1;
  return lines.slice(0, end);
}

function buildShellTimelineItem(input: {
  callId: string;
  command: string;
  cwd: string;
  output: string;
  exitCode: number | null;
  status: ShellStatus;
  terminalId?: string;
}): AgentTimelineItem {
  const base = {
    type: "tool_call" as const,
    name: "shell",
    callId: input.callId,
    detail: {
      type: "shell" as const,
      command: input.command,
      cwd: input.cwd,
      output: input.output,
      ...(input.status === "running" ? {} : { exitCode: input.exitCode }),
    },
    // `userShell` tells the app the user ran this from the composer. `terminalId` lets a
    // client attach to the live terminal while the command runs.
    metadata: {
      userShell: true,
      ...(input.terminalId ? { terminalId: input.terminalId } : {}),
    },
  };
  if (input.status === "failed") {
    return {
      ...base,
      status: "failed",
      error: { message: `Exited with code ${input.exitCode ?? "unknown"}` },
    };
  }
  return { ...base, status: input.status, error: null };
}

// Runs a user-typed `!` command in a terminal in the agent's cwd and mirrors it into the
// agent's timeline as a shell tool call. The terminal takes input while the command runs
// and closes when it exits. Resolves once the final item is recorded.
export async function runAgentShellCommand(options: RunAgentShellCommandOptions): Promise<void> {
  const { command, cwd, terminalManager } = options;
  const invocation = resolveShellInvocation(command);
  const terminal = await terminalManager.createTerminal({
    cwd,
    workspaceId: agentShellTerminalScope(options.agentId),
    name: command,
    command: invocation.shell,
    args: invocation.args,
  });
  const callId = terminal.id;
  let lines: string[] = [];
  let stopped = false;

  const emitRunning = () =>
    options
      .emitLiveTimelineItem(
        buildShellTimelineItem({
          callId,
          command,
          cwd,
          output: lines.join("\n"),
          exitCode: null,
          status: "running",
          terminalId: terminal.id,
        }),
      )
      .catch(() => undefined);

  const readScreen = async () =>
    trimTrailingBlankLines(
      (await terminalManager.captureTerminal(terminal.id, { stripAnsi: true })).lines,
    );
  let capturing = false;
  const captureLive = async () => {
    if (capturing) return;
    capturing = true;
    try {
      const next = await readScreen();
      if (next.join("\n") !== lines.join("\n")) {
        lines = next;
        await emitRunning();
      }
    } catch {
      // The terminal can exit between captures; the exit info carries the final lines.
    } finally {
      capturing = false;
    }
  };

  stopByCallId.set(callId, () => {
    stopped = true;
    terminalManager.killTerminal(terminal.id);
  });
  void emitRunning();
  let unsubscribeFinished = () => {};
  const finished = new Promise<{ kind: "finished"; exitCode: number | null }>((resolve) => {
    unsubscribeFinished = terminal.onCommandFinished(({ exitCode }) =>
      resolve({ kind: "finished", exitCode }),
    );
  });
  const exited = new Promise<{
    kind: "exited";
    exitCode: number | null;
    lastOutputLines: string[];
  }>((resolve) => terminal.onExit((info) => resolve({ kind: "exited", ...info })));
  if (process.platform !== "win32") terminal.send({ type: "input", data: "\r" });
  const interval = setInterval(
    () => void captureLive(),
    options.captureIntervalMs ?? CAPTURE_INTERVAL_MS,
  );
  const outcome = await Promise.race([finished, exited]);
  clearInterval(interval);
  unsubscribeFinished();
  stopByCallId.delete(callId);

  let output: string[];
  if (outcome.kind === "finished") {
    output = await readScreen().catch(() => lines);
    terminalManager.killTerminal(terminal.id);
  } else {
    output = trimTrailingBlankLines(mergeOutputTail(lines, outcome.lastOutputLines));
  }

  let status: ShellStatus = outcome.exitCode === 0 ? "completed" : "failed";
  if (stopped) status = "canceled";
  await options.appendTimelineItem(
    buildShellTimelineItem({
      callId,
      command,
      cwd,
      output: output.join("\n"),
      exitCode: outcome.exitCode,
      status,
    }),
  );
}
