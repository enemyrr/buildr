import { useMemo } from "react";
import { ChevronDown, ChevronRight } from "lucide-react-native";
import { Pressable, Text } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { DensityIcon } from "@/components/ui/density-icon";
import { useIsCompactFormFactor } from "@/constants/layout";
import { isNative } from "@/constants/platform";
import { density } from "@/styles/density";

/** The collapsible label over a hoisted sidebar section, such as Pinned or Snoozed. */
export function SidebarSectionHeader({
  title,
  collapsed,
  onToggle,
  testID,
}: {
  title: string;
  collapsed: boolean;
  onToggle: () => void;
  testID: string;
}) {
  const isCompact = useIsCompactFormFactor();
  const accessibilityState = useMemo(() => ({ expanded: !collapsed }), [collapsed]);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={accessibilityState}
      onPress={onToggle}
      style={styles.header}
      testID={testID}
    >
      {({ hovered }) => (
        <>
          <Text style={styles.title}>{title}</Text>
          {hovered || isNative || isCompact ? (
            <DensityIcon
              icon={collapsed ? ChevronRight : ChevronDown}
              size="xs"
              color="foregroundMuted"
            />
          ) : null}
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create((theme) => ({
  header: {
    minHeight: density.tightRowHeight,
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: theme.spacing[1],
    paddingHorizontal: theme.spacing[2],
    paddingVertical: theme.spacing[1],
    userSelect: "none",
  },
  title: {
    color: theme.colors.foregroundExtraMuted,
    fontSize: 11,
    fontWeight: theme.fontWeight.medium,
  },
}));
