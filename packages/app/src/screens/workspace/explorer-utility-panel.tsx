import { useCallback, useEffect, useMemo, useRef, type ReactElement } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { ChevronDown, ChevronUp } from "lucide-react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { WORKSPACE_SECONDARY_HEADER_HEIGHT } from "@/constants/layout";
import { openProjectSettings } from "@/navigation/settings-navigation";
import { WorkspacePanelHost } from "@/screens/workspace/workspace-panel-host";
import type { WorkspacePaneContentModel } from "@/screens/workspace/workspace-pane-content";
import {
  ScriptRow,
  useWorkspaceScriptControls,
} from "@/screens/workspace/workspace-scripts-button";
import type { WorkspaceTabDescriptor } from "@/screens/workspace/workspace-tabs-types";
import type { WorkspaceDescriptor } from "@/stores/session-store";
import { useExplorerUtilityStore, type ExplorerUtilityTab } from "@/stores/explorer-utility-store";
import type { Theme } from "@/styles/theme";
import type { WorkspaceTabTarget } from "@/workspace-tabs/model";

// Panels here live outside the workspace layout, so they use a pane id no layout ever holds.
const UTILITY_PANE_ID = "explorer-utility";
const TABS: ExplorerUtilityTab[] = ["setup", "run", "terminal"];

const mutedColorMapping = (theme: Theme) => ({ color: theme.colors.foregroundMuted });
const ThemedChevronDown = withUnistyles(ChevronDown);
const ThemedChevronUp = withUnistyles(ChevronUp);
const ThemedLoadingSpinner = withUnistyles(LoadingSpinner);

interface ExplorerUtilityPanelProps {
  serverId: string;
  workspaceId: string;
  workspaceKey: string;
  projectId: string | null;
  scripts: WorkspaceDescriptor["scripts"];
  liveTerminalIds: readonly string[];
  isWorkspaceFocused: boolean;
  buildPaneContentModel: (input: {
    paneId: string;
    tab: WorkspaceTabDescriptor;
  }) => WorkspacePaneContentModel;
  /** Starts the Terminal panel's shell; the created id arrives through the store. */
  onCreateTerminal: () => void;
  /** Registers a started script's terminal without opening a workspace tab for it. */
  onTrackScriptTerminal: (terminalId: string) => void;
  onOpenUrlInBrowserTab?: (url: string) => void;
}

function descriptor(target: WorkspaceTabTarget, id: string): WorkspaceTabDescriptor {
  const tabId = `${UTILITY_PANE_ID}:${id}`;
  return { key: tabId, tabId, kind: target.kind, target };
}

/** The Explorer's bottom panel: workspace setup, run scripts, and a terminal. */
export function ExplorerUtilityPanel({
  serverId,
  workspaceId,
  workspaceKey,
  projectId,
  scripts,
  liveTerminalIds,
  isWorkspaceFocused,
  buildPaneContentModel,
  onCreateTerminal,
  onTrackScriptTerminal,
  onOpenUrlInBrowserTab,
}: ExplorerUtilityPanelProps): ReactElement {
  const { t } = useTranslation();
  const collapsed = useExplorerUtilityStore((state) => state.collapsed);
  const tab = useExplorerUtilityStore((state) => state.tab);
  const setCollapsed = useExplorerUtilityStore((state) => state.setCollapsed);
  const terminalId = useExplorerUtilityStore(
    (state) => state.terminalIdByWorkspace[workspaceKey] ?? null,
  );
  const runScriptName = useExplorerUtilityStore(
    (state) => state.runScriptByWorkspace[workspaceKey] ?? null,
  );
  const liveTerminalIdSet = useMemo(() => new Set(liveTerminalIds), [liveTerminalIds]);
  const liveTerminalId = terminalId && liveTerminalIdSet.has(terminalId) ? terminalId : null;

  const runTerminalId = resolveRunTerminalId(scripts, runScriptName, liveTerminalIdSet);

  // The Terminal tab starts its shell on first view and again after that shell exits.
  const requestedTerminalRef = useRef(false);
  const showsTerminal = !collapsed && tab === "terminal";
  useEffect(() => {
    if (!showsTerminal || liveTerminalId) {
      requestedTerminalRef.current = false;
      return;
    }
    if (requestedTerminalRef.current) return;
    requestedTerminalRef.current = true;
    onCreateTerminal();
  }, [liveTerminalId, onCreateTerminal, showsTerminal]);

  const panelTabs = useMemo(() => {
    const tabs = [descriptor({ kind: "setup", workspaceId }, "setup")];
    if (runTerminalId)
      tabs.push(descriptor({ kind: "terminal", terminalId: runTerminalId }, "run"));
    if (liveTerminalId) {
      tabs.push(descriptor({ kind: "terminal", terminalId: liveTerminalId }, "terminal"));
    }
    return tabs;
  }, [liveTerminalId, runTerminalId, workspaceId]);
  const activePanelTabId =
    tab === "setup" || (tab === "run" && runTerminalId) || (tab === "terminal" && liveTerminalId)
      ? `${UTILITY_PANE_ID}:${tab}`
      : null;

  const toggleCollapsed = useCallback(() => setCollapsed(!collapsed), [collapsed, setCollapsed]);

  return (
    <View
      style={collapsed ? styles.panelCollapsed : styles.panel}
      testID="workspace-explorer-utility-panel"
    >
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            collapsed ? t("workspace.utilityPanel.expand") : t("workspace.utilityPanel.collapse")
          }
          onPress={toggleCollapsed}
          style={styles.collapseButton}
          testID="workspace-explorer-utility-collapse"
        >
          {collapsed ? (
            <ThemedChevronUp size={14} uniProps={mutedColorMapping} />
          ) : (
            <ThemedChevronDown size={14} uniProps={mutedColorMapping} />
          )}
        </Pressable>
        {TABS.map((item) => (
          <UtilityTab key={item} tab={item} active={!collapsed && item === tab} />
        ))}
      </View>
      {collapsed ? null : (
        <View style={styles.body}>
          {tab === "run" ? (
            <RunScripts
              serverId={serverId}
              workspaceId={workspaceId}
              workspaceKey={workspaceKey}
              projectId={projectId}
              scripts={scripts}
              liveTerminalIds={liveTerminalIds}
              onTrackScriptTerminal={onTrackScriptTerminal}
              onOpenUrlInBrowserTab={onOpenUrlInBrowserTab}
            />
          ) : null}
          {tab === "terminal" && !liveTerminalId ? (
            <View style={styles.emptyWrap}>
              <ThemedLoadingSpinner uniProps={mutedColorMapping} />
            </View>
          ) : null}
          <View style={activePanelTabId ? styles.host : styles.hostHidden}>
            <WorkspacePanelHost
              paneId={UTILITY_PANE_ID}
              tabs={panelTabs}
              activeTabId={activePanelTabId}
              normalizedServerId={serverId}
              normalizedWorkspaceId={workspaceId}
              isWorkspaceFocused={isWorkspaceFocused}
              isPaneFocused
              buildPaneContentModel={buildPaneContentModel}
            />
          </View>
        </View>
      )}
    </View>
  );
}

/** The script the Run panel follows: the last one started or viewed, else any running one. */
function resolveRunTerminalId(
  scripts: WorkspaceDescriptor["scripts"],
  runScriptName: string | null,
  liveTerminalIdSet: Set<string>,
): string | null {
  const runScript =
    scripts.find((script) => script.scriptName === runScriptName) ??
    scripts.find((script) => script.lifecycle === "running");
  const terminalId = runScript?.terminalId;
  return terminalId && liveTerminalIdSet.has(terminalId) ? terminalId : null;
}

type RunScriptsProps = Pick<
  ExplorerUtilityPanelProps,
  | "serverId"
  | "workspaceId"
  | "workspaceKey"
  | "projectId"
  | "scripts"
  | "liveTerminalIds"
  | "onTrackScriptTerminal"
  | "onOpenUrlInBrowserTab"
>;

/** The Run tab's script list, or a prompt to add a script when the project has none. */
function RunScripts({
  serverId,
  workspaceId,
  workspaceKey,
  projectId,
  scripts,
  liveTerminalIds,
  onTrackScriptTerminal,
  onOpenUrlInBrowserTab,
}: RunScriptsProps) {
  const { t } = useTranslation();
  const setRunScript = useExplorerUtilityStore((state) => state.setRunScript);
  const handleScriptTerminalStarted = useCallback(
    (startedTerminalId: string) => {
      onTrackScriptTerminal(startedTerminalId);
      const started = scripts.find((script) => script.terminalId === startedTerminalId);
      if (started) setRunScript(workspaceKey, started.scriptName);
    },
    [onTrackScriptTerminal, scripts, setRunScript, workspaceKey],
  );
  const controls = useWorkspaceScriptControls({
    serverId,
    workspaceId,
    scripts,
    liveTerminalIds,
    onScriptTerminalStarted: handleScriptTerminalStarted,
  });
  const { onStartScript } = controls;
  const handleStartScript = useCallback(
    (scriptName: string) => {
      setRunScript(workspaceKey, scriptName);
      onStartScript(scriptName);
    },
    [onStartScript, setRunScript, workspaceKey],
  );
  const handleViewTerminal = useCallback(
    (viewedTerminalId: string) => {
      const viewed = scripts.find((script) => script.terminalId === viewedTerminalId);
      if (viewed) setRunScript(workspaceKey, viewed.scriptName);
    },
    [scripts, setRunScript, workspaceKey],
  );
  const handleAddRunScript = useCallback(() => {
    if (projectId) openProjectSettings(serverId, projectId);
  }, [projectId, serverId]);

  if (scripts.length === 0) {
    return (
      <View style={styles.emptyWrap}>
        <View style={styles.empty}>
          <Text style={styles.emptyText}>{t("workspace.utilityPanel.runEmpty")}</Text>
          {projectId ? (
            <Button
              variant="secondary"
              size="xs"
              onPress={handleAddRunScript}
              testID="workspace-explorer-utility-add-script"
            >
              {t("workspace.utilityPanel.addRunScript")}
            </Button>
          ) : null}
        </View>
      </View>
    );
  }
  return (
    <ScrollView style={styles.scriptList} contentContainerStyle={styles.scriptListContent}>
      {scripts.map((script) => (
        <ScriptRow
          key={script.scriptName}
          script={script}
          {...controls}
          onStartScript={handleStartScript}
          onViewTerminal={handleViewTerminal}
          onOpenUrlInBrowserTab={onOpenUrlInBrowserTab}
        />
      ))}
    </ScrollView>
  );
}

function UtilityTab({ tab, active }: { tab: ExplorerUtilityTab; active: boolean }) {
  const { t } = useTranslation();
  const selectTab = useExplorerUtilityStore((state) => state.selectTab);
  const handlePress = useCallback(() => selectTab(tab), [selectTab, tab]);
  const accessibilityState = useMemo(() => ({ selected: active }), [active]);
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={accessibilityState}
      onPress={handlePress}
      style={styles.tab}
      testID={`workspace-explorer-utility-tab-${tab}`}
    >
      <Text style={active ? styles.tabLabelActive : styles.tabLabel}>
        {t(`workspace.utilityPanel.${tab}`)}
      </Text>
      {active ? <View style={styles.tabIndicator} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create((theme) => ({
  panel: {
    flex: 0.8,
    minHeight: 160,
    borderTopWidth: theme.borderWidth[1],
    borderTopColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceSidebar,
  },
  panelCollapsed: {
    flexShrink: 0,
    borderTopWidth: theme.borderWidth[1],
    borderTopColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceSidebar,
  },
  header: {
    height: WORKSPACE_SECONDARY_HEADER_HEIGHT,
    flexDirection: "row",
    alignItems: "stretch",
    gap: theme.spacing[1],
    paddingHorizontal: theme.spacing[1],
    borderBottomWidth: theme.borderWidth[1],
    borderBottomColor: theme.colors.border,
  },
  collapseButton: {
    width: 24,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.borderRadius.md,
  },
  tab: {
    justifyContent: "center",
    paddingHorizontal: theme.spacing[2],
  },
  tabLabel: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.foregroundMuted,
  },
  tabLabelActive: {
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
    color: theme.colors.foreground,
  },
  tabIndicator: {
    position: "absolute",
    right: theme.spacing[2],
    bottom: 0,
    left: theme.spacing[2],
    height: 2,
    borderRadius: 1,
    backgroundColor: theme.colors.tabIndicator,
  },
  body: {
    flex: 1,
    minHeight: 0,
  },
  scriptList: {
    flexGrow: 0,
    maxHeight: "45%",
    borderBottomWidth: theme.borderWidth[1],
    borderBottomColor: theme.colors.border,
  },
  scriptListContent: {
    padding: theme.spacing[2],
    gap: theme.spacing[1],
  },
  host: {
    flex: 1,
    minHeight: 0,
  },
  hostHidden: {
    display: "none",
  },
  emptyWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: theme.spacing[6],
  },
  empty: {
    alignSelf: "stretch",
    alignItems: "center",
    gap: theme.spacing[4],
    paddingVertical: theme.spacing[8],
    paddingHorizontal: theme.spacing[4],
    borderWidth: theme.borderWidth[1],
    borderStyle: "dashed",
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.lg,
  },
  emptyText: {
    maxWidth: 240,
    textAlign: "center",
    fontSize: theme.fontSize.sm,
    lineHeight: 18,
    color: theme.colors.foregroundMuted,
  },
}));
