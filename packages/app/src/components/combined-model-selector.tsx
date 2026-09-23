import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import {
  Pressable,
  Text,
  View,
  type PressableStateCallbackType,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { useTranslation } from "react-i18next";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import type { AgentProvider } from "@getpaseo/protocol/agent-types";
import type { AgentProfilePicker, AgentProfileSeed } from "@/agent-profiles";
import { ComboboxTrigger } from "@/components/ui/combobox-trigger";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { Combobox, type ComboboxOption, type ComboboxProps } from "@/components/ui/combobox";
import { ModelBrowser, ModelProviderGlyph, useModelBrowser } from "@/components/model-browser";
import { resolveModelBrowserScrolling } from "@/components/model-browser-view";
import { useIsCompactFormFactor } from "@/constants/layout";
import { isNative, isWeb } from "@/constants/platform";
import type { ProviderSelectorProvider } from "@/provider-selection/provider-selection";
import { ICON_SIZE, type Theme } from "@/styles/theme";

const EMPTY_COMBOBOX_OPTIONS: ComboboxOption[] = [];
const ThemedLoadingSpinner = withUnistyles(LoadingSpinner);

const foregroundMutedMapping = (theme: Theme) => ({
  color: theme.colors.foregroundMuted,
});

function noop() {}

interface CombinedModelSelectorProps {
  providers: ProviderSelectorProvider[];
  selectedProvider: string;
  selectedModel: string;
  onSelect: (provider: AgentProvider, modelId: string) => void;
  isLoading: boolean;
  profiles?: AgentProfilePicker | null;
  onApplyProfile?: (profileId: string) => void;
  onEditProfiles?: () => void;
  onCreateProfile?: (seed: AgentProfileSeed) => void;
  onEditProfile?: (profileId: string) => void;
  renderTrigger?: (input: {
    selectedModelLabel: string;
    onPress: () => void;
    disabled: boolean;
    isOpen: boolean;
    hovered: boolean;
    pressed: boolean;
  }) => React.ReactNode;
  onOpen?: () => void;
  onClose?: () => void;
  onRetryProvider?: (provider: AgentProvider) => void;
  isRetryingProvider?: boolean;
  disabled?: boolean;
  serverId?: string | null;
  desktopPlacement?: ComboboxProps["desktopPlacement"];
  desktopMinWidth?: number;
  /**
   * Render the custom trigger as a full-width form field: the outer Pressable
   * becomes a transparent passthrough that stretches its child edge-to-edge and
   * stops painting its own hover/pressed background and rounded corners. The
   * trigger itself owns the field visuals and reads hovered/pressed to show its
   * active state. Without this the trigger stays a content-width toolbar chip
   * (the composer's layout).
   */
  triggerFill?: boolean;
  /**
   * Render only the browser, opened by the caller and anchored to its trigger. Used by pickers
   * that own their trigger and reach the full model list from a row of their own.
   */
  controlled?: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    anchorRef: RefObject<View | null>;
  };
  toolbar?: {
    glyphSize: number;
    showCaret: boolean;
  };
}

function useSelectorOpenState(controlled: CombinedModelSelectorProps["controlled"]) {
  const ownAnchorRef = useRef<View>(null);
  const [ownIsOpen, setOwnIsOpen] = useState(false);
  return {
    ownAnchorRef,
    anchorRef: controlled?.anchorRef ?? ownAnchorRef,
    isOpen: controlled?.open ?? ownIsOpen,
    setOpen: controlled?.onOpenChange ?? setOwnIsOpen,
  };
}

function SelectorTrigger({
  anchorRef,
  renderTrigger,
  toolbar,
  disabled,
  isOpen,
  onPress,
  style,
  accessibilityLabel,
  triggerLabel,
  selectedProvider,
  serverId,
}: {
  anchorRef: RefObject<View | null>;
  renderTrigger: CombinedModelSelectorProps["renderTrigger"];
  toolbar: CombinedModelSelectorProps["toolbar"];
  disabled: boolean;
  isOpen: boolean;
  onPress: () => void;
  style: (state: PressableStateCallbackType & { hovered?: boolean }) => StyleProp<ViewStyle>;
  accessibilityLabel: string;
  triggerLabel: string;
  selectedProvider: string;
  serverId: string | null;
}) {
  if (renderTrigger) {
    return (
      <Pressable
        ref={anchorRef}
        collapsable={false}
        disabled={disabled}
        onPress={onPress}
        style={style}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        testID="combined-model-selector"
      >
        {({ pressed, hovered }: PressableStateCallbackType & { hovered?: boolean }) =>
          renderTrigger({
            selectedModelLabel: triggerLabel,
            onPress,
            disabled,
            isOpen,
            hovered: Boolean(hovered),
            pressed,
          })
        }
      </Pressable>
    );
  }
  return (
    <ComboboxTrigger
      ref={anchorRef}
      collapsable={false}
      disabled={disabled}
      onPress={onPress}
      style={style}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      testID="combined-model-selector"
      chevron={toolbar?.showCaret === false ? null : undefined}
    >
      {selectedProvider.trim().length > 0 ? (
        <View style={toolbar?.glyphSize === 20 ? styles.toolbarGlyph20 : styles.toolbarGlyph16}>
          <ModelProviderGlyph
            provider={selectedProvider}
            serverId={serverId}
            size={toolbar?.glyphSize ?? ICON_SIZE.md}
          />
        </View>
      ) : null}
      <Text style={styles.triggerText} numberOfLines={1} ellipsizeMode="tail">
        {triggerLabel}
      </Text>
    </ComboboxTrigger>
  );
}

export function CombinedModelSelector({
  providers,
  selectedProvider,
  selectedModel,
  onSelect,
  isLoading,
  profiles = null,
  onApplyProfile,
  onEditProfiles,
  onCreateProfile,
  onEditProfile,
  renderTrigger,
  onOpen,
  onClose,
  onRetryProvider,
  isRetryingProvider = false,
  disabled = false,
  serverId = null,
  desktopPlacement,
  desktopMinWidth,
  triggerFill = false,
  toolbar,
  controlled,
}: CombinedModelSelectorProps) {
  const { t } = useTranslation();
  const isCompact = useIsCompactFormFactor();
  const modelBrowserScrolling = resolveModelBrowserScrolling({ isNative, isCompact });
  const { ownAnchorRef, anchorRef, isOpen, setOpen } = useSelectorOpenState(controlled);
  const [isContentReady, setIsContentReady] = useState(isWeb);
  const browser = useModelBrowser({
    providers,
    selectedProvider,
    selectedModel,
    isLoading,
    profiles,
    serverId,
  });
  const { prepareToOpen, reset, showAll } = browser;

  const handleOpenChange = useCallback(
    (open: boolean) => {
      setOpen(open);
      if (open) {
        prepareToOpen();
        onOpen?.();
        return;
      }
      reset();
      onClose?.();
    },
    [onClose, onOpen, prepareToOpen, reset, setOpen],
  );

  // A controlled browser is opened by its owner, so it starts on the full list here.
  const controlledOpen = Boolean(controlled?.open);
  useEffect(() => {
    if (controlledOpen) showAll();
  }, [controlledOpen, showAll]);

  const handleSelect = useCallback(
    (provider: string, modelId: string) => {
      onSelect(provider, modelId);
      handleOpenChange(false);
    },
    [handleOpenChange, onSelect],
  );

  useEffect(() => {
    if (isWeb) return () => {};
    if (!isOpen) {
      setIsContentReady(false);
      return () => {};
    }
    const frame = requestAnimationFrame(() => {
      setIsContentReady(true);
    });
    return () => cancelAnimationFrame(frame);
  }, [isOpen]);

  const handleTriggerPress = useCallback(() => {
    handleOpenChange(!isOpen);
  }, [handleOpenChange, isOpen]);

  const triggerStyle = useCallback(
    ({ pressed, hovered }: PressableStateCallbackType & { hovered?: boolean }) => {
      if (triggerFill) {
        return [
          styles.trigger,
          styles.customTriggerWrapper,
          styles.triggerFill,
          disabled && styles.triggerDisabled,
        ];
      }
      return [
        styles.trigger,
        Boolean(hovered) && styles.triggerHovered,
        (pressed || isOpen) && styles.triggerPressed,
        disabled && styles.triggerDisabled,
        renderTrigger ? styles.customTriggerWrapper : null,
      ];
    },
    [disabled, isOpen, renderTrigger, triggerFill],
  );

  const handleApplyProfile = useCallback(
    (profileId: string) => {
      onApplyProfile?.(profileId);
      handleOpenChange(false);
    },
    [handleOpenChange, onApplyProfile],
  );

  const handleEditProfiles = useCallback(() => {
    handleOpenChange(false);
    onEditProfiles?.();
  }, [handleOpenChange, onEditProfiles]);

  const handleCreateProfile = useCallback(
    (seed: AgentProfileSeed) => {
      handleOpenChange(false);
      onCreateProfile?.(seed);
    },
    [handleOpenChange, onCreateProfile],
  );

  const handleEditProfile = useCallback(
    (profileId: string) => {
      handleOpenChange(false);
      onEditProfile?.(profileId);
    },
    [handleOpenChange, onEditProfile],
  );

  const selectorBody = isContentReady ? (
    <ModelBrowser
      state={browser}
      onSelect={handleSelect}
      onApplyProfile={handleApplyProfile}
      onEditProfiles={onEditProfiles ? handleEditProfiles : undefined}
      onCreateProfile={onCreateProfile ? handleCreateProfile : undefined}
      onEditProfile={onEditProfile ? handleEditProfile : undefined}
      onRetryProvider={onRetryProvider}
      isRetryingProvider={isRetryingProvider}
      scrolling={modelBrowserScrolling}
      flatModels={Boolean(controlled)}
      showProfilesSection={!controlled}
    />
  ) : (
    <View style={styles.sheetLoadingState}>
      <ThemedLoadingSpinner size={ICON_SIZE.sm} uniProps={foregroundMutedMapping} />
      <Text style={styles.sheetLoadingText}>{t("modelSelector.loadingSelector")}</Text>
    </View>
  );

  return (
    <>
      {controlled ? null : (
        <SelectorTrigger
          anchorRef={ownAnchorRef}
          renderTrigger={renderTrigger}
          toolbar={toolbar}
          disabled={disabled}
          isOpen={isOpen}
          onPress={handleTriggerPress}
          style={triggerStyle}
          accessibilityLabel={t("modelSelector.selectedModel", {
            model: browser.selectedModelLabel,
          })}
          triggerLabel={browser.triggerLabel}
          selectedProvider={selectedProvider}
          serverId={serverId}
        />
      )}
      <Combobox
        options={EMPTY_COMBOBOX_OPTIONS}
        value=""
        onSelect={noop}
        open={isOpen}
        onOpenChange={handleOpenChange}
        anchorRef={anchorRef}
        desktopPlacement={desktopPlacement}
        desktopMinWidth={desktopMinWidth}
        desktopLockWidth
        desktopFixedHeight={browser.desktopFixedHeight}
        desktopChildrenScrollEnabled={false}
        header={browser.header}
        mobileChildrenScrollEnabled={!browser.isProviderView || !isNative}
        mobileChildrenContentContainerStyle={styles.mobileBrowserContent}
      >
        {selectorBody}
      </Combobox>
    </>
  );
}

const styles = StyleSheet.create((theme) => ({
  mobileBrowserContent: {
    paddingHorizontal: 0,
  },
  trigger: {
    height: 28,
    minWidth: 0,
    flexShrink: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "transparent",
    gap: theme.spacing[1],
    paddingHorizontal: theme.spacing[2],
    borderRadius: theme.borderRadius["2xl"],
  },
  triggerHovered: {
    backgroundColor: theme.colors.surface2,
  },
  toolbarGlyph16: {
    width: 16,
    height: 16,
    flexShrink: 0,
  },
  toolbarGlyph20: {
    width: 20,
    height: 20,
    flexShrink: 0,
  },
  triggerPressed: {
    backgroundColor: theme.colors.surface0,
  },
  triggerDisabled: {
    opacity: 0.5,
  },
  triggerText: {
    minWidth: 0,
    flexShrink: 1,
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.base,
    fontWeight: theme.fontWeight.normal,
  },
  customTriggerWrapper: {
    paddingHorizontal: 0,
    paddingVertical: 0,
    height: "auto",
  },
  triggerFill: {
    alignSelf: "stretch",
    flexShrink: 0,
    flexDirection: "column",
    alignItems: "stretch",
    backgroundColor: "transparent",
    borderRadius: 0,
  },
  sheetLoadingState: {
    minHeight: 160,
    justifyContent: "center",
    alignItems: "center",
    gap: theme.spacing[2],
  },
  sheetLoadingText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.base,
  },
}));
