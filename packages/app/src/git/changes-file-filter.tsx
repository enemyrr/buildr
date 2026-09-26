import { useCallback, useMemo, useState } from "react";
import { Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { useTranslation } from "react-i18next";
import { SearchField } from "@/components/ui/search-field";
import type { ParsedDiffFile } from "@/git/use-diff-query";

interface FileFilterState {
  query: string;
  collapsedFolderPaths: string[];
}

export function useChangesFileFilter({
  presentation,
  compact,
  files,
  collapsedFolderPaths,
  onCollapsedFolderPathsChange,
}: {
  presentation: "tree" | "diff" | "combined";
  compact: boolean;
  files: ParsedDiffFile[];
  collapsedFolderPaths: string[];
  onCollapsedFolderPathsChange: (paths: string[]) => void;
}) {
  const { t } = useTranslation();
  const [state, setState] = useState<FileFilterState | null>(null);
  const enabled = presentation === "tree" && !compact;
  const active = enabled && state !== null;
  const query = active ? state.query : "";
  const normalizedQuery = query.trim().toLowerCase();
  const visibleFiles = useMemo(
    () =>
      normalizedQuery
        ? files.filter((file) => file.path.toLowerCase().includes(normalizedQuery))
        : files,
    [files, normalizedQuery],
  );
  const toggle = useCallback(() => {
    setState((previous) => (previous === null ? { query: "", collapsedFolderPaths: [] } : null));
  }, []);
  const changeQuery = useCallback((nextQuery: string) => {
    // Reveal matching folders without changing the unfiltered tree's saved expansion.
    setState({ query: nextQuery, collapsedFolderPaths: [] });
  }, []);
  const collapseFilteredFolders = useCallback((paths: string[]) => {
    setState((previous) => (previous ? { ...previous, collapsedFolderPaths: paths } : null));
  }, []);
  const onKeyPress = useCallback((event: { nativeEvent: { key: string } }) => {
    if (event.nativeEvent.key === "Escape") setState(null);
  }, []);
  const control = useMemo(() => ({ value: active, onToggle: toggle }), [active, toggle]);
  const filtering = normalizedQuery.length > 0;
  const noMatches = files.length > 0 && visibleFiles.length === 0;

  return {
    control,
    files: visibleFiles,
    collapsedFolderPaths: filtering && state ? state.collapsedFolderPaths : collapsedFolderPaths,
    onCollapsedFolderPathsChange: filtering
      ? collapseFilteredFolders
      : onCollapsedFolderPathsChange,
    field: active ? (
      <View style={styles.filter}>
        <SearchField
          value={query}
          onChangeText={changeQuery}
          placeholder={t("workspace.git.prFlow.changes.filterFiles")}
          clearAccessibilityLabel={t("workspace.git.prFlow.changes.clearFilter")}
          autoFocus
          onKeyPress={onKeyPress}
          testID="changes-file-filter"
          clearTestID="changes-clear-filter"
        />
        <Text style={styles.count} testID="changes-filter-count">
          {t("workspace.git.prFlow.changes.filteredFiles", {
            visible: visibleFiles.length,
            total: files.length,
          })}
        </Text>
      </View>
    ) : null,
    emptyContent: noMatches ? (
      <View style={styles.empty} testID="changes-filter-empty">
        <Text style={styles.emptyText}>{t("workspace.git.prFlow.changes.noMatchingFiles")}</Text>
      </View>
    ) : null,
  };
}

const styles = StyleSheet.create((theme) => ({
  filter: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    paddingHorizontal: theme.spacing[2],
    paddingVertical: theme.spacing[1],
    borderBottomWidth: theme.borderWidth[1],
    borderBottomColor: theme.colors.border,
  },
  count: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.foregroundMuted,
    flexShrink: 0,
  },
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: theme.spacing[4],
  },
  emptyText: {
    fontSize: theme.fontSize.base,
    color: theme.colors.foregroundMuted,
    textAlign: "center",
  },
}));
