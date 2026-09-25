import { useCallback, useMemo, type ReactElement } from "react";
import { Alert } from "react-native";
import { useTranslation } from "react-i18next";
import type { MutableDaemonConfigPatch } from "@getpaseo/protocol/messages";
import {
  SettingsCard,
  SettingsSection,
  SettingsSelect,
  SettingsSwitch,
} from "@/components/settings";
import { useDaemonConfig } from "@/hooks/use-daemon-config";
import { useAppSettings } from "@/hooks/use-settings";
import { useHostFeature } from "@/runtime/host-features";

// Leaves the choice to the provider's own config file.
const INHERIT = "inherit";

// Claude Code's built-in output styles. Custom styles in ~/.claude/settings.json still apply.
const CLAUDE_OUTPUT_STYLES = [
  "default",
  "Proactive",
  "Concise",
  "Explanatory",
  "Learning",
] as const;
const CODEX_PERSONALITIES = ["pragmatic", "friendly", "none"] as const;

type AgentDefaultsPatch = NonNullable<MutableDaemonConfigPatch["agentDefaults"]>;
type CodexPersonalityValue = typeof INHERIT | (typeof CODEX_PERSONALITIES)[number];

export function AgentDefaultsSection({ serverId }: { serverId: string }): ReactElement {
  const { t } = useTranslation();
  const supportsAgentDefaults = useHostFeature(serverId, "agentDefaults");
  const { config, patchConfig } = useDaemonConfig(serverId);
  const { settings, updateSettings } = useAppSettings();

  const outputStyle = config?.agentDefaults?.claudeOutputStyle || INHERIT;
  const personality: CodexPersonalityValue = config?.agentDefaults?.codexPersonality ?? INHERIT;

  const outputStyleOptions = useMemo(() => {
    const options: { value: string; label: string }[] = [
      {
        value: INHERIT,
        label: t("settings.defaultModels.agentDefaults.claudeOutputStyle.inherit"),
      },
      ...CLAUDE_OUTPUT_STYLES.map((style) => ({
        value: style,
        label: t(`settings.defaultModels.agentDefaults.claudeOutputStyle.options.${style}`),
      })),
    ];
    // A custom style set in the daemon config stays selectable.
    if (!options.some((option) => option.value === outputStyle)) {
      options.push({ value: outputStyle, label: outputStyle });
    }
    return options;
  }, [outputStyle, t]);
  const personalityOptions = useMemo(
    () => [
      {
        value: INHERIT as CodexPersonalityValue,
        label: t("settings.defaultModels.agentDefaults.codexPersonality.inherit"),
      },
      ...CODEX_PERSONALITIES.map((value) => ({
        value,
        label: t(`settings.defaultModels.agentDefaults.codexPersonality.options.${value}`),
      })),
    ],
    [t],
  );

  const save = useCallback(
    (agentDefaults: AgentDefaultsPatch) => {
      patchConfig({ agentDefaults }).catch((error: unknown) => {
        Alert.alert(
          t("common.errors.unableToSave"),
          error instanceof Error ? error.message : String(error),
        );
      });
    },
    [patchConfig, t],
  );
  const handleOutputStyleChange = useCallback(
    (value: string) => save({ claudeOutputStyle: value === INHERIT ? null : value }),
    [save],
  );
  const handlePersonalityChange = useCallback(
    (value: CodexPersonalityValue) => save({ codexPersonality: value === INHERIT ? null : value }),
    [save],
  );
  const handlePlanModeChange = useCallback(
    (defaultToPlanMode: boolean) => {
      void updateSettings({ defaultToPlanMode });
    },
    [updateSettings],
  );

  return (
    <SettingsSection
      title={t("settings.defaultModels.agentDefaults.title")}
      testID="default-models-agent-defaults"
    >
      <SettingsCard>
        {supportsAgentDefaults ? (
          <SettingsSelect
            label={t("settings.defaultModels.agentDefaults.claudeOutputStyle.label")}
            hint={t("settings.defaultModels.agentDefaults.claudeOutputStyle.hint")}
            value={outputStyle}
            options={outputStyleOptions}
            onValueChange={handleOutputStyleChange}
            testID="agent-defaults-claude-output-style"
          />
        ) : null}
        {supportsAgentDefaults ? (
          <SettingsSelect
            label={t("settings.defaultModels.agentDefaults.codexPersonality.label")}
            hint={t("settings.defaultModels.agentDefaults.codexPersonality.hint")}
            value={personality}
            options={personalityOptions}
            onValueChange={handlePersonalityChange}
            testID="agent-defaults-codex-personality"
          />
        ) : null}
        <SettingsSwitch
          label={t("settings.defaultModels.agentDefaults.planMode.label")}
          hint={t("settings.defaultModels.agentDefaults.planMode.hint")}
          value={settings.defaultToPlanMode}
          onValueChange={handlePlanModeChange}
          testID="agent-defaults-plan-mode"
        />
      </SettingsCard>
    </SettingsSection>
  );
}
