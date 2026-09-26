import { useCallback, useState, type ReactNode } from "react";
import {
  Pressable,
  Text,
  View,
  type PressableStateCallbackType,
  type TextInputProps,
} from "react-native";
import { useTranslation } from "react-i18next";
import { StyleSheet } from "react-native-unistyles";
import { isWeb } from "@/constants/platform";
import { SearchField } from "@/components/ui/search-field";
import type { HostSectionSlug, SettingsSectionSlug } from "@/utils/host-routes";

type SearchEntry =
  | { kind: "section"; id: SettingsSectionSlug; labelKey: string }
  | { kind: "host"; id: HostSectionSlug; labelKey: string };

// Use the labels shown on each destination so search follows the app's language.
const SETTING_LABELS: Partial<Record<SearchEntry["id"], string[]>> = {
  general: [
    "settings.general.defaultSend.label",
    "settings.general.language.label",
    "settings.general.terminalScrollback.label",
  ],
  appearance: [
    "settings.appearance.theme.title",
    "settings.appearance.fonts.interfaceFont",
    "settings.appearance.fonts.interfaceSize",
    "settings.appearance.fonts.contentSize",
    "settings.appearance.fonts.codeFont",
    "settings.appearance.fonts.codeSize",
    "settings.appearance.syntax.highlightTheme",
    "settings.appearance.sidebar.title",
    "settings.appearance.chatOutline.title",
    "settings.general.autoExpandReasoning.label",
    "settings.general.toolCallDetail.label",
  ],
  agents: [
    "settings.host.agents.tabs.providers",
    "settings.host.agents.tabs.behavior",
    "settings.host.agents.tabs.usage",
    "settings.host.orchestration.systemPrompt.title",
  ],
  environment: [
    "settings.hostSections.workspaces",
    "settings.host.terminalProfiles.sectionTitle",
    "settings.metadataGeneration.title",
  ],
  connections: ["settings.host.pairDevices.title"],
  about: ["settings.about.appVersion", "settings.diagnostics.title"],
};

const DESKTOP_GENERAL_LABELS = [
  "settings.general.serviceUrls.label",
  "settings.sections.notifications",
  "settings.sections.permissions",
  "settings.sections.integrations",
  "settings.general.browserData.title",
];

export function SettingsNavigationSearch({
  entries,
  isDesktopApp,
  onSelectSection,
  onSelectHostSection,
  children,
}: {
  entries: SearchEntry[];
  isDesktopApp: boolean;
  onSelectSection: (section: SettingsSectionSlug) => void;
  onSelectHostSection: (section: HostSectionSlug) => void;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const words = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const results = entries.flatMap((entry) => {
    const title = t(entry.labelKey);
    const labels = [
      ...(SETTING_LABELS[entry.id] ?? []),
      ...(isWeb && entry.id === "general" ? ["settings.editor.vimKeybindings"] : []),
      ...(isDesktopApp && entry.id === "general" ? DESKTOP_GENERAL_LABELS : []),
    ].map((key) => t(key));
    const matches = (label: string) =>
      words.every((word) => `${title} ${label}`.toLocaleLowerCase().includes(word));
    const matchingLabels = labels.filter(matches);
    if (!matches("") && matchingLabels.length === 0) return [];
    return [{ entry, title, detail: matchingLabels.join(" · ") }];
  });
  const select = useCallback(
    (entry: SearchEntry) => {
      if (entry.kind === "section") onSelectSection(entry.id);
      else onSelectHostSection(entry.id);
    },
    [onSelectSection, onSelectHostSection],
  );
  const handleKeyPress = useCallback<NonNullable<TextInputProps["onKeyPress"]>>(
    (event) => {
      if (event.nativeEvent.key === "Enter" && words.length > 0 && results[0]) {
        select(results[0].entry);
      }
    },
    [words.length, results, select],
  );

  return (
    <>
      <View style={styles.search}>
        <SearchField
          value={query}
          onChangeText={setQuery}
          placeholder={t("settings.search.placeholder")}
          clearAccessibilityLabel={t("settings.search.clear")}
          testID="settings-search"
          clearTestID="settings-search-clear"
          onKeyPress={handleKeyPress}
        />
      </View>
      {words.length === 0 ? (
        children
      ) : (
        <View style={styles.results} testID="settings-search-results">
          {results.length === 0 ? (
            <Text style={styles.empty}>{t("settings.search.noResults")}</Text>
          ) : null}
          {results.map(({ entry, title, detail }) => (
            <SearchResult
              key={`${entry.kind}-${entry.id}`}
              entry={entry}
              title={title}
              detail={detail}
              onSelect={select}
            />
          ))}
        </View>
      )}
    </>
  );
}

function resultStyle({ pressed, hovered }: PressableStateCallbackType) {
  return [styles.result, (pressed || hovered) && styles.resultHovered];
}

function SearchResult({
  entry,
  title,
  detail,
  onSelect,
}: {
  entry: SearchEntry;
  title: string;
  detail: string;
  onSelect: (entry: SearchEntry) => void;
}) {
  const handlePress = useCallback(() => onSelect(entry), [entry, onSelect]);
  return (
    <Pressable accessibilityRole="button" onPress={handlePress} style={resultStyle}>
      <Text style={styles.title}>{title}</Text>
      {detail ? (
        <Text style={styles.detail} numberOfLines={3}>
          {detail}
        </Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create((theme) => ({
  search: {
    flexDirection: "row",
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[2],
  },
  results: { paddingHorizontal: theme.spacing[2], gap: theme.spacing[1] },
  result: { padding: theme.spacing[2], gap: theme.spacing[1], borderRadius: theme.borderRadius.md },
  resultHovered: { backgroundColor: theme.colors.surfaceSidebarHover },
  title: { color: theme.colors.foreground, fontSize: theme.fontSize.base },
  detail: { color: theme.colors.foregroundMuted, fontSize: theme.fontSize.sm },
  empty: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    padding: theme.spacing[2],
  },
}));
