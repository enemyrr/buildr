import { useCallback, type ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { CircleCheck } from "lucide-react-native";
import { isWeb } from "@/constants/platform";
import type { Theme } from "@/styles/theme";

const CheckIcon = withUnistyles(CircleCheck, (theme: Theme) => ({ color: theme.colors.accent }));

const CHECKED = { checked: true };
const UNCHECKED = { checked: false };

interface ChoiceCardProps<T extends string> {
  value: T;
  title: string;
  description: string;
  selected: boolean;
  onSelect: (value: T) => void;
  /** The animated preview drawn above the label. */
  children: ReactNode;
  testID?: string;
}

/** One option of a single-choice onboarding step: an animated preview above its label. */
export function ChoiceCard<T extends string>({
  value,
  title,
  description,
  selected,
  onSelect,
  children,
  testID,
}: ChoiceCardProps<T>) {
  const handlePress = useCallback(() => onSelect(value), [onSelect, value]);
  return (
    <Pressable
      onPress={handlePress}
      style={selected ? styles.cardSelected : styles.card}
      accessibilityRole="radio"
      accessibilityState={selected ? CHECKED : UNCHECKED}
      accessibilityLabel={title}
      testID={testID}
    >
      <View style={styles.preview}>{children}</View>
      <View style={styles.copy}>
        <View style={styles.titleRow}>
          <Text style={styles.title}>{title}</Text>
          {selected ? <CheckIcon size={16} /> : null}
        </View>
        <Text style={styles.description}>{description}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create((theme) => {
  const card = {
    flex: 1,
    minWidth: 180,
    borderRadius: theme.borderRadius.xl,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface1,
    overflow: "hidden" as const,
    ...(isWeb
      ? { transitionProperty: "border-color, background-color", transitionDuration: "150ms" }
      : {}),
  };
  return {
    card,
    cardSelected: {
      ...card,
      borderColor: theme.colors.accent,
      backgroundColor: theme.colors.surface2,
    },
    preview: {
      height: 132,
      padding: theme.spacing[3],
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.border,
      backgroundColor: theme.colors.surface0,
    },
    copy: {
      padding: theme.spacing[3],
      gap: theme.spacing[1],
    },
    titleRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: theme.spacing[2],
    },
    title: {
      color: theme.colors.foreground,
      fontSize: theme.fontSize.base,
      fontWeight: theme.fontWeight.medium,
    },
    description: {
      color: theme.colors.foregroundMuted,
      fontSize: theme.fontSize.sm,
      lineHeight: 18,
    },
  };
});
