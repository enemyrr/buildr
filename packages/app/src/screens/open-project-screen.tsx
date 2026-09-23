import { useHosts, useHostRuntimeLastError } from "@/runtime/host-runtime";
import { useCallback, useEffect, useState, type ComponentType } from "react";
import { useTranslation } from "react-i18next";
import { View, Text, Pressable, type PressableStateCallbackType } from "react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { useReducedMotion } from "react-native-reanimated";
import { useRouter } from "expo-router";
import { FolderOpen, Inbox, Plug, Smartphone } from "lucide-react-native";
import { HelloLettering } from "@/components/hello-lettering";
import { MenuHeader } from "@/components/headers/menu-header";
import { useOpenAddProject } from "@/hooks/use-open-add-project";
import { useImportSession } from "@/hooks/use-import-session";
import { useHostChooser } from "@/hosts/host-chooser";
import { usePanelStore } from "@/stores/panel-store";
import {
  useIsCompactFormFactor,
  HEADER_INNER_HEIGHT,
  HEADER_INNER_HEIGHT_MOBILE,
  HEADER_TOP_PADDING_MOBILE,
} from "@/constants/layout";
import { TitlebarDragRegion } from "@/components/desktop/titlebar-drag-region";
import { useLocalDaemonServerId } from "@/hooks/use-is-local-daemon";
import { PairDeviceModal } from "@/desktop/components/pair-device-modal";
import { buildSettingsHostSectionRoute } from "@/utils/host-routes";
import type { Theme } from "@/styles/theme";

export function OpenProjectScreen() {
  const { t } = useTranslation();
  const hosts = useHosts();
  const router = useRouter();
  const openDesktopAgentList = usePanelStore((s) => s.openDesktopAgentList);
  const openProjectPicker = useOpenAddProject();
  const importSession = useImportSession();
  const chooseHost = useHostChooser();
  const localServerId = useLocalDaemonServerId();
  const [isPairDeviceOpen, setIsPairDeviceOpen] = useState(false);

  const isCompactLayout = useIsCompactFormFactor();

  useEffect(() => {
    if (!isCompactLayout) {
      openDesktopAgentList();
    }
  }, [isCompactLayout, openDesktopAgentList]);

  const handleOpenPicker = useCallback(() => {
    void openProjectPicker();
  }, [openProjectPicker]);

  const handleOpenPairDevice = useCallback(() => setIsPairDeviceOpen(true), []);
  const handleClosePairDevice = useCallback(() => setIsPairDeviceOpen(false), []);

  const handleOpenProviders = useCallback(() => {
    chooseHost({
      title: "Choose host",
      onChooseHost: (serverId) => {
        router.push(buildSettingsHostSectionRoute(serverId, "providers"));
      },
    });
  }, [chooseHost, router]);

  return (
    <View style={styles.container}>
      <MenuHeader borderless />
      <View style={styles.content}>
        <TitlebarDragRegion />
        <HomeLogo />
        {hosts.map((host) => (
          <HostError key={host.serverId} serverId={host.serverId} label={host.label} />
        ))}
        <View style={isCompactLayout ? styles.tiles : styles.desktopTiles}>
          <HomeTile
            icon={ThemedFolderOpen}
            accent
            compact={isCompactLayout}
            title={t("openProject.tiles.addProject.title")}
            description={t("openProject.tiles.addProject.description")}
            onPress={handleOpenPicker}
            testID="open-project-submit"
          />
          <HomeTile
            icon={ThemedInbox}
            compact={isCompactLayout}
            title={t("openProject.tiles.importSession.title")}
            description={t("openProject.tiles.importSession.description")}
            onPress={importSession.open}
            testID="open-project-import-session"
          />
          <HomeTile
            icon={ThemedPlug}
            compact={isCompactLayout}
            title={t("openProject.tiles.setupProviders.title")}
            description={t("openProject.tiles.setupProviders.description")}
            onPress={handleOpenProviders}
            testID="open-project-setup-providers"
          />
          {localServerId ? (
            <HomeTile
              icon={ThemedSmartphone}
              compact={isCompactLayout}
              title={t("openProject.tiles.pairDevice.title")}
              description={t("openProject.tiles.pairDevice.description")}
              onPress={handleOpenPairDevice}
              testID="open-project-pair-device"
            />
          ) : null}
        </View>
      </View>
      <PairDeviceModal
        serverId={localServerId ?? ""}
        visible={isPairDeviceOpen}
        onClose={handleClosePairDevice}
        testID="open-project-pair-device-modal"
      />
      {importSession.sheet}
    </View>
  );
}

const LOGO_SIZE = 52;

const ThemedHelloLettering = withUnistyles(HelloLettering, (theme) => ({
  color: theme.colors.foreground,
}));

// The greeting animates once per app session and stays drawn afterward.
let hasPlayedHello = false;

function HomeLogo() {
  const reduceMotion = useReducedMotion();
  const [drawn] = useState(() => hasPlayedHello || reduceMotion);

  const handleHelloComplete = useCallback(() => {
    hasPlayedHello = true;
  }, []);

  return (
    <View style={styles.logo}>
      <View style={styles.logoLayer}>
        <ThemedHelloLettering height={LOGO_SIZE} drawn={drawn} onComplete={handleHelloComplete} />
      </View>
    </View>
  );
}

function HostError({ serverId, label }: { serverId: string; label: string }) {
  const error = useHostRuntimeLastError(serverId);
  return error ? (
    <Text accessibilityRole="alert" style={styles.hostError}>
      {label}: {error}
    </Text>
  ) : null;
}

type ThemedIcon = ComponentType<{ size: number; uniProps: (theme: Theme) => { color: string } }>;

const ThemedFolderOpen = withUnistyles(FolderOpen);
const ThemedInbox = withUnistyles(Inbox);
const ThemedPlug = withUnistyles(Plug);
const ThemedSmartphone = withUnistyles(Smartphone);

const accentMapping = (theme: Theme) => ({ color: theme.colors.accent });
const mutedMapping = (theme: Theme) => ({ color: theme.colors.foregroundMuted });

interface HomeTileProps {
  icon: ThemedIcon;
  title: string;
  description: string;
  onPress: () => void;
  compact: boolean;
  testID?: string;
  accent?: boolean;
}

function compactTileStyle({ pressed, hovered }: PressableStateCallbackType) {
  return [styles.tile, hovered && styles.tileHovered, pressed && styles.tilePressed];
}

function desktopTileStyle({ pressed, hovered }: PressableStateCallbackType) {
  return [styles.desktopTile, hovered && styles.tileHovered, pressed && styles.tilePressed];
}

// Desktop tiles show only the icon and title; the description moves to the accessibility hint.
function HomeTile({
  icon: Icon,
  title,
  description,
  onPress,
  compact,
  testID,
  accent,
}: HomeTileProps) {
  const uniProps = accent ? accentMapping : mutedMapping;

  if (compact) {
    return (
      <Pressable onPress={onPress} testID={testID} style={compactTileStyle}>
        <Icon size={20} uniProps={uniProps} />
        <View style={styles.tileText}>
          <Text style={styles.tileTitle}>{title}</Text>
          <Text style={styles.tileDescription}>{description}</Text>
        </View>
      </Pressable>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint={description}
      style={desktopTileStyle}
    >
      <Icon size={16} uniProps={uniProps} />
      <Text style={styles.tileTitle} numberOfLines={1}>
        {title}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: {
    flex: 1,
    backgroundColor: theme.colors.surface0,
    userSelect: "none",
  },
  content: {
    position: "relative",
    flex: 1,
    justifyContent: { xs: "flex-start", md: "center" },
    alignItems: "center",
    gap: 0,
    padding: theme.spacing[6],
    paddingTop: { xs: theme.spacing[12], md: theme.spacing[6] },
    paddingBottom: {
      xs: HEADER_INNER_HEIGHT_MOBILE + HEADER_TOP_PADDING_MOBILE + theme.spacing[6],
      md: HEADER_INNER_HEIGHT + theme.spacing[6],
    },
  },
  logo: {
    height: LOGO_SIZE,
    alignSelf: "stretch",
    marginBottom: theme.spacing[8],
  },
  logoLayer: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  hostError: {
    color: theme.colors.destructive,
    fontSize: theme.fontSize.base,
    maxWidth: 452,
    textAlign: "center",
  },
  tiles: {
    marginTop: theme.spacing[6],
    width: "100%",
    maxWidth: 452,
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "flex-start",
    gap: theme.spacing[3],
  },
  desktopTiles: {
    marginTop: theme.spacing[12],
    width: "100%",
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: theme.spacing[3],
  },
  tile: {
    width: "100%",
    padding: theme.spacing[4],
    backgroundColor: theme.colors.surface1,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.xl,
    gap: theme.spacing[3],
  },
  desktopTile: {
    width: 200,
    height: 128,
    padding: theme.spacing[4],
    justifyContent: "space-between",
    backgroundColor: theme.colors.surface1,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
  },
  tileHovered: {
    backgroundColor: theme.colors.surface2,
    borderColor: theme.colors.borderAccent,
  },
  tilePressed: {
    opacity: 0.85,
  },
  tileText: {
    gap: theme.spacing[1],
  },
  tileTitle: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.base,
    fontWeight: theme.fontWeight.normal,
  },
  tileDescription: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.base,
    lineHeight: 18,
  },
}));
