import { useCallback } from "react";
import { Text } from "react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { ChevronDown } from "lucide-react-native";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ICON_SIZE, type Theme } from "@/styles/theme";

const ThemedChevronDown = withUnistyles(ChevronDown);
const mutedMapping = (theme: Theme) => ({ color: theme.colors.foregroundMuted });

export interface SessionsFilterOption {
  value: string;
  label: string;
}

/** A borderless "In all projects ▾" style filter: the label is the current choice. */
export function SessionsFilterDropdown({
  label,
  options,
  value,
  onChange,
  testID,
}: {
  label: string;
  options: readonly SessionsFilterOption[];
  value: string;
  onChange: (value: string) => void;
  testID?: string;
}) {
  const triggerStyle = useCallback(
    ({ hovered, open }: { hovered: boolean; open: boolean }) => [
      styles.trigger,
      (hovered || open) && styles.triggerHovered,
    ],
    [],
  );
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        style={triggerStyle}
        accessibilityRole="button"
        accessibilityLabel={label}
        testID={testID}
      >
        <Text style={styles.label} numberOfLines={1}>
          {label}
        </Text>
        <ThemedChevronDown size={ICON_SIZE.xs} uniProps={mutedMapping} />
      </DropdownMenuTrigger>
      <DropdownMenuContent side="bottom" align="start" offset={4} minWidth={200}>
        {options.map((option) => (
          <SessionsFilterItem
            key={option.value}
            option={option}
            isSelected={option.value === value}
            onChange={onChange}
          />
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function SessionsFilterItem({
  option,
  isSelected,
  onChange,
}: {
  option: SessionsFilterOption;
  isSelected: boolean;
  onChange: (value: string) => void;
}) {
  const handleSelect = useCallback(() => onChange(option.value), [onChange, option.value]);
  return (
    <DropdownMenuItem onSelect={handleSelect} selected={isSelected}>
      {option.label}
    </DropdownMenuItem>
  );
}

const styles = StyleSheet.create((theme) => ({
  trigger: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
    height: 28,
    paddingHorizontal: theme.spacing[2],
    borderRadius: theme.borderRadius.md,
    flexShrink: 0,
  },
  triggerHovered: {
    backgroundColor: theme.colors.interactionHighlight,
  },
  label: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.foregroundMuted,
    maxWidth: 200,
  },
}));
