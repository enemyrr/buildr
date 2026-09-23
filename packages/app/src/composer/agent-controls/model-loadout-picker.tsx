import { useCallback, useMemo, useRef, useState, type ReactElement } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, Text, View, type PressableStateCallbackType } from "react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { Check, ChevronDown, GripVertical, Settings } from "lucide-react-native";
import type {
  AgentFeature,
  AgentFeatureToggle,
  AgentProvider,
} from "@getpaseo/protocol/agent-types";
import { useModelLoadout, type AgentProfilePicker } from "@/agent-profiles";
import { getAgentModeOptionIcon } from "@/agent-controls/icons";
import { formatAgentModeLabel } from "@/agent-controls/labels";
import { CombinedModelSelector } from "@/components/combined-model-selector";
import type { DraggableListDragHandleProps } from "@/components/draggable-list.types";
import { ModelProviderGlyph } from "@/components/model-browser";
import {
  MENU_ITEM_HEIGHT,
  MenuItem,
  MenuRoot,
  MenuSeparator,
  MenuSubTrigger,
  MenuSurface,
  MenuTrigger,
  useMenuContext,
  type MenuPageDefinition,
  type MenuTriggerState,
} from "@/components/ui/menu";
import { Shortcut } from "@/components/ui/shortcut";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/contexts/toast-context";
import { useKeyboardActionHandler } from "@/hooks/use-keyboard-action-handler";
import { useProvidersSnapshot } from "@/hooks/use-providers-snapshot";
import { useShortcutKeys } from "@/hooks/use-shortcut-keys";
import type { KeyboardActionDefinition } from "@/keyboard/keyboard-action-dispatcher";
import {
  getAllProviderModelRows,
  resolveSelectedModelLabel,
  type ProviderSelectorProvider,
} from "@/provider-selection/provider-selection";
import type { Theme } from "@/styles/theme";
import { toErrorMessage } from "@/utils/error-messages";
import { useComposerKeyboardScope } from "@/composer/keyboard-scope";
import type { AgentModeControlValue } from "@/composer/agent-controls/mode-control";
import { resolveNextAgentModeId } from "@/composer/agent-controls/mode";
import {
  buildLoadoutRows,
  findFastFeature,
  resolveLoadoutMove,
  resolveNextThinkingOptionId,
  type LoadoutRow,
} from "@/composer/agent-controls/model-loadout";
import { LoadoutSortable } from "@/composer/agent-controls/loadout-sortable";

const ThemedCheck = withUnistyles(Check);
const ThemedChevronDown = withUnistyles(ChevronDown);
const ThemedGrip = withUnistyles(GripVertical);
const ThemedSettings = withUnistyles(Settings);

const foregroundMapping = (theme: Theme) => ({ color: theme.colors.foreground });
const mutedMapping = (theme: Theme) => ({ color: theme.colors.foregroundMuted });
const extraMutedMapping = (theme: Theme) => ({ color: theme.colors.foregroundExtraMuted });

const POPOVER_WIDTH = 380;
const KEYBOARD_ACTIONS = [
  "message-input.model-slot",
  "message-input.effort-cycle",
  "message-input.fast-toggle",
  "message-input.mode-cycle",
] as const;

interface ThinkingOption {
  id: string;
  label: string;
}

export interface ModelLoadoutPickerProps {
  serverId: string | null;
  provider: string;
  selectedModelId: string;
  modelSelectorProviders: ProviderSelectorProvider[];
  isModelLoading: boolean;
  /** Which loadout slots this composer can run, and how to apply one. */
  profiles: AgentProfilePicker | null;
  onSelectModel: (provider: AgentProvider, modelId: string) => void;
  thinkingOptions: ThinkingOption[];
  selectedThinkingOptionId?: string;
  onSelectThinkingOption?: (thinkingOptionId: string) => void;
  modeControl?: AgentModeControlValue | null;
  features?: AgentFeature[];
  onSetFeature?: (featureId: string, value: unknown) => void;
  onEditLoadout?: () => void;
  onOpen?: () => void;
  onClose?: () => void;
  onRetryProvider?: (provider: AgentProvider) => void;
  isRetryingProvider?: boolean;
  disabled?: boolean;
}

/**
 * The composer's model control: the loadout's slots, then the current model's effort, mode and
 * features, then a way into settings. The full catalog stays one row away, behind the model
 * browser.
 */
export function ModelLoadoutPicker(props: ModelLoadoutPickerProps): ReactElement {
  const {
    serverId,
    provider,
    selectedModelId,
    modelSelectorProviders,
    isModelLoading,
    profiles,
    onSelectModel,
    thinkingOptions,
    selectedThinkingOptionId,
    onSelectThinkingOption,
    modeControl = null,
    features,
    onSetFeature,
    onEditLoadout,
    onOpen,
    onClose,
    onRetryProvider,
    isRetryingProvider = false,
    disabled = false,
  } = props;
  const { t } = useTranslation();
  const toast = useToast();
  const loadout = useModelLoadout(serverId);
  const { entries } = useProvidersSnapshot(serverId, { cwd: null });
  const anchorRef = useRef<View>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [browse, setBrowse] = useState<"add" | "more" | null>(null);

  const selectedThinking =
    thinkingOptions.find((option) => option.id === selectedThinkingOptionId) ??
    thinkingOptions[0] ??
    null;
  const fastFeature = findFastFeature(features);
  const otherFeatures = useMemo(
    () => (features ?? []).filter((feature) => feature.id !== fastFeature?.id),
    [features, fastFeature?.id],
  );

  const rows = useMemo(
    () =>
      buildLoadoutRows({
        slots: loadout.slots ?? [],
        entries,
        applicableIds: new Set(profiles?.rows.map((row) => row.id) ?? []),
        current: {
          provider,
          modelId: selectedModelId,
          thinkingOptionId: selectedThinking?.id ?? null,
        },
      }),
    [entries, loadout.slots, profiles, provider, selectedModelId, selectedThinking?.id],
  );

  const modelLabel = resolveSelectedModelLabel({
    providers: modelSelectorProviders,
    selectedProvider: provider,
    selectedModel: selectedModelId,
    isLoading: isModelLoading,
  });

  const applySlot = useCallback(
    (row: LoadoutRow) => {
      if (row.applicable) profiles?.applyProfile(row.id);
    },
    [profiles],
  );

  const handleMenuOpenChange = useCallback(
    (open: boolean) => {
      setMenuOpen(open);
      if (open) onOpen?.();
      else onClose?.();
    },
    [onClose, onOpen],
  );

  const handleReorder = useCallback(
    (next: LoadoutRow[]) => {
      const move = resolveLoadoutMove(
        rows.map((row) => row.id),
        next.map((row) => row.id),
      );
      if (!move) return;
      loadout.move(move.id, move.toIndex).catch((error) => {
        toast.error(toErrorMessage(error));
      });
    },
    [loadout, rows, toast],
  );

  const handleBrowseOpenChange = useCallback(
    (open: boolean) => {
      if (open) return;
      setBrowse(null);
      onClose?.();
    },
    [onClose],
  );

  const handleBrowseSelect = useCallback(
    (nextProvider: AgentProvider, modelId: string) => {
      onSelectModel(nextProvider, modelId);
      if (browse !== "add") return;
      const row = getAllProviderModelRows(modelSelectorProviders).find(
        (candidate) => candidate.provider === nextProvider && candidate.modelId === modelId,
      );
      loadout
        .add({ provider: nextProvider, model: modelId, name: row?.modelLabel ?? modelId })
        .catch((error) => {
          toast.error(toErrorMessage(error));
        });
    },
    [browse, loadout, modelSelectorProviders, onSelectModel, toast],
  );

  useLoadoutShortcuts({
    rows,
    applySlot,
    thinkingOptions,
    selectedThinkingId: selectedThinking?.id ?? null,
    onSelectThinkingOption,
    fastFeature,
    onSetFeature,
    modeControl,
    disabled,
  });

  const pages = useLoadoutPages({
    thinkingOptions,
    selectedThinkingId: selectedThinking?.id ?? null,
    onSelectThinkingOption,
    modeControl,
    selectFeatures: otherFeatures,
    onSetFeature,
  });

  const isLoadoutEmpty = loadout.isSupported && rows.length === 0;
  const handleBrowse = useCallback(
    () => setBrowse(isLoadoutEmpty ? "add" : "more"),
    [isLoadoutEmpty],
  );
  const browserControl = useMemo(
    () => ({ open: browse !== null, onOpenChange: handleBrowseOpenChange, anchorRef }),
    [browse, handleBrowseOpenChange],
  );
  const renderRow = useCallback(
    (row: LoadoutRow, dragHandle: DraggableListDragHandleProps | null) => (
      <LoadoutRowItem
        row={row}
        serverId={serverId}
        dragHandle={dragHandle}
        onApply={applySlot}
        unavailableLabel={t("composer.loadout.unavailable", { model: row.label })}
        reorderLabel={t("composer.loadout.reorder", { model: row.label })}
      />
    ),
    [applySlot, serverId, t],
  );

  const renderTrigger = useCallback(
    ({ hovered, pressed, open }: MenuTriggerState) => (
      <View
        style={[styles.trigger, (hovered || pressed || open) && styles.triggerActive]}
        pointerEvents="none"
      >
        <Text style={styles.triggerModel} numberOfLines={1}>
          {modelLabel}
        </Text>
        {selectedThinking ? (
          <Text style={styles.triggerEffort} numberOfLines={1}>
            {selectedThinking.label}
          </Text>
        ) : null}
        <ThemedChevronDown size={14} uniProps={mutedMapping} />
      </View>
    ),
    [modelLabel, selectedThinking],
  );

  return (
    <>
      <MenuRoot open={menuOpen} onOpenChange={handleMenuOpenChange} compactMode="sheet">
        <MenuTrigger
          ref={anchorRef}
          disabled={disabled}
          style={[styles.triggerHost, disabled && styles.disabled]}
          accessibilityRole="button"
          accessibilityLabel={t("modelSelector.selectedModel", { model: modelLabel })}
          testID="combined-model-selector"
        >
          {renderTrigger}
        </MenuTrigger>
        <MenuSurface
          side="top"
          align="start"
          width={POPOVER_WIDTH}
          pages={pages}
          sheetTitle={t("composer.loadout.title")}
          testID="model-loadout-menu"
        >
          <LoadoutSortable
            items={rows}
            keyExtractor={loadoutRowKey}
            renderItem={renderRow}
            onReorder={handleReorder}
          />
          <MenuItem muted onSelect={handleBrowse} testID="browse-all-models">
            {isLoadoutEmpty ? t("composer.loadout.addModels") : t("composer.loadout.moreModels")}
          </MenuItem>
          <LoadoutSettingRows
            hasEffort={pages.some((page) => page.id === "effort")}
            effortLabel={selectedThinking?.label}
            modeControl={modeControl}
            fastFeature={fastFeature}
            otherFeatures={otherFeatures}
            onSetFeature={onSetFeature}
          />
          <MenuSeparator />
          <LoadoutFooter
            onEdit={onEditLoadout}
            showCycleHint={thinkingOptions.length > 1}
            editLabel={t("composer.loadout.edit")}
            editAccessibilityLabel={t("composer.loadout.editLabel")}
            cycleLabel={t("composer.loadout.cycleEffort")}
          />
        </MenuSurface>
      </MenuRoot>
      <CombinedModelSelector
        controlled={browserControl}
        providers={modelSelectorProviders}
        selectedProvider={provider}
        selectedModel={selectedModelId}
        onSelect={handleBrowseSelect}
        isLoading={isModelLoading}
        onRetryProvider={onRetryProvider}
        isRetryingProvider={isRetryingProvider}
        serverId={serverId}
        desktopPlacement="top-start"
        desktopMinWidth={POPOVER_WIDTH}
      />
    </>
  );
}

/**
 * The picker's shortcuts, live whenever this composer is the active one — not only while the
 * picker is open. Shift+Tab's mode cycle lives here too, since the mode control moved in here.
 */
function useLoadoutShortcuts(input: {
  rows: LoadoutRow[];
  applySlot: (row: LoadoutRow) => void;
  thinkingOptions: ThinkingOption[];
  selectedThinkingId: string | null;
  onSelectThinkingOption?: (thinkingOptionId: string) => void;
  fastFeature: AgentFeatureToggle | null;
  onSetFeature?: (featureId: string, value: unknown) => void;
  modeControl: AgentModeControlValue | null;
  disabled: boolean;
}): void {
  const { isActiveComposer } = useComposerKeyboardScope();
  const handlerIdRef = useRef(`model-loadout:${Math.random().toString(36).slice(2)}`);
  const handle = useCallback(
    (action: KeyboardActionDefinition): boolean => {
      const { rows, applySlot, fastFeature, onSetFeature, modeControl } = input;
      switch (action.id) {
        case "message-input.model-slot": {
          const row = rows[action.index - 1];
          if (!row?.applicable) return false;
          applySlot(row);
          return true;
        }
        case "message-input.effort-cycle": {
          const next = resolveNextThinkingOptionId(input.thinkingOptions, input.selectedThinkingId);
          if (!next || !input.onSelectThinkingOption) return false;
          input.onSelectThinkingOption(next);
          return true;
        }
        case "message-input.fast-toggle":
          if (!fastFeature || !onSetFeature) return false;
          onSetFeature(fastFeature.id, !fastFeature.value);
          return true;
        case "message-input.mode-cycle": {
          const next = modeControl?.disabled
            ? null
            : resolveNextAgentModeId({
                modeOptions: modeControl?.modeOptions ?? [],
                selectedMode: modeControl?.selectedModeId,
              });
          if (!next || !modeControl) return false;
          modeControl.onSelectMode(next);
          return true;
        }
        default:
          return false;
      }
    },
    [input],
  );
  useKeyboardActionHandler({
    handlerId: handlerIdRef.current,
    actions: KEYBOARD_ACTIONS,
    enabled: isActiveComposer && !input.disabled,
    priority: 200,
    handle,
  });
}

function useLoadoutPages(input: {
  thinkingOptions: ThinkingOption[];
  selectedThinkingId: string | null;
  onSelectThinkingOption?: (thinkingOptionId: string) => void;
  modeControl: AgentModeControlValue | null;
  selectFeatures: AgentFeature[];
  onSetFeature?: (featureId: string, value: unknown) => void;
}): MenuPageDefinition[] {
  const { t } = useTranslation();
  const {
    thinkingOptions,
    selectedThinkingId,
    onSelectThinkingOption,
    modeControl,
    selectFeatures,
    onSetFeature,
  } = input;
  return useMemo(() => {
    const result: MenuPageDefinition[] = [];
    if (thinkingOptions.length > 0 && onSelectThinkingOption) {
      result.push({
        id: "effort",
        title: t("composer.loadout.effort"),
        content: thinkingOptions.map((option) => (
          <ChoiceItem
            key={option.id}
            id={option.id}
            label={option.label}
            selected={option.id === selectedThinkingId}
            onChoose={onSelectThinkingOption}
            testID={`model-loadout-effort-${option.id}`}
          />
        )),
      });
    }
    if (modeControl) {
      result.push({
        id: "mode",
        title: t("composer.loadout.mode"),
        content: modeControl.modeOptions.map((mode) => (
          <ModeOptionItem
            key={mode.id}
            modeControl={modeControl}
            modeId={mode.id}
            label={formatAgentModeLabel(mode)}
          />
        )),
      });
    }
    for (const feature of selectFeatures) {
      if (feature.type !== "select" || !onSetFeature) continue;
      result.push({
        id: `feature-${feature.id}`,
        title: feature.label,
        content: feature.options.map((option) => (
          <FeatureChoiceItem
            key={option.id}
            featureId={feature.id}
            optionId={option.id}
            label={option.label}
            selected={option.id === feature.value}
            onSetFeature={onSetFeature}
          />
        )),
      });
    }
    return result;
  }, [
    modeControl,
    onSelectThinkingOption,
    onSetFeature,
    selectFeatures,
    selectedThinkingId,
    t,
    thinkingOptions,
  ]);
}

function ChoiceItem({
  id,
  label,
  selected,
  onChoose,
  testID,
}: {
  id: string;
  label: string;
  selected: boolean;
  onChoose: (id: string) => void;
  testID?: string;
}): ReactElement {
  const handleSelect = useCallback(() => onChoose(id), [id, onChoose]);
  return (
    <MenuItem selected={selected} onSelect={handleSelect} testID={testID}>
      {label}
    </MenuItem>
  );
}

function FeatureChoiceItem({
  featureId,
  optionId,
  label,
  selected,
  onSetFeature,
}: {
  featureId: string;
  optionId: string;
  label: string;
  selected: boolean;
  onSetFeature: (featureId: string, value: unknown) => void;
}): ReactElement {
  const handleSelect = useCallback(
    () => onSetFeature(featureId, optionId),
    [featureId, onSetFeature, optionId],
  );
  return (
    <MenuItem selected={selected} onSelect={handleSelect}>
      {label}
    </MenuItem>
  );
}

/** Effort, mode and the provider's features: the current model's settings, one row each. */
function LoadoutSettingRows({
  hasEffort,
  effortLabel,
  modeControl,
  fastFeature,
  otherFeatures,
  onSetFeature,
}: {
  hasEffort: boolean;
  effortLabel?: string;
  modeControl: AgentModeControlValue | null;
  fastFeature: AgentFeatureToggle | null;
  otherFeatures: AgentFeature[];
  onSetFeature?: (featureId: string, value: unknown) => void;
}): ReactElement | null {
  const { t } = useTranslation();
  if (!hasEffort && !modeControl && !fastFeature && otherFeatures.length === 0) return null;
  const selectedMode = modeControl?.modeOptions.find(
    (mode) => mode.id === modeControl.selectedModeId,
  );
  return (
    <>
      <MenuSeparator />
      {hasEffort ? (
        <MenuSubTrigger id="effort" value={effortLabel} testID="agent-thinking-selector">
          {t("composer.loadout.effort")}
        </MenuSubTrigger>
      ) : null}
      {modeControl ? (
        <MenuSubTrigger
          id="mode"
          value={selectedMode ? formatAgentModeLabel(selectedMode) : undefined}
          disabled={modeControl.disabled}
          testID="mode-control"
        >
          {t("composer.loadout.mode")}
        </MenuSubTrigger>
      ) : null}
      {fastFeature ? (
        <FeatureToggleItem
          feature={fastFeature}
          label={t("composer.loadout.fast")}
          onSetFeature={onSetFeature}
        />
      ) : null}
      {otherFeatures.map((feature) =>
        feature.type === "toggle" ? (
          <FeatureToggleItem
            key={feature.id}
            feature={feature}
            label={feature.label}
            onSetFeature={onSetFeature}
          />
        ) : (
          <MenuSubTrigger
            key={feature.id}
            id={`feature-${feature.id}`}
            value={feature.options.find((option) => option.id === feature.value)?.label}
            disabled={!onSetFeature}
            testID={`agent-feature-${feature.id}`}
          >
            {feature.label}
          </MenuSubTrigger>
        ),
      )}
    </>
  );
}

function loadoutRowKey(row: LoadoutRow): string {
  return row.id;
}

/**
 * A loadout slot. Hover lives on a plain `View` per docs/hover.md; the drag handle sits beside
 * the press target rather than inside it, so a drag never lands as a press. The press still goes
 * through the menu engine, which closes the surface first.
 */
function LoadoutRowItem({
  row,
  serverId,
  dragHandle,
  onApply,
  unavailableLabel,
  reorderLabel,
}: {
  row: LoadoutRow;
  serverId: string | null;
  dragHandle: DraggableListDragHandleProps | null;
  onApply: (row: LoadoutRow) => void;
  unavailableLabel: string;
  reorderLabel: string;
}): ReactElement {
  const { selectItem } = useMenuContext("LoadoutRowItem");
  const [isHovered, setIsHovered] = useState(false);
  const [isPressed, setIsPressed] = useState(false);
  const handlePointerEnter = useCallback(() => setIsHovered(true), []);
  const handlePointerLeave = useCallback(() => setIsHovered(false), []);
  const handlePressIn = useCallback(() => setIsPressed(true), []);
  const handlePressOut = useCallback(() => setIsPressed(false), []);
  const handlePress = useCallback(() => {
    selectItem(() => onApply(row), true);
  }, [onApply, row, selectItem]);

  return (
    <View
      style={styles.rowHoverTarget}
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
    >
      <View
        style={[
          styles.row,
          (isHovered || isPressed) && row.applicable && styles.rowFilled,
          !row.applicable && styles.disabled,
        ]}
      >
        {dragHandle ? (
          <View
            ref={dragHandle.setActivatorNodeRef as never}
            {...(dragHandle.attributes as object | undefined)}
            {...(dragHandle.listeners as object | undefined)}
            accessibilityLabel={reorderLabel}
            style={styles.handle}
            testID={`model-loadout-handle-${row.id}`}
          >
            <ThemedGrip size={14} uniProps={extraMutedMapping} />
          </View>
        ) : null}
        <Pressable
          disabled={!row.applicable}
          onPress={handlePress}
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
          style={styles.rowPress}
          accessibilityRole="menuitem"
          accessibilityLabel={row.applicable ? undefined : unavailableLabel}
          aria-checked={row.active}
          testID={`model-loadout-row-${row.id}`}
        >
          <View style={styles.glyph}>
            <ModelProviderGlyph provider={row.provider} serverId={serverId} size={16} />
          </View>
          <Text style={styles.rowLabel} numberOfLines={1}>
            {row.label}
          </Text>
          {row.effortLabel ? (
            <Text style={styles.rowEffort} numberOfLines={1}>
              {row.effortLabel}
            </Text>
          ) : null}
          <View style={styles.rowTrailing}>
            {row.active ? <ThemedCheck size={16} uniProps={foregroundMapping} /> : null}
          </View>
        </Pressable>
      </View>
    </View>
  );
}

function ModeOptionItem({
  modeControl,
  modeId,
  label,
}: {
  modeControl: AgentModeControlValue;
  modeId: string;
  label: string;
}): ReactElement {
  const Icon = getAgentModeOptionIcon(
    modeControl.provider,
    modeId,
    modeControl.providerDefinitions,
  );
  const { onSelectMode } = modeControl;
  const handleSelect = useCallback(() => onSelectMode(modeId), [modeId, onSelectMode]);
  const leading = useMemo(
    () => (Icon ? <Icon size={16} color={styles.iconMuted.color} /> : null),
    [Icon],
  );
  return (
    <MenuItem
      selected={modeId === modeControl.selectedModeId}
      leading={leading}
      onSelect={handleSelect}
      testID={`model-loadout-mode-${modeId}`}
    >
      {label}
    </MenuItem>
  );
}

/** A toggle row: the row is the press target and the switch only reflects it. */
function FeatureToggleItem({
  feature,
  label,
  onSetFeature,
}: {
  feature: AgentFeatureToggle;
  label: string;
  onSetFeature?: (featureId: string, value: unknown) => void;
}): ReactElement {
  const handleSelect = useCallback(
    () => onSetFeature?.(feature.id, !feature.value),
    [feature.id, feature.value, onSetFeature],
  );
  const trailing = useMemo(
    () => (
      <View pointerEvents="none">
        <Switch value={feature.value} accessibilityLabel={label} />
      </View>
    ),
    [feature.value, label],
  );
  return (
    <MenuItem
      selected={feature.value}
      closeOnSelect={false}
      onSelect={handleSelect}
      disabled={!onSetFeature}
      trailing={trailing}
      testID={`agent-feature-${feature.id}`}
    >
      {label}
    </MenuItem>
  );
}

function LoadoutFooter({
  onEdit,
  showCycleHint,
  editLabel,
  editAccessibilityLabel,
  cycleLabel,
}: {
  onEdit?: () => void;
  showCycleHint: boolean;
  editLabel: string;
  editAccessibilityLabel: string;
  cycleLabel: string;
}): ReactElement | null {
  const { selectItem } = useMenuContext("LoadoutFooter");
  const cycleKeys = useShortcutKeys("cycle-effort");
  const handleEdit = useCallback(() => selectItem(onEdit, true), [onEdit, selectItem]);
  const editStyle = useCallback(
    ({ hovered, pressed }: PressableStateCallbackType & { hovered?: boolean }) => [
      styles.footerEdit,
      (hovered || pressed) && styles.footerEditActive,
    ],
    [],
  );
  const showHint = showCycleHint && cycleKeys !== null;
  if (!onEdit && !showHint) return null;
  return (
    <View style={styles.footer}>
      {onEdit ? (
        <Pressable
          onPress={handleEdit}
          style={editStyle}
          accessibilityRole="button"
          accessibilityLabel={editAccessibilityLabel}
          testID="model-loadout-edit"
        >
          <ThemedSettings size={12} uniProps={mutedMapping} />
          <Text style={styles.footerText}>{editLabel}</Text>
        </Pressable>
      ) : (
        <View />
      )}
      {showHint ? (
        <View style={styles.footerHint}>
          <Shortcut chord={cycleKeys} />
          <Text style={styles.footerText}>{cycleLabel}</Text>
        </View>
      ) : null}
    </View>
  );
}

// Row numbers mirror `MenuItem` so slots and the rows below them share one height and one inset.
const styles = StyleSheet.create((theme) => ({
  triggerHost: {
    minWidth: 0,
    flexShrink: 1,
  },
  trigger: {
    height: 28,
    minWidth: 0,
    flexShrink: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
    paddingHorizontal: theme.spacing[2],
    borderRadius: theme.borderRadius["2xl"],
    backgroundColor: "transparent",
  },
  triggerActive: {
    backgroundColor: theme.colors.interactionHighlight,
  },
  triggerModel: {
    minWidth: 0,
    flexShrink: 1,
    color: theme.colors.foreground,
    fontSize: theme.fontSize.base,
    fontWeight: theme.fontWeight.normal,
  },
  triggerEffort: {
    flexShrink: 0,
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.base,
    fontWeight: theme.fontWeight.normal,
  },
  disabled: {
    opacity: theme.opacity[50],
  },
  rowHoverTarget: {
    position: "relative",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: MENU_ITEM_HEIGHT,
    gap: theme.spacing[2],
    marginHorizontal: theme.spacing[1],
    paddingHorizontal: theme.spacing[2],
    borderWidth: theme.borderWidth[1],
    borderColor: "transparent",
    borderRadius: theme.borderRadius.md,
  },
  rowFilled: {
    backgroundColor: theme.colors.surface2,
  },
  handle: {
    width: 14,
    alignSelf: "stretch",
    alignItems: "center",
    justifyContent: "center",
  },
  rowPress: {
    flex: 1,
    minWidth: 0,
    alignSelf: "stretch",
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    paddingVertical: theme.spacing[1],
  },
  glyph: {
    width: 16,
    height: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  rowLabel: {
    minWidth: 0,
    flexShrink: 1,
    fontSize: theme.fontSize.base,
    lineHeight: 18,
    color: theme.colors.foreground,
    fontWeight: theme.fontWeight.normal,
  },
  rowEffort: {
    flexShrink: 0,
    fontSize: theme.fontSize.sm,
    color: theme.colors.foregroundMuted,
  },
  rowTrailing: {
    marginLeft: "auto",
    width: 16,
    alignItems: "center",
  },
  iconMuted: {
    color: theme.colors.foregroundMuted,
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing[2],
    // With the Edit button's own padding this lands its glyph on the rows' 13pt rail.
    paddingHorizontal: theme.spacing[2] + theme.borderWidth[1],
    paddingVertical: theme.spacing[1],
  },
  footerEdit: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
    paddingHorizontal: theme.spacing[1],
    paddingVertical: 2,
    borderRadius: theme.borderRadius.sm,
  },
  footerEditActive: {
    backgroundColor: theme.colors.surface2,
  },
  footerHint: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1.5],
  },
  footerText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.foregroundMuted,
  },
}));
