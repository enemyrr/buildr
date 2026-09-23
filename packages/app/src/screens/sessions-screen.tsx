import { useMemo, useState, useCallback, useEffect, type ReactElement } from "react";
import { View, Text } from "react-native";
import { useIsFocused } from "@react-navigation/native";
import { router } from "expo-router";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { ChevronLeft, Import, Plus } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { MenuHeader } from "@/components/headers/menu-header";
import { Button } from "@/components/ui/button";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { AgentList } from "@/components/agent-list";
import { SearchField } from "@/components/ui/search-field";
import {
  SessionsFilterDropdown,
  type SessionsFilterOption,
} from "@/components/sessions-filter-dropdown";
import type { AggregatedAgent } from "@/hooks/use-aggregated-agents";
import { HostFilter } from "@/components/hosts/host-filter";
import { ALL_HOSTS_OPTION_ID } from "@/components/hosts/host-picker";
import { type AgentHistoryHostError, useAgentHistory } from "@/hooks/use-agent-history";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useImportSession } from "@/hooks/use-import-session";
import { useHosts } from "@/runtime/host-runtime";
import { buildNewWorkspaceRoute, buildOpenProjectRoute } from "@/utils/host-routes";

/** Long enough that a typed word is one request, short enough to feel live. */
const SEARCH_DEBOUNCE_MS = 200;

const sessionsHostOptionTestID = (serverId: string) => `sessions-host-filter-item-${serverId}`;

const ALL_PROJECTS = "__all__";
type ArchivedFilter = "hide" | "show";

function agentProjectKey(agent: AggregatedAgent): string | null {
  return agent.projectPlacement?.projectKey ?? null;
}

/** Projects present in the loaded history, in first-seen (most recent) order. */
function collectProjectOptions(agents: readonly AggregatedAgent[]): SessionsFilterOption[] {
  const seen = new Map<string, string>();
  for (const agent of agents) {
    const key = agentProjectKey(agent);
    if (!key || seen.has(key)) continue;
    seen.set(key, agent.projectPlacement?.projectName ?? key);
  }
  return Array.from(seen, ([value, label]) => ({ value, label }));
}

/**
 * A host that failed while others answered. Without this the list silently
 * under-reports, and under a query "No sessions match" becomes a claim the app
 * has no basis for.
 */
function SessionHostErrorsBanner({
  errors,
  t,
}: {
  errors: AgentHistoryHostError[];
  t: TFunction;
}): ReactElement {
  return (
    <View style={styles.errorsBannerWrap}>
      <View style={styles.errorsBanner} testID="sessions-host-errors">
        {errors.map((error) => (
          <Text key={error.serverId} style={styles.errorsBannerText}>
            {t("sessions.hostLoadFailed", { host: error.serverName })}
          </Text>
        ))}
      </View>
    </View>
  );
}

/** An empty list means something different once a query is narrowing it. */
function resolveEmptyText(input: {
  t: TFunction;
  isSearching: boolean;
  isFiltering: boolean;
  isAllHosts: boolean;
}): string {
  if (input.isSearching || input.isFiltering) return input.t("sessions.noMatches");
  if (input.isAllHosts) return input.t("sessions.empty");
  return "No sessions for this host";
}

interface SessionsFilterState {
  visibleAgents: AggregatedAgent[];
  isFiltering: boolean;
  projectFilter: {
    label: string;
    options: SessionsFilterOption[];
    value: string;
    onChange: (value: string) => void;
  };
  archivedFilter: {
    label: string;
    options: SessionsFilterOption[];
    value: ArchivedFilter;
    onChange: (value: string) => void;
  };
}

/** Client-side project and archived filters over the loaded history page. */
function useSessionsFilters(agents: AggregatedAgent[]): SessionsFilterState {
  const { t } = useTranslation();
  const [projectFilter, setProjectFilter] = useState(ALL_PROJECTS);
  const [archivedFilter, setArchivedFilter] = useState<ArchivedFilter>("hide");

  const projectOptions = useMemo(
    () => [
      { value: ALL_PROJECTS, label: t("sessions.filters.allProjects") },
      ...collectProjectOptions(agents),
    ],
    [agents, t],
  );
  const archivedOptions = useMemo(
    () => [
      { value: "hide", label: t("sessions.filters.hidingArchived") },
      { value: "show", label: t("sessions.filters.showingArchived") },
    ],
    [t],
  );
  const handleArchivedFilterChange = useCallback(
    (value: string) => setArchivedFilter(value === "show" ? "show" : "hide"),
    [],
  );
  const visibleAgents = useMemo(
    () =>
      agents.filter(
        (agent) =>
          (archivedFilter === "show" || !agent.archivedAt) &&
          (projectFilter === ALL_PROJECTS || agentProjectKey(agent) === projectFilter),
      ),
    [agents, archivedFilter, projectFilter],
  );
  const isFiltering = projectFilter !== ALL_PROJECTS || archivedFilter === "hide";
  const selectedProjectLabel =
    projectFilter === ALL_PROJECTS
      ? t("sessions.filters.allProjects")
      : t("sessions.filters.inProject", {
          project:
            projectOptions.find((option) => option.value === projectFilter)?.label ?? projectFilter,
        });
  const archivedLabel =
    archivedFilter === "hide"
      ? t("sessions.filters.hidingArchived")
      : t("sessions.filters.showingArchived");

  return {
    visibleAgents,
    isFiltering,
    projectFilter: {
      label: selectedProjectLabel,
      options: projectOptions,
      value: projectFilter,
      onChange: setProjectFilter,
    },
    archivedFilter: {
      label: archivedLabel,
      options: archivedOptions,
      value: archivedFilter,
      onChange: handleArchivedFilterChange,
    },
  };
}

export function SessionsScreen() {
  const isFocused = useIsFocused();

  if (!isFocused) {
    return <View style={styles.container} />;
  }

  return <SessionsScreenContent />;
}

function SessionsScreenContent() {
  const { theme } = useUnistyles();
  const { t } = useTranslation();
  const importSession = useImportSession();
  const hosts = useHosts();
  const [selectedHost, setSelectedHost] = useState(ALL_HOSTS_OPTION_ID);
  const [searchInput, setSearchInput] = useState("");
  const search = useDebouncedValue(searchInput, SEARCH_DEBOUNCE_MS).trim();
  const historyServerId = selectedHost === ALL_HOSTS_OPTION_ID ? null : selectedHost;
  const {
    agents,
    hasMore,
    isInitialLoad,
    isLoadingMore,
    isError,
    isSearchSupported,
    isSearchTruncated,
    hostErrors,
    loadMore,
    refreshAll,
  } = useAgentHistory({
    serverId: historyServerId,
    search,
  });
  const isSearching = isSearchSupported && search.length > 0;
  const { visibleAgents, isFiltering, projectFilter, archivedFilter } = useSessionsFilters(agents);

  useEffect(() => {
    if (
      selectedHost !== ALL_HOSTS_OPTION_ID &&
      !hosts.some((host) => host.serverId === selectedHost)
    ) {
      setSelectedHost(ALL_HOSTS_OPTION_ID);
    }
  }, [hosts, selectedHost]);

  const [isManualRefresh, setIsManualRefresh] = useState(false);

  const handleRefresh = useCallback(() => {
    setIsManualRefresh(true);
    void refreshAll().finally(() => setIsManualRefresh(false));
  }, [refreshAll]);

  // Searching filters the chronological history without changing its date buckets.
  const emptyText = resolveEmptyText({
    t,
    isSearching,
    isFiltering: isFiltering && agents.length > 0,
    isAllHosts: selectedHost === ALL_HOSTS_OPTION_ID,
  });
  const showHostFilter = hosts.length > 1;
  const showLoadError = isError && agents.length === 0;

  const handleBack = useCallback(() => {
    router.navigate(buildOpenProjectRoute());
  }, []);

  const handleClearSearch = useCallback(() => setSearchInput(""), []);
  const handleCreateWorkspace = useCallback(() => {
    router.push(buildNewWorkspaceRoute());
  }, []);
  const headerRight = useMemo(
    () => (
      <Button
        size="xs"
        variant="secondary"
        leftIcon={Plus}
        onPress={handleCreateWorkspace}
        testID="sessions-create-workspace"
      >
        {t("sidebar.actions.newWorkspace")}
      </Button>
    ),
    [handleCreateWorkspace, t],
  );

  const listFooterComponent = useMemo(() => {
    // COMPAT(historyPagination): old daemons return a truncated relevance page.
    // Added in v0.8.0; remove after 2027-03-16 once the daemon floor supports search pagination.
    if (isSearchTruncated) {
      return (
        <View style={styles.footer}>
          <Text style={styles.footerHint}>{t("sessions.tooManyMatches")}</Text>
        </View>
      );
    }
    if (!hasMore) {
      return null;
    }
    return (
      <View style={styles.footer}>
        <Button variant="ghost" onPress={loadMore} disabled={isLoadingMore}>
          {isLoadingMore ? "Loading..." : t("sessions.actions.loadMore")}
        </Button>
      </View>
    );
  }, [hasMore, isLoadingMore, isSearchTruncated, loadMore, t]);

  return (
    <View style={styles.container}>
      <MenuHeader title={t("sessions.title")} rightContent={headerRight} />
      <View style={styles.filterContainer}>
        {isSearchSupported ? (
          <SearchField
            value={searchInput}
            onChangeText={setSearchInput}
            placeholder={t("sessions.searchPlaceholder")}
            clearAccessibilityLabel={t("sessions.actions.clearSearch")}
            testID="sessions-search-input"
            clearTestID="sessions-search-clear"
          />
        ) : null}
        <View style={styles.filterRow}>
          <SessionsFilterDropdown {...projectFilter} testID="sessions-project-filter" />
          <SessionsFilterDropdown {...archivedFilter} testID="sessions-archived-filter" />
          {showHostFilter ? (
            <HostFilter
              hosts={hosts}
              selectedHost={selectedHost}
              onSelectHost={setSelectedHost}
              triggerTestID="sessions-host-filter-trigger"
              hostOptionTestID={sessionsHostOptionTestID}
            />
          ) : null}
        </View>
      </View>
      {hostErrors.length > 0 ? <SessionHostErrorsBanner errors={hostErrors} t={t} /> : null}
      {isInitialLoad ? (
        <View style={styles.loadingContainer}>
          <LoadingSpinner size="large" color={theme.colors.foregroundMuted} />
        </View>
      ) : null}
      {!isInitialLoad && showLoadError ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>Unable to load sessions</Text>
          <Button variant="ghost" onPress={handleRefresh}>
            Try again
          </Button>
        </View>
      ) : null}
      {!isInitialLoad && !showLoadError && visibleAgents.length === 0 ? (
        <View style={styles.emptyContainer} testID="sessions-empty">
          <Text style={styles.emptyText}>{emptyText}</Text>
          {isSearching ? (
            <Button variant="ghost" onPress={handleClearSearch}>
              {t("sessions.actions.clearSearch")}
            </Button>
          ) : (
            <Button variant="ghost" leftIcon={ChevronLeft} onPress={handleBack}>
              Back
            </Button>
          )}
          <Button variant="ghost" leftIcon={Import} onPress={importSession.open}>
            {t("importSession.title")}
          </Button>
        </View>
      ) : null}
      {!isInitialLoad && !showLoadError && visibleAgents.length > 0 ? (
        <AgentList
          agents={visibleAgents}
          showCheckoutInfo={false}
          isRefreshing={isManualRefresh}
          onRefresh={handleRefresh}
          listFooterComponent={listFooterComponent}
          showAttentionIndicator={false}
          showHostColumn
          search={isSearching ? search : undefined}
        />
      ) : null}
      {importSession.sheet}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: {
    flex: 1,
    backgroundColor: theme.colors.surface0,
  },
  filterContainer: {
    gap: theme.spacing[2],
    paddingHorizontal: {
      xs: theme.spacing[3],
      md: theme.spacing[6],
    },
    paddingTop: theme.spacing[4],
  },
  filterRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: theme.spacing[1],
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: theme.spacing[6],
    padding: theme.spacing[6],
  },
  emptyText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.base,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  footer: {
    alignItems: "center",
    paddingVertical: theme.spacing[4],
  },
  footerHint: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.base,
  },
  errorsBannerWrap: {
    paddingHorizontal: {
      xs: theme.spacing[3],
      md: theme.spacing[6],
    },
    paddingTop: theme.spacing[3],
  },
  errorsBanner: {
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing[3],
    gap: theme.spacing[1],
  },
  errorsBannerText: {
    color: theme.colors.palette.red[300],
    fontSize: theme.fontSize.sm,
  },
}));
