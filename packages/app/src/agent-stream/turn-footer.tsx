import React, { memo, useCallback, useMemo, type ReactNode } from "react";
import { Pressable, Text, View, type PressableStateCallbackType } from "react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { MAX_CONTENT_WIDTH } from "@/constants/layout";
import { SPACING, type Theme } from "@/styles/theme";
import type { TurnTiming } from "@/timeline/turn-time";
import type { StreamItem, ToolCallItem } from "@/types/stream";
import {
  collectAssistantResponseContentForStreamRenderStrategy,
  type StreamStrategy,
} from "./strategy";
import { resolveAssistantTurnForkBoundary, type AssistantTurnForkBoundary } from "./turn-boundary";
import { AssistantTurnFooter, LiveElapsed, type AssistantForkTarget } from "@/components/message";
import type { TurnFooterHost } from "./layout";
import { AssistantForkMenu } from "@/components/assistant-fork-menu";
import { PixelLoader } from "@/components/pixel-loader";
import { useRetainedPanelActive } from "@/components/retained-panel";
import { MaterialFileIcon } from "@/components/material-file-icon";
import {
  collectResponseToolCalls,
  collectTurnFileChanges,
  type TurnFileChange,
} from "./turn-file-changes";

export interface TurnFileChipActions {
  /** The calls a stream row stands for; a turn-group host expands to its members. */
  resolveToolCalls: (item: ToolCallItem) => readonly ToolCallItem[];
  openFile: (filePath: string) => void;
}

const ThemedPixelLoader = withUnistyles(PixelLoader);
const workingIndicatorColorMapping = (theme: Theme) => ({ color: theme.colors.foregroundMuted });
export const TURN_FOOTER_BOTTOM_SPACING = SPACING[8];

export type TurnContentStrategy = StreamStrategy;
export type AssistantTurnForkHandler = (input: {
  target: AssistantForkTarget;
  boundary: AssistantTurnForkBoundary;
}) => Promise<void> | void;
/**
 * Fork handler for the turn that is still streaming. It deliberately takes no
 * boundary: `selectForkContextRows` projects the entire timeline when neither
 * boundary field is given, which is what captures the partially streamed text
 * the user is watching. Pinning a boundary here would silently drop the live
 * response — the opposite of what a fork button next to the loader promises.
 *
 * Kept separate from `AssistantTurnForkHandler` (whose `boundary` stays
 * required) so the compiler keeps enforcing that completed turns always pin one.
 */
export type InFlightTurnForkHandler = (target: AssistantForkTarget) => Promise<void> | void;

export const TurnFooter = memo(function TurnFooter({
  isRunning,
  inFlightTurnStartedAt,
  host,
  strategy,
  supportsTimelineCursor,
  onForkAssistantTurn,
  onForkInFlightTurn,
  fileChipActions,
}: {
  isRunning: boolean;
  inFlightTurnStartedAt: Date | null;
  host: TurnFooterHost | null;
  strategy: TurnContentStrategy;
  supportsTimelineCursor: boolean;
  onForkAssistantTurn?: AssistantTurnForkHandler;
  onForkInFlightTurn?: InFlightTurnForkHandler;
  fileChipActions: TurnFileChipActions;
}) {
  if (isRunning) {
    return (
      <TurnFooterRow>
        <RunningTurnFooter
          inFlightTurnStartedAt={inFlightTurnStartedAt}
          onForkInFlightTurn={onForkInFlightTurn}
        />
      </TurnFooterRow>
    );
  }
  if (!host) {
    return null;
  }
  return (
    <CompletedTurnFooterRow
      strategy={strategy}
      items={host.items}
      timing={host.timing}
      startIndex={host.startIndex}
      supportsTimelineCursor={supportsTimelineCursor}
      onForkAssistantTurn={onForkAssistantTurn}
      fileChipActions={fileChipActions}
    />
  );
});

export const CompletedTurnFooterRow = memo(function CompletedTurnFooterRow({
  strategy,
  items,
  timing,
  startIndex,
  supportsTimelineCursor,
  onForkAssistantTurn,
  fileChipActions,
}: {
  strategy: TurnContentStrategy;
  items: StreamItem[];
  timing?: TurnTiming;
  startIndex: number;
  supportsTimelineCursor: boolean;
  onForkAssistantTurn?: AssistantTurnForkHandler;
  fileChipActions: TurnFileChipActions;
}) {
  return (
    <TurnFooterRow>
      <CompletedTurnFooter
        strategy={strategy}
        items={items}
        timing={timing}
        startIndex={startIndex}
        supportsTimelineCursor={supportsTimelineCursor}
        onForkAssistantTurn={onForkAssistantTurn}
        fileChipActions={fileChipActions}
      />
    </TurnFooterRow>
  );
});

const WorkingIndicator = memo(function WorkingIndicator({
  inFlightTurnStartedAt = null,
  onForkInFlightTurn,
}: {
  inFlightTurnStartedAt?: Date | null;
  onForkInFlightTurn?: InFlightTurnForkHandler;
}) {
  const active = useRetainedPanelActive();
  return (
    <View style={stylesheet.turnFooterContent}>
      <View style={stylesheet.workingLoader}>
        <ThemedPixelLoader size={12} uniProps={workingIndicatorColorMapping} />
      </View>
      {/* Match the completed-turn footer: actions precede timing metadata. */}
      {onForkInFlightTurn ? <AssistantForkMenu onFork={onForkInFlightTurn} /> : null}
      {inFlightTurnStartedAt ? (
        <LiveElapsed
          startedAt={inFlightTurnStartedAt}
          active={active}
          style={stylesheet.workingElapsed}
          testID="turn-working-elapsed"
        />
      ) : null}
    </View>
  );
});

function RunningTurnFooter({
  inFlightTurnStartedAt,
  onForkInFlightTurn,
}: {
  inFlightTurnStartedAt: Date | null;
  onForkInFlightTurn?: InFlightTurnForkHandler;
}) {
  return (
    <View style={stylesheet.turnFooterSlot} testID="turn-working-indicator">
      <WorkingIndicator
        inFlightTurnStartedAt={inFlightTurnStartedAt}
        onForkInFlightTurn={onForkInFlightTurn}
      />
    </View>
  );
}

function CompletedTurnFooter({
  strategy,
  items,
  timing,
  startIndex,
  supportsTimelineCursor,
  onForkAssistantTurn,
  fileChipActions,
}: {
  strategy: TurnContentStrategy;
  items: StreamItem[];
  timing?: TurnTiming;
  startIndex: number;
  supportsTimelineCursor: boolean;
  onForkAssistantTurn?: AssistantTurnForkHandler;
  fileChipActions: TurnFileChipActions;
}) {
  const getContent = useCallback(
    () =>
      collectAssistantResponseContentForStreamRenderStrategy({
        strategy,
        items,
        startIndex,
      }),
    [strategy, items, startIndex],
  );
  const boundary = resolveAssistantTurnForkBoundary({
    items,
    startIndex,
    supportsTimelineCursor,
  });
  const handleFork = useCallback(
    (target: AssistantForkTarget) => {
      if (!boundary) {
        return;
      }
      return onForkAssistantTurn?.({ target, boundary });
    },
    [boundary, onForkAssistantTurn],
  );
  const fileChips = useMemo(() => {
    const changes = collectTurnFileChanges(
      collectResponseToolCalls({
        strategy,
        items,
        startIndex,
        expand: fileChipActions.resolveToolCalls,
      }),
    );
    return changes.length > 0 ? (
      <TurnFileChips changes={changes} onOpenFile={fileChipActions.openFile} />
    ) : null;
  }, [fileChipActions, items, startIndex, strategy]);
  return (
    <View style={stylesheet.turnFooterSlot}>
      <AssistantTurnFooter
        getContent={getContent}
        completedAt={timing?.completedAt}
        durationMs={timing?.durationMs}
        onFork={boundary && onForkAssistantTurn ? handleFork : undefined}
        trailing={fileChips}
      />
    </View>
  );
}

const TurnFileChips = memo(function TurnFileChips({
  changes,
  onOpenFile,
}: {
  changes: readonly TurnFileChange[];
  onOpenFile: (filePath: string) => void;
}) {
  return (
    <View style={stylesheet.fileChips}>
      {changes.map((change) => (
        <TurnFileChip key={change.filePath} change={change} onOpenFile={onOpenFile} />
      ))}
    </View>
  );
});

const fileChipStyle = ({
  pressed,
  hovered = false,
}: PressableStateCallbackType & { hovered?: boolean }) => [
  stylesheet.fileChip,
  hovered ? stylesheet.fileChipHovered : null,
  pressed ? stylesheet.fileChipPressed : null,
];

function TurnFileChip({
  change,
  onOpenFile,
}: {
  change: TurnFileChange;
  onOpenFile: (filePath: string) => void;
}) {
  const handlePress = useCallback(() => onOpenFile(change.filePath), [change.filePath, onOpenFile]);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={change.filePath}
      onPress={handlePress}
      style={fileChipStyle}
      testID="turn-file-chip"
    >
      <MaterialFileIcon fileName={change.fileName} size={12} />
      <Text style={stylesheet.fileChipName} numberOfLines={1}>
        {change.fileName}
      </Text>
      {change.additions > 0 ? (
        <Text style={stylesheet.fileChipAdditions}>+{change.additions}</Text>
      ) : null}
      {change.deletions > 0 ? (
        <Text style={stylesheet.fileChipDeletions}>-{change.deletions}</Text>
      ) : null}
    </Pressable>
  );
}

function TurnFooterRow({ children }: { children: ReactNode }) {
  const rowStyle = useMemo(() => [stylesheet.streamItemWrapper, stylesheet.turnFooterRow], []);
  return <View style={rowStyle}>{children}</View>;
}

const stylesheet = StyleSheet.create((theme) => ({
  streamItemWrapper: {
    width: "100%",
    maxWidth: MAX_CONTENT_WIDTH,
    alignSelf: "center",
    paddingHorizontal: theme.spacing[2],
  },
  turnFooterRow: {
    marginTop: theme.spacing[2] + 5,
  },
  turnFooterSlot: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    minHeight: 24,
    paddingBottom: TURN_FOOTER_BOTTOM_SPACING,
  },
  turnFooterContent: {
    height: 24,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-start",
    gap: theme.spacing[3],
  },
  workingElapsed: {
    color: theme.colors.foregroundMuted,
    fontFamily: theme.fontFamily.mono,
    fontSize: theme.fontSize.base,
  },
  workingLoader: {
    marginLeft: 2,
  },
  fileChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: theme.spacing[1],
  },
  fileChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
    maxWidth: 240,
    height: 20,
    paddingHorizontal: 6,
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.border,
    borderRadius: 4,
  },
  fileChipHovered: {
    backgroundColor: theme.colors.surface1,
    borderColor: theme.colors.borderAccent,
  },
  fileChipPressed: {
    opacity: 0.85,
  },
  fileChipName: {
    flexShrink: 1,
    color: theme.colors.foregroundMuted,
    fontSize: 11,
  },
  fileChipAdditions: {
    color: theme.colors.statusSuccess,
    fontSize: 11,
    fontVariant: ["tabular-nums"],
  },
  fileChipDeletions: {
    color: theme.colors.statusDanger,
    fontSize: 11,
    fontVariant: ["tabular-nums"],
  },
}));
