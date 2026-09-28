import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Text, View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { useTranslation } from "react-i18next";
import { StyleSheet } from "react-native-unistyles";
import { useModelLoadout } from "@/agent-profiles";
import { PaseoLogo } from "@/components/icons/paseo-logo";
import { ScrollView } from "@/components/ui/scroll-view";
import { Button } from "@/components/ui/button";
import { getIsElectron } from "@/constants/platform";
import { useFormPreferences } from "@/hooks/use-form-preferences";
import { useOpenAddProject } from "@/hooks/use-open-add-project";
import { useProvidersSnapshot } from "@/hooks/use-providers-snapshot";
import { useAppSettings, type DefaultNewTab } from "@/hooks/use-settings";
import { DefaultModelsBoard } from "@/screens/settings/default-models/default-models-page";
import { ChoiceCard } from "./choice-card";
import { resolveDefaultLoadout } from "./default-loadout";
import { NewTabPreview } from "./new-tab-preview";
import { WorkspacePreview } from "./workspace-preview";

const STEPS = ["welcome", "models", "newTab", "workspace", "project"] as const;
type Step = (typeof STEPS)[number];

/**
 * First-run setup, drawn over the app once a host is online. Finishing or skipping sets
 * `onboardingCompleted`, so it never shows again.
 */
export function OnboardingHost({ onlineServerId }: { onlineServerId: string | null }) {
  const { settings, isLoading } = useAppSettings();
  // Latch the first online host so a reconnect doesn't swap hosts mid-setup.
  const [serverId, setServerId] = useState<string | null>(null);
  useEffect(() => {
    if (!serverId && onlineServerId) setServerId(onlineServerId);
  }, [onlineServerId, serverId]);

  if (isLoading || settings.onboardingCompleted || !serverId) return null;
  return <Onboarding serverId={serverId} />;
}

function Onboarding({ serverId }: { serverId: string }) {
  const { t } = useTranslation();
  const { updateSettings } = useAppSettings();
  const openAddProject = useOpenAddProject();
  const [stepIndex, setStepIndex] = useState(0);
  const step: Step = STEPS[stepIndex];
  useSeedDefaultLoadout(serverId);

  const complete = useCallback(() => {
    void updateSettings({ onboardingCompleted: true });
  }, [updateSettings]);
  const next = useCallback(() => setStepIndex((index) => index + 1), []);
  const back = useCallback(() => setStepIndex((index) => Math.max(0, index - 1)), []);
  const addProject = useCallback(() => {
    complete();
    openAddProject(serverId);
  }, [complete, openAddProject, serverId]);

  return (
    <View style={styles.overlay} testID="onboarding">
      <View style={styles.topBar}>
        <View style={styles.progress}>
          {STEPS.map((item, index) => (
            <View
              key={item}
              style={index <= stepIndex ? styles.progressDone : styles.progressTodo}
            />
          ))}
        </View>
        <Text style={styles.stepLabel}>
          {t("onboarding.setup.stepLabel", { current: stepIndex + 1, total: STEPS.length })}
        </Text>
        <View style={styles.topBarSpacer} />
        {step === "project" ? null : (
          <Button variant="ghost" size="sm" onPress={complete} testID="onboarding-skip">
            {t("onboarding.setup.skip")}
          </Button>
        )}
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        <Animated.View
          key={step}
          entering={FadeIn.duration(220)}
          style={step === "models" ? styles.stepWide : styles.step}
        >
          {step === "welcome" ? <WelcomeStep /> : null}
          {step === "models" ? <ModelsStep serverId={serverId} /> : null}
          {step === "newTab" ? <NewTabStep /> : null}
          {step === "workspace" ? <WorkspaceStep /> : null}
          {step === "project" ? <ProjectStep /> : null}
        </Animated.View>
      </ScrollView>

      <View style={styles.footer}>
        {stepIndex > 0 ? (
          <Button variant="ghost" onPress={back} testID="onboarding-back">
            {t("onboarding.setup.back")}
          </Button>
        ) : null}
        <View style={styles.topBarSpacer} />
        {step === "project" ? (
          <>
            <Button variant="ghost" onPress={complete} testID="onboarding-later">
              {t("onboarding.setup.project.later")}
            </Button>
            <Button variant="default" onPress={addProject} testID="onboarding-add-project">
              {t("onboarding.setup.project.add")}
            </Button>
          </>
        ) : (
          <Button variant="default" onPress={next} testID="onboarding-continue">
            {step === "welcome"
              ? t("onboarding.setup.welcome.start")
              : t("onboarding.setup.continue")}
          </Button>
        )}
      </View>
    </View>
  );
}

/** Fills an empty loadout with the default models this host can run, once. */
function useSeedDefaultLoadout(serverId: string) {
  const loadout = useModelLoadout(serverId);
  const { entries } = useProvidersSnapshot(serverId, { cwd: null });
  const settled = useRef(false);
  const { isSupported, slots, seed } = loadout;

  useEffect(() => {
    if (settled.current || !isSupported || !slots) return;
    if (slots.length > 0) {
      settled.current = true;
      return;
    }
    const defaults = resolveDefaultLoadout(entries);
    if (!defaults) return;
    settled.current = true;
    if (defaults.length === 0) return;
    seed(defaults).catch((error: unknown) => {
      console.warn("[Onboarding] Failed to seed the default loadout", error);
    });
  }, [entries, isSupported, seed, slots]);
}

function StepHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <View style={styles.header}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.subtitle}>{subtitle}</Text>
    </View>
  );
}

function WelcomeStep() {
  const { t } = useTranslation();
  return (
    <View style={styles.welcome}>
      <PaseoLogo size={72} />
      <StepHeader
        title={t("onboarding.setup.welcome.title")}
        subtitle={t("onboarding.setup.welcome.subtitle")}
      />
    </View>
  );
}

function ModelsStep({ serverId }: { serverId: string }) {
  const { t } = useTranslation();
  const loadout = useModelLoadout(serverId);
  const { entries } = useProvidersSnapshot(serverId, { cwd: null });
  return (
    <>
      <StepHeader
        title={t("onboarding.setup.models.title")}
        subtitle={t("onboarding.setup.models.subtitle")}
      />
      {loadout.isSupported ? (
        <DefaultModelsBoard serverId={serverId} entries={entries} loadout={loadout} />
      ) : (
        <Text style={styles.subtitle}>{t("settings.defaultModels.unsupported")}</Text>
      )}
    </>
  );
}

function ChoiceGrid({ children }: { children: ReactNode }) {
  return (
    <View style={styles.grid} accessibilityRole="radiogroup">
      {children}
    </View>
  );
}

function NewTabStep() {
  const { t } = useTranslation();
  const { settings, updateSettings } = useAppSettings();
  const options = useMemo<DefaultNewTab[]>(
    () =>
      getIsElectron()
        ? ["agent", "terminal", "browser", "launcher"]
        : ["agent", "terminal", "launcher"],
    [],
  );
  const select = useCallback(
    (value: DefaultNewTab) => void updateSettings({ defaultNewTab: value }),
    [updateSettings],
  );
  return (
    <>
      <StepHeader
        title={t("onboarding.setup.newTab.title")}
        subtitle={t("onboarding.setup.newTab.subtitle")}
      />
      <ChoiceGrid>
        {options.map((value) => {
          const selected = settings.defaultNewTab === value;
          return (
            <ChoiceCard
              key={value}
              value={value}
              title={t(`onboarding.setup.newTab.options.${value}.title`)}
              description={t(`onboarding.setup.newTab.options.${value}.description`)}
              selected={selected}
              onSelect={select}
              testID={`onboarding-new-tab-${value}`}
            >
              <NewTabPreview kind={value} active={selected} />
            </ChoiceCard>
          );
        })}
      </ChoiceGrid>
    </>
  );
}

const ISOLATIONS = ["worktree", "local"] as const;

function WorkspaceStep() {
  const { t } = useTranslation();
  const { preferences, updatePreferences } = useFormPreferences();
  const current = preferences.isolation ?? "worktree";
  const select = useCallback(
    (value: (typeof ISOLATIONS)[number]) => void updatePreferences({ isolation: value }),
    [updatePreferences],
  );
  return (
    <>
      <StepHeader
        title={t("onboarding.setup.workspace.title")}
        subtitle={t("onboarding.setup.workspace.subtitle")}
      />
      <ChoiceGrid>
        {ISOLATIONS.map((value) => {
          const selected = current === value;
          return (
            <ChoiceCard
              key={value}
              value={value}
              title={t(`onboarding.setup.workspace.options.${value}.title`)}
              description={t(`onboarding.setup.workspace.options.${value}.description`)}
              selected={selected}
              onSelect={select}
              testID={`onboarding-isolation-${value}`}
            >
              <WorkspacePreview mode={value} active={selected} />
            </ChoiceCard>
          );
        })}
      </ChoiceGrid>
    </>
  );
}

function ProjectStep() {
  const { t } = useTranslation();
  return (
    <StepHeader
      title={t("onboarding.setup.project.title")}
      subtitle={t("onboarding.setup.project.subtitle")}
    />
  );
}

const styles = StyleSheet.create((theme) => ({
  overlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 9000,
    backgroundColor: theme.colors.surface0,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[3],
    // Clears the macOS traffic lights; the overlay covers the window chrome.
    paddingTop: theme.spacing[12],
    paddingHorizontal: theme.spacing[6],
  },
  progress: {
    flexDirection: "row",
    gap: theme.spacing[1],
  },
  progressDone: {
    width: 20,
    height: 3,
    borderRadius: 2,
    backgroundColor: theme.colors.accent,
  },
  progressTodo: {
    width: 20,
    height: 3,
    borderRadius: 2,
    backgroundColor: theme.colors.surface3,
  },
  stepLabel: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
  topBarSpacer: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: theme.spacing[6],
  },
  step: {
    width: "100%",
    maxWidth: 800,
  },
  stepWide: {
    width: "100%",
    maxWidth: 960,
  },
  welcome: {
    alignItems: "center",
    gap: theme.spacing[6],
  },
  header: {
    alignItems: "center",
    gap: theme.spacing[2],
    marginBottom: theme.spacing[8],
  },
  title: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize["2xl"],
    fontWeight: theme.fontWeight.medium,
    textAlign: "center",
  },
  subtitle: {
    maxWidth: 520,
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.base,
    lineHeight: 20,
    textAlign: "center",
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing[3],
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    paddingHorizontal: theme.spacing[6],
    paddingVertical: theme.spacing[4],
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
}));
