import { useCallback, useMemo, type ReactElement } from "react";
import { Pressable, Text, View, type PressableStateCallbackType } from "react-native";
import { useTranslation } from "react-i18next";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { Check, GripVertical } from "lucide-react-native";
import type { ProviderSnapshotEntry } from "@getpaseo/protocol/agent-types";
import type { AgentProfile, ModelLoadoutEntry } from "@/agent-profiles";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { useIsCompactFormFactor } from "@/constants/layout";
import { isWeb } from "@/constants/platform";
import type {
  ProviderSelectionModelRow,
  ProviderSelectorProvider,
} from "@/provider-selection/provider-selection";
import { useProviderSettingsStore } from "@/stores/provider-settings-store";
import { ICON_SIZE, type Theme } from "@/styles/theme";
import { LoadoutDragSource } from "./drag";
import { findLoadoutSlot, modelDragId } from "./loadout-drop";
import { ProviderGlyph } from "./provider-glyph";

const CHIP_WIDTH = 176;
const CHIP_HEIGHT = 44;

const ThemedCheck = withUnistyles(Check);
const ThemedGrip = withUnistyles(GripVertical);
const ThemedLoadingSpinner = withUnistyles(LoadingSpinner);
const foregroundMapping = (theme: Theme) => ({ color: theme.colors.foreground });
const mutedMapping = (theme: Theme) => ({ color: theme.colors.foregroundMuted });

type ToggleHandler = (entry: ModelLoadoutEntry, profileId: string | null) => void;

interface ModelCatalogProps {
  serverId: string;
  entries: ProviderSnapshotEntry[] | undefined;
  providers: ProviderSelectorProvider[];
  slots: AgentProfile[] | null;
  isFull: boolean;
  onToggle: ToggleHandler;
}

export function ModelCatalog({
  serverId,
  entries,
  providers,
  slots,
  isFull,
  onToggle,
}: ModelCatalogProps): ReactElement {
  const providersById = useMemo(
    () => new Map(providers.map((provider) => [provider.id, provider])),
    [providers],
  );

  if (!entries) {
    return <LoadingLine />;
  }

  return (
    <View style={styles.columns}>
      {entries.map((entry) => {
        const provider = providersById.get(entry.provider);
        return (
          <ProviderColumn
            key={entry.provider}
            serverId={serverId}
            providerId={entry.provider}
            label={entry.label ?? entry.provider}
            provider={provider ?? null}
            slots={slots}
            isFull={isFull}
            onToggle={onToggle}
          />
        );
      })}
    </View>
  );
}

function ProviderColumn({
  serverId,
  providerId,
  label,
  provider,
  slots,
  isFull,
  onToggle,
}: {
  serverId: string;
  providerId: string;
  label: string;
  /** `null` when the provider is disabled on this host. */
  provider: ProviderSelectorProvider | null;
  slots: AgentProfile[] | null;
  isFull: boolean;
  onToggle: ToggleHandler;
}): ReactElement {
  const isCompact = useIsCompactFormFactor();
  const selection = provider?.modelSelection ?? null;

  return (
    <View
      style={[styles.column, isCompact && styles.columnCompact]}
      testID={`default-models-provider-${providerId}`}
    >
      <View style={styles.columnHeader}>
        <ProviderGlyph provider={providerId} serverId={serverId} size={ICON_SIZE.sm} />
        <Text style={styles.columnLabel} numberOfLines={1}>
          {label}
        </Text>
      </View>
      {selection?.kind === "models"
        ? selection.rows.map((row) => (
            <LoadoutDragSource key={row.favoriteKey} id={modelDragId(row.provider, row.modelId)}>
              <ModelChip
                row={row}
                profileId={findLoadoutSlot(slots ?? [], row.provider, row.modelId)?.id ?? null}
                isFull={isFull}
                disabled={slots === null}
                onToggle={onToggle}
              />
            </LoadoutDragSource>
          ))
        : null}
      {selection?.kind === "loading" ? <LoadingLine /> : null}
      {selection === null || selection.kind === "error" ? (
        <ConfigureChip serverId={serverId} providerId={providerId} label={label} />
      ) : null}
    </View>
  );
}

function ModelChip({
  row,
  profileId,
  isFull,
  disabled,
  onToggle,
}: {
  row: ProviderSelectionModelRow;
  profileId: string | null;
  isFull: boolean;
  disabled: boolean;
  onToggle: ToggleHandler;
}): ReactElement {
  const { t } = useTranslation();
  const isInLoadout = profileId !== null;
  const isBlocked = disabled || (isFull && !isInLoadout);

  const handlePress = useCallback(
    () => onToggle({ provider: row.provider, model: row.modelId, name: row.modelLabel }, profileId),
    [onToggle, profileId, row.modelId, row.modelLabel, row.provider],
  );
  const accessibilityState = useMemo(
    () => ({ selected: isInLoadout, disabled: isBlocked }),
    [isBlocked, isInLoadout],
  );
  const chipStyle = useCallback(
    ({ hovered, pressed }: PressableStateCallbackType & { hovered?: boolean }) => [
      styles.chip,
      (Boolean(hovered) || pressed) && !isBlocked && styles.chipHovered,
      isBlocked && styles.chipBlocked,
    ],
    [isBlocked],
  );

  return (
    <Pressable
      onPress={handlePress}
      disabled={isBlocked}
      style={chipStyle}
      accessibilityRole="button"
      accessibilityState={accessibilityState}
      accessibilityHint={isFull && !isInLoadout ? t("settings.defaultModels.full") : undefined}
      testID={`default-models-model-${row.favoriteKey}`}
    >
      <Text style={styles.chipLabel} numberOfLines={1}>
        {row.modelLabel}
      </Text>
      {isInLoadout ? <ThemedCheck size={ICON_SIZE.sm} uniProps={foregroundMapping} /> : null}
      {isWeb ? (
        <View style={styles.chipTrailing}>
          <ThemedGrip size={ICON_SIZE.sm} uniProps={mutedMapping} />
        </View>
      ) : null}
    </Pressable>
  );
}

function ConfigureChip({
  serverId,
  providerId,
  label,
}: {
  serverId: string;
  providerId: string;
  label: string;
}): ReactElement {
  const { t } = useTranslation();
  const handlePress = useCallback(() => {
    useProviderSettingsStore.getState().open({ serverId, provider: providerId });
  }, [providerId, serverId]);

  return (
    <Pressable
      onPress={handlePress}
      style={configureChipStyle}
      accessibilityRole="button"
      testID={`default-models-configure-${providerId}`}
    >
      <Text style={styles.configureLabel} numberOfLines={1}>
        {t("settings.defaultModels.configure", { provider: label })}
      </Text>
    </Pressable>
  );
}

/** What follows the pointer while a slot or model is dragged. */
export function DragPreview({
  serverId,
  provider,
  label,
}: {
  serverId: string;
  provider: string;
  label: string;
}): ReactElement {
  return (
    <View style={[styles.chip, styles.preview]}>
      <ProviderGlyph
        provider={provider}
        serverId={serverId}
        size={ICON_SIZE.sm}
        tone="foreground"
      />
      <Text style={styles.chipLabel} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

function LoadingLine(): ReactElement {
  const { t } = useTranslation();
  return (
    <View style={styles.loadingLine}>
      <ThemedLoadingSpinner size={ICON_SIZE.sm} uniProps={mutedMapping} />
      <Text style={styles.columnLabel}>{t("settings.defaultModels.loading")}</Text>
    </View>
  );
}

function configureChipStyle({
  hovered,
  pressed,
}: PressableStateCallbackType & { hovered?: boolean }) {
  return [styles.chip, styles.configureChip, (Boolean(hovered) || pressed) && styles.chipHovered];
}

const styles = StyleSheet.create((theme) => ({
  columns: {
    flexDirection: "row",
    flexWrap: "wrap",
    columnGap: theme.spacing[4],
    rowGap: theme.spacing[6],
  },
  column: {
    width: CHIP_WIDTH,
    gap: theme.spacing[2],
  },
  columnCompact: {
    width: "100%",
  },
  columnHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    marginBottom: theme.spacing[1],
  },
  columnLabel: {
    flexShrink: 1,
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
  chip: {
    height: CHIP_HEIGHT,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    paddingHorizontal: theme.spacing[3],
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface1,
  },
  chipHovered: {
    backgroundColor: theme.colors.surface2,
  },
  chipBlocked: {
    opacity: theme.opacity[50],
  },
  chipLabel: {
    flexShrink: 1,
    color: theme.colors.foreground,
    fontSize: theme.fontSize.base,
  },
  chipTrailing: {
    marginLeft: "auto",
  },
  configureChip: {
    borderStyle: "dashed",
    backgroundColor: "transparent",
  },
  configureLabel: {
    flexShrink: 1,
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.base,
  },
  preview: {
    width: CHIP_WIDTH,
    backgroundColor: theme.colors.surface2,
  },
  loadingLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    minHeight: CHIP_HEIGHT,
  },
}));
