import { useCallback, useMemo } from "react";
import { Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { Archive, Paperclip } from "lucide-react-native";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Shortcut } from "@/components/ui/shortcut";
import { useShortcutKeys } from "@/hooks/use-shortcut-keys";
import { ICON_SIZE, type Theme } from "@/styles/theme";
import { previewStashEntry, type PromptStashEntry } from "./model";
import type { PromptStash } from "./use-prompt-stash";

const ThemedArchive = withUnistyles(Archive);
const ThemedPaperclip = withUnistyles(Paperclip);
const iconMutedMapping = (theme: Theme) => ({ color: theme.colors.foregroundMuted });
const stashCurrentIcon = <ThemedArchive size={ICON_SIZE.md} uniProps={iconMutedMapping} />;

interface PromptStashMenuProps {
  stash: PromptStash;
  hasDraft: boolean;
  iconSize: number;
}

function StashEntryTrailing({ entry }: { entry: PromptStashEntry }) {
  if (entry.attachments.length === 0) return null;
  return (
    <View style={styles.attachmentCount}>
      <ThemedPaperclip size={ICON_SIZE.xs} uniProps={iconMutedMapping} />
      <Text style={styles.countText}>{entry.attachments.length}</Text>
    </View>
  );
}

interface StashEntryItemProps {
  entry: PromptStashEntry;
  disabled: boolean;
  onRestore: (id: string) => boolean;
  attachmentsOnlyLabel: string;
}

function StashEntryItem({ entry, disabled, onRestore, attachmentsOnlyLabel }: StashEntryItemProps) {
  const handleSelect = useCallback(() => {
    onRestore(entry.id);
  }, [entry.id, onRestore]);
  const trailing = useMemo(() => <StashEntryTrailing entry={entry} />, [entry]);
  return (
    <DropdownMenuItem
      testID={"composer-stash-entry-" + entry.id}
      disabled={disabled}
      onSelect={handleSelect}
      trailing={trailing}
    >
      {previewStashEntry(entry) ?? attachmentsOnlyLabel}
    </DropdownMenuItem>
  );
}

function triggerStyle({ hovered }: { hovered?: boolean }) {
  return [styles.trigger, Boolean(hovered) && styles.triggerHovered];
}

/** Stash button with its restore menu. Hidden until there is a draft or a stash. */
export function PromptStashMenu({ stash, hasDraft, iconSize }: PromptStashMenuProps) {
  const { t } = useTranslation();
  const shortcutKeys = useShortcutKeys("stash-prompt");
  const { entries } = stash;
  if (entries.length === 0 && !hasDraft) return null;
  const label = t("composer.stash.menuLabel");
  const attachmentsOnlyLabel = t("composer.stash.attachmentsOnly");

  return (
    <DropdownMenu open={stash.isMenuOpen} onOpenChange={stash.setIsMenuOpen}>
      <Tooltip delayDuration={0} enabledOnDesktop enabledOnMobile={false}>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger
            accessibilityLabel={label}
            accessibilityRole="button"
            testID="composer-stash-button"
            style={triggerStyle}
          >
            <View style={styles.triggerContent}>
              <ThemedArchive size={iconSize} uniProps={iconMutedMapping} />
              {entries.length > 0 ? <Text style={styles.countText}>{entries.length}</Text> : null}
            </View>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent side="top" align="center" offset={8}>
          <View style={styles.tooltipRow}>
            <Text style={styles.tooltipText}>{label}</Text>
            {shortcutKeys ? <Shortcut chord={shortcutKeys} /> : null}
          </View>
        </TooltipContent>
      </Tooltip>
      <DropdownMenuContent
        side="top"
        align="end"
        offset={8}
        minWidth={240}
        maxWidth={360}
        testID="composer-stash-menu"
        sheetTitle={label}
      >
        <DropdownMenuItem
          testID="composer-stash-current"
          disabled={!hasDraft || !stash.canStash}
          onSelect={stash.stashDraft}
          leading={stashCurrentIcon}
        >
          {t("composer.stash.stashCurrent")}
        </DropdownMenuItem>
        {entries.length > 0 ? <DropdownMenuSeparator /> : null}
        {entries.map((entry) => (
          <StashEntryItem
            key={entry.id}
            entry={entry}
            disabled={!stash.canStash}
            onRestore={stash.restore}
            attachmentsOnlyLabel={attachmentsOnlyLabel}
          />
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const styles = StyleSheet.create((theme: Theme) => ({
  trigger: {
    height: 28,
    minWidth: 28,
    paddingHorizontal: theme.spacing[1],
    borderRadius: theme.borderRadius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  triggerHovered: {
    backgroundColor: theme.colors.surface2,
  },
  triggerContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
  },
  attachmentCount: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
  },
  countText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.foregroundMuted,
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
