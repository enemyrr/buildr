import { Text, View } from "react-native";
import Animated from "react-native-reanimated";
import { useTranslation } from "react-i18next";
import { StyleSheet } from "react-native-unistyles";
import { useGrowStyle, useLoopProgress, useRevealStyle } from "./loop-progress";

const DURATION_MS = 2600;

type Progress = ReturnType<typeof useLoopProgress>;

/**
 * Git history as two tracks. A worktree forks a branch and the agent's commits land there;
 * local work lands on `main` itself.
 */
export function WorkspacePreview({
  mode,
  active,
}: {
  mode: "worktree" | "local";
  active: boolean;
}) {
  const { t } = useTranslation();
  const progress = useLoopProgress(active, DURATION_MS);

  return (
    <View style={styles.root}>
      <View style={styles.row}>
        <Text style={styles.label}>{t("onboarding.setup.workspace.preview.main")}</Text>
        <View style={styles.track}>
          <View style={styles.line} />
          <View style={[styles.dot, styles.at8]} />
          <View style={[styles.dot, styles.at30]} />
          {mode === "local" ? <LocalChanges progress={progress} /> : null}
        </View>
      </View>
      {mode === "worktree" ? <WorktreeBranch progress={progress} /> : null}
    </View>
  );
}

function LocalChanges({ progress }: { progress: Progress }) {
  const first = useRevealStyle(progress, 0.25);
  const second = useRevealStyle(progress, 0.42);
  const third = useRevealStyle(progress, 0.59);
  const chip = useRevealStyle(progress, 0.74);
  const { t } = useTranslation();
  return (
    <>
      <Animated.View style={[styles.dot, styles.changeDot, styles.at50, first]} />
      <Animated.View style={[styles.dot, styles.changeDot, styles.at68, second]} />
      <Animated.View style={[styles.dot, styles.changeDot, styles.at86, third]} />
      <Animated.View style={[styles.chip, styles.chipBelow, chip]}>
        <Text style={styles.chipText}>{t("onboarding.setup.workspace.preview.changes")}</Text>
      </Animated.View>
    </>
  );
}

function WorktreeBranch({ progress }: { progress: Progress }) {
  const { t } = useTranslation();
  const elbow = useRevealStyle(progress, 0.08);
  const branchLine = useGrowStyle(progress, 0.14, 0.4);
  const label = useRevealStyle(progress, 0.2);
  const first = useRevealStyle(progress, 0.36);
  const second = useRevealStyle(progress, 0.52);
  const third = useRevealStyle(progress, 0.68);
  return (
    <View style={styles.row}>
      <Animated.Text style={[styles.label, styles.branchLabel, label]}>
        {t("onboarding.setup.workspace.preview.branch")}
      </Animated.Text>
      <View style={styles.track}>
        <Animated.View style={[styles.elbow, elbow]} />
        <View style={styles.branch}>
          <Animated.View style={[styles.branchLine, branchLine]} />
          <Animated.View style={[styles.dot, styles.changeDot, styles.at25, first]} />
          <Animated.View style={[styles.dot, styles.changeDot, styles.at55, second]} />
          <Animated.View style={[styles.dot, styles.changeDot, styles.at85, third]} />
        </View>
      </View>
    </View>
  );
}

const DOT = 8;
const ELBOW_LEFT = "30%";

const styles = StyleSheet.create((theme) => ({
  root: {
    flex: 1,
    justifyContent: "center",
    gap: 22,
    paddingHorizontal: theme.spacing[1],
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
  },
  label: {
    width: 44,
    color: theme.colors.foregroundMuted,
    fontFamily: theme.fontFamily.mono,
    fontSize: 10,
  },
  branchLabel: {
    color: theme.colors.accent,
  },
  track: {
    flex: 1,
    height: DOT,
    justifyContent: "center",
  },
  line: {
    height: 2,
    borderRadius: 1,
    backgroundColor: theme.colors.border,
  },
  dot: {
    position: "absolute",
    top: 0,
    width: DOT,
    height: DOT,
    marginLeft: -DOT / 2,
    borderRadius: DOT / 2,
    backgroundColor: theme.colors.foregroundMuted,
  },
  changeDot: {
    backgroundColor: theme.colors.accent,
  },
  at8: { left: "8%" },
  at25: { left: "25%" },
  at30: { left: ELBOW_LEFT },
  at50: { left: "50%" },
  at55: { left: "55%" },
  at68: { left: "68%" },
  at85: { left: "85%" },
  at86: { left: "86%" },
  elbow: {
    position: "absolute",
    left: ELBOW_LEFT,
    bottom: DOT / 2 - 1,
    width: 12,
    height: 30,
    borderLeftWidth: 2,
    borderBottomWidth: 2,
    borderBottomLeftRadius: 8,
    borderColor: theme.colors.accent,
  },
  branch: {
    position: "absolute",
    left: ELBOW_LEFT,
    marginLeft: 12,
    right: 0,
    top: 0,
    bottom: 0,
    justifyContent: "center",
  },
  branchLine: {
    height: 2,
    borderRadius: 1,
    backgroundColor: theme.colors.accent,
  },
  chip: {
    position: "absolute",
    right: 0,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.surface3,
  },
  chipBelow: {
    top: DOT + 10,
  },
  chipText: {
    color: theme.colors.foreground,
    fontSize: 10,
  },
}));
