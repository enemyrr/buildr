// The one line of text on the pill rail above the composer, right-aligned. A pending
// keypress outranks a notice, which outranks the draft's mode, which outranks the idle hint.

export type EscapeArm = "clear" | "rewind";

export type InputHint =
  | { kind: "escape"; arm: EscapeArm }
  | { kind: "notice"; text: string }
  | { kind: "external-editor"; editor: string }
  | { kind: "shell" }
  | { kind: "memory" }
  | { kind: "interrupt" };

export interface InputHintState {
  escapeArm: EscapeArm | null;
  notice: string | null;
  externalEditor: string | null;
  isShellDraft: boolean;
  isMemoryDraft: boolean;
  isAgentRunning: boolean;
}

export function resolveInputHint(state: InputHintState): InputHint | null {
  if (state.escapeArm) return { kind: "escape", arm: state.escapeArm };
  if (state.notice) return { kind: "notice", text: state.notice };
  if (state.externalEditor) return { kind: "external-editor", editor: state.externalEditor };
  if (state.isShellDraft) return { kind: "shell" };
  if (state.isMemoryDraft) return { kind: "memory" };
  if (state.isAgentRunning) return { kind: "interrupt" };
  return null;
}

/** A plain Ctrl+letter chord. Cmd, Alt, and Shift variants belong to other shortcuts. */
export function isCtrlChord(
  event: {
    key: string;
    modifiers: { ctrlKey: boolean; metaKey: boolean; altKey: boolean; shiftKey: boolean };
  },
  letter: string,
): boolean {
  const { ctrlKey, metaKey, altKey, shiftKey } = event.modifiers;
  return ctrlKey && !metaKey && !altKey && !shiftKey && event.key.toLowerCase() === letter;
}
