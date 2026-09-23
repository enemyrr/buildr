import { useCallback, useEffect, useRef } from "react";
import type { NativeSyntheticEvent, TextInputKeyPressEventData } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { useTranslation } from "react-i18next";
import { EditingTextInput, type EditingTextInputHandle } from "@/components/ui/text-input";
import { useToast } from "@/contexts/toast-context";
import { getHostRuntimeStore } from "@/runtime/host-runtime";

// The subset of a workspace a rename needs. Narrower than SidebarWorkspaceEntry so the header can
// build one from the route's descriptor.
export interface RenamableWorkspace {
  serverId: string;
  workspaceId: string;
  name: string;
  title?: string | null;
}

export interface WorkspaceTitleEditorProps {
  workspace: RenamableWorkspace;
  /** Matches the title it replaces: the sidebar row's 20px line, or the header breadcrumb leaf. */
  variant: "sidebar" | "header";
  onDone: () => void;
  testID?: string;
}

// Menus and the command center hand focus back to their trigger as they close. Focusing after
// that settles keeps the restore from blurring, and so committing, the input the moment it mounts.
const FOCUS_DELAY_MS = 50;

/**
 * Inline replacement for a workspace title. Enter and blur commit, Escape cancels. An empty or
 * unchanged value cancels. Failures surface as a toast because the input is already gone.
 */
export function WorkspaceTitleEditor({
  workspace,
  variant,
  onDone,
  testID,
}: WorkspaceTitleEditorProps) {
  const { t } = useTranslation();
  const toast = useToast();
  const inputRef = useRef<EditingTextInputHandle>(null);
  const initialValue = workspace.title ?? workspace.name;
  const draftRef = useRef(initialValue);
  const hasFocusedRef = useRef(false);
  const settledRef = useRef(false);
  const { serverId, workspaceId } = workspace;

  useEffect(() => {
    const timeout = setTimeout(() => inputRef.current?.focus(), FOCUS_DELAY_MS);
    return () => clearTimeout(timeout);
  }, []);

  const handleChangeText = useCallback((value: string) => {
    draftRef.current = value;
  }, []);

  const cancel = useCallback(() => {
    if (settledRef.current) return;
    settledRef.current = true;
    onDone();
  }, [onDone]);

  const commit = useCallback(() => {
    if (settledRef.current) return;
    settledRef.current = true;
    onDone();
    const next = draftRef.current.trim();
    if (!next || next === initialValue) return;
    const client = getHostRuntimeStore().getClient(serverId);
    if (!client) {
      toast.error(t("sidebar.workspace.toasts.hostDisconnected"));
      return;
    }
    void client.setWorkspaceTitle(workspaceId, next).catch((error: unknown) => {
      toast.error(
        error instanceof Error && error.message ? error.message : t("common.errors.unableToSave"),
      );
    });
  }, [initialValue, onDone, serverId, t, toast, workspaceId]);

  const handleFocus = useCallback(() => {
    hasFocusedRef.current = true;
  }, []);

  const handleBlur = useCallback(() => {
    if (hasFocusedRef.current) commit();
  }, [commit]);

  const handleKeyPress = useCallback(
    (event: NativeSyntheticEvent<TextInputKeyPressEventData>) => {
      if (event.nativeEvent.key === "Escape") cancel();
    },
    [cancel],
  );

  return (
    <EditingTextInput
      ref={inputRef}
      initialValue={initialValue}
      placeholder={workspace.name}
      placeholderTextColor={styles.placeholder.color}
      onChangeText={handleChangeText}
      onSubmitEditing={commit}
      onFocus={handleFocus}
      onBlur={handleBlur}
      onKeyPress={handleKeyPress}
      selectTextOnFocus
      autoCapitalize="none"
      autoCorrect={false}
      returnKeyType="done"
      accessibilityLabel={t("sidebar.workspace.rename.title")}
      style={[styles.input, variant === "sidebar" ? styles.sidebar : styles.header]}
      testID={testID}
    />
  );
}

const styles = StyleSheet.create((theme) => ({
  // The border sits outside the text: negative margins cancel border and padding so the glyphs
  // stay on the rail the title used.
  input: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.base,
    fontWeight: theme.fontWeight.normal,
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.base,
    paddingVertical: 0,
    paddingHorizontal: theme.spacing[1],
    marginHorizontal: -(theme.spacing[1] + theme.borderWidth[1]),
    outlineWidth: 0,
    minWidth: 0,
  },
  sidebar: {
    flex: 1,
    height: 20,
  },
  header: {
    width: 240,
    maxWidth: "100%",
    marginVertical: -theme.borderWidth[1],
  },
  placeholder: {
    color: theme.colors.foregroundExtraMuted,
  },
}));
