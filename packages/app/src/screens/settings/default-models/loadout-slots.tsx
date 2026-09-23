import { useCallback, useState, type ReactElement } from "react";
import { Pressable, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { X } from "lucide-react-native";
import type {
  AgentModelDefinition,
  AgentSelectOption,
  ProviderSnapshotEntry,
} from "@getpaseo/protocol/agent-types";
import { formatThinkingOptionLabel } from "@/agent-controls/labels";
import { MODEL_LOADOUT_SIZE, type AgentProfile } from "@/agent-profiles";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useIsCompactFormFactor } from "@/constants/layout";
import { isNative, isWeb } from "@/constants/platform";
import { ICON_SIZE, type Theme } from "@/styles/theme";
import { LoadoutDragSource, LoadoutDropTarget } from "./drag";
import { slotDragId } from "./loadout-drop";
import { ProviderGlyph } from "./provider-glyph";

export const SLOT_SIZE = 140;
const SLOT_GLYPH_SIZE = 28;
const SLOT_INDICES = Array.from({ length: MODEL_LOADOUT_SIZE }, (_, index) => index);

const ThemedX = withUnistyles(X);
const mutedMapping = (theme: Theme) => ({ color: theme.colors.foregroundMuted });

interface LoadoutSlotsProps {
  serverId: string;
  slots: AgentProfile[] | null;
  entries: ProviderSnapshotEntry[] | undefined;
  onRemove: (profileId: string) => void;
  onSetThinking: (profileId: string, thinkingOptionId: string) => void;
}

function findModel(
  entries: ProviderSnapshotEntry[] | undefined,
  profile: AgentProfile,
): AgentModelDefinition | null {
  const models = entries?.find((candidate) => candidate.provider === profile.provider)?.models;
  // A slot can name a model the catalog no longer lists; borrow a sibling's effort options.
  return (
    models?.find((model) => model.id === profile.model) ??
    models?.find((model) => (model.thinkingOptions?.length ?? 0) > 0) ??
    null
  );
}

function resolveEffortLabel(
  profile: AgentProfile,
  model: AgentModelDefinition | null,
): string | null {
  const effectiveId = profile.thinkingOptionId ?? model?.defaultThinkingOptionId;
  if (!effectiveId) return null;
  const option = model?.thinkingOptions?.find((candidate) => candidate.id === effectiveId);
  return formatThinkingOptionLabel(option ?? { id: effectiveId });
}

export function LoadoutSlots({
  serverId,
  slots,
  entries,
  onRemove,
  onSetThinking,
}: LoadoutSlotsProps): ReactElement {
  return (
    <View style={styles.row} testID="default-models-slots">
      {SLOT_INDICES.map((index) => {
        const profile = slots?.[index];
        return (
          <LoadoutDropTarget key={index} index={index}>
            {(isOver) =>
              profile ? (
                <LoadoutDragSource id={slotDragId(profile.id)}>
                  <FilledSlot
                    key={profile.id}
                    serverId={serverId}
                    profile={profile}
                    model={findModel(entries, profile)}
                    index={index}
                    isOver={isOver}
                    onRemove={onRemove}
                    onSetThinking={onSetThinking}
                  />
                </LoadoutDragSource>
              ) : (
                <EmptySlot index={index} isOver={isOver} />
              )
            }
          </LoadoutDropTarget>
        );
      })}
    </View>
  );
}

function FilledSlot({
  serverId,
  profile,
  model,
  index,
  isOver,
  onRemove,
  onSetThinking,
}: {
  serverId: string;
  profile: AgentProfile;
  model: AgentModelDefinition | null;
  index: number;
  isOver: boolean;
  onRemove: (profileId: string) => void;
  onSetThinking: (profileId: string, thinkingOptionId: string) => void;
}): ReactElement {
  const { t } = useTranslation();
  const isCompact = useIsCompactFormFactor();
  const [isHovered, setIsHovered] = useState(false);
  const showRemove = isHovered || isNative || isCompact;

  const handlePointerEnter = useCallback(() => setIsHovered(true), []);
  const handlePointerLeave = useCallback(() => setIsHovered(false), []);
  const handleRemove = useCallback(() => onRemove(profile.id), [onRemove, profile.id]);

  return (
    <View
      style={styles.hoverTarget}
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
    >
      <View
        style={[styles.slot, isOver && styles.slotOver]}
        testID={`default-models-slot-${index}`}
      >
        <View style={styles.slotTop}>
          {index === 0 ? (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{t("settings.defaultModels.defaultBadge")}</Text>
            </View>
          ) : null}
          <Pressable
            onPress={handleRemove}
            hitSlop={8}
            style={[styles.removeButton, !showRemove && styles.hidden]}
            accessibilityRole="button"
            accessibilityLabel={t("settings.defaultModels.remove", { name: profile.name })}
            testID={`default-models-slot-remove-${index}`}
          >
            <ThemedX size={ICON_SIZE.sm} uniProps={mutedMapping} />
          </Pressable>
        </View>
        <View style={styles.slotCenter}>
          <ProviderGlyph
            provider={profile.provider}
            serverId={serverId}
            size={SLOT_GLYPH_SIZE}
            tone="foreground"
          />
        </View>
        <Text style={styles.slotName} numberOfLines={1}>
          {profile.name}
        </Text>
        <EffortControl profile={profile} model={model} onSetThinking={onSetThinking} />
      </View>
    </View>
  );
}

function EffortControl({
  profile,
  model,
  onSetThinking,
}: {
  profile: AgentProfile;
  model: AgentModelDefinition | null;
  onSetThinking: (profileId: string, thinkingOptionId: string) => void;
}): ReactElement {
  const { t } = useTranslation();
  const options = model?.thinkingOptions ?? [];
  const label = resolveEffortLabel(profile, model);
  const selectedId = profile.thinkingOptionId ?? model?.defaultThinkingOptionId;

  if (options.length === 0) {
    // A blank line keeps every card's name on the same baseline.
    return <Text style={styles.effortText}>{label ?? " "}</Text>;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        style={effortTriggerStyle}
        accessibilityRole="button"
        accessibilityLabel={t("settings.defaultModels.effortLabel", {
          name: profile.name,
          value: label ?? "",
        })}
      >
        <Text style={styles.effortText}>{label ?? t("settings.defaultModels.effortDefault")}</Text>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="bottom" align="start" width={200}>
        {options.map((option) => (
          <EffortMenuItem
            key={option.id}
            profileId={profile.id}
            option={option}
            selected={option.id === selectedId}
            onSetThinking={onSetThinking}
          />
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function EffortMenuItem({
  profileId,
  option,
  selected,
  onSetThinking,
}: {
  profileId: string;
  option: AgentSelectOption;
  selected: boolean;
  onSetThinking: (profileId: string, thinkingOptionId: string) => void;
}): ReactElement {
  const handleSelect = useCallback(
    () => onSetThinking(profileId, option.id),
    [onSetThinking, option.id, profileId],
  );
  return (
    <DropdownMenuItem selected={selected} onSelect={handleSelect}>
      {formatThinkingOptionLabel(option)}
    </DropdownMenuItem>
  );
}

function EmptySlot({ index, isOver }: { index: number; isOver: boolean }): ReactElement {
  const { t } = useTranslation();
  // Native has no drag, so the hint there points at the catalog instead.
  const hint = isWeb ? t("settings.defaultModels.dropHint") : t("settings.defaultModels.emptySlot");
  return (
    <View
      style={[styles.slot, styles.slotEmpty, isOver && styles.slotOver]}
      testID={`default-models-slot-${index}`}
    >
      <View style={styles.slotCenter}>
        <Text style={styles.dropHint}>{hint}</Text>
      </View>
      <Text style={styles.slotNumber}>{index + 1}</Text>
    </View>
  );
}

function effortTriggerStyle({ hovered, open }: { hovered: boolean; open: boolean }) {
  return [styles.effortTrigger, (hovered || open) && styles.effortTriggerActive];
}

const styles = StyleSheet.create((theme) => ({
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing[3],
  },
  hoverTarget: {
    position: "relative",
  },
  slot: {
    width: SLOT_SIZE,
    height: SLOT_SIZE,
    padding: theme.spacing[3],
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface1,
  },
  slotEmpty: {
    borderStyle: "dashed",
    backgroundColor: "transparent",
  },
  slotOver: {
    borderColor: theme.colors.foregroundMuted,
  },
  slotTop: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: theme.spacing[6],
  },
  badge: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.base,
    paddingHorizontal: theme.spacing[1],
  },
  badgeText: {
    color: theme.colors.foregroundMuted,
    fontFamily: theme.fontFamily.mono,
    fontSize: theme.fontSize.sm,
    textTransform: "uppercase",
  },
  removeButton: {
    marginLeft: "auto",
    padding: theme.spacing[0.5],
    borderRadius: theme.borderRadius.base,
  },
  hidden: {
    opacity: 0,
    pointerEvents: "none",
  },
  slotCenter: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  slotName: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.base,
  },
  effortTrigger: {
    alignSelf: "flex-start",
    borderRadius: theme.borderRadius.base,
    // Pulled back by its own padding so the label stays on the name's rail.
    paddingHorizontal: theme.spacing[1],
    marginLeft: -theme.spacing[1],
  },
  effortTriggerActive: {
    backgroundColor: theme.colors.interactionHighlight,
  },
  effortText: {
    color: theme.colors.foregroundMuted,
    fontFamily: theme.fontFamily.mono,
    fontSize: theme.fontSize.sm,
    textTransform: "uppercase",
  },
  dropHint: {
    color: theme.colors.foregroundMuted,
    fontFamily: theme.fontFamily.mono,
    fontSize: theme.fontSize.sm,
    textTransform: "uppercase",
    textAlign: "center",
  },
  slotNumber: {
    position: "absolute",
    right: theme.spacing[3],
    bottom: theme.spacing[3],
    color: theme.colors.foregroundMuted,
    fontFamily: theme.fontFamily.mono,
    fontSize: theme.fontSize.sm,
  },
}));
