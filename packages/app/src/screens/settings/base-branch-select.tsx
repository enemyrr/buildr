import { useCallback, useMemo, useRef, useState } from "react";
import { Text, View, type PressableStateCallbackType } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { useTranslation } from "react-i18next";
import type { DaemonClient } from "@getpaseo/client/internal/daemon-client";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
import { ComboboxTrigger } from "@/components/ui/combobox-trigger";
import { SettingsRow } from "@/components/settings";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useFetchQuery } from "@/data/query";

// Empty means "branch from whatever is checked out"; the combobox needs a non-empty id for it.
const CHECKED_OUT_OPTION_ID = "__checked-out__";

interface BaseBranchSelectProps {
  client: DaemonClient;
  repoRoot: string;
  value: string;
  onValueChange: (value: string) => void;
  testID?: string;
}

export function BaseBranchSelect({
  client,
  repoRoot,
  value,
  onValueChange,
  testID,
}: BaseBranchSelectProps) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedQuery = useDebouncedValue(searchQuery.trim(), 150);
  const anchorRef = useRef<View | null>(null);
  const checkedOutLabel = t("settings.project.git.baseBranchCheckedOut");

  const branchesQuery = useFetchQuery({
    queryKey: ["branch-suggestions", repoRoot, debouncedQuery],
    queryFn: () =>
      client.getBranchSuggestions({ cwd: repoRoot, query: debouncedQuery || undefined, limit: 50 }),
    enabled: isOpen,
    dataShape: "list",
    staleTimeMs: 15_000,
  });

  const options = useMemo<ComboboxOption[]>(() => {
    // Prefer the origin ref so new workspaces start from the pushed state, like `origin/main`.
    const branches = (branchesQuery.data?.branchDetails ?? []).map((branch) => {
      const ref = branch.hasRemote ? `origin/${branch.name}` : branch.name;
      return { id: ref, label: branch.name };
    });
    return [{ id: CHECKED_OUT_OPTION_ID, label: checkedOutLabel }, ...branches];
  }, [branchesQuery.data?.branchDetails, checkedOutLabel]);

  const handleSelect = useCallback(
    (id: string) => {
      onValueChange(id === CHECKED_OUT_OPTION_ID ? "" : id);
      setIsOpen(false);
    },
    [onValueChange],
  );
  const handleOpen = useCallback(() => setIsOpen(true), []);
  const triggerStyle = useCallback(
    ({ hovered = false }: PressableStateCallbackType & { hovered?: boolean }) => [
      styles.trigger,
      hovered && styles.triggerHovered,
    ],
    [],
  );

  return (
    <SettingsRow
      label={t("settings.project.git.baseBranch")}
      hint={t("settings.project.git.baseBranchHint")}
      testID={testID}
    >
      <ComboboxTrigger
        ref={anchorRef}
        style={triggerStyle}
        onPress={handleOpen}
        accessibilityRole="button"
        accessibilityLabel={t("settings.project.git.baseBranch")}
        testID={testID ? `${testID}-trigger` : undefined}
      >
        <Text style={styles.value} numberOfLines={1}>
          {value || checkedOutLabel}
        </Text>
      </ComboboxTrigger>
      <Combobox
        options={options}
        value={value || CHECKED_OUT_OPTION_ID}
        onSelect={handleSelect}
        searchable
        searchPlaceholder={t("settings.project.git.baseBranchSearch")}
        onSearchQueryChange={setSearchQuery}
        allowCustomValue
        open={isOpen}
        onOpenChange={setIsOpen}
        anchorRef={anchorRef}
        desktopMinWidth={280}
      />
    </SettingsRow>
  );
}

const styles = StyleSheet.create((theme) => ({
  trigger: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
    paddingVertical: theme.spacing[1],
    paddingHorizontal: theme.spacing[2],
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    maxWidth: 260,
  },
  triggerHovered: {
    backgroundColor: theme.colors.surface2,
  },
  value: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.base,
    flexShrink: 1,
  },
}));
