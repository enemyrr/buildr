import { useCallback, useMemo, useState, type RefObject } from "react";
import type { View } from "react-native";
import { useTranslation } from "react-i18next";
import type { DaemonClient } from "@getpaseo/client/internal/daemon-client";
import type { AgentCapabilityFlags } from "@getpaseo/protocol/agent-types";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
import { useSessionStore } from "@/stores/session-store";
import { useRewindAgentMutation } from "./use-rewind-agent-mutation";
import { useRewindCapabilities } from "./use-rewind-capabilities";
import { selectRewindTargets, type RewindTarget } from "./rewind-targets";

function toSingleLine(text: string): string {
  return text.replace(/\s+/g, " ");
}

interface RewindPickerProps {
  serverId: string;
  agentId: string;
  client: DaemonClient | null;
  capabilities: AgentCapabilityFlags;
  anchorRef: RefObject<View | null>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Pick a past message, then how far to rewind. The keyboard path to the per-message menu. */
export function RewindPicker({
  serverId,
  agentId,
  client,
  capabilities,
  anchorRef,
  open,
  onOpenChange,
}: RewindPickerProps) {
  const { t } = useTranslation();
  const [target, setTarget] = useState<RewindTarget | null>(null);
  const rewindLabels = useMemo(
    () => ({
      conversation: t("rewind.actions.conversation"),
      files: t("rewind.actions.files"),
      both: t("rewind.actions.both"),
    }),
    [t],
  );
  const modes = useRewindCapabilities(capabilities, rewindLabels);
  const rewind = useRewindAgentMutation({ serverId, agentId, client });

  const targets = useMemo(
    () => (open ? selectRewindTargets(useSessionStore.getState().sessions[serverId], agentId) : []),
    [agentId, open, serverId],
  );
  const options = useMemo<ComboboxOption[]>(
    () =>
      target
        ? modes.map((mode) => ({ id: mode.mode, label: mode.label }))
        : targets.map((entry) => ({ id: entry.messageId, label: toSingleLine(entry.prompt) })),
    [modes, target, targets],
  );

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next) setTarget(null);
      onOpenChange(next);
    },
    [onOpenChange],
  );

  const handleSelect = useCallback(
    (id: string) => {
      if (!target) {
        setTarget(targets.find((entry) => entry.messageId === id) ?? null);
        return;
      }
      const mode = modes.find((item) => item.mode === id)?.mode;
      handleOpenChange(false);
      if (!mode) return;
      void rewind
        .rewindAgent({ mode, rewoundText: target.prompt, messageId: target.messageId })
        .catch(() => undefined);
    },
    [handleOpenChange, modes, rewind, target, targets],
  );

  if (modes.length === 0) return null;
  return (
    <Combobox
      // Remount per step so the search query from the message list doesn't filter the modes.
      key={target?.messageId ?? "messages"}
      options={options}
      value=""
      onSelect={handleSelect}
      keepOpenOnSelect={!target}
      searchable={!target}
      searchPlaceholder={t("rewind.picker.searchPlaceholder")}
      title={target ? t("rewind.warning") : t("rewind.picker.title")}
      emptyText={t("rewind.picker.empty")}
      open={open}
      onOpenChange={handleOpenChange}
      desktopPlacement="top-start"
      anchorRef={anchorRef}
    />
  );
}
