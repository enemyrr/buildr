import { useCallback, useMemo, type ReactElement } from "react";
import { Alert, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import type { ProviderSnapshotEntry } from "@getpaseo/protocol/agent-types";
import { StyleSheet } from "react-native-unistyles";
import {
  AgentProfilesSection,
  MODEL_LOADOUT_SIZE,
  useModelLoadout,
  type ModelLoadout,
  type ModelLoadoutEntry,
} from "@/agent-profiles";
import { SettingsSection } from "@/components/settings/headings/settings-section";
import { useProvidersSnapshot } from "@/hooks/use-providers-snapshot";
import {
  buildSelectableProviderSelectorProviders,
  getAllProviderModelRows,
} from "@/provider-selection/provider-selection";
import { useHostRuntimeIsConnected } from "@/runtime/host-runtime";
import { settingsStyles } from "@/styles/settings";
import { LoadoutDragProvider } from "./drag";
import {
  modelDragId,
  resolveLoadoutDrop,
  slotDragId,
  type LoadoutDragSource,
} from "./loadout-drop";
import { LoadoutSlots } from "./loadout-slots";
import { DragPreview, ModelCatalog } from "./model-catalog";

interface DragItem {
  source: LoadoutDragSource;
  provider: string;
  label: string;
}

export function HostDefaultModelsPage({ serverId }: { serverId: string }): ReactElement {
  const { t } = useTranslation();
  const isConnected = useHostRuntimeIsConnected(serverId);
  const loadout = useModelLoadout(serverId);
  const { entries } = useProvidersSnapshot(serverId, { cwd: null });

  if (!isConnected || !loadout.isSupported) {
    return (
      <SettingsSection title={t("settings.defaultModels.loadoutTitle")}>
        <View style={settingsStyles.card} testID="default-models-unavailable">
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>
              {isConnected
                ? t("settings.defaultModels.unsupported")
                : t("settings.defaultModels.unavailable")}
            </Text>
          </View>
        </View>
      </SettingsSection>
    );
  }

  return (
    <View>
      <DefaultModelsBoard serverId={serverId} entries={entries} loadout={loadout} />
      <AgentProfilesSection serverId={serverId} />
    </View>
  );
}

function DefaultModelsBoard({
  serverId,
  entries,
  loadout,
}: {
  serverId: string;
  entries: ProviderSnapshotEntry[] | undefined;
  loadout: ModelLoadout;
}): ReactElement {
  const { t } = useTranslation();
  const { slots, isFull, add, remove, move, replace, setThinking } = loadout;
  const providers = useMemo(() => buildSelectableProviderSelectorProviders(entries), [entries]);

  const run = useCallback(
    (action: Promise<void>) => {
      action.catch((error: unknown) => {
        Alert.alert(
          t("common.errors.unableToSave"),
          error instanceof Error ? error.message : String(error),
        );
      });
    },
    [t],
  );

  const dragItems = useMemo(() => {
    const items = new Map<string, DragItem>();
    for (const profile of slots ?? []) {
      items.set(slotDragId(profile.id), {
        source: { kind: "slot", profileId: profile.id },
        provider: profile.provider,
        label: profile.name,
      });
    }
    for (const row of getAllProviderModelRows(providers)) {
      const entry = { provider: row.provider, model: row.modelId, name: row.modelLabel };
      items.set(modelDragId(row.provider, row.modelId), {
        source: { kind: "model", entry },
        provider: row.provider,
        label: row.modelLabel,
      });
    }
    return items;
  }, [providers, slots]);

  const handleDrop = useCallback(
    (sourceId: string, targetIndex: number) => {
      const item = dragItems.get(sourceId);
      if (!item || !slots) return;
      const action = resolveLoadoutDrop({
        source: item.source,
        targetIndex,
        slots,
        size: MODEL_LOADOUT_SIZE,
      });
      if (!action) return;
      if (action.kind === "move") run(move(action.profileId, action.toIndex));
      if (action.kind === "add") run(add(action.entry));
      if (action.kind === "replace") run(replace(action.profileId, action.entry));
    },
    [add, dragItems, move, replace, run, slots],
  );

  const renderOverlay = useCallback(
    (sourceId: string) => {
      const item = dragItems.get(sourceId);
      if (!item) return null;
      return <DragPreview serverId={serverId} provider={item.provider} label={item.label} />;
    },
    [dragItems, serverId],
  );

  const handleRemove = useCallback((profileId: string) => run(remove(profileId)), [remove, run]);
  const handleSetThinking = useCallback(
    (profileId: string, thinkingOptionId: string) => run(setThinking(profileId, thinkingOptionId)),
    [run, setThinking],
  );
  const handleToggle = useCallback(
    (entry: ModelLoadoutEntry, profileId: string | null) => {
      if (profileId) {
        run(remove(profileId));
        return;
      }
      if (!isFull) run(add(entry));
    },
    [add, isFull, remove, run],
  );

  return (
    <LoadoutDragProvider onDrop={handleDrop} renderOverlay={renderOverlay}>
      <SettingsSection
        title={t("settings.defaultModels.loadoutTitle")}
        info={t("settings.defaultModels.loadoutInfo")}
        testID="default-models-loadout"
      >
        <LoadoutSlots
          serverId={serverId}
          slots={slots}
          entries={entries}
          onRemove={handleRemove}
          onSetThinking={handleSetThinking}
        />
      </SettingsSection>
      <SettingsSection
        title={t("settings.defaultModels.catalogTitle")}
        info={t("settings.defaultModels.catalogInfo")}
        testID="default-models-catalog"
      >
        <ModelCatalog
          serverId={serverId}
          entries={entries}
          providers={providers}
          slots={slots}
          isFull={isFull}
          onToggle={handleToggle}
        />
      </SettingsSection>
    </LoadoutDragProvider>
  );
}

const styles = StyleSheet.create((theme) => ({
  emptyCard: {
    paddingVertical: theme.spacing[6],
    paddingHorizontal: theme.spacing[4],
    alignItems: "center",
  },
  emptyText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.base,
    textAlign: "center",
  },
}));
