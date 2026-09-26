import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ComponentType, ReactNode } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type PressableStateCallbackType,
} from "react-native";
import { EditingTextInput as TextInput } from "@/components/ui/text-input";
import { useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { Buffer } from "buffer";
import {
  ArrowLeft,
  Palette,
  Server,
  Network,
  Bot,
  Keyboard,
  Info,
  Plus,
  FolderGit2,
  SquareTerminal,
  Blocks,
  ChevronRight,
  Cpu,
  SlidersHorizontal,
  Wrench,
} from "lucide-react-native";
import { DropdownTrigger } from "@/components/ui/dropdown-trigger";
import { ComboboxTrigger } from "@/components/ui/combobox-trigger";
import { SidebarHeaderRow } from "@/components/sidebar/sidebar-header-row";
import { HostPicker as SharedHostPicker } from "@/components/hosts/host-picker";
import { HostStatusDot } from "@/components/host-status-dot";
import { SettingsSection } from "@/components/settings/headings/settings-section";
import { SettingsNavigationSearch } from "@/screens/settings/settings-navigation-search";
import { AppearanceSection } from "@/screens/settings/appearance/appearance-section";
import { LayoutSection } from "@/screens/settings/layout/layout-section";
import {
  useAppSettings,
  useSettings,
  parseTerminalScrollbackLines,
  type AppSettings,
  type SendBehavior,
  type ServiceUrlBehavior,
  type Settings as EffectiveSettings,
} from "@/hooks/use-settings";
import { useHostRuntimeIsConnected, useHosts } from "@/runtime/host-runtime";
import { useSessionStore } from "@/stores/session-store";
import {
  orderHostsLocalFirst,
  resolveActiveHostServerId,
  type HostProfile,
} from "@/types/host-connection";
import { TitlebarDragRegion } from "@/components/desktop/titlebar-drag-region";
import { WindowChromeRegion, WindowChromeSafeArea } from "@/utils/desktop-window";
import { confirmDialog } from "@/utils/confirm-dialog";
import { BackHeader } from "@/components/headers/back-header";
import { ScreenHeader } from "@/components/headers/screen-header";
import { AddHostMethodModal } from "@/components/add-host-method-modal";
import { AddHostModal } from "@/components/add-host-modal";
import { AddRemoteSshHostModal } from "@/components/add-remote-ssh-host-modal";
import { PairLinkModal } from "@/components/pair-link-modal";
import { KeyboardShortcutsSection } from "@/screens/settings/keyboard-shortcuts-section";
import { EditorSection } from "@/screens/settings/editor-section";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { DesktopPermissionsSection } from "@/desktop/components/desktop-permissions-section";
import { DesktopNotificationsSection } from "@/desktop/components/desktop-notifications-section";
import { BrowserDataSection } from "@/desktop/browser/settings/browser-data-section";
import { IntegrationsSection } from "@/desktop/components/integrations-section";
import { isElectronRuntime } from "@/desktop/host";
import { useDesktopAppUpdater } from "@/desktop/updates/use-desktop-app-updater";
import { formatVersionWithPrefix } from "@/desktop/updates/desktop-updates";
import { resolveAppVersion } from "@/utils/app-version";
import { openChangelog } from "@/changelog";
import { useAppDiagnosticStore } from "@/diagnostics/store";
import { settingsStyles } from "@/styles/settings";
import { THINKING_TONE_NATIVE_PCM_BASE64 } from "@/utils/thinking-tone.native-pcm";
import { useVoiceAudioEngineOptional } from "@/contexts/voice-context";
import {
  LANGUAGE_OPTIONS,
  formatLanguageOptionLabel,
  parseAppLanguage,
  type AppLanguage,
  type SupportedLocale,
} from "@/i18n/locales";
import {
  HostConnectionsPage,
  HostPairDevicePage,
  HostAgentsPage,
  HostSettingsPage,
  HostWorkspacesPage,
  HostTerminalsPage,
} from "@/screens/settings/host-page";
import { PluginSettingsContent } from "@/plugins/settings";
import { useInstalledPlugins } from "@/plugins/registry";
import { HostPluginsPage } from "@/screens/settings/plugins-page";
import { MetadataGenerationPage } from "@/screens/settings/metadata-generation-page";
import { HostDefaultModelsPage } from "@/screens/settings/default-models/default-models-page";
import ProjectsScreen from "@/screens/projects-screen";
import { ProjectSettingsPage } from "@/screens/settings/project-settings-page";
import { useProjects } from "@/hooks/use-projects";
import { getProjectHostEntry, getProjectSummaryForHostProject } from "@/utils/projects";
import { SETTINGS_DESKTOP_SIDEBAR_WIDTH, useIsCompactFormFactor } from "@/constants/layout";
import { useLocalDaemonServerId } from "@/hooks/use-is-local-daemon";
import {
  type EnableBuiltInDaemonOption,
  useEnableBuiltInDaemonOption,
} from "@/desktop/hooks/use-enable-built-in-daemon-option";
import {
  DEFAULT_PROJECT_SETTINGS_SECTION,
  buildProjectSettingsRoute,
  buildSettingsHostSectionRoute,
  buildSettingsSectionRoute,
  type HostSectionSlug,
  type ProjectSettingsSectionSlug,
  type SettingsSectionSlug,
} from "@/utils/host-routes";
import { ProjectIconView } from "@/components/project-icon-view";
import { useHostProjects, type HostProject } from "@/screens/settings/use-host-projects";
import { useLastWorkspaceSelection } from "@/stores/navigation-active-workspace-store";
import { returnFromSettings, type SettingsView } from "@/navigation/settings-navigation";
import { isNative, isWeb } from "@/constants/platform";

// ---------------------------------------------------------------------------
// View model
// ---------------------------------------------------------------------------

type NavIcon = ComponentType<{ size: number; color: string }>;

type SidebarNavItem =
  | {
      kind: "section";
      id: SettingsSectionSlug;
      labelKey: string;
      icon: NavIcon;
      desktopOnly?: boolean;
    }
  | { kind: "host"; id: HostSectionSlug; labelKey: string; icon: NavIcon };

const SECTION_NAV_ITEMS = {
  general: {
    kind: "section",
    id: "general",
    labelKey: "settings.sections.general",
    icon: SlidersHorizontal,
  },
  appearance: {
    kind: "section",
    id: "appearance",
    labelKey: "settings.sections.appearance",
    icon: Palette,
  },
  shortcuts: {
    kind: "section",
    id: "shortcuts",
    labelKey: "settings.sections.shortcuts",
    icon: Keyboard,
    desktopOnly: true,
  },
  about: { kind: "section", id: "about", labelKey: "settings.sections.about", icon: Info },
} satisfies Record<SettingsSectionSlug, SidebarNavItem>;

const HOST_NAV_ITEMS = {
  projects: {
    kind: "host",
    id: "projects",
    labelKey: "settings.hostSections.projects",
    icon: FolderGit2,
  },
  models: { kind: "host", id: "models", labelKey: "settings.defaultModels.title", icon: Cpu },
  agents: { kind: "host", id: "agents", labelKey: "settings.hostSections.agents", icon: Bot },
  environment: {
    kind: "host",
    id: "environment",
    labelKey: "settings.hostSections.environment",
    icon: SquareTerminal,
  },
  connections: {
    kind: "host",
    id: "connections",
    labelKey: "settings.hostSections.connections",
    icon: Network,
  },
  plugins: { kind: "host", id: "plugins", labelKey: "settings.hostSections.plugins", icon: Blocks },
  host: { kind: "host", id: "host", labelKey: "settings.hostSections.advanced", icon: Wrench },
} satisfies Record<HostSectionSlug, SidebarNavItem>;

interface SidebarNavGroup {
  labelKey: string;
  items: SidebarNavItem[];
}

// Projects are listed in their own Repositories group between these.
const LEADING_NAV_GROUPS: SidebarNavGroup[] = [
  {
    labelKey: "settings.groups.personal",
    items: [
      SECTION_NAV_ITEMS.general,
      SECTION_NAV_ITEMS.appearance,
      SECTION_NAV_ITEMS.shortcuts,
      HOST_NAV_ITEMS.models,
    ],
  },
  {
    labelKey: "settings.groups.agentsEnvironment",
    items: [
      HOST_NAV_ITEMS.agents,
      HOST_NAV_ITEMS.environment,
      HOST_NAV_ITEMS.connections,
      HOST_NAV_ITEMS.plugins,
    ],
  },
];

const TRAILING_NAV_GROUPS: SidebarNavGroup[] = [
  { labelKey: "settings.groups.more", items: [HOST_NAV_ITEMS.host, SECTION_NAV_ITEMS.about] },
];

function renderHostSettingsContent(
  view: Extract<SettingsView, { kind: "host" }>,
  onHostRemoved: () => void,
): ReactNode {
  switch (view.section) {
    case "projects":
      return <ProjectsScreen serverId={view.serverId} />;
    case "models":
      return <HostDefaultModelsPage serverId={view.serverId} />;
    case "agents":
      return <HostAgentsPage serverId={view.serverId} />;
    case "environment":
      return (
        <>
          <HostWorkspacesPage serverId={view.serverId} />
          <HostTerminalsPage serverId={view.serverId} />
          <MetadataGenerationPage serverId={view.serverId} />
        </>
      );
    case "connections":
      return (
        <>
          <HostConnectionsPage serverId={view.serverId} />
          <HostPairDevicePage serverId={view.serverId} />
        </>
      );
    case "plugins":
      return <HostPluginsPage serverId={view.serverId} />;
    case "host":
      return <HostSettingsPage serverId={view.serverId} onHostRemoved={onHostRemoved} />;
  }
}

// The Default models board lays out five slots and a column per provider side by side.
function settingsContentStyle(view: SettingsView, isCompact: boolean) {
  const isWide = view.kind === "host" && view.section === "models";
  if (isCompact) return styles.content;
  return isWide ? [styles.desktopContent, styles.contentWide] : styles.desktopContent;
}

// ---------------------------------------------------------------------------
// Trigger + sidebar style helpers
// ---------------------------------------------------------------------------

function themeTriggerStyle({ pressed }: PressableStateCallbackType) {
  return [styles.themeTrigger, pressed && { opacity: 0.85 }];
}

function sidebarItemStyle({ hovered }: PressableStateCallbackType & { hovered?: boolean }) {
  return [sidebarStyles.item, Boolean(hovered) && sidebarStyles.itemHovered];
}

function selectedSidebarItemStyle({ hovered }: PressableStateCallbackType & { hovered?: boolean }) {
  return [
    sidebarStyles.item,
    Boolean(hovered) && sidebarStyles.itemHovered,
    sidebarStyles.itemSelected,
  ];
}

function getSendBehaviorOptions(t: TFunction) {
  return [
    { value: "interrupt" as const, label: t("settings.general.defaultSend.options.interrupt") },
    { value: "steer" as const, label: t("settings.general.defaultSend.options.steer") },
    { value: "queue" as const, label: t("settings.general.defaultSend.options.queue") },
  ];
}

function getServiceUrlBehaviorLabel(t: TFunction, value: ServiceUrlBehavior): string {
  const labels: Record<ServiceUrlBehavior, string> = {
    ask: t("settings.general.serviceUrls.options.ask"),
    "in-app": t("settings.general.serviceUrls.options.inApp"),
    external: t("settings.general.serviceUrls.options.external"),
  };
  return labels[value];
}

function getActiveLocale(language: string | undefined): SupportedLocale {
  const parsed = parseAppLanguage(language);
  return parsed && parsed !== "system" ? parsed : "en";
}

const SERVICE_URL_BEHAVIOR_VALUES: ServiceUrlBehavior[] = ["ask", "in-app", "external"];

// ---------------------------------------------------------------------------
// Section components
// ---------------------------------------------------------------------------

interface GeneralSectionProps {
  settings: AppSettings;
  isDesktopApp: boolean;
  handleSendBehaviorChange: (behavior: SendBehavior) => void;
  handleServiceUrlBehaviorChange: (behavior: ServiceUrlBehavior) => void;
  handleLanguageChange: (language: AppLanguage) => void;
  handleTerminalScrollbackLinesChange: (lines: number) => void;
}

interface ServiceUrlBehaviorMenuItemProps {
  value: ServiceUrlBehavior;
  label: string;
  selected: boolean;
  onChange: (value: ServiceUrlBehavior) => void;
}

interface SendBehaviorMenuItemProps {
  value: SendBehavior;
  label: string;
  selected: boolean;
  onChange: (value: SendBehavior) => void;
}

function SendBehaviorMenuItem({ value, label, selected, onChange }: SendBehaviorMenuItemProps) {
  const handleSelect = useCallback(() => {
    onChange(value);
  }, [onChange, value]);
  return (
    <DropdownMenuItem selected={selected} onSelect={handleSelect}>
      {label}
    </DropdownMenuItem>
  );
}

function ServiceUrlBehaviorMenuItem({
  value,
  label,
  selected,
  onChange,
}: ServiceUrlBehaviorMenuItemProps) {
  const handleSelect = useCallback(() => {
    onChange(value);
  }, [onChange, value]);
  return (
    <DropdownMenuItem selected={selected} onSelect={handleSelect}>
      {label}
    </DropdownMenuItem>
  );
}

interface LanguageMenuItemProps {
  value: AppLanguage;
  activeLocale: SupportedLocale;
  selected: boolean;
  onChange: (value: AppLanguage) => void;
}

function LanguageMenuItem({ value, activeLocale, selected, onChange }: LanguageMenuItemProps) {
  const { t } = useTranslation();
  const handleSelect = useCallback(() => {
    onChange(value);
  }, [onChange, value]);
  const option = LANGUAGE_OPTIONS.find((entry) => entry.value === value);
  const label = option
    ? formatLanguageOptionLabel(option, activeLocale, t(option.labelKey))
    : value;

  return (
    <DropdownMenuItem selected={selected} onSelect={handleSelect}>
      {label}
    </DropdownMenuItem>
  );
}

function GeneralSection({
  settings,
  isDesktopApp,
  handleSendBehaviorChange,
  handleServiceUrlBehaviorChange,
  handleLanguageChange,
  handleTerminalScrollbackLinesChange,
}: GeneralSectionProps) {
  const { t, i18n } = useTranslation();
  const activeLocale = getActiveLocale(i18n.language);
  const sendBehaviorOptions = useMemo(() => getSendBehaviorOptions(t), [t]);
  const selectedSendBehaviorLabel =
    sendBehaviorOptions.find((option) => option.value === settings.sendBehavior)?.label ??
    settings.sendBehavior;
  const sendBehaviorDescriptionKey = `settings.general.defaultSend.descriptions.${settings.sendBehavior}`;
  const selectedLanguageOption = LANGUAGE_OPTIONS.find(
    (option) => option.value === settings.language,
  );
  const selectedLanguageLabel = selectedLanguageOption
    ? formatLanguageOptionLabel(
        selectedLanguageOption,
        activeLocale,
        t(selectedLanguageOption.labelKey),
      )
    : settings.language;
  const [terminalScrollbackValue, setTerminalScrollbackValue] = useState(
    String(settings.terminalScrollbackLines),
  );

  const handleTerminalScrollbackChangeText = useCallback((value: string) => {
    setTerminalScrollbackValue(value.replace(/[^\d]/g, ""));
  }, []);

  const commitTerminalScrollback = useCallback(() => {
    const parsed = parseTerminalScrollbackLines(terminalScrollbackValue);
    const nextValue = parsed ?? settings.terminalScrollbackLines;
    setTerminalScrollbackValue(String(nextValue));
    if (nextValue !== settings.terminalScrollbackLines) {
      handleTerminalScrollbackLinesChange(nextValue);
    }
  }, [
    handleTerminalScrollbackLinesChange,
    settings.terminalScrollbackLines,
    terminalScrollbackValue,
  ]);

  useEffect(() => {
    setTerminalScrollbackValue(String(settings.terminalScrollbackLines));
  }, [settings.terminalScrollbackLines]);

  return (
    <View style={settingsStyles.section}>
      <View style={settingsStyles.card}>
        <View style={settingsStyles.row}>
          <View style={settingsStyles.rowContent}>
            <Text style={settingsStyles.rowTitle}>{t("settings.general.defaultSend.label")}</Text>
            <Text style={settingsStyles.rowHint}>{t(sendBehaviorDescriptionKey)}</Text>
          </View>
          <DropdownMenu>
            <DropdownTrigger
              accessibilityRole="button"
              accessibilityLabel={`${t("settings.general.defaultSend.label")}: ${selectedSendBehaviorLabel}`}
              style={themeTriggerStyle}
            >
              <Text style={styles.themeTriggerText}>{selectedSendBehaviorLabel}</Text>
            </DropdownTrigger>
            <DropdownMenuContent side="bottom" align="end" width={200}>
              {sendBehaviorOptions.map((option) => (
                <SendBehaviorMenuItem
                  key={option.value}
                  value={option.value}
                  label={option.label}
                  selected={settings.sendBehavior === option.value}
                  onChange={handleSendBehaviorChange}
                />
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </View>
        <View style={[settingsStyles.row, settingsStyles.rowBorder]}>
          <View style={settingsStyles.rowContent}>
            <Text style={settingsStyles.rowTitle}>{t("settings.general.language.label")}</Text>
            <Text style={settingsStyles.rowHint}>{t("settings.general.language.description")}</Text>
          </View>
          <DropdownMenu>
            <DropdownTrigger
              accessibilityRole="button"
              accessibilityLabel={selectedLanguageLabel}
              style={themeTriggerStyle}
            >
              <Text style={styles.themeTriggerText}>{selectedLanguageLabel}</Text>
            </DropdownTrigger>
            <DropdownMenuContent side="bottom" align="end" width={300}>
              {LANGUAGE_OPTIONS.map((option) => (
                <LanguageMenuItem
                  key={option.value}
                  value={option.value}
                  activeLocale={activeLocale}
                  selected={settings.language === option.value}
                  onChange={handleLanguageChange}
                />
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </View>
        {isDesktopApp ? (
          <View style={[settingsStyles.row, settingsStyles.rowBorder]}>
            <View style={settingsStyles.rowContent}>
              <Text style={settingsStyles.rowTitle}>{t("settings.general.serviceUrls.label")}</Text>
              <Text style={settingsStyles.rowHint}>
                {t("settings.general.serviceUrls.description")}
              </Text>
            </View>
            <DropdownMenu>
              <DropdownTrigger style={themeTriggerStyle}>
                <Text style={styles.themeTriggerText}>
                  {getServiceUrlBehaviorLabel(t, settings.serviceUrlBehavior)}
                </Text>
              </DropdownTrigger>
              <DropdownMenuContent side="bottom" align="end" width={200}>
                {SERVICE_URL_BEHAVIOR_VALUES.map((value) => (
                  <ServiceUrlBehaviorMenuItem
                    key={value}
                    value={value}
                    label={getServiceUrlBehaviorLabel(t, value)}
                    selected={settings.serviceUrlBehavior === value}
                    onChange={handleServiceUrlBehaviorChange}
                  />
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </View>
        ) : null}
        <View style={[settingsStyles.row, settingsStyles.rowBorder]}>
          <View style={settingsStyles.rowContent}>
            <Text style={settingsStyles.rowTitle}>
              {t("settings.general.terminalScrollback.label")}
            </Text>
            <Text style={settingsStyles.rowHint}>
              {t("settings.general.terminalScrollback.description")}
            </Text>
          </View>
          <TextInput
            initialValue={terminalScrollbackValue}
            onChangeText={handleTerminalScrollbackChangeText}
            onBlur={commitTerminalScrollback}
            onSubmitEditing={commitTerminalScrollback}
            keyboardType="number-pad"
            inputMode="numeric"
            selectTextOnFocus
            style={styles.terminalScrollbackInput}
            accessibilityLabel={t("settings.general.terminalScrollback.accessibilityLabel")}
          />
        </View>
      </View>
    </View>
  );
}

interface DiagnosticsSectionProps {
  useLegacyTerminalRenderer: boolean;
  onUseLegacyTerminalRendererChange: (value: boolean) => void;
  voiceAudioEngine: ReturnType<typeof useVoiceAudioEngineOptional>;
  isPlaybackTestRunning: boolean;
  playbackTestResult: string | null;
  handlePlaybackTest: () => Promise<void>;
}

function DiagnosticsSection({
  useLegacyTerminalRenderer,
  onUseLegacyTerminalRendererChange,
  voiceAudioEngine,
  isPlaybackTestRunning,
  playbackTestResult,
  handlePlaybackTest,
}: DiagnosticsSectionProps) {
  const { t } = useTranslation();
  const openAppDiagnostic = useAppDiagnosticStore((state) => state.open);
  const handlePlayPress = useCallback(() => {
    void handlePlaybackTest();
  }, [handlePlaybackTest]);
  return (
    <SettingsSection title={t("settings.diagnostics.title")}>
      <View style={settingsStyles.card}>
        {isNative ? (
          <View style={settingsStyles.row} testID="legacy-terminal-renderer-row">
            <View style={settingsStyles.rowContent}>
              <Text style={settingsStyles.rowTitle}>
                {t("settings.diagnostics.legacyTerminalRenderer.label")}
              </Text>
              <Text style={settingsStyles.rowHint}>
                {t("settings.diagnostics.legacyTerminalRenderer.description")}
              </Text>
            </View>
            <Switch
              value={useLegacyTerminalRenderer}
              onValueChange={onUseLegacyTerminalRendererChange}
              accessibilityLabel={t(
                "settings.diagnostics.legacyTerminalRenderer.accessibilityLabel",
              )}
              testID="legacy-terminal-renderer-switch"
            />
          </View>
        ) : null}
        <View style={settingsStyles.row} testID="app-diagnostic-row">
          <View style={settingsStyles.rowContent}>
            <Text style={settingsStyles.rowTitle}>{t("settings.diagnostics.app.rowTitle")}</Text>
            <Text style={settingsStyles.rowHint}>{t("settings.diagnostics.app.rowHint")}</Text>
          </View>
          <Button variant="secondary" size="sm" onPress={openAppDiagnostic}>
            {t("settings.diagnostics.app.run")}
          </Button>
        </View>
        <View style={settingsStyles.row}>
          <View style={settingsStyles.rowContent}>
            <Text style={settingsStyles.rowTitle}>{t("settings.diagnostics.testAudio")}</Text>
            {playbackTestResult ? (
              <Text style={settingsStyles.rowHint}>{playbackTestResult}</Text>
            ) : null}
          </View>
          <Button
            variant="secondary"
            size="sm"
            onPress={handlePlayPress}
            disabled={!voiceAudioEngine || isPlaybackTestRunning}
          >
            {isPlaybackTestRunning
              ? t("settings.diagnostics.playing")
              : t("settings.diagnostics.playTest")}
          </Button>
        </View>
      </View>
    </SettingsSection>
  );
}

interface AboutSectionProps {
  appVersion: string | null;
  appVersionText: string;
  isDesktopApp: boolean;
}

function AboutSection({ appVersion, appVersionText, isDesktopApp }: AboutSectionProps) {
  const { t } = useTranslation();
  return (
    <>
      <View style={settingsStyles.section}>
        <View style={settingsStyles.card}>
          <View style={settingsStyles.row}>
            <View style={settingsStyles.rowContent}>
              <Text style={settingsStyles.rowTitle}>{t("settings.about.appVersion")}</Text>
              <Text style={settingsStyles.rowHint}>{t("settings.about.thisDevice")}</Text>
            </View>
            <Text style={styles.aboutValue}>{appVersionText}</Text>
          </View>
          <WhatsNewRow />
          {isDesktopApp ? <DesktopAppUpdateRow /> : null}
        </View>
      </View>
      <ConnectedHostsSection clientVersion={appVersion} />
    </>
  );
}

function WhatsNewRow() {
  const { t } = useTranslation();
  const { theme } = useUnistyles();

  return (
    <Pressable
      style={[settingsStyles.row, settingsStyles.rowBorder]}
      onPress={openChangelog}
      accessibilityRole="button"
      testID="settings-whats-new"
    >
      {({ hovered }: PressableStateCallbackType & { hovered?: boolean }) => (
        <>
          <View style={settingsStyles.rowContent}>
            <Text style={settingsStyles.rowTitle}>{t("changelog.title")}</Text>
            <Text style={settingsStyles.rowHint}>{t("settings.about.whatsNewHint")}</Text>
          </View>
          <ChevronRight
            size={theme.iconSize.sm}
            color={hovered ? theme.colors.foreground : theme.colors.foregroundMuted}
          />
        </>
      )}
    </Pressable>
  );
}

function normalizeVersion(version: string | null | undefined): string | null {
  const trimmed = version?.trim();
  if (!trimmed) return null;
  return trimmed.replace(/^v/i, "");
}

function ConnectedHostsSection({ clientVersion }: { clientVersion: string | null }) {
  const { t } = useTranslation();
  const hosts = useHosts();
  if (hosts.length === 0) {
    return null;
  }
  return (
    <SettingsSection title={t("settings.about.connectedHosts")}>
      <View style={settingsStyles.card}>
        {hosts.map((host, index) => (
          <HostVersionRow
            key={host.serverId}
            host={host}
            showBorder={index > 0}
            clientVersion={clientVersion}
          />
        ))}
      </View>
    </SettingsSection>
  );
}

function HostVersionRow({
  host,
  showBorder,
  clientVersion,
}: {
  host: HostProfile;
  showBorder: boolean;
  clientVersion: string | null;
}) {
  const { t } = useTranslation();
  const isConnected = useHostRuntimeIsConnected(host.serverId);
  const daemonVersion = useSessionStore(
    (state) => state.sessions[host.serverId]?.serverInfo?.version ?? null,
  );

  const rowStyle = useMemo(
    () => [settingsStyles.row, showBorder && settingsStyles.rowBorder],
    [showBorder],
  );

  const normalizedHost = normalizeVersion(daemonVersion);
  const normalizedClient = normalizeVersion(clientVersion);
  const isMismatch =
    normalizedHost !== null && normalizedClient !== null && normalizedHost !== normalizedClient;

  let valueText: string;
  if (!isConnected) {
    valueText = t("settings.about.offline");
  } else if (normalizedHost) {
    valueText = formatVersionWithPrefix(normalizedHost);
  } else {
    valueText = "—";
  }

  const valueStyle = useMemo(
    () => [styles.aboutValue, isMismatch && styles.aboutVersionMismatch],
    [isMismatch],
  );

  return (
    <View style={rowStyle}>
      <View style={settingsStyles.rowContent}>
        <Text style={settingsStyles.rowTitle} numberOfLines={1}>
          {host.label}
        </Text>
        {isMismatch ? (
          <Text style={settingsStyles.rowHint}>{t("settings.about.versionDiffers")}</Text>
        ) : null}
      </View>
      <Text style={valueStyle}>{valueText}</Text>
    </View>
  );
}

function getUpdateButtonLabel(
  t: TFunction,
  isInstalling: boolean,
  latestVersion: string | null | undefined,
): string {
  if (isInstalling) return t("settings.about.updates.installing");
  if (latestVersion) {
    return t("settings.about.updates.updateTo", {
      version: formatVersionWithPrefix(latestVersion),
    });
  }
  return t("settings.about.updates.update");
}

function DesktopAppUpdateRow() {
  const { t } = useTranslation();
  const { settings, updateSettings } = useSettings();
  const {
    isDesktopApp,
    statusText,
    availableUpdate,
    errorMessage,
    isChecking,
    isInstalling,
    checkForUpdates,
    installUpdate,
  } = useDesktopAppUpdater();

  useFocusEffect(
    useCallback(() => {
      if (!isDesktopApp) {
        return undefined;
      }
      void checkForUpdates({ intent: "automatic", silent: true });
      return undefined;
    }, [checkForUpdates, isDesktopApp]),
  );

  const handleCheckForUpdates = useCallback(() => {
    if (!isDesktopApp) {
      return;
    }
    void checkForUpdates();
  }, [checkForUpdates, isDesktopApp]);

  const handleReleaseChannelChange = useCallback(
    (releaseChannel: EffectiveSettings["releaseChannel"]) => {
      void updateSettings({ releaseChannel });
    },
    [updateSettings],
  );
  const releaseChannelOptions = useMemo(
    () => [
      { value: "stable" as const, label: t("settings.about.releaseChannel.stable") },
      { value: "beta" as const, label: t("settings.about.releaseChannel.beta") },
    ],
    [t],
  );

  const handleInstallUpdate = useCallback(() => {
    if (!isDesktopApp) {
      return;
    }

    void confirmDialog({
      title: t("settings.about.updates.installTitle"),
      message: t("settings.about.updates.installMessage"),
      confirmLabel: t("settings.about.updates.installConfirm"),
      cancelLabel: t("common.actions.cancel"),
    })
      .then((confirmed) => {
        if (!confirmed) {
          return;
        }
        void installUpdate();
        return;
      })
      .catch((error) => {
        console.error("[Settings] Failed to open app update confirmation", error);
        Alert.alert(
          t("settings.about.updates.alertTitle"),
          t("settings.about.updates.alertMessage"),
        );
      });
  }, [installUpdate, isDesktopApp, t]);

  const isUpdateReady = availableUpdate?.readyToInstall === true;
  const readyUpdateVersion = isUpdateReady ? availableUpdate?.latestVersion : null;

  if (!isDesktopApp) {
    return null;
  }

  return (
    <>
      <View style={[settingsStyles.row, settingsStyles.rowBorder]}>
        <View style={settingsStyles.rowContent}>
          <Text style={settingsStyles.rowTitle}>{t("settings.about.releaseChannel.label")}</Text>
          <Text style={settingsStyles.rowHint}>
            {t("settings.about.releaseChannel.description")}
          </Text>
        </View>
        <SegmentedControl
          size="sm"
          value={settings.releaseChannel}
          onValueChange={handleReleaseChannelChange}
          options={releaseChannelOptions}
        />
      </View>
      <View style={[settingsStyles.row, settingsStyles.rowBorder]}>
        <View style={settingsStyles.rowContent}>
          <Text style={settingsStyles.rowTitle}>{t("settings.about.updates.label")}</Text>
          <Text style={settingsStyles.rowHint}>{statusText}</Text>
          {readyUpdateVersion ? (
            <Text style={settingsStyles.rowHint}>
              {t("settings.about.updates.readyToInstall", {
                version: formatVersionWithPrefix(readyUpdateVersion),
              })}
            </Text>
          ) : null}
          {errorMessage ? <Text style={styles.aboutErrorText}>{errorMessage}</Text> : null}
        </View>
        <View style={styles.aboutUpdateActions}>
          <Button
            variant="outline"
            size="sm"
            onPress={handleCheckForUpdates}
            disabled={isChecking || isInstalling}
          >
            {isChecking ? t("settings.about.updates.checking") : t("settings.about.updates.check")}
          </Button>
          <Button
            variant="default"
            size="sm"
            onPress={handleInstallUpdate}
            disabled={isChecking || isInstalling || !isUpdateReady}
          >
            {getUpdateButtonLabel(t, isInstalling, readyUpdateVersion)}
          </Button>
        </View>
      </View>
    </>
  );
}

// ---------------------------------------------------------------------------
// Sidebar
// ---------------------------------------------------------------------------

// Each sidebar selection replaces the route, which remounts the screen. Keep
// the sidebar offset outside React so the new instance restores it.
let persistedSidebarScrollY = 0;

function usePersistedSidebarScroll() {
  const scrollRef = useRef<ScrollView>(null);
  const hasRestoredRef = useRef(persistedSidebarScrollY === 0);

  const onScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    persistedSidebarScrollY = event.nativeEvent.contentOffset.y;
  }, []);

  const onContentSizeChange = useCallback(() => {
    if (hasRestoredRef.current) return;
    hasRestoredRef.current = true;
    scrollRef.current?.scrollTo({ y: persistedSidebarScrollY, animated: false });
  }, []);

  return { scrollRef, onScroll, onContentSizeChange };
}

/**
 * Local daemon first, then remaining hosts in their existing order.
 */
function useSortedHosts(hosts: HostProfile[], localServerId: string | null): HostProfile[] {
  return useMemo(() => orderHostsLocalFirst(hosts, localServerId), [hosts, localServerId]);
}

interface SidebarNavButtonProps {
  item: SidebarNavItem;
  isSelected: boolean;
  onSelectSection: (section: SettingsSectionSlug) => void;
  onSelectHostSection: (section: HostSectionSlug) => void;
}

function SidebarNavButton({
  item,
  isSelected,
  onSelectSection,
  onSelectHostSection,
}: SidebarNavButtonProps) {
  const { theme } = useUnistyles();
  const { t } = useTranslation();
  const handlePress = useCallback(() => {
    if (item.kind === "section") onSelectSection(item.id);
    else onSelectHostSection(item.id);
  }, [item, onSelectHostSection, onSelectSection]);
  const accessibilityState = useMemo(() => ({ selected: isSelected }), [isSelected]);
  const labelStyle = useMemo(
    () => [sidebarStyles.label, isSelected && { color: theme.colors.foreground }],
    [isSelected, theme.colors.foreground],
  );
  const IconComponent = item.icon;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={accessibilityState}
      onPress={handlePress}
      testID={
        item.kind === "host" ? `settings-host-section-${item.id}` : `settings-section-${item.id}`
      }
      style={isSelected ? selectedSidebarItemStyle : sidebarItemStyle}
    >
      <IconComponent
        size={theme.iconSize.md}
        color={isSelected ? theme.colors.foreground : theme.colors.foregroundMuted}
      />
      <Text style={labelStyle} numberOfLines={1}>
        {t(item.labelKey)}
      </Text>
    </Pressable>
  );
}

interface SidebarProjectsGroupProps {
  serverId: string;
  selectedProjectId: string | null;
  onSelectProject: (projectId: string) => void;
}

function SidebarProjectsGroup({
  serverId,
  selectedProjectId,
  onSelectProject,
}: SidebarProjectsGroupProps) {
  const { t } = useTranslation();
  const { hostProjects, iconDataByProjectViewKey } = useHostProjects(serverId);

  if (hostProjects.length === 0) return null;

  return (
    <View style={sidebarStyles.list} testID="settings-sidebar-projects">
      <Text style={sidebarStyles.groupLabel}>{t("settings.groups.repositories")}</Text>
      {hostProjects.map((entry) => (
        <SidebarProjectItem
          key={entry.host.projectId}
          entry={entry}
          iconDataUri={iconDataByProjectViewKey.get(entry.project.viewKey) ?? null}
          isSelected={entry.host.projectId === selectedProjectId}
          onSelect={onSelectProject}
        />
      ))}
    </View>
  );
}

interface SidebarProjectItemProps {
  entry: HostProject;
  iconDataUri: string | null;
  isSelected: boolean;
  onSelect: (projectId: string) => void;
}

function SidebarProjectItem({ entry, iconDataUri, isSelected, onSelect }: SidebarProjectItemProps) {
  const { theme } = useUnistyles();
  const { projectId, projectName } = entry.host;
  const handlePress = useCallback(() => onSelect(projectId), [onSelect, projectId]);
  const accessibilityState = useMemo(() => ({ selected: isSelected }), [isSelected]);
  const labelStyle = useMemo(
    () => [sidebarStyles.label, isSelected && { color: theme.colors.foreground }],
    [isSelected, theme.colors.foreground],
  );
  const initial = projectName.trim().charAt(0).toUpperCase() || "?";

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={accessibilityState}
      onPress={handlePress}
      testID={`settings-sidebar-project-${projectId}`}
      style={isSelected ? selectedSidebarItemStyle : sidebarItemStyle}
    >
      <View style={sidebarStyles.projectIcon}>
        <ProjectIconView
          iconDataUri={iconDataUri}
          initial={initial}
          projectViewKey={entry.project.viewKey}
          size={theme.iconSize.md}
          textStyle={sidebarStyles.projectIconFallbackText}
        />
      </View>
      <Text style={labelStyle} numberOfLines={1}>
        {projectName}
      </Text>
    </Pressable>
  );
}

interface HostPickerProps {
  activeServerId: string | null;
  sortedHosts: HostProfile[];
  onSelectHost: (serverId: string) => void;
  onAddHost: () => void;
  enableBuiltInDaemonOption: EnableBuiltInDaemonOption;
}

/**
 * Scopes the host sections to a host. Reuses the canonical sidebar host
 * switcher pattern (left-sidebar.tsx): a quiet row-styled trigger opening a
 * <Combobox>. The local host is listed first, each row shows the connection it
 * is using right now; an "Add host" row is always reachable from the list —
 * even with a single host.
 */
function HostPicker({
  activeServerId,
  sortedHosts,
  onSelectHost,
  onAddHost,
  enableBuiltInDaemonOption,
}: HostPickerProps) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<View | null>(null);
  const activeHost =
    sortedHosts.find((host) => host.serverId === activeServerId) ?? sortedHosts[0] ?? null;

  const handleOpen = useCallback(() => setIsOpen(true), []);
  const hostOptionTestID = useCallback(
    (serverId: string) => `settings-host-picker-item-${serverId}`,
    [],
  );
  const triggerStyle = useCallback(
    ({ hovered = false }: PressableStateCallbackType & { hovered?: boolean }) => [
      sidebarStyles.pickerTrigger,
      hovered && sidebarStyles.pickerTriggerHovered,
    ],
    [],
  );

  return (
    <SharedHostPicker
      hosts={sortedHosts}
      value={activeServerId ?? ""}
      onSelect={onSelectHost}
      open={isOpen}
      onOpenChange={setIsOpen}
      anchorRef={triggerRef}
      includeAddHost
      onAddHost={onAddHost}
      includeEnableBuiltInDaemon={enableBuiltInDaemonOption.visible}
      onEnableBuiltInDaemon={enableBuiltInDaemonOption.onPress}
      showActiveConnection
      searchable={false}
      title={t("settings.hostPicker.switchHost")}
      desktopMinWidth={240}
      addHostTestID="settings-add-host"
      hostOptionTestID={hostOptionTestID}
    >
      <ComboboxTrigger
        ref={triggerRef}
        block
        style={triggerStyle}
        onPress={handleOpen}
        accessibilityRole="button"
        accessibilityLabel={t("settings.hostPicker.switchHost")}
        testID="settings-host-picker"
      >
        {activeHost ? (
          <View style={sidebarStyles.pickerTriggerDot}>
            <HostStatusDot serverId={activeHost.serverId} />
          </View>
        ) : null}
        <Text style={sidebarStyles.pickerTriggerLabel} numberOfLines={1}>
          {activeHost?.label ?? t("settings.groups.host")}
        </Text>
      </ComboboxTrigger>
    </SharedHostPicker>
  );
}

interface SettingsSidebarProps {
  view: SettingsView;
  onSelectSection: (section: SettingsSectionSlug) => void;
  onSelectHostSection: (section: HostSectionSlug) => void;
  onSelectProject: (projectId: string) => void;
  onSelectHost: (serverId: string) => void;
  onAddHost: () => void;
  onBackToWorkspace: () => void;
  activeHostServerId: string | null;
  layout: "desktop" | "mobile";
}

function SettingsSidebar({
  view,
  onSelectSection,
  onSelectHostSection,
  onSelectProject,
  onSelectHost,
  onAddHost,
  onBackToWorkspace,
  activeHostServerId,
  layout,
}: SettingsSidebarProps) {
  const { theme } = useUnistyles();
  const { t } = useTranslation();
  const hosts = useHosts();
  const localServerId = useLocalDaemonServerId();
  const sortedHosts = useSortedHosts(hosts, localServerId);
  const hasHosts = sortedHosts.length > 0;
  const enableBuiltInDaemonOption = useEnableBuiltInDaemonOption();
  const isDesktopApp = isElectronRuntime();
  const insets = useSafeAreaInsets();
  const isDesktop = layout === "desktop";
  const outerContainerStyle = useMemo(
    () => [isDesktop ? sidebarStyles.desktopContainer : sidebarStyles.mobileContainer],
    [isDesktop],
  );
  const innerContainerStyle = useMemo(
    () => [{ flex: 1 }, isDesktop ? { paddingTop: insets.top } : null],
    [insets.top, isDesktop],
  );
  const sidebarScroll = usePersistedSidebarScroll();
  let selectedHostSection: HostSectionSlug | null = null;
  if (view.kind === "host") selectedHostSection = view.section;
  if (view.kind === "plugin") selectedHostSection = "plugins";

  const isItemVisible = (item: SidebarNavItem) =>
    item.kind === "host" ? hasHosts : !item.desktopOnly || isDesktopApp;
  const isItemSelected = (item: SidebarNavItem) =>
    item.kind === "host"
      ? selectedHostSection === item.id
      : view.kind === "section" && view.section === item.id;

  const renderGroup = (group: SidebarNavGroup) => {
    const visibleItems = group.items.filter(isItemVisible);
    if (visibleItems.length === 0) return null;
    return (
      <View key={group.labelKey} style={sidebarStyles.list}>
        <Text style={sidebarStyles.groupLabel}>{t(group.labelKey)}</Text>
        {visibleItems.map((item) => (
          <SidebarNavButton
            key={item.id}
            item={item}
            isSelected={isItemSelected(item)}
            onSelectSection={onSelectSection}
            onSelectHostSection={onSelectHostSection}
          />
        ))}
      </View>
    );
  };

  const sidebarBody = (
    <>
      {hasHosts ? (
        <View style={sidebarStyles.hostPicker}>
          <HostPicker
            activeServerId={activeHostServerId}
            sortedHosts={sortedHosts}
            onSelectHost={onSelectHost}
            onAddHost={onAddHost}
            enableBuiltInDaemonOption={enableBuiltInDaemonOption}
          />
        </View>
      ) : (
        <View style={sidebarStyles.list}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("settings.addHost")}
            onPress={onAddHost}
            testID="settings-add-host"
            style={sidebarItemStyle}
          >
            <Plus size={theme.iconSize.md} color={theme.colors.foregroundMuted} />
            <Text style={sidebarStyles.label} numberOfLines={1}>
              {t("settings.addHost")}
            </Text>
          </Pressable>
          {enableBuiltInDaemonOption.visible ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("settings.enableBuiltInDaemon")}
              onPress={enableBuiltInDaemonOption.onPress}
              testID="settings-enable-built-in-daemon"
              style={sidebarItemStyle}
            >
              <Server size={theme.iconSize.md} color={theme.colors.foregroundMuted} />
              <Text style={sidebarStyles.label} numberOfLines={1}>
                {t("settings.enableBuiltInDaemon")}
              </Text>
            </Pressable>
          ) : null}
        </View>
      )}
      <SettingsNavigationSearch
        entries={[...LEADING_NAV_GROUPS, ...TRAILING_NAV_GROUPS]
          .flatMap((group) => group.items)
          .filter(isItemVisible)}
        isDesktopApp={isDesktopApp}
        onSelectSection={onSelectSection}
        onSelectHostSection={onSelectHostSection}
      >
        {LEADING_NAV_GROUPS.map(renderGroup)}
        {hasHosts && activeHostServerId ? (
          <SidebarProjectsGroup
            serverId={activeHostServerId}
            selectedProjectId={view.kind === "project" ? view.projectId : null}
            onSelectProject={onSelectProject}
          />
        ) : null}
        {TRAILING_NAV_GROUPS.map(renderGroup)}
      </SettingsNavigationSearch>
    </>
  );

  return (
    <View
      accessibilityLabel={t("settings.title")}
      role="navigation"
      style={outerContainerStyle}
      testID="settings-sidebar"
    >
      {isDesktop ? (
        <View style={innerContainerStyle}>
          <View style={sidebarStyles.sidebarDragArea}>
            <TitlebarDragRegion />
            <WindowChromeSafeArea placement="below" />
            <SidebarHeaderRow
              icon={ArrowLeft}
              label={t("settings.backToWorkspace")}
              onPress={onBackToWorkspace}
              testID="settings-back-to-workspace"
            />
          </View>
          <ScrollView
            ref={sidebarScroll.scrollRef}
            style={sidebarStyles.scrollBody}
            showsVerticalScrollIndicator={false}
            onScroll={sidebarScroll.onScroll}
            onContentSizeChange={sidebarScroll.onContentSizeChange}
            scrollEventThrottle={16}
            testID="settings-sidebar-scroll-body"
          >
            {sidebarBody}
          </ScrollView>
        </View>
      ) : (
        sidebarBody
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

export interface SettingsScreenProps {
  view: SettingsView;
  openAddHostIntent?: string | null;
}

export default function SettingsScreen({ view, openAddHostIntent = null }: SettingsScreenProps) {
  const router = useRouter();
  const { t } = useTranslation();
  const voiceAudioEngine = useVoiceAudioEngineOptional();
  const { settings, isLoading: settingsLoading, updateSettings } = useAppSettings();
  const [isAddHostMethodVisible, setIsAddHostMethodVisible] = useState(false);
  const [isDirectHostVisible, setIsDirectHostVisible] = useState(false);
  const [isRemoteSshVisible, setIsRemoteSshVisible] = useState(false);
  const [isPasteLinkVisible, setIsPasteLinkVisible] = useState(false);
  const [isPlaybackTestRunning, setIsPlaybackTestRunning] = useState(false);
  const [playbackTestResult, setPlaybackTestResult] = useState<string | null>(null);
  const lastOpenedAddHostIntentRef = useRef<string | null>(null);
  const isDesktopApp = isElectronRuntime();
  const appVersion = resolveAppVersion();
  const appVersionText = formatVersionWithPrefix(appVersion);
  const isCompactLayout = useIsCompactFormFactor();
  const insets = useSafeAreaInsets();
  const insetBottomStyle = useMemo(() => ({ paddingBottom: insets.bottom }), [insets.bottom]);
  const hosts = useHosts();
  const localServerId = useLocalDaemonServerId();
  const sortedHosts = useSortedHosts(hosts, localServerId);
  const lastWorkspaceSelection = useLastWorkspaceSelection();
  const routedSettingsHostServerId =
    view.kind === "host" || view.kind === "project" || view.kind === "plugin"
      ? view.serverId
      : null;
  const [selectedSettingsHostServerId, setSelectedSettingsHostServerId] = useState<string | null>(
    routedSettingsHostServerId ?? lastWorkspaceSelection?.serverId ?? null,
  );
  useFocusEffect(
    useCallback(() => {
      setSelectedSettingsHostServerId(
        routedSettingsHostServerId ?? lastWorkspaceSelection?.serverId ?? null,
      );
    }, [lastWorkspaceSelection?.serverId, routedSettingsHostServerId]),
  );

  // The host the four sections scope to: the host on the active view, otherwise
  // the picker choice, otherwise the connected local daemon, otherwise the first host.
  const activeHostServerId = useMemo(() => {
    if (view.kind === "host" || view.kind === "project" || view.kind === "plugin")
      return view.serverId;
    return resolveActiveHostServerId({
      selectedServerId: selectedSettingsHostServerId,
      localServerId,
      hosts,
      orderedHosts: sortedHosts,
    });
  }, [view, selectedSettingsHostServerId, localServerId, hosts, sortedHosts]);

  const handleSendBehaviorChange = useCallback(
    (behavior: SendBehavior) => {
      void updateSettings({ sendBehavior: behavior });
    },
    [updateSettings],
  );

  const handleServiceUrlBehaviorChange = useCallback(
    (behavior: ServiceUrlBehavior) => {
      void updateSettings({ serviceUrlBehavior: behavior });
    },
    [updateSettings],
  );

  const handleLanguageChange = useCallback(
    (language: AppLanguage) => {
      void updateSettings({ language });
    },
    [updateSettings],
  );

  const handleTerminalScrollbackLinesChange = useCallback(
    (terminalScrollbackLines: number) => {
      void updateSettings({ terminalScrollbackLines });
    },
    [updateSettings],
  );

  const handleUseLegacyTerminalRendererChange = useCallback(
    (useLegacyTerminalRenderer: boolean) => {
      void updateSettings({ useLegacyTerminalRenderer });
    },
    [updateSettings],
  );

  const handlePlaybackTest = useCallback(async () => {
    if (!voiceAudioEngine || isPlaybackTestRunning) {
      return;
    }

    setIsPlaybackTestRunning(true);
    setPlaybackTestResult(null);

    try {
      const bytes = Buffer.from(THINKING_TONE_NATIVE_PCM_BASE64, "base64");
      await voiceAudioEngine.initialize();
      voiceAudioEngine.stop();
      await voiceAudioEngine.play({
        type: "audio/pcm;rate=16000;bits=16",
        size: bytes.byteLength,
        async arrayBuffer() {
          return Uint8Array.from(bytes).buffer;
        },
      });
      setPlaybackTestResult(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("[Settings] Playback test failed", error);
      setPlaybackTestResult(t("settings.diagnostics.playbackFailed", { message }));
    } finally {
      setIsPlaybackTestRunning(false);
    }
  }, [isPlaybackTestRunning, t, voiceAudioEngine]);

  const closeAddConnectionFlow = useCallback(() => {
    setIsAddHostMethodVisible(false);
    setIsDirectHostVisible(false);
    setIsRemoteSshVisible(false);
    setIsPasteLinkVisible(false);
  }, []);

  const goBackToAddConnectionMethods = useCallback(() => {
    setIsDirectHostVisible(false);
    setIsRemoteSshVisible(false);
    setIsPasteLinkVisible(false);
    setIsAddHostMethodVisible(true);
  }, []);

  const handleAddHost = useCallback(() => {
    setIsAddHostMethodVisible(true);
  }, []);

  useEffect(() => {
    if (!openAddHostIntent || lastOpenedAddHostIntentRef.current === openAddHostIntent) {
      return;
    }
    lastOpenedAddHostIntentRef.current = openAddHostIntent;
    handleAddHost();
  }, [handleAddHost, openAddHostIntent]);

  const handleSelectDirectConnection = useCallback(() => {
    setIsAddHostMethodVisible(false);
    setIsDirectHostVisible(true);
  }, []);

  const handleSelectRemoteSsh = useCallback(() => {
    setIsAddHostMethodVisible(false);
    setIsRemoteSshVisible(true);
  }, []);

  const handleSelectPasteLink = useCallback(() => {
    setIsAddHostMethodVisible(false);
    setIsPasteLinkVisible(true);
  }, []);

  const handleHostAdded = useCallback(
    ({ serverId }: { serverId: string }) => {
      const target = buildSettingsHostSectionRoute(serverId, "connections");
      if (isCompactLayout) {
        router.push(target);
      } else {
        router.replace(target);
      }
    },
    [isCompactLayout, router],
  );

  const handleSelectSection = useCallback(
    (section: SettingsSectionSlug) => {
      const target = buildSettingsSectionRoute(section);
      if (isCompactLayout) {
        router.push(target);
      } else {
        router.replace(target);
      }
    },
    [isCompactLayout, router],
  );

  // Picker: choose the host for host-section rows. If the user is already on a
  // host detail route, keep that detail section and swap only the host segment.
  const handleSelectHost = useCallback(
    (serverId: string) => {
      setSelectedSettingsHostServerId(serverId);
      if (view.kind === "project") {
        const target = buildSettingsHostSectionRoute(serverId, "host");
        if (isCompactLayout) {
          router.push(target);
        } else {
          router.replace(target);
        }
        return;
      }
      if (view.kind !== "host") {
        return;
      }
      const target = buildSettingsHostSectionRoute(serverId, view.section);
      if (isCompactLayout) {
        router.push(target);
      } else {
        router.replace(target);
      }
    },
    [isCompactLayout, router, view],
  );

  const handleSelectHostSection = useCallback(
    (section: HostSectionSlug) => {
      if (!activeHostServerId) {
        handleAddHost();
        return;
      }
      const target = buildSettingsHostSectionRoute(activeHostServerId, section);
      if (isCompactLayout) {
        router.push(target);
      } else {
        router.replace(target);
      }
    },
    [activeHostServerId, handleAddHost, isCompactLayout, router],
  );

  const handleSelectProjectSection = useCallback(
    (projectId: string, section: ProjectSettingsSectionSlug) => {
      if (!activeHostServerId) return;
      const target = buildProjectSettingsRoute(activeHostServerId, projectId, section);
      if (isCompactLayout) {
        router.push(target);
      } else {
        router.replace(target);
      }
    },
    [activeHostServerId, isCompactLayout, router],
  );

  const handleSelectProject = useCallback(
    (projectId: string) => handleSelectProjectSection(projectId, DEFAULT_PROJECT_SETTINGS_SECTION),
    [handleSelectProjectSection],
  );

  // Tabs swap the section in place, so they never stack history.
  const handleSelectProjectTab = useCallback(
    (section: ProjectSettingsSectionSlug) => {
      if (view.kind !== "project") return;
      router.replace(buildProjectSettingsRoute(view.serverId, view.projectId, section));
    },
    [router, view],
  );

  const handleScanQr = useCallback(() => {
    closeAddConnectionFlow();
    router.push({
      pathname: "/pair-scan",
      params: { source: "settings" },
    });
  }, [closeAddConnectionFlow, router]);

  const handleHostRemoved = useCallback(() => {
    const fallback = buildSettingsSectionRoute("general");
    if (isCompactLayout) {
      router.replace("/settings");
    } else {
      router.replace(fallback);
    }
  }, [isCompactLayout, router]);

  const handleBackFromDetail = useCallback(() => {
    returnFromSettings(view);
  }, [view]);

  const handleBackToWorkspace = useCallback(() => {
    returnFromSettings({ kind: "root" });
  }, []);

  const installedPlugins = useInstalledPlugins();
  const { projects } = useProjects();
  const detailTitle = ((): string | null => {
    if (view.kind === "plugin") {
      const screen = installedPlugins
        .find((plugin) => plugin.serverId === view.serverId && plugin.id === view.pluginId)
        ?.settingsScreens.find((candidate) => candidate.id === view.screenId);
      return `${view.pluginId} · ${screen?.title ?? t("settings.title")}`;
    }
    if (view.kind === "host") return t(HOST_NAV_ITEMS[view.section].labelKey);
    if (view.kind === "section") return t(SECTION_NAV_ITEMS[view.section].labelKey);
    if (view.kind === "project") {
      const project = getProjectSummaryForHostProject(projects, view.serverId, view.projectId);
      return getProjectHostEntry(project, view.serverId, view.projectId)?.projectName ?? null;
    }
    return null;
  })();

  const contentStyle = settingsContentStyle(view, isCompactLayout);
  const content = ((): ReactNode => {
    if (view.kind === "plugin")
      return (
        <PluginSettingsContent
          serverId={view.serverId}
          pluginId={view.pluginId}
          screenId={view.screenId}
        />
      );
    if (view.kind === "host") {
      return renderHostSettingsContent(view, handleHostRemoved);
    }
    if (view.kind === "project") {
      return (
        <ProjectSettingsPage
          serverId={view.serverId}
          projectId={view.projectId}
          section={view.section}
          onSelectSection={handleSelectProjectTab}
          showTitle={!isCompactLayout}
        />
      );
    }
    if (view.kind === "section") {
      switch (view.section) {
        case "general":
          return (
            <>
              <GeneralSection
                settings={settings}
                isDesktopApp={isDesktopApp}
                handleSendBehaviorChange={handleSendBehaviorChange}
                handleServiceUrlBehaviorChange={handleServiceUrlBehaviorChange}
                handleLanguageChange={handleLanguageChange}
                handleTerminalScrollbackLinesChange={handleTerminalScrollbackLinesChange}
              />
              {isDesktopApp ? <DesktopNotificationsSection /> : null}
              {isDesktopApp ? <DesktopPermissionsSection /> : null}
              {isWeb ? <EditorSection /> : null}
              {isDesktopApp ? <IntegrationsSection /> : null}
              {isDesktopApp ? <BrowserDataSection /> : null}
            </>
          );
        case "appearance":
          return (
            <>
              <AppearanceSection />
              {isDesktopApp ? <LayoutSection /> : null}
            </>
          );
        case "shortcuts":
          return isDesktopApp ? <KeyboardShortcutsSection /> : null;
        case "about":
          return (
            <>
              <AboutSection
                appVersion={appVersion}
                appVersionText={appVersionText}
                isDesktopApp={isDesktopApp}
              />
              <DiagnosticsSection
                useLegacyTerminalRenderer={settings.useLegacyTerminalRenderer}
                onUseLegacyTerminalRendererChange={handleUseLegacyTerminalRendererChange}
                voiceAudioEngine={voiceAudioEngine}
                isPlaybackTestRunning={isPlaybackTestRunning}
                playbackTestResult={playbackTestResult}
                handlePlaybackTest={handlePlaybackTest}
              />
            </>
          );
      }
    }
    return null;
  })();

  if (settingsLoading) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingText}>{t("settings.loading")}</Text>
      </View>
    );
  }

  const addHostModals = (
    <>
      <AddHostMethodModal
        visible={isAddHostMethodVisible}
        onClose={closeAddConnectionFlow}
        onDirectConnection={handleSelectDirectConnection}
        onRemoteSsh={handleSelectRemoteSsh}
        onPasteLink={handleSelectPasteLink}
        onScanQr={handleScanQr}
      />
      <AddHostModal
        visible={isDirectHostVisible}
        onClose={closeAddConnectionFlow}
        onCancel={goBackToAddConnectionMethods}
        onSaved={handleHostAdded}
      />
      <AddRemoteSshHostModal
        visible={isRemoteSshVisible}
        onClose={closeAddConnectionFlow}
        onCancel={goBackToAddConnectionMethods}
        onSaved={handleHostAdded}
      />
      <PairLinkModal
        visible={isPasteLinkVisible}
        onClose={closeAddConnectionFlow}
        onCancel={goBackToAddConnectionMethods}
        onSaved={handleHostAdded}
      />
    </>
  );

  // Mobile root: full-screen sidebar-as-list.
  if (isCompactLayout && view.kind === "root") {
    return (
      <View style={styles.container}>
        <BackHeader title={t("settings.title")} onBack={handleBackToWorkspace} />
        <ScrollView style={styles.scrollView} contentContainerStyle={insetBottomStyle}>
          <SettingsSidebar
            view={view}
            onSelectSection={handleSelectSection}
            onSelectHostSection={handleSelectHostSection}
            onSelectProject={handleSelectProject}
            onSelectHost={handleSelectHost}
            onAddHost={handleAddHost}
            onBackToWorkspace={handleBackToWorkspace}
            activeHostServerId={activeHostServerId}
            layout="mobile"
          />
        </ScrollView>
        {addHostModals}
      </View>
    );
  }

  if (isCompactLayout) {
    return (
      <View style={styles.container}>
        <BackHeader title={detailTitle ?? undefined} onBack={handleBackFromDetail} />
        <ScrollView style={styles.scrollView} contentContainerStyle={insetBottomStyle}>
          <View style={contentStyle}>{content}</View>
        </ScrollView>
        {addHostModals}
      </View>
    );
  }

  // Desktop split view — mirrors AppContainer: sidebar owns the titlebar drag
  // region + traffic-light padding; the detail pane leads with the page title.
  return (
    <View style={styles.container}>
      <View style={desktopStyles.row}>
        <WindowChromeRegion corners="top-left">
          <SettingsSidebar
            view={view}
            onSelectSection={handleSelectSection}
            onSelectHostSection={handleSelectHostSection}
            onSelectProject={handleSelectProject}
            onSelectHost={handleSelectHost}
            onAddHost={handleAddHost}
            onBackToWorkspace={handleBackToWorkspace}
            activeHostServerId={activeHostServerId}
            layout="desktop"
          />
        </WindowChromeRegion>
        <WindowChromeRegion corners="top-right">
          <View style={desktopStyles.contentPane} testID="settings-detail-pane">
            <ScreenHeader borderless />
            <ScrollView style={styles.scrollView} contentContainerStyle={insetBottomStyle}>
              <View style={contentStyle}>
                {detailTitle && view.kind !== "project" ? (
                  <Text style={settingsStyles.pageTitle} testID="settings-detail-header-title">
                    {detailTitle}
                  </Text>
                ) : null}
                {content}
              </View>
            </ScrollView>
          </View>
        </WindowChromeRegion>
      </View>
      {addHostModals}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create((theme) => ({
  loadingContainer: {
    flex: 1,
    backgroundColor: theme.colors.surface0,
    alignItems: "center",
    justifyContent: "center",
  },
  loadingText: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.base,
  },
  container: {
    flex: 1,
    backgroundColor: theme.colors.surface0,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: theme.spacing[4],
    paddingTop: theme.spacing[6],
    width: "100%",
    maxWidth: 720,
    alignSelf: "center",
  },
  // Desktop pages hug the sidebar instead of floating centered in the pane.
  desktopContent: {
    paddingHorizontal: theme.spacing[12],
    paddingTop: theme.spacing[4],
    paddingBottom: theme.spacing[12],
    width: "100%",
    maxWidth: 960,
  },
  contentWide: {
    maxWidth: 1100,
  },
  aboutValue: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.base,
  },
  aboutVersionMismatch: {
    color: theme.colors.palette.amber[500],
  },
  aboutErrorText: {
    color: theme.colors.palette.red[300],
    fontSize: theme.fontSize.sm,
    marginTop: theme.spacing[1],
  },
  aboutUpdateActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
  },
  themeTrigger: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
    paddingVertical: theme.spacing[1],
    paddingHorizontal: theme.spacing[2],
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  themeTriggerText: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.base,
  },
  terminalScrollbackInput: {
    width: 112,
    minHeight: 36,
    paddingVertical: theme.spacing[2],
    paddingHorizontal: theme.spacing[3],
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface2,
    color: theme.colors.foreground,
    fontSize: theme.fontSize.base,
    textAlign: "right",
  },
  placeholder: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: theme.spacing[8],
  },
  placeholderText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.base,
  },
}));

const desktopStyles = StyleSheet.create({
  row: {
    flex: 1,
    flexDirection: "row",
  },
  contentPane: {
    flex: 1,
  },
});

const sidebarStyles = StyleSheet.create((theme) => ({
  desktopContainer: {
    width: SETTINGS_DESKTOP_SIDEBAR_WIDTH,
    borderRightWidth: 1,
    borderRightColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceSidebar,
  },
  scrollBody: {
    flex: 1,
  },
  sidebarDragArea: {
    position: "relative",
  },
  hostPicker: {
    paddingTop: theme.spacing[2],
    paddingHorizontal: theme.spacing[2],
  },
  mobileContainer: {
    paddingVertical: theme.spacing[2],
    paddingHorizontal: theme.spacing[2],
  },
  list: {
    paddingVertical: theme.spacing[2],
    paddingHorizontal: theme.spacing[2],
    gap: theme.spacing[1],
  },
  groupLabel: {
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
    color: theme.colors.foregroundMuted,
    paddingHorizontal: theme.spacing[2],
    paddingVertical: theme.spacing[1],
  },
  item: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    minHeight: { xs: 36, md: 32 },
    paddingVertical: { xs: theme.spacing[2], md: theme.spacing[1.5] },
    paddingHorizontal: theme.spacing[2],
    borderRadius: theme.borderRadius.md,
  },
  itemHovered: {
    backgroundColor: theme.colors.surfaceSidebarHover,
  },
  itemSelected: {
    backgroundColor: theme.colors.surfaceSidebarHover,
  },
  label: {
    fontSize: theme.fontSize.base,
    color: theme.colors.foregroundMuted,
    fontWeight: theme.fontWeight.normal,
    flex: 1,
  },
  pickerTrigger: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    minHeight: 36,
    paddingVertical: theme.spacing[2],
    paddingHorizontal: theme.spacing[2],
    borderRadius: theme.borderRadius.lg,
  },
  pickerTriggerHovered: {
    backgroundColor: theme.colors.surfaceSidebarHover,
  },
  pickerTriggerLabel: {
    flex: 1,
    minWidth: 0,
    fontSize: theme.fontSize.base,
    color: theme.colors.foreground,
    fontWeight: theme.fontWeight.normal,
  },
  projectIcon: {
    width: theme.iconSize.md,
    height: theme.iconSize.md,
    alignItems: "center",
    justifyContent: "center",
  },
  projectIconFallbackText: {
    fontSize: theme.fontSize.sm,
  },
  projectLabel: {
    flex: 1,
    minWidth: 0,
    fontSize: theme.fontSize.base,
    color: theme.colors.foreground,
    fontWeight: theme.fontWeight.normal,
  },
  // Indented rail under an expanded project, like a tree.
  projectSections: {
    marginLeft: theme.spacing[4],
    paddingLeft: theme.spacing[2],
    borderLeftWidth: 1,
    borderLeftColor: theme.colors.border,
    gap: theme.spacing[1],
    marginTop: theme.spacing[1],
  },
  // Match the setting items' icon footprint so the host label aligns with them.
  pickerTriggerDot: {
    width: theme.iconSize.md,
    height: theme.iconSize.md,
    alignItems: "center",
    justifyContent: "center",
  },
}));
