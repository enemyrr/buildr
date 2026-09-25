import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { SettingsSection, SettingsCard, SettingsSelect } from "@/components/settings";
import { getIsElectron } from "@/constants/platform";
import {
  useAppSettings,
  type DefaultNewTab,
  type OpenInSidePanePreferences,
  type PullRequestOpenLocation,
} from "@/hooks/use-settings";

const SOURCES = [
  "explorerFiles",
  "diffs",
  "chatFiles",
  "diffFiles",
  "subagents",
] as const satisfies readonly (keyof OpenInSidePanePreferences)[];

type LayoutPreferenceSource = keyof OpenInSidePanePreferences | "pullRequests";

function LayoutPreferenceRow({
  source,
  destination,
  allowExplorer,
  onDestinationChange,
}: {
  source: LayoutPreferenceSource;
  destination: PullRequestOpenLocation;
  allowExplorer?: boolean;
  onDestinationChange(source: LayoutPreferenceSource, destination: PullRequestOpenLocation): void;
}) {
  const { t } = useTranslation();
  const options = useMemo(() => {
    const destinations = allowExplorer
      ? (["main", "side", "explorer"] as const)
      : (["main", "side"] as const);
    return destinations.map((value) => ({
      value,
      label: t(`settings.layout.openInSidePane.destinations.${value}`),
    }));
  }, [allowExplorer, t]);
  const change = useCallback(
    (value: PullRequestOpenLocation) => onDestinationChange(source, value),
    [source, onDestinationChange],
  );
  return (
    <SettingsSelect
      label={t(`settings.layout.openInSidePane.sources.${source}.label`)}
      value={destination}
      options={options}
      onValueChange={change}
    />
  );
}

function DefaultNewTabSection() {
  const { t } = useTranslation();
  const { settings, updateSettings } = useAppSettings();
  const options = useMemo(() => {
    const values: DefaultNewTab[] = getIsElectron()
      ? ["agent", "terminal", "browser", "launcher"]
      : ["agent", "terminal", "launcher"];
    return values.map((value) => ({
      value,
      label: t(`settings.layout.defaultNewTab.options.${value}`),
    }));
  }, [t]);
  const change = useCallback(
    (value: DefaultNewTab) => void updateSettings({ defaultNewTab: value }),
    [updateSettings],
  );
  return (
    <SettingsSection title={t("settings.layout.defaultNewTab.title")}>
      <SettingsCard>
        <SettingsSelect
          label={t("settings.layout.defaultNewTab.label")}
          value={settings.defaultNewTab}
          options={options}
          onValueChange={change}
        />
      </SettingsCard>
    </SettingsSection>
  );
}

export function LayoutSection() {
  const { t } = useTranslation();
  const { settings, updateSettings } = useAppSettings();
  const handleDestinationChange = useCallback(
    (source: LayoutPreferenceSource, destination: PullRequestOpenLocation) => {
      if (source === "pullRequests") {
        void updateSettings({ pullRequestOpenLocation: destination });
        return;
      }
      void updateSettings({
        openInSidePane: { ...settings.openInSidePane, [source]: destination === "side" },
      });
    },
    [settings.openInSidePane, updateSettings],
  );
  return (
    <>
      <DefaultNewTabSection />
      <SettingsSection title={t("settings.layout.openInSidePane.title")}>
        <SettingsCard>
          {SOURCES.map((source) => (
            <LayoutPreferenceRow
              key={source}
              source={source}
              destination={settings.openInSidePane[source] ? "side" : "main"}
              onDestinationChange={handleDestinationChange}
            />
          ))}
          <LayoutPreferenceRow
            source="pullRequests"
            destination={settings.pullRequestOpenLocation}
            allowExplorer
            onDestinationChange={handleDestinationChange}
          />
        </SettingsCard>
      </SettingsSection>
    </>
  );
}
