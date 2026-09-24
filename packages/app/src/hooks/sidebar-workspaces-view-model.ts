import type { PrHint } from "@/git/pr-hint";
import { selectPrHintFromStatus } from "@/git/pr-hint";
import { type HostProjectListItem } from "@/projects/host-project-model";
import type { PendingCreateAttempt } from "@/stores/create-flow-store";
import type { WorkspaceDescriptor } from "@/stores/session-store";
import type {
  WorkspaceStructureHostPlacement,
  WorkspaceStructureProject,
} from "@/projects/workspace-structure";
import { projectDisplayNameFromProjectId } from "@/utils/project-display-name";
import { aggregateSidebarStateBuckets } from "@/utils/sidebar-agent-state";
import { shortenPath } from "@/utils/shorten-path";
import type { WorkspaceAgentActivity } from "@/utils/workspace-agent-activity";
import { resolveWorkspaceMapKeyByIdentity } from "@/utils/workspace-identity";

const EMPTY_PROJECTS: SidebarProjectEntry[] = [];

export type SidebarStateBucket = WorkspaceDescriptor["status"];

export interface SidebarWorkspacePlacement {
  workspaceKey: string;
  serverId: string;
  workspaceId: string;
  projectViewKey: string;
  projectName: string;
  projectRootPath?: string;
  workspaceDirectory?: string;
  projectKind: WorkspaceStructureProject["projectKind"];
  workspaceKind: WorkspaceDescriptor["workspaceKind"];
  name: string;
}

export interface SidebarStatusWorkspacePlacement extends SidebarWorkspacePlacement {
  statusBucket: SidebarStateBucket;
  statusEnteredAt: Date | null;
}

export interface SidebarWorkspaceEntry extends SidebarStatusWorkspacePlacement {
  workspaceDirectory: string;
  workspaceDirectoryLabel: string;
  // Raw user-set title (null when the name is derived from branch/directory).
  // Prefills the rename input and signals whether a reset is available.
  title: string | null;
  pinnedAt?: string | null;
  labels?: string[];
  // Checkout branch (null when not a git checkout or detached HEAD).
  currentBranch: string | null;
  archivingAt: string | null;
  diffStat: { additions: number; deletions: number } | null;
  prHint: PrHint | null;
  archiveHasUncommittedChanges: boolean | null;
  archiveUnpushedCommitCount: number | null;
  scripts: WorkspaceDescriptor["scripts"];
  hasRunningScripts: boolean;
}

export interface SidebarProjectEntry {
  viewKey: string;
  projectName: string;
  projectKind: WorkspaceStructureProject["projectKind"];
  iconWorkingDir: string;
  hosts: WorkspaceStructureHostPlacement[];
  workspaces: SidebarWorkspacePlacement[];
}

export interface SidebarWorkspacePlacementModel {
  workspaces: SidebarWorkspacePlacement[];
  projects: SidebarProjectEntry[];
  projectNamesByViewKey: Map<string, string>;
}

export interface SidebarWorkspaceSession {
  serverId: string;
  workspaces: Map<string, WorkspaceDescriptor>;
  workspaceAgentActivity: Map<string, WorkspaceAgentActivity>;
}

interface SidebarWorkspaceSessionSource {
  workspaces: Map<string, WorkspaceDescriptor>;
  workspaceAgentActivity: Map<string, WorkspaceAgentActivity>;
}

export function selectSidebarWorkspaceSessions(
  sessions: Record<string, SidebarWorkspaceSessionSource | undefined>,
  serverIds: readonly string[],
): SidebarWorkspaceSession[] {
  const selected: SidebarWorkspaceSession[] = [];
  for (const serverId of serverIds) {
    const session = sessions[serverId];
    if (!session) {
      continue;
    }
    selected.push({
      serverId,
      workspaces: session.workspaces,
      workspaceAgentActivity: session.workspaceAgentActivity,
    });
  }
  return selected;
}

export function areSidebarWorkspaceSessionsEqual(
  left: readonly SidebarWorkspaceSession[],
  right: readonly SidebarWorkspaceSession[],
): boolean {
  if (left.length !== right.length) {
    return false;
  }
  for (let index = 0; index < left.length; index += 1) {
    const leftSession = left[index];
    const rightSession = right[index];
    if (
      !leftSession ||
      !rightSession ||
      leftSession.serverId !== rightSession.serverId ||
      leftSession.workspaces !== rightSession.workspaces ||
      leftSession.workspaceAgentActivity !== rightSession.workspaceAgentActivity
    ) {
      return false;
    }
  }
  return true;
}

interface EffectiveWorkspaceStatus {
  status: WorkspaceDescriptor["status"];
  enteredAt: Date | null;
}

function projectNameForWorkspace(workspace: WorkspaceDescriptor): string {
  return (
    workspace.projectCustomName ??
    workspace.projectDisplayName ??
    projectDisplayNameFromProjectId(workspace.projectId)
  );
}

function normalizeCurrentBranch(currentBranch: string | null | undefined): string | null {
  if (!currentBranch) {
    return null;
  }
  const trimmed = currentBranch.trim();
  return trimmed.length === 0 || trimmed === "HEAD" ? null : trimmed;
}

export function createSidebarWorkspaceEntry(input: {
  serverId: string;
  workspace: WorkspaceDescriptor;
  projectViewKey?: string;
  pendingCreateAttempts?: Record<string, PendingCreateAttempt>;
  workspaceAgentActivity?: ReadonlyMap<string, WorkspaceAgentActivity>;
}): SidebarWorkspaceEntry {
  const projectViewKey = input.projectViewKey ?? input.workspace.projectId;
  const effectiveStatus = deriveEffectiveWorkspaceStatus(input);
  return {
    workspaceKey: `${input.serverId}:${input.workspace.id}`,
    serverId: input.serverId,
    workspaceId: input.workspace.id,
    projectViewKey,
    projectName: projectNameForWorkspace(input.workspace),
    projectRootPath: input.workspace.projectRootPath,
    workspaceDirectory: input.workspace.workspaceDirectory,
    workspaceDirectoryLabel:
      input.workspace.worktreeSlug ?? shortenPath(input.workspace.workspaceDirectory),
    projectKind: input.workspace.projectKind,
    workspaceKind: input.workspace.workspaceKind,
    name: input.workspace.name,
    title: input.workspace.title ?? null,
    pinnedAt: input.workspace.pinnedAt,
    labels: input.workspace.labels ?? EMPTY_WORKSPACE_LABELS,
    currentBranch: normalizeCurrentBranch(input.workspace.gitRuntime?.currentBranch),
    statusBucket: effectiveStatus.status,
    statusEnteredAt: effectiveStatus.enteredAt,
    archivingAt: input.workspace.archivingAt,
    diffStat: input.workspace.diffStat,
    prHint: selectPrHintFromStatus(
      input.workspace.githubRuntime?.pullRequest,
      input.workspace.forge,
    ),
    archiveHasUncommittedChanges: input.workspace.gitRuntime?.isDirty ?? null,
    archiveUnpushedCommitCount: input.workspace.gitRuntime?.aheadOfOrigin ?? null,
    scripts: input.workspace.scripts,
    hasRunningScripts: input.workspace.scripts.some((script) => script.lifecycle === "running"),
  };
}

const EMPTY_WORKSPACE_LABELS: string[] = [];

function deriveEffectiveWorkspaceStatus(input: {
  serverId: string;
  workspace: WorkspaceDescriptor;
  pendingCreateAttempts?: Record<string, PendingCreateAttempt>;
  workspaceAgentActivity?: ReadonlyMap<string, WorkspaceAgentActivity>;
}): EffectiveWorkspaceStatus {
  if (input.workspace.status !== "done") {
    return { status: input.workspace.status, enteredAt: input.workspace.statusEnteredAt };
  }

  const pendingStartedAt = getPendingInitialAgentCreateStartedAt({
    serverId: input.serverId,
    workspaceId: input.workspace.id,
    pendingCreateAttempts: input.pendingCreateAttempts,
  });
  if (pendingStartedAt) {
    return { status: "running", enteredAt: pendingStartedAt };
  }

  const rootAgentActivity = input.workspaceAgentActivity?.get(input.workspace.id);
  if (rootAgentActivity && rootAgentActivity.status !== "done") {
    return rootAgentActivity;
  }

  return { status: input.workspace.status, enteredAt: input.workspace.statusEnteredAt };
}

function getPendingInitialAgentCreateStartedAt(input: {
  serverId: string;
  workspaceId: string;
  pendingCreateAttempts: Record<string, PendingCreateAttempt> | undefined;
}): Date | null {
  let latestStartedAt: Date | null = null;
  for (const pending of Object.values(input.pendingCreateAttempts ?? {})) {
    if (pending.serverId !== input.serverId) continue;
    if (pending.workspaceId !== input.workspaceId) continue;
    if (pending.lifecycle === "abandoned") continue;
    const startedAt = new Date(pending.timestamp);
    if (!latestStartedAt || startedAt > latestStartedAt) {
      latestStartedAt = startedAt;
    }
  }
  return latestStartedAt;
}

/**
 * Most urgent status among a project's workspaces. Backs the status dot on a collapsed
 * project row, which otherwise hides every workspace-level signal it contains.
 *
 * Reads the already-derived entries, so workspaces the session hasn't hydrated yet (no entry)
 * are skipped rather than counted as done.
 */
export function deriveProjectStatusBucket(input: {
  workspaces: readonly SidebarWorkspacePlacement[];
  workspaceEntriesByKey: ReadonlyMap<string, SidebarWorkspaceEntry>;
}): SidebarStateBucket {
  const buckets: SidebarStateBucket[] = [];
  for (const placement of input.workspaces) {
    const entry = input.workspaceEntriesByKey.get(placement.workspaceKey);
    if (entry) buckets.push(entry.statusBucket);
  }
  return aggregateSidebarStateBuckets(buckets);
}

export function buildSidebarWorkspacePlacementModel(input: {
  projects: readonly HostProjectListItem[];
}): SidebarWorkspacePlacementModel {
  const projects = buildSidebarProjectsFromHostProjects({ projects: input.projects });
  return {
    projects,
    workspaces: projects.flatMap((project) => project.workspaces),
    projectNamesByViewKey: new Map(
      projects.map((project) => [project.viewKey, project.projectName]),
    ),
  };
}

function createStructuralWorkspaceEntry(input: {
  project: HostProjectListItem;
  workspaceKey: string;
}): SidebarWorkspacePlacement {
  const identity = resolveStructuralWorkspaceIdentity({
    project: input.project,
    workspaceKey: input.workspaceKey,
  });

  return {
    workspaceKey: identity.workspaceKey,
    serverId: identity.serverId,
    workspaceId: identity.workspaceId,
    projectViewKey: input.project.viewKey,
    projectName: input.project.projectName,
    projectRootPath: input.project.iconWorkingDir,
    workspaceDirectory: undefined,
    projectKind: input.project.projectKind,
    workspaceKind: "checkout",
    name: identity.workspaceId,
  };
}

function resolveStructuralWorkspaceIdentity(input: {
  project: HostProjectListItem;
  workspaceKey: string;
}): {
  workspaceKey: string;
  serverId: string;
  workspaceId: string;
} {
  const hostsByLongestPrefix = [...input.project.hosts].sort(
    (left, right) => right.serverId.length - left.serverId.length,
  );

  for (const host of hostsByLongestPrefix) {
    const prefix = `${host.serverId}:`;
    if (!input.workspaceKey.startsWith(prefix)) continue;
    const workspaceId = input.workspaceKey.slice(prefix.length);
    if (!workspaceId) continue;
    return {
      workspaceKey: input.workspaceKey,
      serverId: host.serverId,
      workspaceId,
    };
  }

  const separatorIndex = input.workspaceKey.indexOf(":");
  if (separatorIndex > 0) {
    return {
      workspaceKey: input.workspaceKey,
      serverId: input.workspaceKey.slice(0, separatorIndex),
      workspaceId: input.workspaceKey.slice(separatorIndex + 1),
    };
  }

  const serverId = input.project.hosts[0]?.serverId ?? input.workspaceKey;
  return {
    workspaceKey: `${serverId}:${input.workspaceKey}`,
    serverId,
    workspaceId: input.workspaceKey,
  };
}

export function buildSidebarWorkspaceEntries(input: {
  placements: readonly SidebarWorkspacePlacement[];
  sessions: SidebarWorkspaceSession[];
  pendingCreateAttempts?: Record<string, PendingCreateAttempt>;
  previousEntries?: ReadonlyMap<string, SidebarWorkspaceEntry>;
}): ReadonlyMap<string, SidebarWorkspaceEntry> {
  if (input.placements.length === 0 || input.sessions.length === 0) {
    return input.previousEntries?.size === 0 ? input.previousEntries : new Map();
  }

  const sessionByServerId = new Map(input.sessions.map((session) => [session.serverId, session]));
  const entries = new Map<string, SidebarWorkspaceEntry>();

  for (const placement of input.placements) {
    const session = sessionByServerId.get(placement.serverId);
    if (!session) continue;
    const workspaceKey = resolveWorkspaceMapKeyByIdentity({
      workspaces: session.workspaces,
      workspaceId: placement.workspaceId,
    });
    const workspace = workspaceKey ? session.workspaces.get(workspaceKey) : null;
    if (!workspace) continue;

    const entry = createSidebarWorkspaceEntry({
      serverId: placement.serverId,
      workspace,
      projectViewKey: placement.projectViewKey,
      pendingCreateAttempts: input.pendingCreateAttempts,
      workspaceAgentActivity: session.workspaceAgentActivity,
    });
    const previousEntry = input.previousEntries?.get(placement.workspaceKey);
    entries.set(
      placement.workspaceKey,
      previousEntry && areSidebarWorkspaceEntriesEqual(previousEntry, entry)
        ? previousEntry
        : entry,
    );
  }

  return input.previousEntries && areEntryMapsIdentical(input.previousEntries, entries)
    ? input.previousEntries
    : entries;
}

function areEntryMapsIdentical(
  left: ReadonlyMap<string, SidebarWorkspaceEntry>,
  right: ReadonlyMap<string, SidebarWorkspaceEntry>,
): boolean {
  if (left.size !== right.size) return false;
  const rightIterator = right.entries();
  for (const [key, entry] of left) {
    const next = rightIterator.next();
    if (next.done || next.value[0] !== key || next.value[1] !== entry) return false;
  }
  return true;
}

function areSidebarWorkspaceEntriesEqual(
  left: SidebarWorkspaceEntry,
  right: SidebarWorkspaceEntry,
): boolean {
  const keys = Object.keys(left) as Array<keyof SidebarWorkspaceEntry>;
  if (keys.length !== Object.keys(right).length) return false;
  // normalizeWorkspaceDescriptor rebuilds these objects on every payload; compare by value.
  return keys.every((key) => {
    switch (key) {
      case "prHint":
        return arePrHintsEqual(left.prHint, right.prHint);
      case "statusEnteredAt":
        return left.statusEnteredAt?.getTime() === right.statusEnteredAt?.getTime();
      case "diffStat":
        return (
          left.diffStat === right.diffStat ||
          (left.diffStat !== null &&
            right.diffStat !== null &&
            left.diffStat.additions === right.diffStat.additions &&
            left.diffStat.deletions === right.diffStat.deletions)
        );
      case "labels":
        return areArraysShallowEqual(left.labels, right.labels);
      case "scripts":
        return areArraysShallowEqual(left.scripts, right.scripts, areScriptsEqual);
      default:
        return Object.is(left[key], right[key]);
    }
  });
}

function arePrHintsEqual(left: PrHint | null, right: PrHint | null): boolean {
  return (
    left === right ||
    (left !== null &&
      right !== null &&
      left.url === right.url &&
      left.number === right.number &&
      left.state === right.state &&
      left.checks === right.checks &&
      left.checksStatus === right.checksStatus &&
      left.reviewDecision === right.reviewDecision)
  );
}

function areArraysShallowEqual<T>(
  left: readonly T[] | undefined,
  right: readonly T[] | undefined,
  isEqual: (a: T, b: T) => boolean = Object.is,
): boolean {
  if (left === right) return true;
  if (!left || !right || left.length !== right.length) return false;
  return left.every((item, index) => isEqual(item, right[index] as T));
}

type WorkspaceScript = WorkspaceDescriptor["scripts"][number];

function areScriptsEqual(left: WorkspaceScript, right: WorkspaceScript): boolean {
  if (left === right) return true;
  const keys = Object.keys(left) as Array<keyof WorkspaceScript>;
  return (
    keys.length === Object.keys(right).length &&
    keys.every((key) => Object.is(left[key], right[key]))
  );
}

export function buildSidebarProjectsFromStructure(input: {
  projects: WorkspaceStructureProject[];
}): SidebarProjectEntry[] {
  return buildSidebarProjectsFromHostProjects({
    projects: input.projects.map((project) => ({
      viewKey: project.viewKey,
      projectKey: project.projectKey,
      projectName: project.projectName,
      projectKind: project.projectKind,
      iconWorkingDir: project.iconWorkingDir,
      hosts: project.hosts,
      workspaceKeys: project.workspaceKeys,
    })),
  });
}

export function buildSidebarProjectsFromHostProjects(input: {
  projects: readonly HostProjectListItem[];
}): SidebarProjectEntry[] {
  if (input.projects.length === 0) {
    return EMPTY_PROJECTS;
  }

  return input.projects.map((project) => ({
    viewKey: project.viewKey,
    projectName: project.projectName,
    projectKind: project.projectKind,
    iconWorkingDir: project.iconWorkingDir,
    hosts: project.hosts,
    workspaces: project.workspaceKeys.map((workspaceKey) =>
      createStructuralWorkspaceEntry({
        project,
        workspaceKey,
      }),
    ),
  }));
}

// Host labels disambiguate which machine a workspace lives on; they only earn their
// space once the visible sidebar spans more than one host. Counting distinct hosts
// across the visible projects (not all connected hosts) keeps labels off when a host
// filter pins the view to a single host.
export function shouldShowSidebarHostLabels(projects: SidebarProjectEntry[]): boolean {
  const serverIds = new Set<string>();
  for (const project of projects) {
    for (const host of project.hosts) {
      serverIds.add(host.serverId);
    }
  }
  return serverIds.size >= 2;
}

export function applyStoredOrdering<T>(input: {
  items: T[];
  storedOrder: string[];
  getKey: (item: T) => string;
}): T[] {
  if (input.items.length <= 1 || input.storedOrder.length === 0) {
    return input.items;
  }

  const itemByKey = new Map<string, T>();
  for (const item of input.items) {
    itemByKey.set(input.getKey(item), item);
  }

  const prunedOrder: string[] = [];
  const seen = new Set<string>();
  for (const key of input.storedOrder) {
    if (!itemByKey.has(key) || seen.has(key)) {
      continue;
    }
    seen.add(key);
    prunedOrder.push(key);
  }

  if (prunedOrder.length === 0) {
    return input.items;
  }

  const orderedSet = new Set(prunedOrder);
  const ordered: T[] = [];
  let orderedIndex = 0;

  for (const item of input.items) {
    const key = input.getKey(item);
    if (!orderedSet.has(key)) {
      ordered.push(item);
      continue;
    }

    const targetKey = prunedOrder[orderedIndex] ?? key;
    orderedIndex += 1;
    ordered.push(itemByKey.get(targetKey) ?? item);
  }

  return ordered;
}

export function appendMissingOrderKeys(input: {
  currentOrder: string[];
  visibleKeys: string[];
}): string[] {
  if (input.visibleKeys.length === 0) {
    return input.currentOrder;
  }

  const existingKeys = new Set(input.currentOrder);
  const missingKeys = input.visibleKeys.filter((key) => !existingKeys.has(key));
  if (missingKeys.length === 0) {
    return input.currentOrder;
  }

  return [...input.currentOrder, ...missingKeys];
}

export function prependMissingOrderKeys(input: {
  currentOrder: string[];
  visibleKeys: string[];
}): string[] {
  if (input.visibleKeys.length === 0) {
    return input.currentOrder;
  }

  const existingKeys = new Set(input.currentOrder);
  const missingKeys = input.visibleKeys.filter((key) => !existingKeys.has(key));
  if (missingKeys.length === 0) {
    return input.currentOrder;
  }

  return [...missingKeys, ...input.currentOrder];
}

export interface SidebarOrderUpdates {
  projectOrder: string[] | null;
  workspaceOrders: Array<{ projectViewKey: string; order: string[] }>;
}

export function computeSidebarOrderUpdates(input: {
  projects: SidebarProjectEntry[];
  persistedProjectOrder: string[];
  getWorkspaceOrder: (projectViewKey: string) => string[];
}): SidebarOrderUpdates {
  if (input.projects.length === 0) {
    return { projectOrder: null, workspaceOrders: [] };
  }

  const nextProjectOrder = appendMissingOrderKeys({
    currentOrder: input.persistedProjectOrder,
    visibleKeys: input.projects.map((project) => project.viewKey),
  });
  const projectOrder = nextProjectOrder === input.persistedProjectOrder ? null : nextProjectOrder;

  const workspaceOrders: Array<{ projectViewKey: string; order: string[] }> = [];
  for (const project of input.projects) {
    const persistedWorkspaceOrder = input.getWorkspaceOrder(project.viewKey);
    const nextWorkspaceOrder = prependMissingOrderKeys({
      currentOrder: persistedWorkspaceOrder,
      visibleKeys: project.workspaces.map((workspace) => workspace.workspaceKey),
    });
    if (nextWorkspaceOrder !== persistedWorkspaceOrder) {
      workspaceOrders.push({ projectViewKey: project.viewKey, order: nextWorkspaceOrder });
    }
  }

  return { projectOrder, workspaceOrders };
}

export interface SidebarLoadingState {
  isLoading: boolean;
  isInitialLoad: boolean;
  isRevalidating: boolean;
}

export function deriveSidebarLoadingState(input: {
  isActive: boolean;
  serverIds: string[];
  hydratedServerIds: string[];
  hasProjects: boolean;
}): SidebarLoadingState {
  const hasRegisteredHosts = input.serverIds.length > 0;
  const allHydrated =
    input.serverIds.length > 0 && input.serverIds.length === input.hydratedServerIds.length;
  const isLoading = input.isActive && hasRegisteredHosts && !allHydrated;
  const isInitialLoad = isLoading && !input.hasProjects;
  return { isLoading, isInitialLoad, isRevalidating: false };
}
