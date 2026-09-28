import { useCallback, useMemo, type RefObject } from "react";
import type { View } from "react-native";
import { useTranslation } from "react-i18next";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
import { useSessionStore } from "@/stores/session-store";
import { selectPromptHistory } from "./prompt-history";

interface HistorySearchPickerProps {
  serverId: string;
  agentId: string;
  anchorRef: RefObject<View | null>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (prompt: string) => void;
}

/** Ctrl+R: fuzzy search over the agent's sent prompts, newest first. */
export function HistorySearchPicker({
  serverId,
  agentId,
  anchorRef,
  open,
  onOpenChange,
  onPick,
}: HistorySearchPickerProps) {
  const { t } = useTranslation();
  const entries = useMemo(
    () =>
      open
        ? selectPromptHistory(useSessionStore.getState().sessions[serverId], agentId).toReversed()
        : [],
    [agentId, open, serverId],
  );
  const options = useMemo<ComboboxOption[]>(
    () => entries.map((entry) => ({ id: entry.id, label: entry.prompt.replace(/\s+/g, " ") })),
    [entries],
  );
  const handleSelect = useCallback(
    (id: string) => {
      const entry = entries.find((candidate) => candidate.id === id);
      if (entry) onPick(entry.prompt);
    },
    [entries, onPick],
  );

  return (
    <Combobox
      options={options}
      value=""
      onSelect={handleSelect}
      searchable
      searchPlaceholder={t("composer.historySearch.placeholder")}
      title={t("composer.historySearch.title")}
      emptyText={t("composer.historySearch.empty")}
      open={open}
      onOpenChange={onOpenChange}
      desktopPlacement="top-start"
      anchorRef={anchorRef}
    />
  );
}
