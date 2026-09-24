import { getHostRuntimeStore } from "@/runtime/host-runtime";
import {
  clearWorkspaceArchivePending,
  markWorkspaceArchivePending,
} from "@/contexts/session-workspace-upserts";
import type { FetchWorkspacesEntry } from "@getpaseo/client/internal/daemon-client";
import {
  normalizeWorkspaceDescriptor,
  useSessionStore,
  type WorkspaceDescriptor,
} from "@/stores/session-store";
import {
  normalizeWorkspaceOpaqueId,
  resolveWorkspaceMapKeyByIdentity,
} from "@/utils/workspace-identity";
import { i18n } from "@/i18n/i18next";

export interface WorkspaceArchiveTarget {
  serverId: string;
  workspaceId: string;
}

interface ProjectWorkspacesQuery {
  filter: { projectId: string };
  page: { limit: number };
}

interface WorkspaceArchiveClient {
  archiveWorkspace: (workspaceId: string) => Promise<{ error: string | null }>;
  fetchWorkspaces: (query: ProjectWorkspacesQuery) => Promise<{ entries: FetchWorkspacesEntry[] }>;
}

// The sidebar strip and the workspace menu can both archive the same workspace.
const inFlightArchives = new Map<string, Promise<void>>();

interface OptimisticWorkspaceArchiveSnapshot {
  workspace: WorkspaceDescriptor | null;
}

export interface WorkspaceArchiveFailure {
  serverId: string;
  workspaceId: string;
  error: unknown;
}

function isWorkspaceArchiveFailure(error: unknown): error is WorkspaceArchiveFailure {
  return (
    typeof error === "object" &&
    error !== null &&
    "serverId" in error &&
    typeof error.serverId === "string" &&
    "workspaceId" in error &&
    typeof error.workspaceId === "string" &&
    "error" in error
  );
}

function hideWorkspaceOptimistically(
  workspace: WorkspaceArchiveTarget,
): OptimisticWorkspaceArchiveSnapshot {
  const workspaces = useSessionStore.getState().sessions[workspace.serverId]?.workspaces;
  const workspaceKey = resolveWorkspaceMapKeyByIdentity({
    workspaces,
    workspaceId: workspace.workspaceId,
  });
  const snapshot = workspaceKey ? (workspaces?.get(workspaceKey) ?? null) : null;
  markWorkspaceArchivePending({
    serverId: workspace.serverId,
    workspaceId: workspace.workspaceId,
  });
  getHostRuntimeStore().removeWorkspaceSnapshot(workspace.serverId, workspace.workspaceId);
  return { workspace: snapshot };
}

// A failed or timed-out request may still have archived the workspace, so only
// the host's current view decides whether it comes back.
async function restoreWorkspaceIfStillActive(input: {
  client: WorkspaceArchiveClient;
  serverId: string;
  workspaceId: string;
  snapshot: OptimisticWorkspaceArchiveSnapshot;
}): Promise<void> {
  clearWorkspaceArchivePending({
    serverId: input.serverId,
    workspaceId: input.workspaceId,
  });
  const hidden = input.snapshot.workspace;
  if (!hidden) {
    return;
  }
  const active = await fetchActiveWorkspace(input.client, hidden);
  if (active) {
    getHostRuntimeStore().acceptWorkspaceSnapshots(input.serverId, [active]);
  }
}

async function fetchActiveWorkspace(
  client: WorkspaceArchiveClient,
  hidden: WorkspaceDescriptor,
): Promise<WorkspaceDescriptor | null> {
  let entries: FetchWorkspacesEntry[];
  try {
    ({ entries } = await client.fetchWorkspaces({
      filter: { projectId: hidden.projectId },
      page: { limit: 200 },
    }));
  } catch {
    // Unreachable host: nothing was synced past the hide, so the reconnect sync
    // still replays an archive that did land.
    return hidden;
  }
  const entry = entries.find((candidate) => normalizeWorkspaceOpaqueId(candidate.id) === hidden.id);
  return entry ? normalizeWorkspaceDescriptor(entry) : null;
}

async function archiveWorkspaceOrThrow(input: {
  client: WorkspaceArchiveClient;
  workspaceId: string;
}): Promise<void> {
  const payload = await input.client.archiveWorkspace(input.workspaceId);
  if (payload.error) {
    throw new Error(payload.error);
  }
}

export function archiveWorkspaceOptimistically(input: {
  client: WorkspaceArchiveClient;
  workspace: WorkspaceArchiveTarget;
}): Promise<void> {
  const workspaceId =
    normalizeWorkspaceOpaqueId(input.workspace.workspaceId) ?? input.workspace.workspaceId;
  const key = `${input.workspace.serverId}:${workspaceId}`;
  const inFlight = inFlightArchives.get(key);
  if (inFlight) {
    return inFlight;
  }
  const archive = runOptimisticArchive(input).finally(() => inFlightArchives.delete(key));
  inFlightArchives.set(key, archive);
  return archive;
}

async function runOptimisticArchive(input: {
  client: WorkspaceArchiveClient;
  workspace: WorkspaceArchiveTarget;
}): Promise<void> {
  const snapshot = hideWorkspaceOptimistically(input.workspace);

  try {
    await archiveWorkspaceOrThrow({
      client: input.client,
      workspaceId: input.workspace.workspaceId,
    });
  } catch (error) {
    await restoreWorkspaceIfStillActive({
      client: input.client,
      serverId: input.workspace.serverId,
      workspaceId: input.workspace.workspaceId,
      snapshot,
    });
    throw error;
  }
}

export async function archiveWorkspacesOptimistically(input: {
  getClient: (serverId: string) => WorkspaceArchiveClient | null;
  workspaces: WorkspaceArchiveTarget[];
}): Promise<WorkspaceArchiveFailure[]> {
  const results = await Promise.allSettled(
    input.workspaces.map(async (workspace) => {
      const client = input.getClient(workspace.serverId);
      if (!client) {
        throw {
          serverId: workspace.serverId,
          workspaceId: workspace.workspaceId,
          error: new Error(i18n.t("sidebar.workspace.toasts.hostDisconnected")),
        } satisfies WorkspaceArchiveFailure;
      }

      try {
        await archiveWorkspaceOptimistically({
          client,
          workspace,
        });
      } catch (error) {
        throw {
          serverId: workspace.serverId,
          workspaceId: workspace.workspaceId,
          error,
        } satisfies WorkspaceArchiveFailure;
      }
    }),
  );

  return results.flatMap((result) =>
    result.status === "rejected" && isWorkspaceArchiveFailure(result.reason) ? [result.reason] : [],
  );
}
