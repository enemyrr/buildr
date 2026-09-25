import { useCallback, useMemo, type ComponentType } from "react";
import { Pressable, Text, View, type PressableStateCallbackType } from "react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { ICON_SIZE, type Theme } from "@/styles/theme";

export interface SettingsTab<T extends string> {
  value: T;
  label: string;
  icon?: ComponentType<{ size: number; color: string }>;
}

interface SettingsTabsProps<T extends string> {
  tabs: readonly SettingsTab<T>[];
  value: T;
  onChange: (value: T) => void;
  testID?: string;
}

/**
 * Underlined tab strip that splits one settings page into views. Sits at the
 * top of the page, above the first section.
 */
export function SettingsTabs<T extends string>({
  tabs,
  value,
  onChange,
  testID,
}: SettingsTabsProps<T>) {
  return (
    <View style={styles.bar} role="tablist" testID={testID}>
      {tabs.map((tab) => (
        <SettingsTabButton
          key={tab.value}
          tab={tab}
          isSelected={tab.value === value}
          onSelect={onChange}
          testID={testID ? `${testID}-${tab.value}` : undefined}
        />
      ))}
    </View>
  );
}

function SettingsTabButton<T extends string>({
  tab,
  isSelected,
  onSelect,
  testID,
}: {
  tab: SettingsTab<T>;
  isSelected: boolean;
  onSelect: (value: T) => void;
  testID?: string;
}) {
  const { value, label, icon: Icon } = tab;
  const handlePress = useCallback(() => onSelect(value), [onSelect, value]);
  const accessibilityState = useMemo(() => ({ selected: isSelected }), [isSelected]);
  const tabStyle = useCallback(() => [styles.tab, isSelected && styles.tabSelected], [isSelected]);

  return (
    <Pressable
      role="tab"
      accessibilityState={accessibilityState}
      onPress={handlePress}
      style={tabStyle}
      testID={testID}
    >
      {({ hovered }: PressableStateCallbackType & { hovered?: boolean }) => (
        <SettingsTabContent
          label={label}
          icon={Icon}
          isHighlighted={isSelected || Boolean(hovered)}
        />
      )}
    </Pressable>
  );
}

type TabIconComponent = ComponentType<{ size: number; color: string }>;

function TabIcon({ icon: Icon, color = "" }: { icon: TabIconComponent; color?: string }) {
  return <Icon size={ICON_SIZE.sm} color={color} />;
}

const ThemedTabIcon = withUnistyles(TabIcon);
const foregroundColor = (theme: Theme) => ({ color: theme.colors.foreground });
const mutedColor = (theme: Theme) => ({ color: theme.colors.foregroundMuted });

function SettingsTabContent({
  label,
  icon,
  isHighlighted,
}: {
  label: string;
  icon?: TabIconComponent;
  isHighlighted: boolean;
}) {
  return (
    <>
      {icon ? (
        <ThemedTabIcon icon={icon} uniProps={isHighlighted ? foregroundColor : mutedColor} />
      ) : null}
      <Text style={isHighlighted ? styles.labelHighlighted : styles.label} numberOfLines={1}>
        {label}
      </Text>
    </>
  );
}

const styles = StyleSheet.create((theme) => ({
  bar: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing[6],
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    marginBottom: theme.spacing[6],
  },
  tab: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    paddingVertical: theme.spacing[2],
    marginBottom: -1,
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  tabSelected: {
    borderBottomColor: theme.colors.foreground,
  },
  label: {
    fontSize: theme.fontSize.base,
    color: theme.colors.foregroundMuted,
  },
  labelHighlighted: {
    fontSize: theme.fontSize.base,
    color: theme.colors.foreground,
  },
}));
