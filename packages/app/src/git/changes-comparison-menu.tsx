import { useCallback, useMemo, useState, type ReactElement } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  MenuHint,
  MenuItem,
  MenuSeparator,
  MenuSubTrigger,
  MenuTextField,
  type MenuPageDefinition,
} from "@/components/ui/menu";
import { useToast } from "@/contexts/toast-context";
import { useFetchQuery } from "@/data/query";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { invalidateCheckoutGitQueriesForClient } from "@/git/query-keys";
import { useCheckoutCommitsQuery } from "@/git/use-commits-query";
import { useCheckoutStatusQuery } from "@/git/use-status-query";
import { useWorkingDiffSummary } from "@/git/use-working-diff-summary";
import type { WorkingDiffComparison } from "@/git/working-diff-comparison";
import { useHostRuntimeClient } from "@/runtime/host-runtime";
import { useSessionStore } from "@/stores/session-store";
import { formatTimeAgo } from "@/utils/time";

const TARGET_BRANCH_PAGE_ID = "changes-target-branch";
const MAX_MENU_COMMITS = 5;
const MAX_BRANCH_SUGGESTIONS = 12;

interface ChangesComparisonMenuInput {
  serverId: string;
  workspaceId?: string | null;
  cwd: string;
  diffMode: WorkingDiffComparison;
  baseRefLabel: string;
  onSelectUncommitted: () => void;
  onSelectBase: () => void;
  onOpenCommit: (sha: string) => void;
}

/**
 * The comparison half of the desktop Changes options menu: the target branch, which diff to
 * show, and the branch's own commits. Rows mount with the open menu, so their queries only run
 * while it is open.
 */
export function useChangesComparisonMenu(input: ChangesComparisonMenuInput): {
  items: ReactElement;
  pages: readonly MenuPageDefinition[];
} {
  const { t } = useTranslation();
  const {
    serverId,
    workspaceId,
    cwd,
    diffMode,
    baseRefLabel,
    onSelectUncommitted,
    onSelectBase,
    onOpenCommit,
  } = input;
  const items = useMemo(
    () => (
      <ChangesComparisonItems
        serverId={serverId}
        workspaceId={workspaceId}
        cwd={cwd}
        diffMode={diffMode}
        baseRefLabel={baseRefLabel}
        onSelectUncommitted={onSelectUncommitted}
        onSelectBase={onSelectBase}
        onOpenCommit={onOpenCommit}
      />
    ),
    [
      baseRefLabel,
      cwd,
      diffMode,
      onOpenCommit,
      onSelectBase,
      onSelectUncommitted,
      serverId,
      workspaceId,
    ],
  );
  const pages = useMemo<readonly MenuPageDefinition[]>(
    () => [
      {
        id: TARGET_BRANCH_PAGE_ID,
        title: t("workspace.git.diff.targetBranch"),
        // The page takes typed input, so the pointer must not open or dismiss it.
        hoverIntent: false,
        content: <TargetBranchPage serverId={serverId} cwd={cwd} baseRefLabel={baseRefLabel} />,
      },
    ],
    [baseRefLabel, cwd, serverId, t],
  );
  return { items, pages };
}

function ChangesComparisonItems({
  serverId,
  workspaceId,
  cwd,
  diffMode,
  baseRefLabel,
  onSelectUncommitted,
  onSelectBase,
  onOpenCommit,
}: ChangesComparisonMenuInput): ReactElement {
  const { t } = useTranslation();
  const { status } = useCheckoutStatusQuery({ serverId, cwd });
  // COMPAT(checkoutBaseRefSet): added in v0.9.6, remove gate after 2027-03-25.
  const baseRefSetSupported = useSessionStore(
    (state) => state.sessions[serverId]?.serverInfo?.features?.checkoutBaseRefSet === true,
  );
  const canSetTargetBranch =
    baseRefSetSupported && status?.isGit === true && status.isPaseoOwnedWorktree;
  const checkout = { serverId, workspaceId: workspaceId ?? undefined, cwd };
  const committed = useWorkingDiffSummary({ ...checkout, mode: "base" });
  const uncommitted = useWorkingDiffSummary({ ...checkout, mode: "uncommitted" });
  const commitsQuery = useCheckoutCommitsQuery({ serverId, cwd });
  const commits =
    commitsQuery.status === "loaded"
      ? commitsQuery.data.commits.filter((commit) => !commit.isOnBase).slice(0, MAX_MENU_COMMITS)
      : [];
  const describeCount = (summary: { fileCount: number } | null) =>
    summary
      ? t("workspace.git.prFlow.changes.filesChanged", { count: summary.fileCount })
      : undefined;

  return (
    <>
      <MenuSubTrigger
        id={TARGET_BRANCH_PAGE_ID}
        value={baseRefLabel}
        disabled={!canSetTargetBranch}
        testID="changes-target-branch"
      >
        {t("workspace.git.diff.targetBranch")}
      </MenuSubTrigger>
      <MenuSeparator />
      <MenuItem
        selected={diffMode === "base"}
        description={describeCount(committed)}
        onSelect={onSelectBase}
        testID="changes-diff-mode-committed"
      >
        {t("workspace.git.diff.committed")}
      </MenuItem>
      <MenuItem
        selected={diffMode === "uncommitted"}
        description={describeCount(uncommitted)}
        onSelect={onSelectUncommitted}
        testID="changes-diff-mode-uncommitted"
      >
        {t("workspace.git.diff.uncommitted")}
      </MenuItem>
      {commits.length > 0 ? <MenuSeparator /> : null}
      {commits.map((commit) => (
        <CommitMenuItem
          key={commit.sha}
          sha={commit.sha}
          subject={commit.subject}
          description={`${commit.shortSha} • ${commit.authorName} • ${formatTimeAgo(
            new Date(commit.authorDate),
          )}`}
          onOpenCommit={onOpenCommit}
        />
      ))}
    </>
  );
}

function CommitMenuItem({
  sha,
  subject,
  description,
  onOpenCommit,
}: {
  sha: string;
  subject: string;
  description: string;
  onOpenCommit: (sha: string) => void;
}): ReactElement {
  const handleSelect = useCallback(() => onOpenCommit(sha), [onOpenCommit, sha]);
  return (
    <MenuItem description={description} onSelect={handleSelect} testID={`changes-commit-${sha}`}>
      {subject}
    </MenuItem>
  );
}

function TargetBranchPage({
  serverId,
  cwd,
  baseRefLabel,
}: {
  serverId: string;
  cwd: string;
  baseRefLabel: string;
}): ReactElement {
  const { t } = useTranslation();
  const client = useHostRuntimeClient(serverId);
  const queryClient = useQueryClient();
  const toast = useToast();
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebouncedValue(query.trim(), 150);

  const branchesQuery = useFetchQuery({
    queryKey: ["branch-suggestions", serverId, cwd, debouncedQuery],
    queryFn: () => {
      if (!client) throw new Error(t("common.errors.daemonClientUnavailable"));
      return client.getBranchSuggestions({
        cwd,
        query: debouncedQuery || undefined,
        limit: MAX_BRANCH_SUGGESTIONS,
      });
    },
    enabled: Boolean(client),
    dataShape: "list",
    staleTimeMs: 15_000,
  });
  // Prefer the origin ref so the comparison tracks the pushed state, like `origin/main`.
  const branches = useMemo(
    () =>
      (branchesQuery.data?.branchDetails ?? []).map((branch) => ({
        ref: branch.hasRemote ? `origin/${branch.name}` : branch.name,
        name: branch.name,
      })),
    [branchesQuery.data?.branchDetails],
  );

  const selectBranch = useCallback(
    async (ref: string) => {
      if (!client) return;
      try {
        const result = await client.setCheckoutBaseRef(cwd, ref);
        if (result.error) throw new Error(result.error.message);
        await invalidateCheckoutGitQueriesForClient(queryClient, { serverId, cwd });
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : t("workspace.git.diff.failedSetTargetBranch"),
        );
      }
    },
    [client, cwd, queryClient, serverId, t, toast],
  );

  return (
    <>
      <MenuTextField
        onChangeText={setQuery}
        placeholder={t("workspace.git.diff.searchBranches")}
        autoFocus
        testID="changes-target-branch-search"
      />
      <MenuSeparator />
      {branches.map((branch) => (
        <TargetBranchItem
          key={branch.ref}
          branchRef={branch.ref}
          name={branch.name}
          selected={branch.name === baseRefLabel || branch.ref === baseRefLabel}
          onSelect={selectBranch}
        />
      ))}
      {branches.length === 0 ? (
        <MenuHint>
          {branchesQuery.isLoading
            ? t("workspace.git.diff.loadingBranches")
            : t("workspace.git.diff.noBranches")}
        </MenuHint>
      ) : null}
    </>
  );
}

function TargetBranchItem({
  branchRef,
  name,
  selected,
  onSelect,
}: {
  branchRef: string;
  name: string;
  selected: boolean;
  onSelect: (ref: string) => Promise<void>;
}): ReactElement {
  const handleSelect = useCallback(() => void onSelect(branchRef), [branchRef, onSelect]);
  return (
    <MenuItem selected={selected} onSelect={handleSelect} testID={`changes-target-branch-${name}`}>
      {name}
    </MenuItem>
  );
}
