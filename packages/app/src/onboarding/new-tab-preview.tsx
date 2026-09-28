import { Text, View } from "react-native";
import Animated from "react-native-reanimated";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { Globe, MessageSquare, SquareTerminal } from "lucide-react-native";
import type { DefaultNewTab } from "@/hooks/use-settings";
import type { Theme } from "@/styles/theme";
import { useLoopProgress, useRevealStyle } from "./loop-progress";

const DURATION_MS = 2200;
const ICON_SIZE = 10;

const foregroundMapping = (theme: Theme) => ({ color: theme.colors.foreground });
const mutedMapping = (theme: Theme) => ({ color: theme.colors.foregroundMuted });
const ChatIcon = withUnistyles(MessageSquare, foregroundMapping);
const TerminalIcon = withUnistyles(SquareTerminal, foregroundMapping);
const BrowserIcon = withUnistyles(Globe, foregroundMapping);
const MutedChatIcon = withUnistyles(MessageSquare, mutedMapping);
const MutedTerminalIcon = withUnistyles(SquareTerminal, mutedMapping);
const MutedBrowserIcon = withUnistyles(Globe, mutedMapping);

const TAB_ICONS = {
  agent: ChatIcon,
  terminal: TerminalIcon,
  browser: BrowserIcon,
  launcher: null,
} as const;

/** A tiny workspace window: a tab pops into the strip, then fills with what `kind` opens. */
export function NewTabPreview({ kind, active }: { kind: DefaultNewTab; active: boolean }) {
  const progress = useLoopProgress(active, DURATION_MS);
  const tabStyle = useRevealStyle(progress, 0.02);
  const TabIcon = TAB_ICONS[kind];

  return (
    <View style={styles.window}>
      <View style={styles.tabStrip}>
        <View style={styles.idleTab} />
        <View style={styles.idleTab} />
        <Animated.View style={[styles.newTab, tabStyle]}>
          {TabIcon ? <TabIcon size={ICON_SIZE} /> : <Text style={styles.plus}>+</Text>}
        </Animated.View>
      </View>
      <View style={styles.body}>
        {kind === "agent" ? <ChatBody progress={progress} /> : null}
        {kind === "terminal" ? <TerminalBody progress={progress} /> : null}
        {kind === "browser" ? <BrowserBody progress={progress} /> : null}
        {kind === "launcher" ? <LauncherBody progress={progress} /> : null}
      </View>
    </View>
  );
}

type Progress = ReturnType<typeof useLoopProgress>;

function ChatBody({ progress }: { progress: Progress }) {
  const prompt = useRevealStyle(progress, 0.18);
  const line1 = useRevealStyle(progress, 0.36);
  const line2 = useRevealStyle(progress, 0.46);
  const line3 = useRevealStyle(progress, 0.56);
  return (
    <View style={styles.fill}>
      <Animated.View style={[styles.userBubble, prompt]} />
      <Animated.View style={[styles.line, styles.w90, line1]} />
      <Animated.View style={[styles.line, styles.w75, line2]} />
      <Animated.View style={[styles.line, styles.w50, line3]} />
      <View style={styles.composer} />
    </View>
  );
}

function TerminalBody({ progress }: { progress: Progress }) {
  const command = useRevealStyle(progress, 0.18);
  const output = useRevealStyle(progress, 0.4);
  const prompt = useRevealStyle(progress, 0.6);
  return (
    <View style={styles.terminal}>
      <Animated.Text style={[styles.mono, command]}>$ npm run dev</Animated.Text>
      <Animated.Text style={[styles.monoMuted, output]}>ready on localhost:3000</Animated.Text>
      <Animated.View style={[styles.promptRow, prompt]}>
        <Text style={styles.mono}>$ </Text>
        <View style={styles.cursor} />
      </Animated.View>
    </View>
  );
}

function BrowserBody({ progress }: { progress: Progress }) {
  const address = useRevealStyle(progress, 0.18);
  const hero = useRevealStyle(progress, 0.36);
  const copy = useRevealStyle(progress, 0.52);
  return (
    <View style={styles.fill}>
      <Animated.View style={[styles.addressBar, address]}>
        <MutedBrowserIcon size={8} />
        <View style={styles.addressText} />
      </Animated.View>
      <Animated.View style={[styles.hero, hero]} />
      <Animated.View style={[styles.line, styles.w75, copy]} />
    </View>
  );
}

function LauncherBody({ progress }: { progress: Progress }) {
  const row1 = useRevealStyle(progress, 0.18);
  const row2 = useRevealStyle(progress, 0.26);
  const row3 = useRevealStyle(progress, 0.34);
  const highlight = useRevealStyle(progress, 0.56);
  return (
    <View style={styles.launcher}>
      <Animated.View style={[styles.launcherRow, row1]}>
        <Animated.View style={[styles.launcherHighlight, highlight]} />
        <MutedChatIcon size={ICON_SIZE} />
        <View style={[styles.launcherLabel, styles.w50]} />
      </Animated.View>
      <Animated.View style={[styles.launcherRow, row2]}>
        <MutedTerminalIcon size={ICON_SIZE} />
        <View style={[styles.launcherLabel, styles.w60]} />
      </Animated.View>
      <Animated.View style={[styles.launcherRow, row3]}>
        <MutedBrowserIcon size={ICON_SIZE} />
        <View style={[styles.launcherLabel, styles.w40]} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  window: {
    flex: 1,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface1,
    overflow: "hidden",
  },
  tabStrip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    height: 20,
    paddingHorizontal: 6,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  idleTab: {
    width: 28,
    height: 10,
    borderRadius: 3,
    backgroundColor: theme.colors.surface3,
    opacity: 0.6,
  },
  newTab: {
    width: 34,
    height: 14,
    borderRadius: 4,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.surface3,
  },
  plus: {
    color: theme.colors.foreground,
    fontSize: 10,
    lineHeight: 12,
  },
  body: {
    flex: 1,
    padding: 8,
  },
  fill: {
    flex: 1,
    gap: 5,
  },
  userBubble: {
    alignSelf: "flex-end",
    width: "55%",
    height: 12,
    borderRadius: 6,
    backgroundColor: theme.colors.surface3,
  },
  line: {
    height: 5,
    borderRadius: 3,
    backgroundColor: theme.colors.foregroundExtraMuted,
  },
  w90: { width: "90%" },
  w75: { width: "75%" },
  w60: { width: "60%" },
  w50: { width: "50%" },
  w40: { width: "40%" },
  composer: {
    marginTop: "auto",
    height: 14,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  terminal: {
    flex: 1,
    gap: 3,
  },
  mono: {
    color: theme.colors.foreground,
    fontFamily: theme.fontFamily.mono,
    fontSize: 9,
    lineHeight: 12,
  },
  monoMuted: {
    color: theme.colors.foregroundMuted,
    fontFamily: theme.fontFamily.mono,
    fontSize: 9,
    lineHeight: 12,
  },
  promptRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  cursor: {
    width: 5,
    height: 10,
    backgroundColor: theme.colors.accent,
  },
  addressBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    height: 12,
    paddingHorizontal: 4,
    borderRadius: 6,
    backgroundColor: theme.colors.surface3,
  },
  addressText: {
    width: "45%",
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.colors.foregroundMuted,
    opacity: 0.4,
  },
  hero: {
    height: 26,
    borderRadius: 4,
    backgroundColor: theme.colors.surface3,
  },
  launcher: {
    flex: 1,
    gap: 3,
  },
  launcherRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    height: 16,
    paddingHorizontal: 5,
  },
  launcherHighlight: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 4,
    backgroundColor: theme.colors.surface3,
  },
  launcherLabel: {
    height: 5,
    borderRadius: 3,
    backgroundColor: theme.colors.foregroundMuted,
    opacity: 0.4,
  },
}));
