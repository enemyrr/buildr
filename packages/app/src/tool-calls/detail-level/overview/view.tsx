import { memo, useCallback, useMemo, useState, type ReactNode } from "react";
import { Pressable, Text, View, type PressableStateCallbackType } from "react-native";
import { useTranslation } from "react-i18next";
import { ChevronRight, XCircle } from "lucide-react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { ExpandableBadge } from "@/components/message";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { useIsCompactFormFactor } from "@/constants/layout";
import type { Theme } from "@/styles/theme";
import type { ToolCallItem } from "@/types/stream";
import { buildToolCallPresentation } from "@/tool-calls/presentation";
import { componentForToolCallIcon, resolveToolCallIcon } from "@/utils/tool-call-icon";
import type { ToolCallIcon } from "@/utils/tool-call-icon-name";
import { describeToolCall } from "../grouping";
import type { OverviewToolCallGroup, TurnActivityEntry } from "./model";
import { OverviewToolCallGroupSheet } from "./sheet";

/** Entries shown under a collapsed group while its turn is still running. */
const LIVE_PREVIEW_ENTRY_COUNT = 3;
const HEADER_ICON_SIZE = 12;
const EXPANDED_STATE = { expanded: true };
const COLLAPSED_STATE = { expanded: false };

export type TurnActivityEntryRenderer = (entry: TurnActivityEntry, isLast: boolean) => ReactNode;

interface OverviewGroupProps {
  group: OverviewToolCallGroup;
  /** `null` until the user toggles the group. */
  expanded: boolean | null;
  isLastInSequence: boolean;
  onExpandedChange: (groupId: string, expanded: boolean) => void;
  renderEntry: TurnActivityEntryRenderer;
}

const mutedMapping = (theme: Theme) => ({ color: theme.colors.foregroundMuted });
const dangerMapping = (theme: Theme) => ({ color: theme.colors.statusDanger });

function ToolIconGlyph({
  name,
  size,
  color,
}: {
  name: ToolCallIcon;
  size: number;
  color?: string;
}) {
  const Icon = componentForToolCallIcon(name);
  return <Icon size={size} color={color} />;
}

const ThemedToolIconGlyph = withUnistyles(ToolIconGlyph);
const ThemedChevronRight = withUnistyles(ChevronRight);
const ThemedXCircle = withUnistyles(XCircle);
const ThemedLoadingSpinner = withUnistyles(LoadingSpinner);

function useGroupLabel(group: OverviewToolCallGroup): string {
  const { t } = useTranslation();
  return useMemo(() => {
    const parts = [
      t(`toolCallGroup.toolCalls.${group.toolCallCount === 1 ? "one" : "other"}`, {
        count: group.toolCallCount,
      }),
    ];
    if (group.messageCount > 0) {
      parts.push(
        t(`toolCallGroup.messages.${group.messageCount === 1 ? "one" : "other"}`, {
          count: group.messageCount,
        }),
      );
    }
    return parts.join(", ");
  }, [group.messageCount, group.toolCallCount, t]);
}

function renderEntries(
  entries: readonly TurnActivityEntry[],
  renderEntry: TurnActivityEntryRenderer,
) {
  return entries.map((entry, index) => (
    <View key={entry.id}>{renderEntry(entry, index === entries.length - 1)}</View>
  ));
}

const headerPressableStyle = ({
  pressed,
  hovered = false,
}: PressableStateCallbackType & { hovered?: boolean }) => [
  styles.header,
  hovered ? styles.headerHovered : null,
  pressed ? styles.headerPressed : null,
];

export const OverviewToolCallGroupView = memo(function OverviewToolCallGroupView({
  group,
  expanded,
  isLastInSequence,
  onExpandedChange,
  renderEntry,
}: OverviewGroupProps) {
  const isCompact = useIsCompactFormFactor();
  const label = useGroupLabel(group);
  const toggle = useCallback(() => {
    onExpandedChange(group.run.id, expanded !== true);
  }, [expanded, group.run.id, onExpandedChange]);
  const close = useCallback(() => {
    onExpandedChange(group.run.id, false);
  }, [group.run.id, onExpandedChange]);

  const isInlineExpanded = expanded === true && !isCompact;
  // A live turn streams flat until it seals; it folds into the header once the turn ends.
  const isLiveFlat = !group.run.isSealed && !isCompact && expanded === null;
  // On compact the sheet owns expansion, so closing it must not hide the live preview.
  const showsLivePreview = !group.run.isSealed && isCompact;
  const visibleEntries = useMemo(() => {
    if (isInlineExpanded) return group.entries;
    if (showsLivePreview) return group.entries.slice(-LIVE_PREVIEW_ENTRY_COUNT);
    return [];
  }, [group.entries, isInlineExpanded, showsLivePreview]);
  const chevronStyle = isInlineExpanded ? styles.chevronExpanded : styles.chevron;

  if (isLiveFlat) {
    return (
      <View
        style={isLastInSequence ? styles.containerLast : styles.container}
        testID="tool-call-group"
      >
        {renderEntries(group.entries, renderEntry)}
      </View>
    );
  }

  return (
    <View
      style={isLastInSequence ? styles.containerLast : styles.container}
      testID="tool-call-group"
    >
      <Pressable
        accessibilityRole="button"
        accessibilityState={isInlineExpanded ? EXPANDED_STATE : COLLAPSED_STATE}
        accessibilityLabel={label}
        onPress={toggle}
        style={headerPressableStyle}
      >
        <View style={chevronStyle}>
          <ThemedChevronRight size={HEADER_ICON_SIZE} uniProps={mutedMapping} />
        </View>
        <Text style={styles.label} numberOfLines={1}>
          {label}
        </Text>
        <View style={styles.icons}>
          {group.iconNames.map((name) => (
            <ThemedToolIconGlyph
              key={name}
              name={name}
              size={HEADER_ICON_SIZE}
              uniProps={mutedMapping}
            />
          ))}
        </View>
        {group.errorCount > 0 ? (
          <ThemedXCircle size={HEADER_ICON_SIZE} uniProps={dangerMapping} />
        ) : null}
        {group.isLoading ? (
          <ThemedLoadingSpinner size={HEADER_ICON_SIZE} uniProps={mutedMapping} />
        ) : null}
      </Pressable>
      {visibleEntries.length > 0 ? (
        <View style={styles.body}>{renderEntries(visibleEntries, renderEntry)}</View>
      ) : null}
      {isCompact ? (
        <OverviewToolCallGroupSheet visible={expanded === true} summary={label} onClose={close}>
          {expanded ? renderEntries(group.entries, renderEntry) : null}
        </OverviewToolCallGroupSheet>
      ) : null}
    </View>
  );
});

interface MergedToolCallsRowProps {
  calls: readonly ToolCallItem[];
  cwd?: string;
  renderCall: (call: ToolCallItem, isLast: boolean) => ReactNode;
}

/** `[icon] Bash ×4  <latest summary>`; expands to the individual calls. */
export const MergedToolCallsRow = memo(function MergedToolCallsRow({
  calls,
  cwd,
  renderCall,
}: MergedToolCallsRowProps) {
  const [expanded, setExpanded] = useState(false);
  const onToggle = useCallback(() => setExpanded((previous) => !previous), []);
  const latest = calls.at(-1);
  const presentation = useMemo(() => {
    if (!latest) return null;
    const descriptor = describeToolCall(latest);
    return buildToolCallPresentation({
      toolName: descriptor.name,
      status: descriptor.status,
      error: descriptor.error,
      detail: descriptor.detail,
      metadata: descriptor.metadata,
      cwd,
      resolveIcon: resolveToolCallIcon,
    });
  }, [cwd, latest]);
  const states = useMemo(() => {
    let isLoading = false;
    let isError = false;
    for (const call of calls) {
      const status = describeToolCall(call).status;
      isLoading ||= status === "running" || status === "executing";
      isError ||= status === "failed";
    }
    return { isLoading, isError };
  }, [calls]);
  const renderDetails = useCallback(
    () => (
      <View style={styles.mergedDetails}>
        {calls.map((call, index) => (
          <View key={call.id}>{renderCall(call, index === calls.length - 1)}</View>
        ))}
      </View>
    ),
    [calls, renderCall],
  );
  if (!presentation) {
    return null;
  }
  return (
    <ExpandableBadge
      testID="tool-call-merged-row"
      label={`${presentation.displayName} ×${calls.length}`}
      secondaryLabel={presentation.summary}
      secondaryLabelVariant="code"
      icon={presentation.icon}
      isExpanded={expanded}
      isLoading={states.isLoading}
      isError={states.isError}
      onToggle={onToggle}
      renderDetails={renderDetails}
      borderlessWhenExpanded
    />
  );
});

const styles = StyleSheet.create((theme) => ({
  container: {
    marginBottom: theme.spacing[1],
  },
  containerLast: {
    marginBottom: theme.spacing[4],
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    maxWidth: "100%",
    gap: theme.spacing[2],
    minHeight: 26,
    paddingVertical: theme.spacing[1],
    paddingHorizontal: theme.spacing[2],
    marginHorizontal: -theme.spacing[2],
    borderRadius: theme.borderRadius.md,
  },
  headerHovered: {
    backgroundColor: theme.colors.surface1,
  },
  headerPressed: {
    opacity: 0.85,
  },
  chevron: {
    transform: [{ rotate: "0deg" }],
  },
  chevronExpanded: {
    transform: [{ rotate: "90deg" }],
  },
  label: {
    flexShrink: 1,
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.base,
  },
  icons: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
  },
  body: {
    marginTop: theme.spacing[1],
    marginLeft: 5,
    paddingLeft: theme.spacing[4],
    borderLeftWidth: theme.borderWidth[1],
    borderLeftColor: theme.colors.border,
  },
  mergedDetails: {
    paddingTop: theme.spacing[1],
    paddingLeft: theme.spacing[4],
  },
}));
