import { useCallback, useMemo, type ReactElement } from "react";
import { Pressable, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { Archive, Paperclip, X } from "lucide-react-native";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  type DropdownMenuTriggerProps,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Shortcut } from "@/components/ui/shortcut";
import { ComposerTrackActions, ComposerTrackRow } from "@/composer/tracks";
import { useIsCompactFormFactor } from "@/constants/layout";
import { isNative } from "@/constants/platform";
import { useCompactTimeAgo } from "@/hooks/use-time-ago";
import { useShortcutKeys } from "@/hooks/use-shortcut-keys";
import type { Theme } from "@/styles/theme";
import { previewStashEntry, type PromptStashEntry } from "./model";
import type { PromptStash } from "./use-prompt-stash";

const ThemedArchive = withUnistyles(Archive);
const ThemedPaperclip = withUnistyles(Paperclip);
const ThemedX = withUnistyles(X);
const foregroundMapping = (theme: Theme) => ({ color: theme.colors.foreground });
const foregroundMutedMapping = (theme: Theme) => ({ color: theme.colors.foregroundMuted });

/** Matches the track panels, whose row family this menu reuses. */
const ROW_ICON_SIZE = 14;
const MENU_MIN_WIDTH = 280;
const MENU_MAX_WIDTH = 420;
const MENU_MAX_HEIGHT = 440;

type TriggerStyle = NonNullable<DropdownMenuTriggerProps["style"]>;

const triggerStyle: TriggerStyle = ({ hovered, pressed, open }) => [
  styles.trigger,
  (hovered || pressed || open) && styles.triggerActive,
];

interface PromptStashMenuProps {
  stash: PromptStash;
  hasDraft: boolean;
  iconSize: number;
}

/**
 * The composer toolbar's stash control. It exists only while something is
 * stashed, so an empty stash adds nothing to the toolbar and the first stash
 * is the only thing that makes it appear. Stashing itself is Cmd+S, or the
 * menu's first row once the control is there.
 */
export function PromptStashMenu({ stash, hasDraft, iconSize }: PromptStashMenuProps) {
  const { t } = useTranslation();
  const shortcutKeys = useShortcutKeys("stash-prompt");
  const { entries } = stash;
  if (entries.length === 0) return null;
  const label = t("composer.stash.menuLabel");

  return (
    <DropdownMenu open={stash.isMenuOpen} onOpenChange={stash.setIsMenuOpen}>
      <Tooltip delayDuration={0} enabledOnDesktop enabledOnMobile={false}>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger
            accessibilityLabel={t("composer.stash.triggerLabel", { count: entries.length })}
            accessibilityRole="button"
            testID="composer-stash-button"
            style={triggerStyle}
          >
            <ThemedArchive size={iconSize} uniProps={foregroundMutedMapping} />
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent side="top" align="center" offset={8}>
          <View style={styles.tooltipRow}>
            <Text style={styles.tooltipText}>
              {t("composer.stash.triggerLabel", { count: entries.length })}
            </Text>
            {shortcutKeys ? <Shortcut chord={shortcutKeys} /> : null}
          </View>
        </TooltipContent>
      </Tooltip>
      <DropdownMenuContent
        side="top"
        align="end"
        offset={8}
        minWidth={MENU_MIN_WIDTH}
        maxWidth={MENU_MAX_WIDTH}
        maxHeight={MENU_MAX_HEIGHT}
        scrollable
        testID="composer-stash-menu"
        sheetTitle={label}
      >
        <ComposerTrackActions>
          <StashCurrentRow
            disabled={!hasDraft || !stash.canStash}
            onPress={stash.stashDraft}
            label={t("composer.stash.stashCurrent")}
          />
        </ComposerTrackActions>
        {entries.map((entry) => (
          <StashEntryRow
            key={entry.id}
            entry={entry}
            disabled={!stash.canStash}
            onRestore={stash.restore}
            onDelete={stash.remove}
          />
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function StashCurrentRow({
  disabled,
  onPress,
  label,
}: {
  disabled: boolean;
  onPress: () => void;
  label: string;
}): ReactElement {
  const shortcutKeys = useShortcutKeys("stash-prompt");
  const renderRow = useCallback(
    () => (
      <>
        <Text style={styles.rowLabel} numberOfLines={1}>
          {label}
        </Text>
        {shortcutKeys ? <Shortcut chord={shortcutKeys} /> : null}
      </>
    ),
    [label, shortcutKeys],
  );
  return (
    <View style={disabled ? styles.disabled : undefined}>
      <ComposerTrackRow
        accessibilityLabel={label}
        testID="composer-stash-current"
        disabled={disabled}
        onPress={onPress}
      >
        {renderRow}
      </ComposerTrackRow>
    </View>
  );
}

interface StashEntryRowProps {
  entry: PromptStashEntry;
  disabled: boolean;
  onRestore: (id: string) => boolean;
  onDelete: (id: string) => void;
}

function StashEntryRow({ entry, disabled, onRestore, onDelete }: StashEntryRowProps) {
  const { t } = useTranslation();
  const isCompact = useIsCompactFormFactor();
  const label = previewStashEntry(entry) ?? t("composer.stash.attachmentsOnly");
  const handleRestore = useCallback(() => {
    onRestore(entry.id);
  }, [entry.id, onRestore]);
  const handleDelete = useCallback(() => {
    onDelete(entry.id);
  }, [entry.id, onDelete]);
  const isDeleteAlwaysVisible = isNative || isCompact;

  const renderRow = useCallback(
    ({ active }: { active: boolean }) => (
      <>
        <Text style={styles.rowLabel} numberOfLines={1}>
          {label}
        </Text>
        <StashEntryMeta entry={entry} />
        <StashDeleteButton
          label={t("composer.stash.delete.action", { label })}
          tooltip={t("composer.stash.delete.tooltip")}
          testID={`composer-stash-delete-${entry.id}`}
          visible={isDeleteAlwaysVisible || active}
          onPress={handleDelete}
        />
      </>
    ),
    [entry, handleDelete, isDeleteAlwaysVisible, label, t],
  );

  return (
    <View style={disabled ? styles.disabled : undefined}>
      <ComposerTrackRow
        accessibilityLabel={label}
        testID={`composer-stash-entry-${entry.id}`}
        disabled={disabled}
        onPress={handleRestore}
      >
        {renderRow}
      </ComposerTrackRow>
    </View>
  );
}

function StashEntryMeta({ entry }: { entry: PromptStashEntry }): ReactElement {
  const createdAt = useMemo(() => new Date(entry.createdAt), [entry.createdAt]);
  const timeAgo = useCompactTimeAgo(createdAt);
  return (
    <>
      {entry.attachments.length > 0 ? (
        <View style={styles.attachmentCount}>
          <ThemedPaperclip size={ROW_ICON_SIZE} uniProps={foregroundMutedMapping} />
          <Text style={styles.rowMeta}>{entry.attachments.length}</Text>
        </View>
      ) : null}
      <Text style={styles.rowMeta} numberOfLines={1}>
        {timeAgo}
      </Text>
    </>
  );
}

// Hidden with opacity rather than unmounted, so revealing it never resizes the row.
function StashDeleteButton({
  label,
  tooltip,
  testID,
  visible,
  onPress,
}: {
  label: string;
  tooltip: string;
  testID: string;
  visible: boolean;
  onPress: () => void;
}): ReactElement {
  return (
    <View
      style={visible ? styles.actionVisible : styles.actionHidden}
      pointerEvents={visible ? "auto" : "none"}
    >
      <Tooltip delayDuration={0} enabledOnDesktop enabledOnMobile={false}>
        <TooltipTrigger asChild disabled={!visible}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={label}
            testID={testID}
            onPress={onPress}
            style={styles.actionButton}
            hitSlop={8}
          >
            {({ hovered, pressed }) => (
              <ThemedX
                size={ROW_ICON_SIZE}
                uniProps={hovered || pressed ? foregroundMapping : foregroundMutedMapping}
              />
            )}
          </Pressable>
        </TooltipTrigger>
        <TooltipContent side="top" align="center" offset={8}>
          <Text style={styles.tooltipText}>{tooltip}</Text>
        </TooltipContent>
      </Tooltip>
    </View>
  );
}

const styles = StyleSheet.create((theme: Theme) => ({
  // Same box and hover fill as the composer toolbar's other icon buttons.
  trigger: {
    width: 28,
    height: 28,
    borderRadius: theme.borderRadius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  triggerActive: {
    backgroundColor: theme.colors.surface2,
  },
  // `flexBasis: "auto"` so the panel measures the label instead of truncating at its floor.
  rowLabel: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: "auto",
    minWidth: 0,
    fontSize: theme.fontSize.base,
    color: theme.colors.foreground,
  },
  rowMeta: {
    flexShrink: 0,
    fontSize: theme.fontSize.sm,
    color: theme.colors.foregroundMuted,
  },
  attachmentCount: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
  },
  actionVisible: {
    opacity: 1,
  },
  actionHidden: {
    opacity: 0,
  },
  actionButton: {
    padding: theme.spacing[1],
    alignItems: "center",
    justifyContent: "center",
  },
  disabled: {
    opacity: theme.opacity[50],
  },
  tooltipRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
  },
  tooltipText: {
    fontSize: theme.fontSize.base,
    color: theme.colors.popoverForeground,
  },
}));
