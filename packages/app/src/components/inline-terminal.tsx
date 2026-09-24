// Native has no inline terminal; running `!` commands show their captured text instead.
export const INLINE_TERMINAL_SUPPORTED = false;

export function InlineTerminal(_props: { serverId: string; terminalId: string }) {
  return null;
}
