import { useCallback, useMemo, type ReactNode } from "react";
import { Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { FileDiff, GitCommitHorizontal } from "lucide-react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import invariant from "tiny-invariant";
import { useRetainedPanelActive } from "@/components/retained-panel";
import { useIsCompactFormFactor } from "@/constants/layout";
import { PaneContentToolbar } from "@/components/ui/pane-content-toolbar";
import { isWeb } from "@/constants/platform";
import { DiffDocument } from "@/git/diff-document";
import { ChangesSurface, DiffLayoutToggle, resolveDiffLayout } from "@/git/diff-pane";
import { useCommitDiffFiles } from "@/git/use-diff-files";
import { useChangesPreferences } from "@/hooks/use-changes-preferences";
import { useAppSettings } from "@/hooks/use-settings";
import { usePaneContext } from "@/panels/pane-context";
import { definePanel, type PanelDescriptor, type PanelPresentation } from "@/panels/panel-registry";
import { useAddFileToChat } from "@/panels/use-add-file-to-chat";
import { useWorkspaceDirectory } from "@/stores/session-store-hooks";
import type { WorkspaceTabTarget } from "@/workspace-tabs/model";
import { defaultChangesState, changesStateSchema } from "@/panels/changes/state";
import { usePanelState } from "@/panels/use-panel-state";
import { RenderProfile } from "@/utils/render-profiler";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { DiffTooLargeState } from "@/git/diff-too-large-state";
import type { ParsedDiffFile } from "@/git/use-diff-query";
import { confirmDialog } from "@/utils/confirm-dialog";
import {
  useRestoreTurnFiles,
  useSupportsAgentCheckpoints,
  useTurnCheckpoint,
  useTurnDiff,
  type TurnCheckpointResult,
  type TurnDiffQueryResult,
} from "@/checkpoints/use-turn-checkpoints";

const ThemedFileDiff = withUnistyles(FileDiff);
const ThemedGitCommitHorizontal = withUnistyles(GitCommitHorizontal);

function useDiffPanelPreferences() {
  const { settings } = useAppSettings();
  const { preferences, updatePreferences } = useChangesPreferences();
  const isCompact = useIsCompactFormFactor();
  const canUseSplitLayout = isWeb && !isCompact;
  const effectiveLayout = resolveDiffLayout(preferences.layout, canUseSplitLayout);
  const displayPreferences = useMemo(
    () => ({
      layout: effectiveLayout,
      wrapLines: preferences.wrapLines,
      codeFontSize: settings.codeFontSize,
      monoFontFamily: settings.monoFontFamily,
    }),
    [effectiveLayout, preferences.wrapLines, settings.codeFontSize, settings.monoFontFamily],
  );
  const toggleLayout = useCallback(() => {
    void updatePreferences({ layout: preferences.layout === "unified" ? "split" : "unified" });
  }, [preferences.layout, updatePreferences]);
  const toggleWrapLines = useCallback(() => {
    void updatePreferences({ wrapLines: !preferences.wrapLines });
  }, [preferences.wrapLines, updatePreferences]);
  const toggleHideWhitespace = useCallback(() => {
    void updatePreferences({ hideWhitespace: !preferences.hideWhitespace });
  }, [preferences.hideWhitespace, updatePreferences]);
  return {
    preferences,
    isCompact,
    canUseSplitLayout,
    displayPreferences,
    toggleLayout,
    toggleWrapLines,
    toggleHideWhitespace,
  };
}

function PanelState({
  message,
  tone = "muted",
  testID,
}: {
  message: string;
  tone?: "muted" | "error";
  testID?: string;
}) {
  return (
    <View style={styles.centerState} testID={testID}>
      <Text style={tone === "error" ? styles.errorText : styles.mutedText}>{message}</Text>
    </View>
  );
}

function resolveChangesPresentation(
  isTree: boolean,
  inlineDiff: boolean,
): "tree" | "diff" | "combined" {
  if (!isTree) return "diff";
  return inlineDiff ? "combined" : "tree";
}

function ChangesPanel() {
  const { t } = useTranslation();
  const { serverId, workspaceId, tabId, target, openPreferredTarget, openTargetToSide } =
    usePaneContext();
  const [changesState, setChangesState] = usePanelState(changesStateSchema, defaultChangesState);
  const { preferences } = useChangesPreferences();
  const cwd = useWorkspaceDirectory(serverId, workspaceId);
  const isActive = useRetainedPanelActive();
  const { addFile, canAddToChat } = useAddFileToChat({ serverId, workspaceId });
  invariant(
    target.kind === "working_diff" || target.kind === "changes_tree",
    "ChangesPanel requires working_diff or changes_tree target",
  );
  const isTree = target.kind === "changes_tree";

  const handleOpenFile = useCallback(
    (path: string) => openPreferredTarget({ kind: "file", path }, isTree ? "diffs" : "diffFiles"),
    [isTree, openPreferredTarget],
  );

  const handleSelectDiffFile = useCallback(
    (path: string) =>
      openPreferredTarget(
        { kind: "working_diff", focusPath: path, focusRequestId: Date.now() },
        "diffs",
      ),
    [openPreferredTarget],
  );
  const handleOpenDiffToSide = useCallback(
    (path: string) =>
      openTargetToSide?.({ kind: "working_diff", focusPath: path, focusRequestId: Date.now() }),
    [openTargetToSide],
  );

  if (!cwd) {
    return <PanelState message={t("panels.diff.directoryMissing")} />;
  }

  const presentation = resolveChangesPresentation(isTree, preferences.inlineDiff);
  const testID = isTree ? "changes-tree-panel" : "working-diff-panel";
  const profileId = isTree ? `ChangesTreePanel:${tabId}` : `WorkingDiffPanel:${tabId}`;

  return (
    <View style={styles.container} testID={testID}>
      <RenderProfile id={profileId}>
        <ChangesSurface
          serverId={serverId}
          workspaceId={workspaceId}
          cwd={cwd}
          enabled={isActive}
          presentation={presentation}
          focusPath={target.kind === "working_diff" ? target.focusPath : undefined}
          focusRequestId={target.kind === "working_diff" ? target.focusRequestId : undefined}
          onSelectDiffFile={isTree ? handleSelectDiffFile : undefined}
          onOpenFile={handleOpenFile}
          onOpenToSide={isTree && openTargetToSide ? handleOpenDiffToSide : undefined}
          onAddToChat={canAddToChat ? addFile : undefined}
          state={changesState}
          onStateChange={setChangesState}
        />
      </RenderProfile>
    </View>
  );
}

function CommitDiffPanel() {
  const { t } = useTranslation();
  const { serverId, workspaceId, target } = usePaneContext();
  const cwd = useWorkspaceDirectory(serverId, workspaceId);
  const panelPreferences = useDiffPanelPreferences();
  invariant(target.kind === "commit_diff", "CommitDiffPanel requires commit_diff target");
  const { files, isLoading, error, capabilityMissing } = useCommitDiffFiles({
    serverId,
    cwd: cwd ?? "",
    sha: target.sha,
    enabled: Boolean(cwd),
  });
  const mode = useMemo(() => ({ kind: "commit" as const }), []);

  let body: ReactNode;
  if (!cwd) {
    body = <PanelState message={t("panels.diff.directoryMissing")} />;
  } else if (capabilityMissing) {
    body = (
      <PanelState
        message={t("panels.diff.capabilityMissing")}
        testID="commit-diff-capability-missing"
      />
    );
  } else if (error) {
    body = (
      <PanelState message={t("panels.diff.loadError")} tone="error" testID="commit-diff-error" />
    );
  } else if (isLoading && files.length === 0) {
    body = <PanelState message={t("workspace.tabs.loading")} testID="commit-diff-loading" />;
  } else if (files.length === 0) {
    body = <PanelState message={t("panels.diff.empty")} testID="commit-diff-empty" />;
  } else {
    body = (
      <DiffDocument
        files={files}
        displayPreferences={panelPreferences.displayPreferences}
        mode={mode}
      />
    );
  }

  return (
    <View style={styles.container} testID="commit-diff-panel">
      {panelPreferences.canUseSplitLayout ? (
        <PaneContentToolbar style={styles.toolbar} testID="commit-diff-header">
          <View style={styles.toolbarActions} testID="commit-diff-toolbar">
            <DiffLayoutToggle
              layout={panelPreferences.preferences.layout}
              isMobile={panelPreferences.isCompact}
              testID="commit-diff-toggle-layout"
              onToggle={panelPreferences.toggleLayout}
            />
          </View>
        </PaneContentToolbar>
      ) : null}
      <View style={styles.body}>{body}</View>
    </View>
  );
}

interface TurnDiffBodyInput {
  supported: boolean;
  checkpoint: TurnCheckpointResult;
  diff: TurnDiffQueryResult;
}

type TurnDiffBodyState =
  | { kind: "message"; message: string; tone: "muted" | "error"; testID: string }
  | { kind: "too_large" }
  | { kind: "files"; files: ParsedDiffFile[] };

function turnDiffMessage(
  message: string,
  tone: "muted" | "error",
  testID: string,
): TurnDiffBodyState {
  return { kind: "message", message, tone, testID };
}

function resolveTurnDiffBody(input: TurnDiffBodyInput, t: TFunction): TurnDiffBodyState {
  if (!input.supported) {
    return turnDiffMessage(
      t("panels.diff.turnCapabilityMissing"),
      "muted",
      "turn-diff-capability-missing",
    );
  }
  if (input.checkpoint.error) {
    return turnDiffMessage(t("panels.diff.loadError"), "error", "turn-diff-error");
  }
  if (input.checkpoint.isLoading) {
    return turnDiffMessage(t("workspace.tabs.loading"), "muted", "turn-diff-loading");
  }
  if (!input.checkpoint.turn) {
    return turnDiffMessage(t("panels.diff.turnMissing"), "muted", "turn-diff-missing");
  }
  if (input.diff.error) {
    // The daemon's reason, such as a turn that is still running, beats a generic failure.
    return turnDiffMessage(input.diff.error.message, "error", "turn-diff-error");
  }
  if (!input.diff.data) {
    return turnDiffMessage(t("workspace.tabs.loading"), "muted", "turn-diff-loading");
  }
  if (input.diff.data.diffTooLarge) return { kind: "too_large" };
  if (input.diff.data.files.length === 0) {
    return turnDiffMessage(t("panels.diff.empty"), "muted", "turn-diff-empty");
  }
  return { kind: "files", files: input.diff.data.files };
}

interface TurnRestoreFilesButtonProps {
  serverId: string;
  agentId: string;
  messageId: string;
  blockedReason: string | null;
}

function TurnRestoreFilesButton({
  serverId,
  agentId,
  messageId,
  blockedReason,
}: TurnRestoreFilesButtonProps) {
  const { t } = useTranslation();
  const { restoreFiles, isPending } = useRestoreTurnFiles({ serverId, agentId });
  const handlePress = useCallback(async () => {
    const confirmed = await confirmDialog({
      title: t("panels.diff.restoreTitle"),
      message: t("panels.diff.restoreMessage"),
      confirmLabel: t("panels.diff.restoreFiles"),
      destructive: true,
    });
    if (!confirmed) return;
    // useRestoreTurnFiles owns the success and failure toasts.
    await restoreFiles(messageId).catch(() => undefined);
  }, [messageId, restoreFiles, t]);
  const button = (
    <Button
      variant="outline"
      size="xs"
      disabled={blockedReason !== null}
      loading={isPending}
      onPress={handlePress}
      testID="turn-diff-restore-files"
    >
      {t("panels.diff.restoreFiles")}
    </Button>
  );
  if (!blockedReason) return button;
  return (
    <Tooltip delayDuration={250} enabledOnDesktop enabledOnMobile={false}>
      <TooltipTrigger asChild>
        <View>{button}</View>
      </TooltipTrigger>
      <TooltipContent side="bottom" align="end" offset={8}>
        <Text style={styles.tooltipText}>{blockedReason}</Text>
      </TooltipContent>
    </Tooltip>
  );
}

function TurnDiffPanel() {
  const { t } = useTranslation();
  const { serverId, target } = usePaneContext();
  const panelPreferences = useDiffPanelPreferences();
  invariant(target.kind === "turn_diff", "TurnDiffPanel requires turn_diff target");
  const supported = useSupportsAgentCheckpoints(serverId);
  const checkpoint = useTurnCheckpoint({
    serverId,
    agentId: target.agentId,
    messageId: target.messageId,
    enabled: supported,
  });
  const diff = useTurnDiff({
    serverId,
    agentId: target.agentId,
    turnIndex: checkpoint.turn?.turnIndex ?? null,
    ignoreWhitespace: panelPreferences.preferences.hideWhitespace,
  });
  const mode = useMemo(() => ({ kind: "commit" as const }), []);
  const bodyState = resolveTurnDiffBody({ supported, checkpoint, diff }, t);

  let body: ReactNode;
  if (bodyState.kind === "message") {
    body = (
      <PanelState message={bodyState.message} tone={bodyState.tone} testID={bodyState.testID} />
    );
  } else if (bodyState.kind === "too_large") {
    body = <DiffTooLargeState />;
  } else {
    body = (
      <DiffDocument
        files={bodyState.files}
        displayPreferences={panelPreferences.displayPreferences}
        mode={mode}
      />
    );
  }

  return (
    <View style={styles.container} testID="turn-diff-panel">
      <PaneContentToolbar style={styles.toolbar} testID="turn-diff-header">
        <View style={styles.toolbarActions} testID="turn-diff-toolbar">
          {panelPreferences.canUseSplitLayout ? (
            <DiffLayoutToggle
              layout={panelPreferences.preferences.layout}
              isMobile={panelPreferences.isCompact}
              testID="turn-diff-toggle-layout"
              onToggle={panelPreferences.toggleLayout}
            />
          ) : null}
          {checkpoint.turn ? (
            <TurnRestoreFilesButton
              serverId={serverId}
              agentId={target.agentId}
              messageId={target.messageId}
              blockedReason={checkpoint.restoreFilesBlockedReason}
            />
          ) : null}
        </View>
      </PaneContentToolbar>
      <View style={styles.body}>{body}</View>
    </View>
  );
}

const workingDiffPresentation = {
  label: (t) => t("panels.diff.diffLabel"),
  subtitle: (t) => t("panels.diff.changesSubtitle"),
  tooltip: (t) => t("panels.diff.changesSubtitle"),
  icon: ThemedFileDiff,
} satisfies PanelPresentation;

const changesTreePresentation = {
  label: (t) => t("panels.diff.changesLabel"),
  subtitle: (t) => t("panels.diff.changesSubtitle"),
  tooltip: (t) => t("panels.diff.changesSubtitle"),
  icon: ThemedFileDiff,
} satisfies PanelPresentation;

function useCommitDiffPanelDescriptor(
  target: Extract<WorkspaceTabTarget, { kind: "commit_diff" }>,
): PanelDescriptor {
  const { t } = useTranslation();
  return {
    label: target.sha.slice(0, 7),
    subtitle: t("panels.diff.commitSubtitle"),
    tooltip: target.sha,
    titleState: "ready",
    icon: ThemedGitCommitHorizontal,
    statusBucket: null,
  };
}

const turnDiffPresentation = {
  label: (t) => t("panels.diff.turnLabel"),
  subtitle: (t) => t("panels.diff.turnSubtitle"),
  tooltip: (t) => t("panels.diff.turnSubtitle"),
  icon: ThemedFileDiff,
} satisfies PanelPresentation;

export const turnDiffPanelRegistration = definePanel("turn_diff", {
  component: TurnDiffPanel,
  presentation: turnDiffPresentation,
});

export const workingDiffPanelRegistration = definePanel("working_diff", {
  component: ChangesPanel,
  presentation: workingDiffPresentation,
});

export const changesTreePanelRegistration = definePanel("changes_tree", {
  component: ChangesPanel,
  presentation: changesTreePresentation,
});

export const commitDiffPanelRegistration = definePanel("commit_diff", {
  component: CommitDiffPanel,
  useDescriptor: useCommitDiffPanelDescriptor,
});

const styles = StyleSheet.create((theme) => ({
  container: {
    flex: 1,
    minHeight: 0,
  },
  toolbar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing[2],
    paddingRight: theme.spacing[2],
  },
  toolbarActions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: theme.spacing[1],
  },
  body: {
    flex: 1,
    minHeight: 0,
  },
  centerState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: theme.spacing[6],
    paddingTop: theme.spacing[16],
  },
  mutedText: {
    fontSize: theme.fontSize.base,
    color: theme.colors.foregroundMuted,
    textAlign: "center",
  },
  errorText: {
    fontSize: theme.fontSize.base,
    color: theme.colors.destructive,
    textAlign: "center",
  },
  tooltipText: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
  },
}));
