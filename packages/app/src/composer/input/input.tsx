import {
  useComposerEditingSession,
  useComposerFullscreen,
  type ComposerEditingSession,
} from "@/composer/editing-session";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import {
  View,
  Text,
  useWindowDimensions,
  NativeSyntheticEvent,
  TextInputKeyPressEventData,
  TextInputSelectionChangeEventData,
  type LayoutChangeEvent,
} from "react-native";
import {
  useState,
  useRef,
  useCallback,
  useEffect,
  useLayoutEffect,
  useImperativeHandle,
  useMemo,
  forwardRef,
} from "react";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { useTranslation } from "react-i18next";
import { ICON_SIZE, type Theme } from "@/styles/theme";
import { ArrowUp, Mic, MicOff, CornerDownLeft, Plus } from "lucide-react-native";
import { useDictation } from "@/hooks/use-dictation";
import { hasFinePointer } from "@/hooks/use-fine-pointer";
import { DictationInlineControls } from "@/components/dictation-controls";
import { RealtimeVoiceOverlay } from "@/components/realtime-voice-overlay";
import type { DaemonClient } from "@getpaseo/client/internal/daemon-client";
import { useSessionStore } from "@/stores/session-store";
import { useVoiceOptional } from "@/contexts/voice-context";
import { useToast } from "@/contexts/toast-context";
import { resolveVoiceUnavailableMessage } from "@/utils/server-info-capabilities";
import {
  collectImageFilesFromClipboardData,
  filesToImageAttachments,
} from "@/utils/image-attachments-from-files";
import type { ComposerAttachment } from "@/attachments/types";
import type { ImageAttachment, MessagePayload, TextReplacement } from "@/composer/types";
import { focusWithRetries } from "@/utils/web-focus";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Shortcut } from "@/components/ui/shortcut";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useShortcutKeys } from "@/hooks/use-shortcut-keys";
import { useIosHardwareKeyboardSubmit } from "@/hooks/use-ios-hardware-keyboard-submit";
import { formatShortcut, type ShortcutKey } from "@/utils/format-shortcut";
import { getShortcutOs } from "@/utils/shortcut-platform";
import type { MessageInputKeyboardActionKind } from "@/keyboard/actions";
import { isImeComposingKeyboardEvent } from "@/utils/keyboard-ime";
import { isWeb } from "@/constants/platform";
import { useIsCompactFormFactor } from "@/constants/layout";
import { useComposerKeyboardScope } from "@/composer/keyboard-scope";
import { RenderProfile } from "@/utils/render-profiler";
import { useComposerHeight } from "./height";
import { ComposerTextOverlay } from "./text-overlay";
import type { InlineChip } from "./text-overlay.types";
import { ComposerInputPresentation } from "./presentation";
import { resolveComposerInputMode, type ComposerInputMode } from "@/composer/input-mode";
import type { NativePastedFile } from "@/composer/native-pasted-image";
import { trimInlineText } from "@/composer/inline-attachments/tokens";
import {
  EditingTextInput,
  type EditingTextInputHandle as ComposerTextInputHandle,
  type EditingTextInputProps,
} from "@/components/ui/text-input";

const ComposerTextInput = withUnistyles(EditingTextInput, (theme) => ({
  placeholderTextColor: theme.colors.foregroundExtraMuted,
}));
import {
  resolveSendTooltipLabel,
  resolveSubmitAccessibilityLabel,
  resolveVoiceAccessibilityLabel,
  resolveVoiceTooltipText,
} from "./labels";
import {
  applyDictationTranscript,
  computeCanStartDictation,
  resolveComposerSurfacePresentation,
  resolveComposerSurfaceText,
  resolveRetainedSelection,
  runAlternateSendAction,
  runDefaultSendAction,
  runMessageInputKeyboardAction,
  stopRealtimeVoice,
} from "./state";
import { resolveListKeyEdit } from "./list-continuation";
import { useLargeTextPaste } from "./large-paste";

const DEFAULT_SEND_KEYS: ShortcutKey[][] = [["Enter"]];
const COMPOSER_INPUT_DATASET = { composerInput: "" } as const;

export interface AttachmentMenuItem {
  id: string;
  label: string;
  onSelect: () => void;
  disabled?: boolean;
  icon?: React.ReactElement | null;
}

export interface ComposerInputSnapshot {
  text: string;
  selection: { start: number; end: number };
}

export interface ComposerKeyModifiers {
  shiftKey: boolean;
  altKey: boolean;
  metaKey: boolean;
  ctrlKey: boolean;
}

export interface ComposerKeyPressEvent {
  key: string;
  modifiers: ComposerKeyModifiers;
  preventDefault: () => void;
  input: ComposerInputSnapshot;
}

export interface MessageInputProps {
  editingSession?: ComposerEditingSession;
  submissionError?: React.ReactNode;
  value: string;
  onChangeText: (text: string) => void;
  onSubmit: (payload: MessagePayload) => void;
  /** When true, the submit button is enabled even without text or images (e.g. external attachment selected). */
  hasExternalContent?: boolean;
  /** When true, the submit button stays visible and can submit even with no content. */
  allowEmptySubmit?: boolean;
  /** Optional accessibility label for the primary submit button. */
  submitButtonAccessibilityLabel?: string;
  /** Optional testID for the primary submit button. */
  submitButtonTestID?: string;
  submitIcon?: "arrow" | "return";
  isSubmitDisabled?: boolean;
  isSubmitLoading?: boolean;
  /** When true, keep the grown input height after submit (text is preserved, not cleared). */
  preserveHeightOnSubmit?: boolean;
  attachments: ComposerAttachment[];
  cwd: string;
  attachmentMenuItems: AttachmentMenuItem[];
  onAttachButtonRef?: (node: View | null) => void;
  onAddImages?: (images: ImageAttachment[]) => void;
  onPasteImages?: (files: readonly NativePastedFile[]) => void;
  /** Receives a web text paste over the large-paste threshold instead of the input. */
  onPasteLargeText?: (text: string) => void;
  client: DaemonClient | null;
  /** Dictation start gate from host runtime (socket connected + directory ready). */
  isReadyForDictation?: boolean;
  placeholder?: string;
  autoFocus?: boolean;
  autoFocusKey?: string;
  disabled?: boolean;
  /** Content to render on the left side of the composer toolbar (e.g., AgentControls) */
  leftContent?: React.ReactNode;
  /** Content to render on the right side before the voice button (e.g., context window meter) */
  beforeVoiceContent?: React.ReactNode;
  /** Auxiliary content to render on the right side after the voice button. */
  rightContent?: React.ReactNode;
  /** Primary action to render when the agent is active and the composer has no sendable content. */
  activeActionContent?: React.ReactNode;
  voiceServerId?: string;
  voiceAgentId?: string;
  /** When true and there's sendable content, calls onQueue instead of onSubmit */
  isAgentRunning?: boolean;
  /** Controls what the default send action (Enter, send button, dictation) does when the agent is
   *  running. "interrupt" and "steer" send immediately, "queue" queues. Required so the default
   *  lives only in DEFAULT_CLIENT_SETTINGS. */
  defaultSendBehavior: "interrupt" | "steer" | "queue";
  /** Callback for queue button when agent is running */
  onQueue?: (payload: MessagePayload) => void;
  /** Optional handler used when submit button is in loading state. */
  onSubmitLoadingPress?: () => void;
  /** Intercept key press events before default handling. Return true to prevent default. */
  onKeyPress?: (event: ComposerKeyPressEvent) => boolean;
  /** Reports cursor selection updates from the underlying input. */
  onSelectionChange?: (selection: { start: number; end: number }) => void;
  onFocusChange?: (focused: boolean) => void;
  onHeightChange?: (height: number) => void;
  /** Extra styles merged onto the input wrapper (e.g. elevated background). */
  inputWrapperStyle?: import("react-native").StyleProp<import("react-native").ViewStyle>;
  /** Content rendered inside the bordered input surface, above the text input (e.g. attachment pills). */
  attachmentSlot?: React.ReactNode;
  /** Attachments painted as chips over their tokens in the text. Web only. */
  inlineChips?: readonly InlineChip[];
  /** Paints the `ultrathink` keyword, for providers that act on it. Web only. */
  highlightUltrathink?: boolean;
  /** What this composer is for. See `@/composer/input-mode` for what each mode implies. */
  inputMode?: ComposerInputMode;
  /** Renders `value` as static text on the same surface, for content there is nothing to type into. */
  readOnly?: boolean;
  /** Command issued when application state must replace native-owned text. */
  textReplacement: TextReplacement;
  /** Replaces the submit icon with this label, still inside the composer's own toolbar row. */
  submitLabel?: string;
}

export interface MessageInputRef {
  focus: () => void;
  blur: () => void;
  getText: () => string;
  getInputSnapshot: () => ComposerInputSnapshot;
  replaceText: (text: string, selection?: { start: number; end: number }) => void;
  /** Replaces the text as one step on the input's native undo history. */
  applyEdit: (edit: ComposerInputSnapshot) => void;
  runKeyboardAction: (action: MessageInputKeyboardActionKind) => boolean;
  /**
   * Web-only: return the underlying DOM element for focus assertions/retries.
   * May return null if not mounted or on native.
   */
  getNativeElement?: () => HTMLElement | null;
}

const MIN_INPUT_HEIGHT_MOBILE = 30;
const MIN_INPUT_HEIGHT_DESKTOP = 46;
const DEFAULT_MAX_INPUT_HEIGHT = 160;
const MAX_INPUT_VIEWPORT_RATIO = 0.5;
const MIN_INPUT_HEIGHT = isWeb ? MIN_INPUT_HEIGHT_DESKTOP : MIN_INPUT_HEIGHT_MOBILE;
type WebTextInputKeyPressEvent = NativeSyntheticEvent<
  TextInputKeyPressEventData & {
    metaKey?: boolean;
    ctrlKey?: boolean;
    shiftKey?: boolean;
    altKey?: boolean;
    // Web-only: present on DOM KeyboardEvent during IME composition (CJK input).
    isComposing?: boolean;
    keyCode?: number;
  }
>;

interface TextAreaHandle {
  value?: string;
  scrollHeight?: number;
  clientHeight?: number;
  offsetHeight?: number;
  scrollTop?: number;
  selectionStart?: number | null;
  selectionEnd?: number | null;
  style?: {
    height?: string;
    overflowY?: string;
  };
}

function AttachButtonIcon({
  hovered,
  onAttachButtonRef,
  buttonIconSize,
}: {
  hovered: boolean;
  onAttachButtonRef: ((node: View | null) => void) | undefined;
  buttonIconSize: number;
}) {
  const colorMapping = hovered ? iconForegroundMapping : iconForegroundMutedMapping;
  return (
    <View ref={onAttachButtonRef} collapsable={false} style={styles.attachButtonAnchor}>
      <ThemedPlus size={buttonIconSize} uniProps={colorMapping} />
    </View>
  );
}

function AttachmentMenuList({ items }: { items: AttachmentMenuItem[] }) {
  return (
    <>
      {items.map((item) => (
        <DropdownMenuItem
          key={item.id}
          testID={`message-input-attachment-menu-item-${item.id}`}
          disabled={item.disabled}
          onSelect={item.onSelect}
          leading={item.icon ?? null}
        >
          {item.label}
        </DropdownMenuItem>
      ))}
    </>
  );
}

function AttachmentDropdown({
  visible,
  isConnected,
  disabled,
  attachButtonStyle,
  renderAttachButtonIcon,
  attachmentMenuItems,
  addAttachmentLabel,
}: {
  visible: boolean;
  isConnected: boolean;
  disabled: boolean;
  attachButtonStyle: React.ComponentProps<typeof DropdownMenuTrigger>["style"];
  renderAttachButtonIcon: (input: { hovered?: boolean }) => React.ReactElement;
  attachmentMenuItems: AttachmentMenuItem[];
  addAttachmentLabel: string;
}) {
  const isButtonDisabled = !isConnected || disabled;
  if (!visible) return null;
  return (
    <DropdownMenu compactMode="sheet">
      <Tooltip delayDuration={0} enabledOnDesktop enabledOnMobile={false}>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger
            disabled={isButtonDisabled}
            accessibilityLabel={addAttachmentLabel}
            accessibilityRole="button"
            testID="message-input-attach-button"
            style={attachButtonStyle}
          >
            {renderAttachButtonIcon}
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent side="top" align="center" offset={8}>
          <Text style={styles.tooltipText}>{addAttachmentLabel}</Text>
        </TooltipContent>
      </Tooltip>
      <DropdownMenuContent
        side="top"
        align="start"
        offset={8}
        minWidth={220}
        testID="message-input-attachment-menu"
        sheetTitle={addAttachmentLabel}
      >
        <AttachmentMenuList items={attachmentMenuItems} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function VoiceButtonIcon({
  hovered,
  isMutedRealtime,
  buttonIconSize,
}: {
  hovered: boolean;
  isMutedRealtime: boolean;
  buttonIconSize: number;
}) {
  const colorMapping = hovered ? iconForegroundMapping : iconForegroundMutedMapping;
  if (isMutedRealtime) {
    return <ThemedMicOff size={buttonIconSize} uniProps={colorMapping} />;
  }
  return <ThemedMic size={buttonIconSize} uniProps={colorMapping} />;
}

type ShortcutChord = NonNullable<React.ComponentProps<typeof Shortcut>["chord"]>;

function VoiceTooltipBody({
  voiceTooltipText,
  shortcut,
}: {
  voiceTooltipText: string;
  shortcut: ShortcutChord | null | undefined;
}) {
  return (
    <View style={styles.tooltipRow}>
      <Text style={styles.tooltipText}>{voiceTooltipText}</Text>
      {shortcut ? <Shortcut chord={shortcut} /> : null}
    </View>
  );
}

function SendTooltipBody({
  label,
  sendKeys,
}: {
  label: string;
  sendKeys: ShortcutChord | null | undefined;
}) {
  return (
    <View style={styles.tooltipRow}>
      <Text style={styles.tooltipText}>{label}</Text>
      {sendKeys ? <Shortcut chord={sendKeys} /> : null}
    </View>
  );
}

function SendButtonContent({
  isSubmitLoading,
  submitIcon,
  submitLabel,
  buttonIconSize,
}: {
  isSubmitLoading: boolean;
  submitIcon: "arrow" | "return";
  submitLabel: string | undefined;
  buttonIconSize: number;
}) {
  if (isSubmitLoading) {
    return <ThemedLoadingSpinner size="small" uniProps={iconAccentForegroundMapping} />;
  }
  if (submitLabel) {
    return <Text style={styles.sendButtonLabel}>{submitLabel}</Text>;
  }
  if (submitIcon === "return") {
    return <ThemedCornerDownLeft size={buttonIconSize} uniProps={iconAccentForegroundMapping} />;
  }
  return <ThemedArrowUp size={buttonIconSize} uniProps={iconAccentForegroundMapping} />;
}

interface DesktopKeyPressContext {
  onKeyPressCallback: ((event: ComposerKeyPressEvent) => boolean) | undefined;
  input: ComposerKeyPressEvent["input"];
  submitOnEnter: boolean;
  isAgentRunning: boolean;
  onQueue: ((payload: MessagePayload) => void) | undefined;
  isSubmitDisabled: boolean;
  isSubmitLoading: boolean;
  disabled: boolean;
  handleAlternateSendAction: () => void;
  handleDefaultSendAction: () => void;
  applyTextEdit: (edit: ComposerInputSnapshot) => void;
}

// Host interception runs first, so an open autocomplete menu keeps Enter and Tab.
function handleEditingKeyPress(
  event: WebTextInputKeyPressEvent,
  ctx: DesktopKeyPressContext,
  modifiers: ComposerKeyModifiers,
): boolean {
  const key = event.nativeEvent.key;
  const handled = ctx.onKeyPressCallback?.({
    key,
    modifiers,
    preventDefault: () => event.preventDefault(),
    input: ctx.input,
  });
  if (handled) return true;
  const listEdit = resolveListKeyEdit({
    key,
    modifiers,
    submitOnEnter: ctx.submitOnEnter,
    input: ctx.input,
  });
  if (!listEdit) return false;
  event.preventDefault();
  ctx.applyTextEdit(listEdit);
  return true;
}

function readKeyModifiers(event: WebTextInputKeyPressEvent["nativeEvent"]): ComposerKeyModifiers {
  return {
    shiftKey: event.shiftKey === true,
    altKey: event.altKey === true,
    metaKey: event.metaKey === true,
    ctrlKey: event.ctrlKey === true,
  };
}

function handleDesktopKeyPressImpl(
  event: WebTextInputKeyPressEvent,
  ctx: DesktopKeyPressContext,
): void {
  if (isImeComposingKeyboardEvent(event.nativeEvent)) return;

  const modifiers = readKeyModifiers(event.nativeEvent);
  const { shiftKey, metaKey, ctrlKey } = modifiers;
  if (handleEditingKeyPress(event, ctx, modifiers)) return;

  if (event.nativeEvent.key !== "Enter") return;
  if (!ctx.submitOnEnter) return;
  if (shiftKey) return;

  if ((metaKey || ctrlKey) && ctx.isAgentRunning && ctx.onQueue) {
    if (ctx.isSubmitDisabled || ctx.isSubmitLoading || ctx.disabled) return;
    event.preventDefault();
    ctx.handleAlternateSendAction();
    return;
  }

  if (ctx.isSubmitDisabled || ctx.isSubmitLoading || ctx.disabled) return;
  event.preventDefault();
  ctx.handleDefaultSendAction();
}

function getTextInputNativeElement(current: ComposerTextInputHandle | null): HTMLElement | null {
  if (!current) return null;
  const native = typeof current.getNativeRef === "function" ? current.getNativeRef() : current;
  return native instanceof HTMLElement ? native : null;
}

interface PasteImagesEffectArgs {
  textarea: HTMLElement | null;
  isConnected: boolean;
  disabled: boolean;
  isDictating: boolean;
  isRealtimeVoiceForCurrentAgent: boolean;
  onAddImages: ((images: ImageAttachment[]) => void) | undefined;
}

function canAcceptPaste(
  args: Pick<
    PasteImagesEffectArgs,
    "isConnected" | "disabled" | "isDictating" | "isRealtimeVoiceForCurrentAgent"
  >,
): boolean {
  return (
    args.isConnected && !args.disabled && !args.isDictating && !args.isRealtimeVoiceForCurrentAgent
  );
}

function usePasteImagesEffect(args: PasteImagesEffectArgs): void {
  const {
    textarea,
    isConnected,
    disabled,
    isDictating,
    isRealtimeVoiceForCurrentAgent,
    onAddImages,
  } = args;

  useEffect(() => {
    if (!isWeb || !onAddImages) return;

    if (!textarea) return;

    let disposed = false;
    const handlePaste = (event: ClipboardEvent) => {
      if (!isConnected || disabled || isDictating || isRealtimeVoiceForCurrentAgent) return;

      const imageFiles = collectImageFilesFromClipboardData(event.clipboardData);
      if (imageFiles.length === 0) return;

      event.preventDefault();

      void filesToImageAttachments(imageFiles)
        .then((pastedAttachments) => {
          if (disposed || pastedAttachments.length === 0) return;
          onAddImages(pastedAttachments);
          return;
        })
        .catch((error) => {
          console.error("[MessageInput] Failed to process pasted images:", error);
        });
    };

    textarea.addEventListener("paste", handlePaste);
    return () => {
      disposed = true;
      textarea.removeEventListener?.("paste", handlePaste);
    };
  }, [disabled, textarea, isConnected, isDictating, isRealtimeVoiceForCurrentAgent, onAddImages]);
}

function useAutoFocusOnWebEffect(
  textInputRef: React.MutableRefObject<ComposerTextInputHandle | null>,
  autoFocus: boolean,
  autoFocusKey: string | undefined,
): void {
  useEffect(() => {
    if (!isWeb || !autoFocus) return;
    return focusWithRetries({
      focus: () => textInputRef.current?.focus(),
      isFocused: () => {
        const element = getTextInputNativeElement(textInputRef.current);
        const active = typeof document !== "undefined" ? document.activeElement : null;
        return Boolean(element) && active === element;
      },
      deferInitialAttempt: true,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoFocus, autoFocusKey]);
}

function MessageInputAutoFocus({
  enabled,
  autoFocusKey,
  textInputRef,
}: {
  enabled: boolean;
  autoFocusKey: string | undefined;
  textInputRef: React.MutableRefObject<ComposerTextInputHandle | null>;
}) {
  const { isPaneFocused } = useComposerKeyboardScope();
  useAutoFocusOnWebEffect(textInputRef, enabled && isPaneFocused, autoFocusKey);
  return null;
}

function MessageInputOverlay({
  showRealtimeOverlay,
  voice,
  onRealtimeVoiceStop,
}: {
  showRealtimeOverlay: boolean;
  voice:
    | {
        isMuted: boolean;
        isVoiceSwitching: boolean;
        toggleMute: () => void;
      }
    | null
    | undefined;
  onRealtimeVoiceStop: () => void;
}) {
  if (!showRealtimeOverlay || !voice) return null;
  return (
    <RealtimeVoiceOverlay
      isMuted={voice.isMuted}
      isSwitching={voice.isVoiceSwitching}
      onToggleMute={voice.toggleMute}
      onStop={onRealtimeVoiceStop}
    />
  );
}

function FocusHint({
  visible,
  focusInputKeys,
  label,
}: {
  visible: boolean;
  focusInputKeys: ShortcutChord | null | undefined;
  label: string;
}) {
  const { isActiveComposer } = useComposerKeyboardScope();
  if (!isActiveComposer || !visible || !focusInputKeys || !label.trim()) return null;
  return (
    <Text style={styles.focusHintText} pointerEvents="none">
      {label}
    </Text>
  );
}

interface ComposerTextSurfaceProps {
  readOnly: boolean;
  value: string;
  textReplacementKey: string;
  textInputRef: React.Ref<ComposerTextInputHandle>;
  getTextArea: () => HTMLTextAreaElement | null;
  inlineChips: readonly InlineChip[] | undefined;
  highlightUltrathink: boolean;
  textInputStyle: EditingTextInputProps["style"];
  readOnlyTextStyle: React.ComponentProps<typeof Text>["style"];
  placeholder: string;
  accessibilityLabel: string;
  onChangeText: (text: string) => void;
  onFocus: () => void;
  onBlur: () => void;
  editable: boolean;
  scrollEnabled: boolean;
  autoFocus: boolean;
  onKeyPress: ((event: WebTextInputKeyPressEvent) => void) | undefined;
  onSelectionChange: (event: NativeSyntheticEvent<TextInputSelectionChangeEventData>) => void;
  onPasteImages: ((files: readonly NativePastedFile[]) => void) | undefined;
  onPasteError: (message: string) => void;
  fullscreen: boolean;
  compact: boolean;
  onRenderedLinesChange: (lines: number) => void;
  focusHintVisible: boolean;
  focusInputKeys: ShortcutChord | null | undefined;
  focusHintLabel: string;
}

/**
 * The composer's content: an editable input, or static text when there is
 * nothing to type. Both sit in the same bordered surface, so read-only is a
 * state of this composer rather than a second one.
 */
function ComposerTextSurface(props: ComposerTextSurfaceProps): React.ReactElement {
  const { onChangeText, onRenderedLinesChange } = props;
  const [measurementText, setMeasurementText] = useState(props.value);
  useEffect(() => {
    if (!isWeb) setMeasurementText(props.value);
  }, [props.value, props.textReplacementKey]);
  const handleTextChange = useCallback(
    (text: string) => {
      if (!isWeb) setMeasurementText(text);
      onChangeText(text);
    },
    [onChangeText, setMeasurementText],
  );
  const measureLines = useCallback(
    (event: import("react-native").TextLayoutEvent) =>
      onRenderedLinesChange(event.nativeEvent.lines.length),
    [onRenderedLinesChange],
  );
  if (props.readOnly) {
    return (
      <View style={styles.textInputScrollWrapper}>
        <Text style={props.readOnlyTextStyle} testID="composer-readonly-content">
          {props.value}
        </Text>
      </View>
    );
  }
  return (
    <View style={[styles.textInputScrollWrapper, props.fullscreen && styles.fullscreenTextSurface]}>
      {!isWeb && props.compact && !props.fullscreen ? (
        <Text
          accessible={false}
          pointerEvents="none"
          style={[props.textInputStyle, styles.lineMeasurement]}
          onTextLayout={measureLines}
        >
          {`${measurementText}\u200b`}
        </Text>
      ) : null}
      <ComposerTextInput
        ref={props.textInputRef}
        dataSet={COMPOSER_INPUT_DATASET}
        initialValue={props.value}
        onChangeText={handleTextChange}
        placeholder={props.placeholder}
        accessibilityLabel={props.accessibilityLabel}
        onFocus={props.onFocus}
        onBlur={props.onBlur}
        style={props.textInputStyle}
        multiline
        scrollEnabled={props.scrollEnabled}
        editable={props.editable}
        onKeyPress={props.onKeyPress}
        onSelectionChange={props.onSelectionChange}
        onPasteImages={props.onPasteImages}
        onPasteError={props.onPasteError}
        autoFocus={props.autoFocus}
      />
      <ComposerTextOverlay
        getTextArea={props.getTextArea}
        value={props.value}
        chips={props.inlineChips}
        highlightUltrathink={props.highlightUltrathink}
      />
      <FocusHint
        visible={props.focusHintVisible}
        focusInputKeys={props.focusInputKeys}
        label={props.focusHintLabel}
      />
    </View>
  );
}

function VoiceButtonTooltip({
  visible,
  onVoicePress,
  isDictationStartEnabled,
  voiceButtonAccessibilityLabel,
  voiceButtonStyle,
  renderVoiceButtonIcon,
  voiceTooltipText,
  isRealtimeVoiceForCurrentAgent,
  voiceMuteToggleKeys,
  dictationToggleKeys,
}: {
  visible: boolean;
  onVoicePress: () => void;
  isDictationStartEnabled: boolean;
  voiceButtonAccessibilityLabel: string;
  voiceButtonStyle: React.ComponentProps<typeof TooltipTrigger>["style"];
  renderVoiceButtonIcon: (input: { hovered?: boolean }) => React.ReactElement;
  voiceTooltipText: string;
  isRealtimeVoiceForCurrentAgent: boolean;
  voiceMuteToggleKeys: ShortcutChord | null | undefined;
  dictationToggleKeys: ShortcutChord | null | undefined;
}) {
  const shortcut = isRealtimeVoiceForCurrentAgent ? voiceMuteToggleKeys : dictationToggleKeys;
  if (!visible) return null;
  return (
    <Tooltip delayDuration={0} enabledOnDesktop enabledOnMobile={false}>
      <TooltipTrigger
        onPress={onVoicePress}
        disabled={!isDictationStartEnabled}
        accessibilityRole="button"
        accessibilityLabel={voiceButtonAccessibilityLabel}
        style={voiceButtonStyle}
      >
        {renderVoiceButtonIcon}
      </TooltipTrigger>
      <TooltipContent side="top" align="center" offset={8}>
        <VoiceTooltipBody voiceTooltipText={voiceTooltipText} shortcut={shortcut} />
      </TooltipContent>
    </Tooltip>
  );
}

function SendButtonTooltip({
  shouldShow,
  canPressLoadingButton,
  onSubmitLoadingPress,
  onDefaultSendAction,
  isSendButtonDisabled,
  submitAccessibilityLabel,
  sendButtonCombinedStyle,
  isSubmitLoading,
  submitIcon,
  submitLabel,
  submitButtonTestID,
  buttonIconSize,
  sendKeys,
  sendTooltipLabel,
}: {
  shouldShow: boolean;
  canPressLoadingButton: boolean;
  onSubmitLoadingPress: (() => void) | undefined;
  onDefaultSendAction: () => void;
  isSendButtonDisabled: boolean;
  submitAccessibilityLabel: string;
  sendButtonCombinedStyle: React.ComponentProps<typeof TooltipTrigger>["style"];
  isSubmitLoading: boolean;
  submitIcon: "arrow" | "return";
  submitLabel: string | undefined;
  submitButtonTestID: string | undefined;
  buttonIconSize: number;
  sendKeys: ShortcutChord | null | undefined;
  sendTooltipLabel: string;
}) {
  if (!shouldShow) return null;
  return (
    <Tooltip delayDuration={0} enabledOnDesktop enabledOnMobile={false}>
      <TooltipTrigger
        onPress={canPressLoadingButton ? onSubmitLoadingPress : onDefaultSendAction}
        disabled={isSendButtonDisabled}
        accessibilityLabel={submitAccessibilityLabel}
        accessibilityRole="button"
        testID={submitButtonTestID}
        style={sendButtonCombinedStyle}
      >
        <SendButtonContent
          isSubmitLoading={isSubmitLoading}
          submitIcon={submitIcon}
          submitLabel={submitLabel}
          buttonIconSize={buttonIconSize}
        />
      </TooltipTrigger>
      <TooltipContent side="top" align="center" offset={8}>
        <SendTooltipBody label={sendTooltipLabel} sendKeys={sendKeys} />
      </TooltipContent>
    </Tooltip>
  );
}

function hasSendableComposerContent(input: {
  hasText: boolean;
  attachments: readonly ComposerAttachment[];
  hasExternalContent: boolean;
}): boolean {
  return input.hasText || input.attachments.length > 0 || input.hasExternalContent;
}

// One slot: the running turn's cancel control while the draft is empty,
// otherwise the send button, disabled on an empty draft instead of hidden.
function PrimaryAction({
  isAgentRunning,
  hasSendableContent,
  activeActionContent,
  ...sendButtonProps
}: {
  isAgentRunning: boolean;
  hasSendableContent: boolean;
  activeActionContent: React.ReactNode;
} & React.ComponentProps<typeof SendButtonTooltip>) {
  if (isAgentRunning && !hasSendableContent && activeActionContent) return activeActionContent;
  return <SendButtonTooltip {...sendButtonProps} />;
}
interface ToggleRealtimeVoiceContext {
  voice:
    | {
        isVoiceSwitching: boolean;
        isVoiceModeForAgent: (serverId: string, agentId: string) => boolean;
        startVoice: (serverId: string, agentId: string) => Promise<unknown>;
      }
    | null
    | undefined;
  voiceServerId: string | undefined;
  voiceAgentId: string | undefined;
  isConnected: boolean;
  disabled: boolean;
  isAgentRunning: boolean;
  handleStopRealtimeVoice: () => Promise<unknown> | void;
  toast: { error: (msg: string) => void };
  interruptBeforeVoiceMessage: string;
  exitFullscreen: () => void;
}

function toggleRealtimeVoiceImpl(ctx: ToggleRealtimeVoiceContext): void {
  if (!ctx.voice || !ctx.voiceServerId || !ctx.voiceAgentId || !ctx.isConnected || ctx.disabled) {
    return;
  }
  if (ctx.voice.isVoiceSwitching) return;
  if (ctx.voice.isVoiceModeForAgent(ctx.voiceServerId, ctx.voiceAgentId)) {
    void ctx.handleStopRealtimeVoice();
    return;
  }
  if (ctx.isAgentRunning) {
    ctx.toast.error(ctx.interruptBeforeVoiceMessage);
    return;
  }
  ctx.exitFullscreen();
  void ctx.voice.startVoice(ctx.voiceServerId, ctx.voiceAgentId).catch((error) => {
    console.error("[MessageInput] Failed to start realtime voice", error);
    const message = extractErrorMessage(error);
    if (message && message.trim().length > 0) {
      ctx.toast.error(message);
    }
  });
}

interface StartDictationContext {
  dictationUnavailableMessage: string | null | undefined;
  canStartDictation: () => boolean;
  toast: { error: (msg: string) => void };
  startDictation: () => Promise<void>;
  exitFullscreen: () => void;
}

async function startDictationIfAvailableImpl(ctx: StartDictationContext): Promise<void> {
  if (ctx.dictationUnavailableMessage) {
    ctx.toast.error(ctx.dictationUnavailableMessage);
    return;
  }
  if (!ctx.canStartDictation()) {
    return;
  }
  ctx.exitFullscreen();
  await ctx.startDictation();
}

interface VoicePressContext {
  isRealtimeVoiceForCurrentAgent: boolean;
  voice: { toggleMute: () => void } | null | undefined;
  isDictating: boolean;
  cancelDictation: () => Promise<void> | void;
  startDictationIfAvailable: () => Promise<void>;
}

async function handleVoicePressImpl(ctx: VoicePressContext): Promise<void> {
  if (ctx.isRealtimeVoiceForCurrentAgent && ctx.voice) {
    ctx.voice.toggleMute();
    return;
  }
  if (ctx.isDictating) {
    await ctx.cancelDictation();
    return;
  }
  await ctx.startDictationIfAvailable();
}

interface SendMessageContext {
  value: string;
  attachments: ComposerAttachment[];
  hasExternalContent: boolean;
  allowEmptySubmit: boolean;
  cwd: string;
  isAgentRunning: boolean;
  onSubmit: (payload: MessagePayload) => void;
  onMinimizeHeight: () => void;
  preserveHeightOnSubmit: boolean;
  exitFullscreen: () => void;
}

function sendMessageImpl(ctx: SendMessageContext): void {
  const trimmed = trimInlineText(ctx.value);
  if (
    !trimmed &&
    ctx.attachments.length === 0 &&
    !ctx.hasExternalContent &&
    !ctx.allowEmptySubmit
  ) {
    return;
  }
  ctx.exitFullscreen();
  ctx.onSubmit({
    text: trimmed,
    attachments: ctx.attachments,
    cwd: ctx.cwd,
    forceSend: ctx.isAgentRunning || undefined,
  });
  // When the host preserves and locks the composer (e.g. new-workspace creation),
  // the text stays put — collapsing the height would clip it. Keep it grown.
  if (!ctx.preserveHeightOnSubmit) {
    ctx.onMinimizeHeight();
  }
}

interface QueueMessageContext {
  value: string;
  attachments: ComposerAttachment[];
  cwd: string;
  onQueue: ((payload: MessagePayload) => void) | undefined;
  replaceText: (text: string) => void;
  onMinimizeHeight: () => void;
  exitFullscreen: () => void;
}

function queueMessageImpl(ctx: QueueMessageContext): void {
  if (!ctx.onQueue) return;
  const trimmed = trimInlineText(ctx.value);
  if (!trimmed && ctx.attachments.length === 0) return;
  ctx.exitFullscreen();
  ctx.onQueue({ text: trimmed, attachments: ctx.attachments, cwd: ctx.cwd });
  ctx.replaceText("");
  ctx.onMinimizeHeight();
}

function computeIsRealtimeVoiceForAgent(
  voice: { isVoiceModeForAgent: (serverId: string, agentId: string) => boolean } | null | undefined,
  voiceServerId: string | undefined,
  voiceAgentId: string | undefined,
): boolean {
  if (!voice || !voiceServerId || !voiceAgentId) return false;
  return voice.isVoiceModeForAgent(voiceServerId, voiceAgentId);
}

function computeShouldShowDictationControls(
  isDictating: boolean,
  isDictationProcessing: boolean,
  dictationStatus: string,
): boolean {
  return isDictating || isDictationProcessing || dictationStatus === "failed";
}

function computeIsDictationStartEnabled(
  isReadyForDictation: boolean | undefined,
  isConnected: boolean,
  disabled: boolean,
): boolean {
  return (isReadyForDictation ?? isConnected) && !disabled;
}

function resolveMaxInputHeight(windowHeight: number, compact: boolean): number {
  if (compact) return DEFAULT_MAX_INPUT_HEIGHT;
  if (!Number.isFinite(windowHeight) || windowHeight <= 0) return DEFAULT_MAX_INPUT_HEIGHT;
  return Math.max(DEFAULT_MAX_INPUT_HEIGHT, Math.floor(windowHeight * MAX_INPUT_VIEWPORT_RATIO));
}

function isTextAreaLike(v: unknown): v is TextAreaHandle {
  return typeof v === "object" && v !== null && "scrollHeight" in v;
}

function getWebTextAreaImpl(current: ComposerTextInputHandle | null): TextAreaHandle | null {
  if (!current) return null;
  const candidate = current as { getNativeRef?: () => unknown };
  if (typeof candidate.getNativeRef === "function") {
    const native = candidate.getNativeRef();
    if (isTextAreaLike(native)) return native;
  }
  if (isTextAreaLike(current)) return current;
  return null;
}

function getComposerInputSnapshot(
  current: ComposerTextInputHandle | null,
  fallbackText: string,
  fallbackSelection: ComposerInputSnapshot["selection"],
): ComposerInputSnapshot {
  const textArea = getWebTextAreaImpl(current);
  const text = textArea?.value ?? current?.getText() ?? fallbackText;
  const start = textArea?.selectionStart ?? fallbackSelection.start;
  const end = textArea?.selectionEnd ?? fallbackSelection.end;
  return { text, selection: { start, end } };
}

interface SendButtonStateInput {
  disabled: boolean;
  isSubmitDisabled: boolean;
  hasSendableContent: boolean;
  allowEmptySubmit: boolean;
  isSubmitLoading: boolean;
  onSubmitLoadingPress: (() => void) | undefined;
  defaultSendBehavior: "interrupt" | "steer" | "queue";
  isAgentRunning: boolean;
}

interface SendButtonStateOutput {
  canPressLoadingButton: boolean;
  isSendButtonDisabled: boolean;
  defaultActionQueues: boolean;
}

function computeSendButtonState(input: SendButtonStateInput): SendButtonStateOutput {
  const isEmpty = !input.hasSendableContent && !input.allowEmptySubmit;
  const canPressLoadingButton =
    input.isSubmitLoading && typeof input.onSubmitLoadingPress === "function";
  const isSendButtonDisabled =
    input.disabled ||
    (!canPressLoadingButton && (input.isSubmitDisabled || isEmpty || input.isSubmitLoading));
  const defaultActionQueues = input.defaultSendBehavior === "queue" && input.isAgentRunning;
  return { canPressLoadingButton, isSendButtonDisabled, defaultActionQueues };
}

interface ResolvedMessageInputProps {
  value: string;
  onChangeText: (text: string) => void;
  onSubmit: (payload: MessagePayload) => void;
  hasExternalContent: boolean;
  allowEmptySubmit: boolean;
  submitButtonAccessibilityLabel: string | undefined;
  submitButtonTestID: string | undefined;
  submitIcon: "arrow" | "return";
  isSubmitDisabled: boolean;
  isSubmitLoading: boolean;
  preserveHeightOnSubmit: boolean;
  attachments: ComposerAttachment[];
  cwd: string;
  attachmentMenuItems: AttachmentMenuItem[];
  onAttachButtonRef: ((node: View | null) => void) | undefined;
  onAddImages: ((images: ImageAttachment[]) => void) | undefined;
  onPasteImages: ((files: readonly NativePastedFile[]) => void) | undefined;
  onPasteLargeText: ((text: string) => void) | undefined;
  client: DaemonClient | null;
  isReadyForDictation: boolean | undefined;
  placeholder: string | undefined;
  autoFocus: boolean;
  autoFocusKey: string | undefined;
  disabled: boolean;
  leftContent: React.ReactNode;
  beforeVoiceContent: React.ReactNode;
  rightContent: React.ReactNode;
  activeActionContent: React.ReactNode;
  voiceServerId: string | undefined;
  voiceAgentId: string | undefined;
  isAgentRunning: boolean;
  defaultSendBehavior: "interrupt" | "steer" | "queue";
  onQueue: ((payload: MessagePayload) => void) | undefined;
  onSubmitLoadingPress: (() => void) | undefined;
  onKeyPressCallback: ((event: ComposerKeyPressEvent) => boolean) | undefined;
  onSelectionChangeCallback: ((selection: { start: number; end: number }) => void) | undefined;
  onFocusChange: ((focused: boolean) => void) | undefined;
  onHeightChange: ((height: number) => void) | undefined;
  inputWrapperStyle: import("react-native").StyleProp<import("react-native").ViewStyle>;
  attachmentSlot: React.ReactNode;
  inlineChips: readonly InlineChip[] | undefined;
  highlightUltrathink: boolean;
  inputMode: ComposerInputMode;
  readOnly: boolean;
  textReplacement: TextReplacement;
  submitLabel: string | undefined;
}

function resolveMessageInputProps(props: MessageInputProps): ResolvedMessageInputProps {
  return {
    value: props.value,
    onChangeText: props.onChangeText,
    onSubmit: props.onSubmit,
    hasExternalContent: props.hasExternalContent ?? false,
    allowEmptySubmit: props.allowEmptySubmit ?? false,
    submitButtonAccessibilityLabel: props.submitButtonAccessibilityLabel,
    submitButtonTestID: props.submitButtonTestID,
    submitIcon: props.submitIcon ?? "arrow",
    isSubmitDisabled: props.isSubmitDisabled ?? false,
    isSubmitLoading: props.isSubmitLoading ?? false,
    preserveHeightOnSubmit: props.preserveHeightOnSubmit ?? false,
    attachments: props.attachments,
    cwd: props.cwd,
    attachmentMenuItems: props.attachmentMenuItems,
    onAttachButtonRef: props.onAttachButtonRef,
    onAddImages: props.onAddImages,
    onPasteImages: props.onPasteImages,
    onPasteLargeText: props.onPasteLargeText,
    client: props.client,
    isReadyForDictation: props.isReadyForDictation,
    placeholder: props.placeholder,
    autoFocus: props.autoFocus ?? false,
    autoFocusKey: props.autoFocusKey,
    disabled: props.disabled ?? false,
    leftContent: props.leftContent,
    beforeVoiceContent: props.beforeVoiceContent,
    rightContent: props.rightContent,
    activeActionContent: props.activeActionContent,
    voiceServerId: props.voiceServerId,
    voiceAgentId: props.voiceAgentId,
    isAgentRunning: props.isAgentRunning ?? false,
    defaultSendBehavior: props.defaultSendBehavior,
    onQueue: props.onQueue,
    onSubmitLoadingPress: props.onSubmitLoadingPress,
    onKeyPressCallback: props.onKeyPress,
    onSelectionChangeCallback: props.onSelectionChange,
    onFocusChange: props.onFocusChange,
    onHeightChange: props.onHeightChange,
    inputWrapperStyle: props.inputWrapperStyle,
    attachmentSlot: props.attachmentSlot,
    inlineChips: props.inlineChips,
    highlightUltrathink: props.highlightUltrathink ?? false,
    inputMode: props.inputMode ?? "chat",
    readOnly: props.readOnly ?? false,
    textReplacement: props.textReplacement,
    submitLabel: props.submitLabel,
  };
}

function extractErrorMessage(error: unknown): string | null {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return null;
}

function resolvePresentationSendDisabled(input: {
  fullscreen: boolean;
  disabled: boolean;
  hasText: boolean;
  attachments: ComposerAttachment[];
  hasExternalContent: boolean;
  allowEmpty: boolean;
}): boolean {
  return (
    input.disabled || (input.fullscreen && !input.allowEmpty && !hasSendableComposerContent(input))
  );
}

function shouldShowFullscreenControl(
  compact: boolean,
  readOnly: boolean,
  overlayVisible: boolean,
  renderedLines: number,
) {
  return compact && !readOnly && !overlayVisible && renderedLines > 2;
}

export const MessageInput = forwardRef<MessageInputRef, MessageInputProps>(
  function MessageInput(props, ref) {
    const {
      value,
      onChangeText,
      onSubmit,
      hasExternalContent,
      allowEmptySubmit,
      submitButtonAccessibilityLabel,
      submitButtonTestID,
      submitIcon,
      isSubmitDisabled,
      isSubmitLoading,
      preserveHeightOnSubmit,
      attachments,
      cwd,
      attachmentMenuItems,
      onAttachButtonRef,
      onAddImages,
      onPasteImages,
      onPasteLargeText,
      client,
      isReadyForDictation,
      placeholder,
      autoFocus,
      autoFocusKey,
      disabled,
      leftContent,
      beforeVoiceContent,
      rightContent,
      activeActionContent,
      voiceServerId,
      voiceAgentId,
      isAgentRunning,
      defaultSendBehavior,
      onQueue,
      onSubmitLoadingPress,
      onKeyPressCallback,
      onSelectionChangeCallback,
      onFocusChange,
      onHeightChange,
      inputWrapperStyle,
      attachmentSlot,
      inlineChips,
      highlightUltrathink,
      inputMode,
      readOnly,
      textReplacement,
      submitLabel,
    } = resolveMessageInputProps(props);
    const { isPaneFocused } = useComposerKeyboardScope();
    const mode = resolveComposerInputMode(inputMode);
    const { t } = useTranslation();
    const isCompact = useIsCompactFormFactor();
    const { height: windowHeight } = useWindowDimensions();
    const editingSession = useComposerEditingSession(inputMode, props.editingSession);
    const isFullscreen = useComposerFullscreen(editingSession);
    const [renderedLines, setRenderedLines] = useState(1);
    const maxInputHeight = resolveMaxInputHeight(windowHeight, isCompact);
    const buttonIconSize = isWeb ? ICON_SIZE.sm : ICON_SIZE.md;
    const toast = useToast();
    const voice = useVoiceOptional();
    const voiceMuteToggleKeys = useShortcutKeys("voice-mute-toggle");
    const dictationToggleKeys = useShortcutKeys("dictation-toggle");
    const focusInputKeys = useShortcutKeys("focus-message-input");
    const [isInputFocused, setIsInputFocused] = useState(false);
    // Web text is DOM-owned between deferred draft publications. The action button only needs
    // this boundary, so publish empty/non-empty transitions without rerendering for every key.
    const initialHasLiveText = value.trim().length > 0;
    const [hasLiveText, setHasLiveText] = useState(initialHasLiveText);
    const hasLiveTextRef = useRef(initialHasLiveText);
    const rootRef = useRef<View | null>(null);
    const inputWrapperRef = useRef<View | null>(null);
    const textInputRef = useRef<ComposerTextInputHandle | null>(null);
    const isInputFocusedRef = useRef(false);
    const focusIntentRef = useRef(false);
    const valueRef = useRef(value);
    const selectionRef = useRef({ start: value.length, end: value.length });
    const paneFocusedRef = useRef(isPaneFocused);
    paneFocusedRef.current = isPaneFocused;
    const [webTextArea, setWebTextArea] = useState<HTMLElement | null>(null);
    const appliedTextReplacementKeyRef = useRef(textReplacement.key);
    const webTextareaRef = useRef<HTMLElement | null>(null);
    const updateLiveTextPresence = useCallback((text: string) => {
      const nextHasLiveText = text.trim().length > 0;
      if (hasLiveTextRef.current === nextHasLiveText) return;
      hasLiveTextRef.current = nextHasLiveText;
      setHasLiveText(nextHasLiveText);
    }, []);

    // One editor stays mounted through every layout mode, so this ref only follows
    // the editor's own mount and unmount.
    const assignTextInput = useCallback((input: ComposerTextInputHandle | null) => {
      textInputRef.current = input;
      if (!isWeb) return;
      const element = getWebTextAreaImpl(input) as HTMLElement | null;
      webTextareaRef.current = element;
      setWebTextArea(element);
    }, []);
    // Only mouse-driven UIs restore editing focus on navigation. Touch users return
    // to the conversation; replaying old focus would reopen their software keyboard.
    // Read pointer capability when restoring, without making a pointer change itself
    // a focus trigger.
    useLayoutEffect(() => {
      const finePointer = hasFinePointer();
      if (!isPaneFocused && isWeb && !finePointer) {
        // Hiding a retained tab only blurs its editor after the browser renders.
        // A quick return before that frame would otherwise keep touch focus.
        textInputRef.current?.blur();
      } else if (isPaneFocused && focusIntentRef.current && finePointer) {
        textInputRef.current?.focus();
      }
    }, [isPaneFocused]);
    // The compact and desktop screens mount the editor in different trees, so a
    // viewport that crosses the breakpoint remounts it. The draft owner brings the
    // text back; the session brings the caret and focus intent back. On web the
    // owner may still hold an unpublished edit while the new editor mounts, so the
    // caret is placed now against the text on screen and again when the owner's
    // hydrated text arrives.
    const retainedSelectionRef = useRef<{ start: number; end: number } | null>(null);
    useLayoutEffect(() => {
      const retained = editingSession.takeEditor();
      if (retained) {
        const text = textInputRef.current?.getText() ?? valueRef.current;
        const selection = resolveRetainedSelection(retained.selection, text.length);
        retainedSelectionRef.current = retained.selection;
        selectionRef.current = selection;
        textInputRef.current?.setSelection(selection);
        if (retained.focused && hasFinePointer()) {
          focusIntentRef.current = true;
          if (paneFocusedRef.current) textInputRef.current?.focus();
        }
      }
      return () => {
        editingSession.retainEditor({
          selection: getComposerInputSnapshot(
            textInputRef.current,
            valueRef.current,
            selectionRef.current,
          ).selection,
          focused: isInputFocusedRef.current || focusIntentRef.current,
        });
      };
    }, [editingSession]);
    const getLiveText = useCallback(() => valueRef.current, []);
    const composerHeight = useComposerHeight({
      getText: getLiveText,
      textareaRef: webTextareaRef,
      minHeight: MIN_INPUT_HEIGHT,
      maxHeight: maxInputHeight,
      onRenderedLinesChange: setRenderedLines,
      presentationKey: isFullscreen,
    });
    const { style: composerHeightStyle, scrollEnabled: isComposerScrollEnabled } = composerHeight;
    const measuredComposerHeight = composerHeight.mode === "measured" ? composerHeight : undefined;
    const updateComposerHeightForText = measuredComposerHeight?.onTextChange;
    const resetComposerHeight = measuredComposerHeight?.reset;

    const exitFullscreen = useCallback(() => editingSession.setFullscreen(false), [editingSession]);
    const enterFullscreen = useCallback(() => editingSession.setFullscreen(true), [editingSession]);

    // The conversation sizes itself against the inline composer; fullscreen covers it.
    const handleComposerLayout = useCallback(
      (event: LayoutChangeEvent) => {
        if (!isFullscreen) onHeightChange?.(event.nativeEvent.layout.height);
      },
      [isFullscreen, onHeightChange],
    );

    const replaceText = useCallback(
      (nextText: string, selection?: { start: number; end: number }) => {
        updateComposerHeightForText?.(valueRef.current, nextText);
        valueRef.current = nextText;
        updateLiveTextPresence(nextText);
        selectionRef.current = selection ?? { start: nextText.length, end: nextText.length };
        if (nextText === "") {
          textInputRef.current?.reset();
        } else {
          textInputRef.current?.replaceText(nextText, selection);
        }
        onChangeText(nextText);
      },
      [onChangeText, updateComposerHeightForText, updateLiveTextPresence],
    );

    const applyEdit = useCallback(
      (edit: ComposerInputSnapshot) => {
        updateComposerHeightForText?.(valueRef.current, edit.text);
        valueRef.current = edit.text;
        updateLiveTextPresence(edit.text);
        selectionRef.current = edit.selection;
        textInputRef.current?.applyEdit(edit.text, edit.selection);
        onChangeText(edit.text);
      },
      [onChangeText, updateComposerHeightForText, updateLiveTextPresence],
    );

    useImperativeHandle(ref, () => ({
      focus: () => {
        textInputRef.current?.focus();
      },
      blur: () => {
        textInputRef.current?.blur();
      },
      getText: () => textInputRef.current?.getText() ?? valueRef.current,
      getInputSnapshot: () =>
        getComposerInputSnapshot(textInputRef.current, valueRef.current, selectionRef.current),
      replaceText,
      applyEdit,
      runKeyboardAction: (action) =>
        runMessageInputKeyboardAction(action, {
          focusInput: () => textInputRef.current?.focus(),
          isDictationRecording: isDictationActive,
          markTranscriptForSend: () => {
            sendAfterTranscriptRef.current = true;
          },
          confirmDictation,
          cancelDictation,
          startDictation: startDictationIfAvailable,
          toggleRealtimeVoice: handleToggleRealtimeVoiceShortcut,
          isRealtimeVoiceActive: isRealtimeVoiceForCurrentAgent,
          toggleRealtimeVoiceMute: () => voice?.toggleMute(),
        }),
      getNativeElement: () => (isWeb ? getTextInputNativeElement(textInputRef.current) : null),
    }));
    const sendAfterTranscriptRef = useRef(false);
    const serverInfo = useSessionStore(
      useCallback(
        (state) => {
          if (!voiceServerId) {
            return null;
          }
          return state.sessions[voiceServerId]?.serverInfo ?? null;
        },
        [voiceServerId],
      ),
    );

    useEffect(() => {
      if (appliedTextReplacementKeyRef.current === textReplacement.key) return;
      appliedTextReplacementKeyRef.current = textReplacement.key;
      updateComposerHeightForText?.(valueRef.current, textReplacement.text);
      valueRef.current = textReplacement.text;
      updateLiveTextPresence(textReplacement.text);
      const retainedSelection =
        textReplacement.kind === "hydrated" ? retainedSelectionRef.current : null;
      retainedSelectionRef.current = null;
      if (textReplacement.text === "") {
        textInputRef.current?.reset();
      } else if (retainedSelection) {
        const selection = resolveRetainedSelection(retainedSelection, textReplacement.text.length);
        selectionRef.current = selection;
        textInputRef.current?.replaceText(textReplacement.text, selection);
      } else {
        textInputRef.current?.replaceText(textReplacement.text);
      }
    }, [textReplacement, updateComposerHeightForText, updateLiveTextPresence]);

    useEffect(() => {
      return () => {
        onFocusChange?.(false);
      };
    }, [onFocusChange]);

    const handleDictationTranscript = useCallback(
      (text: string, _meta: { requestId: string }) => {
        const autoSend = sendAfterTranscriptRef.current;
        sendAfterTranscriptRef.current = false;
        applyDictationTranscript(text, {
          value: valueRef.current,
          defaultSendBehavior,
          isAgentRunning,
          onQueue,
          onSubmit,
          replaceText,
          attachments,
          cwd,
          autoSend,
        });
      },
      [replaceText, onSubmit, onQueue, attachments, cwd, isAgentRunning, defaultSendBehavior],
    );

    const handleDictationError = useCallback(
      (error: Error) => {
        console.error("[MessageInput] Dictation error:", error);
        toast.error(error.message);
      },
      [toast],
    );

    const dictationUnavailableMessage = resolveVoiceUnavailableMessage({
      serverInfo,
      mode: "dictation",
    });

    const canStartDictation = useCallback(
      () =>
        computeCanStartDictation({
          client,
          isReadyForDictation,
          disabled,
          dictationUnavailableMessage,
        }),
      [client, disabled, dictationUnavailableMessage, isReadyForDictation],
    );

    const canConfirmDictation = useCallback(() => client?.isConnected ?? false, [client]);
    const isConnected = client?.isConnected ?? false;
    const isDictationStartEnabled = computeIsDictationStartEnabled(
      isReadyForDictation,
      isConnected,
      disabled,
    );

    const {
      isRecording: isDictating,
      isRecordingActive: isDictationActive,
      isProcessing: isDictationProcessing,
      partialTranscript: _dictationPartialTranscript,
      volume: dictationVolume,
      status: dictationStatus,
      startDictation,
      cancelDictation,
      confirmDictation,
      retryFailedDictation,
      discardFailedDictation,
    } = useDictation({
      client,
      onTranscript: handleDictationTranscript,
      onError: handleDictationError,
      canStart: canStartDictation,
      canConfirm: canConfirmDictation,
      enableDuration: true,
    });

    const isRealtimeVoiceForCurrentAgent = computeIsRealtimeVoiceForAgent(
      voice,
      voiceServerId,
      voiceAgentId,
    );
    const showDictationControls = computeShouldShowDictationControls(
      isDictating,
      isDictationProcessing,
      dictationStatus,
    );
    const showRealtimeOverlay = isRealtimeVoiceForCurrentAgent;
    const surfacePresentation = resolveComposerSurfacePresentation(showRealtimeOverlay);

    useEffect(() => {
      if (isDictating || isDictationProcessing) {
        return;
      }
      sendAfterTranscriptRef.current = false;
    }, [dictationStatus, isDictating, isDictationProcessing]);

    const startDictationIfAvailable = useCallback(
      () =>
        startDictationIfAvailableImpl({
          dictationUnavailableMessage,
          canStartDictation,
          toast,
          startDictation,
          exitFullscreen,
        }),
      [canStartDictation, dictationUnavailableMessage, startDictation, toast, exitFullscreen],
    );

    const handleVoicePress = useCallback(
      () =>
        handleVoicePressImpl({
          isRealtimeVoiceForCurrentAgent,
          voice,
          isDictating,
          cancelDictation,
          startDictationIfAvailable,
        }),
      [
        cancelDictation,
        isDictating,
        isRealtimeVoiceForCurrentAgent,
        startDictationIfAvailable,
        voice,
      ],
    );

    const handleCancelRecording = useCallback(async () => {
      await cancelDictation();
    }, [cancelDictation]);

    const handleAcceptRecording = useCallback(async () => {
      sendAfterTranscriptRef.current = false;
      await confirmDictation();
    }, [confirmDictation]);

    const handleRetryFailedRecording = useCallback(() => {
      void retryFailedDictation();
    }, [retryFailedDictation]);

    const handleDiscardFailedRecording = useCallback(() => {
      discardFailedDictation();
    }, [discardFailedDictation]);

    const handleStopRealtimeVoice = useCallback(async () => {
      try {
        await stopRealtimeVoice({
          voice,
          isRealtimeVoiceForCurrentAgent,
          isAgentRunning,
          client,
          voiceAgentId,
        });
      } catch (error) {
        console.error("[MessageInput] Failed to stop realtime voice", error);
        const message = extractErrorMessage(error);
        if (message && message.trim().length > 0) {
          toast.error(message);
        }
      }
    }, [client, isAgentRunning, isRealtimeVoiceForCurrentAgent, toast, voice, voiceAgentId]);

    const handleToggleRealtimeVoiceShortcut = useCallback(() => {
      toggleRealtimeVoiceImpl({
        voice,
        voiceServerId,
        voiceAgentId,
        isConnected,
        disabled,
        isAgentRunning,
        handleStopRealtimeVoice,
        toast,
        interruptBeforeVoiceMessage: t("composer.voice.interruptBeforeVoice"),
        exitFullscreen,
      });
    }, [
      disabled,
      handleStopRealtimeVoice,
      exitFullscreen,
      isAgentRunning,
      isConnected,
      t,
      toast,
      voice,
      voiceAgentId,
      voiceServerId,
    ]);

    const minimizeInputHeight = useCallback(() => {
      resetComposerHeight?.();
    }, [resetComposerHeight]);

    const handleSendMessage = useCallback(() => {
      const liveValue = textInputRef.current?.getText() ?? valueRef.current;
      if (!preserveHeightOnSubmit) {
        updateLiveTextPresence("");
      }
      sendMessageImpl({
        value: liveValue,
        attachments,
        hasExternalContent,
        allowEmptySubmit,
        cwd,
        isAgentRunning,
        onSubmit,
        onMinimizeHeight: minimizeInputHeight,
        preserveHeightOnSubmit,
        exitFullscreen,
      });
    }, [
      allowEmptySubmit,
      attachments,
      cwd,
      onSubmit,
      isAgentRunning,
      hasExternalContent,
      minimizeInputHeight,
      preserveHeightOnSubmit,
      updateLiveTextPresence,
      exitFullscreen,
    ]);

    const handleQueueMessage = useCallback(
      () =>
        queueMessageImpl({
          value: textInputRef.current?.getText() ?? valueRef.current,
          attachments,
          cwd,
          onQueue,
          replaceText,
          onMinimizeHeight: minimizeInputHeight,
          exitFullscreen,
        }),
      [attachments, cwd, onQueue, replaceText, minimizeInputHeight, exitFullscreen],
    );

    const handleDefaultSendAction = useCallback(() => {
      runDefaultSendAction({
        defaultSendBehavior,
        isAgentRunning,
        onQueue,
        handleSendMessage,
        handleQueueMessage,
      });
    }, [defaultSendBehavior, isAgentRunning, onQueue, handleQueueMessage, handleSendMessage]);

    const handleAlternateSendAction = useCallback(() => {
      runAlternateSendAction({
        defaultSendBehavior,
        isAgentRunning,
        onQueue,
        handleSendMessage,
        handleQueueMessage,
      });
    }, [defaultSendBehavior, isAgentRunning, handleSendMessage, handleQueueMessage, onQueue]);

    usePasteImagesEffect({
      textarea: webTextArea,
      isConnected,
      disabled,
      isDictating,
      isRealtimeVoiceForCurrentAgent,
      onAddImages,
    });

    const handleSelectionChange = useCallback(
      (event: NativeSyntheticEvent<TextInputSelectionChangeEventData>) => {
        const start = event.nativeEvent.selection?.start ?? 0;
        const end = event.nativeEvent.selection?.end ?? start;
        selectionRef.current = { start, end };
        onSelectionChangeCallback?.({ start, end });
      },
      [onSelectionChangeCallback],
    );

    const shouldHandleWebKeyPress = isWeb;
    const shouldSubmitOnEnter = isWeb && !isCompact;

    const handleDesktopKeyPress = useCallback(
      (event: WebTextInputKeyPressEvent) => {
        if (!shouldHandleWebKeyPress) return;
        handleDesktopKeyPressImpl(event, {
          onKeyPressCallback,
          input: getComposerInputSnapshot(
            textInputRef.current,
            valueRef.current,
            selectionRef.current,
          ),
          submitOnEnter: shouldSubmitOnEnter,
          isAgentRunning,
          onQueue,
          isSubmitDisabled,
          isSubmitLoading,
          disabled,
          handleAlternateSendAction,
          handleDefaultSendAction,
          applyTextEdit: applyEdit,
        });
      },
      [
        shouldHandleWebKeyPress,
        onKeyPressCallback,
        shouldSubmitOnEnter,
        isAgentRunning,
        onQueue,
        isSubmitDisabled,
        isSubmitLoading,
        disabled,
        handleAlternateSendAction,
        handleDefaultSendAction,
        applyEdit,
      ],
    );

    const hasSendableContent = hasSendableComposerContent({
      hasText: hasLiveText,
      attachments,
      hasExternalContent,
    });
    const { canPressLoadingButton, isSendButtonDisabled, defaultActionQueues } =
      computeSendButtonState({
        disabled,
        isSubmitDisabled,
        hasSendableContent,
        allowEmptySubmit,
        isSubmitLoading,
        onSubmitLoadingPress,
        defaultSendBehavior,
        isAgentRunning,
      });
    useIosHardwareKeyboardSubmit({
      isEnabled: isInputFocused && !isSendButtonDisabled,
      onSubmit: handleDefaultSendAction,
    });
    const submitAccessibilityLabel = resolveSubmitAccessibilityLabel({
      submitButtonAccessibilityLabel,
      canPressLoadingButton,
      defaultActionQueues,
      defaultSendBehavior,
      isAgentRunning,
      t,
    });

    const voiceButtonAccessibilityLabel = resolveVoiceAccessibilityLabel({
      isRealtimeVoiceForCurrentAgent,
      isMuted: Boolean(voice?.isMuted),
      isDictating,
      t,
    });

    const voiceTooltipText = resolveVoiceTooltipText({
      isRealtimeVoiceForCurrentAgent,
      isMuted: Boolean(voice?.isMuted),
      t,
    });

    const sendTooltipLabel = resolveSendTooltipLabel({
      submitButtonAccessibilityLabel,
      defaultActionQueues,
      t,
    });

    const handleInputChange = useCallback(
      (nextValue: string) => {
        updateComposerHeightForText?.(valueRef.current, nextValue);
        valueRef.current = nextValue;
        updateLiveTextPresence(nextValue);
        onChangeText(nextValue);
      },
      [onChangeText, updateComposerHeightForText, updateLiveTextPresence],
    );

    const handleInputFocus = useCallback(() => {
      focusIntentRef.current = true;
      isInputFocusedRef.current = true;
      setIsInputFocused(true);
      onFocusChange?.(true);
    }, [onFocusChange]);

    const handleInputBlur = useCallback(() => {
      // A blur in the active pane is a dismissal; only hiding the pane preserves intent.
      if (paneFocusedRef.current) focusIntentRef.current = false;
      isInputFocusedRef.current = false;
      setIsInputFocused(false);
      onFocusChange?.(false);
    }, [onFocusChange]);

    const handlePasteError = useCallback(
      (message: string) => {
        console.error("[MessageInput] Native paste failed:", message);
        toast.error(t("composer.errors.pasteImageFailed"));
      },
      [t, toast],
    );

    const attachButtonStyle = useCallback(
      ({ hovered }: { hovered?: boolean }) => [
        styles.attachButton,
        Boolean(hovered) && styles.iconButtonHovered,
        (!isConnected || disabled) && styles.buttonDisabled,
      ],
      [isConnected, disabled],
    );

    const voiceButtonStyle = useCallback(
      ({ hovered }: { hovered?: boolean }) => [
        styles.voiceButton,
        Boolean(hovered) && styles.iconButtonHovered,
        !isDictationStartEnabled && styles.buttonDisabled,
      ],
      [isDictationStartEnabled],
    );

    const handleRealtimeVoiceStop = useCallback(() => {
      void handleStopRealtimeVoice();
    }, [handleStopRealtimeVoice]);

    const inputWrapperCombinedStyle = useMemo(
      () => [
        styles.inputWrapper,
        isCompact && !isFullscreen && styles.inputWrapperCompact,
        readOnly && styles.inputWrapperReadOnly,
        inputWrapperStyle,
        { opacity: surfacePresentation.input.opacity },
      ],
      [inputWrapperStyle, isCompact, isFullscreen, readOnly, surfacePresentation.input.opacity],
    );
    // `withUnistyles` maps this component's `style` into a `.hash > *` child
    // rule, which ties on specificity with react-native-web's own
    // `.css-textinput-*` class and loses on source order — so a themed
    // `fontFamily` here is silently dropped while every other property lands.
    // An inline style outranks both classes. See docs/unistyles.md.
    const getTextArea = useCallback(() => {
      if (!isWeb) return null;
      const element = getTextInputNativeElement(textInputRef.current);
      return element instanceof HTMLTextAreaElement ? element : null;
    }, []);
    useLargeTextPaste({
      getTextArea,
      enabled: canAcceptPaste({
        isConnected,
        disabled,
        isDictating,
        isRealtimeVoiceForCurrentAgent,
      }),
      onPasteLargeText,
    });
    const textInputStyle = useMemo(
      () => [
        styles.textInput,
        mode.isMonospace && styles.textInputMonospace,
        isFullscreen ? styles.fullscreenTextInput : composerHeightStyle,
        isCompact && !isFullscreen && styles.compactTextInput,
      ],
      [composerHeightStyle, mode.isMonospace, isFullscreen, isCompact],
    );
    // Static content has no textarea to mirror, so it grows with its own text
    // instead of the measured input height.
    const readOnlyTextStyle = useMemo(
      () => [styles.textInput, mode.isMonospace && styles.textInputMonospace, styles.readOnlyText],
      [mode.isMonospace],
    );
    // Fullscreen always shows Send; without content it is disabled, and looks it.
    const isPresentedSendDisabled = resolvePresentationSendDisabled({
      fullscreen: isFullscreen,
      disabled: isSendButtonDisabled,
      hasText: hasLiveText,
      attachments,
      hasExternalContent,
      allowEmpty: allowEmptySubmit,
    });
    const sendButtonCombinedStyle = useMemo(
      () => [
        styles.sendButton,
        submitLabel ? styles.sendButtonLabeled : undefined,
        isPresentedSendDisabled && styles.buttonDisabled,
      ],
      [isPresentedSendDisabled, submitLabel],
    );
    const overlayContainerStyle = useMemo(
      () => [styles.overlayContainer, { opacity: surfacePresentation.overlay.opacity }],
      [surfacePresentation.overlay.opacity],
    );

    const renderAttachButtonIcon = useCallback(
      ({ hovered }: { hovered?: boolean }) => (
        <AttachButtonIcon
          hovered={Boolean(hovered)}
          onAttachButtonRef={onAttachButtonRef}
          buttonIconSize={buttonIconSize}
        />
      ),
      [onAttachButtonRef, buttonIconSize],
    );

    const renderVoiceButtonIcon = useCallback(
      ({ hovered }: { hovered?: boolean }) => (
        <VoiceButtonIcon
          hovered={Boolean(hovered)}
          isMutedRealtime={Boolean(isRealtimeVoiceForCurrentAgent && voice?.isMuted)}
          buttonIconSize={buttonIconSize}
        />
      ),
      [isRealtimeVoiceForCurrentAgent, voice?.isMuted, buttonIconSize],
    );

    const sendButton = useMemo(
      () => (
        <PrimaryAction
          isAgentRunning={!isFullscreen && isAgentRunning}
          hasSendableContent={hasSendableContent}
          activeActionContent={activeActionContent}
          shouldShow
          canPressLoadingButton={canPressLoadingButton}
          onSubmitLoadingPress={onSubmitLoadingPress}
          onDefaultSendAction={handleDefaultSendAction}
          isSendButtonDisabled={isPresentedSendDisabled}
          submitAccessibilityLabel={submitAccessibilityLabel}
          sendButtonCombinedStyle={sendButtonCombinedStyle}
          isSubmitLoading={isSubmitLoading}
          submitIcon={submitIcon}
          submitLabel={submitLabel}
          submitButtonTestID={submitButtonTestID}
          buttonIconSize={buttonIconSize}
          sendKeys={DEFAULT_SEND_KEYS}
          sendTooltipLabel={sendTooltipLabel}
        />
      ),
      [
        isFullscreen,
        isAgentRunning,
        hasSendableContent,
        activeActionContent,
        canPressLoadingButton,
        onSubmitLoadingPress,
        handleDefaultSendAction,
        isPresentedSendDisabled,
        submitAccessibilityLabel,
        sendButtonCombinedStyle,
        isSubmitLoading,
        submitIcon,
        submitLabel,
        submitButtonTestID,
        buttonIconSize,
        sendTooltipLabel,
      ],
    );
    const textSurface = useMemo(
      () => (
        <RenderProfile id="ComposerTextSurface">
          <ComposerTextSurface
            readOnly={readOnly}
            value={
              readOnly
                ? value
                : resolveComposerSurfaceText(
                    valueRef.current,
                    textReplacement,
                    appliedTextReplacementKeyRef.current,
                  )
            }
            textReplacementKey={textReplacement.key}
            textInputRef={assignTextInput}
            getTextArea={getTextArea}
            inlineChips={inlineChips}
            highlightUltrathink={highlightUltrathink}
            textInputStyle={textInputStyle}
            readOnlyTextStyle={readOnlyTextStyle}
            placeholder={placeholder ?? t("composer.placeholders.fallback")}
            accessibilityLabel={t(mode.accessibilityLabelKey)}
            onChangeText={handleInputChange}
            onFocus={handleInputFocus}
            onBlur={handleInputBlur}
            editable={!isDictating && !isRealtimeVoiceForCurrentAgent && !disabled}
            scrollEnabled={isComposerScrollEnabled}
            autoFocus={false}
            onKeyPress={shouldHandleWebKeyPress ? handleDesktopKeyPress : undefined}
            onSelectionChange={handleSelectionChange}
            onPasteImages={onPasteImages}
            onPasteError={handlePasteError}
            fullscreen={isFullscreen}
            compact={isCompact}
            onRenderedLinesChange={setRenderedLines}
            focusHintVisible={!isFullscreen && isWeb && !isInputFocused && !value}
            focusInputKeys={focusInputKeys}
            focusHintLabel={t("composer.input.focusHint", {
              shortcut: focusInputKeys ? formatShortcut(focusInputKeys[0], getShortcutOs()) : "",
            })}
          />
        </RenderProfile>
      ),
      [
        readOnly,
        textReplacement,
        assignTextInput,
        getTextArea,
        inlineChips,
        highlightUltrathink,
        textInputStyle,
        readOnlyTextStyle,
        placeholder,
        t,
        mode.accessibilityLabelKey,
        handleInputChange,
        handleInputFocus,
        handleInputBlur,
        isDictating,
        isRealtimeVoiceForCurrentAgent,
        disabled,
        isComposerScrollEnabled,
        shouldHandleWebKeyPress,
        handleDesktopKeyPress,
        handleSelectionChange,
        onPasteImages,
        handlePasteError,
        isFullscreen,
        isCompact,
        isInputFocused,
        value,
        focusInputKeys,
      ],
    );
    const toolbar = useMemo(
      () => (
        <View style={styles.buttonRow}>
          {/* Toolbar left: agent controls */}
          <View style={styles.leftButtonGroup}>{leftContent}</View>

          {/* Right: attachments, voice, contextual button (realtime/send/cancel) */}
          <View style={styles.rightButtonGroup}>
            <AttachmentDropdown
              visible={mode.showAttachments}
              isConnected={isConnected}
              disabled={disabled}
              attachButtonStyle={attachButtonStyle}
              renderAttachButtonIcon={renderAttachButtonIcon}
              attachmentMenuItems={attachmentMenuItems}
              addAttachmentLabel={t("composer.input.addAttachment")}
            />
            {beforeVoiceContent}
            <DictationInlineControls
              visible={showDictationControls}
              volume={dictationVolume}
              isProcessing={isDictationProcessing}
              status={dictationStatus}
              iconSize={buttonIconSize}
              onCancel={handleCancelRecording}
              onStop={handleAcceptRecording}
              onRetry={handleRetryFailedRecording}
              onDiscard={handleDiscardFailedRecording}
            />
            <VoiceButtonTooltip
              visible={mode.showVoice && !showDictationControls}
              onVoicePress={handleVoicePress}
              isDictationStartEnabled={isDictationStartEnabled}
              voiceButtonAccessibilityLabel={voiceButtonAccessibilityLabel}
              voiceButtonStyle={voiceButtonStyle}
              renderVoiceButtonIcon={renderVoiceButtonIcon}
              voiceTooltipText={voiceTooltipText}
              isRealtimeVoiceForCurrentAgent={isRealtimeVoiceForCurrentAgent}
              voiceMuteToggleKeys={voiceMuteToggleKeys}
              dictationToggleKeys={dictationToggleKeys}
            />
            {rightContent}
            {sendButton}
          </View>
        </View>
      ),
      [
        mode.showAttachments,
        isConnected,
        disabled,
        attachButtonStyle,
        renderAttachButtonIcon,
        attachmentMenuItems,
        t,
        leftContent,
        beforeVoiceContent,
        showDictationControls,
        dictationVolume,
        isDictationProcessing,
        dictationStatus,
        buttonIconSize,
        handleCancelRecording,
        handleAcceptRecording,
        handleRetryFailedRecording,
        handleDiscardFailedRecording,
        mode.showVoice,
        handleVoicePress,
        isDictationStartEnabled,
        voiceButtonAccessibilityLabel,
        voiceButtonStyle,
        renderVoiceButtonIcon,
        voiceTooltipText,
        isRealtimeVoiceForCurrentAgent,
        voiceMuteToggleKeys,
        dictationToggleKeys,
        rightContent,
        sendButton,
      ],
    );
    const voiceOverlay = useMemo(
      () => (
        <View
          style={overlayContainerStyle}
          pointerEvents={surfacePresentation.overlay.pointerEvents}
        >
          <MessageInputOverlay
            showRealtimeOverlay={showRealtimeOverlay}
            voice={voice}
            onRealtimeVoiceStop={handleRealtimeVoiceStop}
          />
        </View>
      ),
      [
        overlayContainerStyle,
        surfacePresentation.overlay.pointerEvents,
        showRealtimeOverlay,
        voice,
        handleRealtimeVoiceStop,
      ],
    );
    return (
      <View
        ref={rootRef}
        style={isFullscreen ? styles.fullscreenContainer : styles.container}
        testID="message-input-root"
        onLayout={handleComposerLayout}
      >
        <MessageInputAutoFocus
          enabled={autoFocus}
          autoFocusKey={autoFocusKey}
          textInputRef={textInputRef}
        />
        <ComposerInputPresentation
          fullscreen={isFullscreen}
          sendIconSize={buttonIconSize}
          surface={textSurface}
          toolbar={toolbar}
          send={sendButton}
          error={props.submissionError}
          onExit={exitFullscreen}
          inputWrapperRef={inputWrapperRef}
          inputWrapperStyle={inputWrapperCombinedStyle}
          inputPointerEvents={surfacePresentation.input.pointerEvents}
          attachmentSlot={attachmentSlot}
          showFullscreenButton={shouldShowFullscreenControl(
            isCompact,
            readOnly,
            showRealtimeOverlay,
            renderedLines,
          )}
          onEnter={enterFullscreen}
          overlay={voiceOverlay}
        />
      </View>
    );
  },
);

const styles = StyleSheet.create((theme: Theme) => ({
  container: {
    flexShrink: 1,
    position: "relative",
  },
  fullscreenContainer: {
    flex: 1,
    position: "relative",
  },
  inputWrapper: {
    flexShrink: 1,
    flexDirection: "column",
    gap: theme.spacing[3],
    backgroundColor: theme.colors.surface1,
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.borderAccent,
    borderRadius: 10,
    paddingTop: {
      xs: theme.spacing[2],
      md: theme.spacing[3],
    },
    paddingBottom: theme.spacing[2],
    paddingHorizontal: theme.spacing[3],
    ...(isWeb
      ? {
          transitionProperty: "border-color",
          transitionDuration: "200ms",
          transitionTimingFunction: "ease-in-out",
        }
      : {}),
  },
  // Lifts the composer off the chat it sits under on phones.
  inputWrapperCompact: {
    ...theme.shadow.sm,
  },
  // Dotted says "this surface is the same box, but there is nothing to type
  // into it" without swapping the border colour, which reads as an error state.
  inputWrapperReadOnly: {
    borderStyle: "dotted",
  },
  // The band the fullscreen glyph sits in is the input's own padding, so a tap
  // anywhere in it (under the glyph, or where the glyph would be) is a tap on the
  // editor: it focuses, shows the keyboard, and places the caret. Reserved whether
  // or not the glyph shows, so text never reflows when it appears.
  compactTextInput: { paddingRight: 36 },
  fullscreenTextSurface: { flex: 1, minHeight: 0 },
  fullscreenTextInput: { flex: 1, height: "100%", textAlignVertical: "top" },
  lineMeasurement: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    opacity: 0,
    maxHeight: undefined,
    minHeight: undefined,
    height: undefined,
  },
  textInputScrollWrapper: {
    flexShrink: 1,
    position: "relative",
    minHeight: { xs: 44, md: 56 },
  },
  focusHintText: {
    position: "absolute",
    top: 0,
    right: 0,
    fontSize: theme.fontSize.sm,
    color: theme.colors.foregroundMuted,
    opacity: 0.5,
  },
  textInput: {
    // Preserve the controls when an ancestor constrains an overlong draft.
    flexShrink: 1,
    width: "100%",
    color: theme.colors.foreground,
    fontSize: theme.fontSize.content,
    fontWeight: theme.fontWeight.normal,
    // No lineHeight on native. React Native applies it as a span over the text, and an
    // empty trailing line is laid out from the font's own metrics on some devices, so
    // the input jumps when the first character lands on a new line. The font's natural
    // line box is the same for every line. Web keeps the CSS value.
    ...(isWeb
      ? ({
          lineHeight: theme.fontSize.content * 1.4,
          outlineStyle: "none",
          outlineWidth: 0,
          outlineColor: "transparent",
        } as object)
      : {}),
  },
  textInputMonospace: {
    fontFamily: theme.fontFamily.mono,
  },
  readOnlyText: {
    minHeight: MIN_INPUT_HEIGHT,
    color: theme.colors.foregroundMuted,
  },
  buttonRow: {
    flexShrink: 0,
    // Pins the toolbar to the bottom when a caller gives the wrapper a min height.
    marginTop: "auto",
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    marginHorizontal: -6,
  },
  leftButtonGroup: {
    minWidth: 0,
    flexShrink: 1,
    flexGrow: 1,
    flexDirection: "row",
    alignItems: "flex-end",
    gap: theme.spacing[0],
  },
  rightButtonGroup: {
    flexShrink: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
  },
  attachButton: {
    width: 28,
    height: 28,
    borderRadius: theme.borderRadius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  attachButtonAnchor: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  voiceButton: {
    width: 28,
    height: 28,
    borderRadius: theme.borderRadius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  sendButton: {
    width: 28,
    height: 28,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.borderAccent,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: theme.spacing[1],
  },
  sendButtonLabeled: {
    width: "auto",
    minWidth: 28,
    paddingHorizontal: theme.spacing[3],
    borderRadius: theme.borderRadius.md,
  },
  sendButtonLabel: {
    fontSize: theme.fontSize.base,
    fontWeight: theme.fontWeight.medium,
    color: theme.colors.foreground,
  },
  iconButtonHovered: {
    backgroundColor: theme.colors.surface2,
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
  buttonDisabled: {
    opacity: 0.5,
  },
  overlayContainer: {
    position: "absolute",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    top: 0,
    left: 0,
    width: "100%",
    height: "100%",
    right: 0,
    bottom: 0,
  },
})) as unknown as Record<string, object>;

const ThemedPlus = withUnistyles(Plus);
const ThemedMic = withUnistyles(Mic);
const ThemedMicOff = withUnistyles(MicOff);
const ThemedArrowUp = withUnistyles(ArrowUp);
const ThemedCornerDownLeft = withUnistyles(CornerDownLeft);
const ThemedLoadingSpinner = withUnistyles(LoadingSpinner);

const iconForegroundMapping = (theme: Theme) => ({ color: theme.colors.foreground });
const iconForegroundMutedMapping = (theme: Theme) => ({ color: theme.colors.foregroundMuted });
const iconAccentForegroundMapping = (theme: Theme) => ({ color: theme.colors.foreground });
