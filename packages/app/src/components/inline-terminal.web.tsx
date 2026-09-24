import { useCallback, useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import {
  DEFAULT_TERMINAL_INPUT_MODE_STATE,
  type TerminalInputModeState,
} from "@getpaseo/protocol/terminal-input-mode";
import TerminalEmulator, { type TerminalEmulatorHandle } from "@/components/terminal-emulator";
import { useAppSettings } from "@/hooks/use-settings";
import { useHostRuntimeClient, useHostRuntimeIsConnected } from "@/runtime/host-runtime";
import { useSessionStore } from "@/stores/session-store";
import {
  createTerminalKeyInput,
  dispatchTerminalKeyInput,
} from "@/terminal/runtime/terminal-key-dispatch";
import { resolveTerminalRestoreOptions } from "@/terminal/runtime/terminal-restore-options";
import { TerminalStreamController } from "@/terminal/runtime/terminal-stream-controller";
import type { TerminalRendererReadyChange } from "@/utils/terminal-renderer-readiness";
import { toXtermTheme } from "@/utils/to-xterm-theme";

export const INLINE_TERMINAL_SUPPORTED = true;

const INLINE_TERMINAL_HEIGHT = 280;
const TERMINAL_EMULATOR_DOM_PROPS = { style: { flex: 1 }, matchContents: false };

const ThemedTerminalEmulator = withUnistyles(TerminalEmulator, (theme) => ({
  xtermTheme: toXtermTheme(theme.colors.terminal),
}));

interface TerminalSize {
  rows: number;
  cols: number;
}

// A live, interactive view of a daemon terminal, sized to sit inside a chat card. It owns
// the terminal's size while mounted, since nothing else displays it.
export function InlineTerminal({ serverId, terminalId }: { serverId: string; terminalId: string }) {
  const client = useHostRuntimeClient(serverId);
  const isConnected = useHostRuntimeIsConnected(serverId);
  const supportsRestoreModes = useSessionStore(
    (state) => state.sessions[serverId]?.serverInfo?.features?.["terminal-restore-modes"] === true,
  );
  const supportsInputModeReplay = useSessionStore(
    (state) =>
      state.sessions[serverId]?.serverInfo?.features?.["terminal-input-mode-replay"] === true,
  );
  const { settings } = useAppSettings();
  const emulatorRef = useRef<TerminalEmulatorHandle>(null);
  const inputModeRef = useRef<TerminalInputModeState>(DEFAULT_TERMINAL_INPUT_MODE_STATE);
  const sizeRef = useRef<TerminalSize | null>(null);
  const sentSizeRef = useRef<TerminalSize | null>(null);
  const streamKey = `inline-terminal:${serverId}:${terminalId}`;
  const [isRendererReady, setIsRendererReady] = useState(false);

  const handleRendererReadyChange = useCallback(
    (change: TerminalRendererReadyChange) => {
      if (change.streamKey === streamKey) setIsRendererReady(change.isReady);
    },
    [streamKey],
  );

  useEffect(() => {
    if (!client || !isConnected || !isRendererReady) return;
    const controller = new TerminalStreamController({
      client,
      getPreferredSize: () => sizeRef.current,
      onOutput: ({ data }) => emulatorRef.current?.writeOutput(data),
      onRestore: ({ data }) => emulatorRef.current?.restoreOutput(data),
      onSnapshot: ({ state }) => emulatorRef.current?.renderSnapshot(state),
      getRestoreOptions: () =>
        resolveTerminalRestoreOptions({
          supportsTerminalRestoreModes: supportsRestoreModes,
          canClaimSize: true,
          size: sizeRef.current,
        }),
    });
    controller.setTerminal({ terminalId });
    return () => controller.dispose();
  }, [client, isConnected, isRendererReady, supportsRestoreModes, terminalId]);

  const sendData = useCallback(
    (data: string) => client?.sendTerminalInput(terminalId, { type: "input", data }),
    [client, terminalId],
  );

  const handleInput = useCallback(
    (data: string) => {
      if (data.length > 0) sendData(data);
    },
    [sendData],
  );

  const handleTerminalKey = useCallback(
    (input: { key: string; ctrl: boolean; shift: boolean; alt: boolean; meta: boolean }) => {
      dispatchTerminalKeyInput({
        keyInput: createTerminalKeyInput({
          key: input.key,
          modifiers: { ctrl: input.ctrl, shift: input.shift, alt: input.alt },
          meta: input.meta,
        }),
        inputMode: inputModeRef.current,
        sendData,
      });
    },
    [sendData],
  );

  const handleInputModeChange = useCallback((state: TerminalInputModeState) => {
    inputModeRef.current = state;
  }, []);

  const handleResize = useCallback(
    (input: { rows: number; cols: number }) => {
      const size = { rows: Math.floor(input.rows), cols: Math.floor(input.cols) };
      if (size.rows <= 0 || size.cols <= 0) return;
      sizeRef.current = size;
      const sent = sentSizeRef.current;
      if (sent?.rows === size.rows && sent.cols === size.cols) return;
      sentSizeRef.current = size;
      client?.sendTerminalInput(terminalId, { type: "resize", ...size, intent: "claim" });
    },
    [client, terminalId],
  );

  return (
    <View style={styles.container} testID="inline-terminal">
      <ThemedTerminalEmulator
        ref={emulatorRef}
        dom={TERMINAL_EMULATOR_DOM_PROPS}
        streamKey={streamKey}
        supportsTerminalInputModeReplay={supportsInputModeReplay}
        scrollbackLines={settings.terminalScrollbackLines}
        fontFamily={settings.monoFontFamily.trim() || undefined}
        fontSize={settings.codeFontSize}
        onRendererReadyChange={handleRendererReadyChange}
        onInput={handleInput}
        onTerminalKey={handleTerminalKey}
        onInputModeChange={handleInputModeChange}
        onResize={handleResize}
      />
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: {
    height: INLINE_TERMINAL_HEIGHT,
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.base,
    overflow: "hidden",
    backgroundColor: theme.colors.terminal.background,
    padding: theme.spacing[2],
  },
}));
