import { describe, expect, it } from "vitest";
import type { WorkspaceStructureProject } from "@/projects/workspace-structure";
import type { ActiveWorkspaceSelection } from "@/stores/navigation-active-workspace-store";
import type { Agent, WorkspaceDescriptor } from "@/stores/session-store";
import {
  collectArchiveNeighborCandidates,
  resolveWorkspaceArchiveRedirectTarget,
  type ArchiveNeighborCandidate,
} from "@/utils/workspace-archive-navigation";
import {
  redirectIfArchivingActiveWorkspace,
  type RedirectIfArchivingActiveWorkspaceDeps,
} from "@/utils/workspace-archive-redirect";

function candidate(
  workspaceId: string,
  overrides: Partial<ArchiveNeighborCandidate> = {},
): ArchiveNeighborCandidate {
  return {
    serverId: "server-1",
    workspaceId,
    lastActivityAt: null,
    archiving: false,
    ...overrides,
  };
}

function resolve(workspaceId: string, projects: ArchiveNeighborCandidate[][]) {
  return resolveWorkspaceArchiveRedirectTarget({
    archived: { serverId: "server-1", workspaceId },
    projects,
  });
}

describe("resolveWorkspaceArchiveRedirectTarget", () => {
  it("selects the next workspace below in the same project", () => {
    expect(resolve("b", [[candidate("a"), candidate("b"), candidate("c")]])).toEqual({
      kind: "workspace",
      serverId: "server-1",
      workspaceId: "c",
    });
  });

  it("selects the previous workspace when the archived one is last in its project", () => {
    expect(
      resolve("c", [[candidate("a"), candidate("b"), candidate("c")], [candidate("x")]]),
    ).toEqual({ kind: "workspace", serverId: "server-1", workspaceId: "b" });
  });

  it("skips neighbors that are already being archived", () => {
    expect(
      resolve("a", [[candidate("a"), candidate("b", { archiving: true }), candidate("c")]]),
    ).toEqual({ kind: "workspace", serverId: "server-1", workspaceId: "c" });
  });

  it("falls back to the most recently active workspace in any project", () => {
    expect(
      resolve("a", [
        [candidate("a", { lastActivityAt: 900 })],
        [candidate("x", { lastActivityAt: 100 }), candidate("y", { lastActivityAt: 500 })],
        [candidate("z", { serverId: "server-2" })],
      ]),
    ).toEqual({ kind: "workspace", serverId: "server-1", workspaceId: "y" });
  });

  it("falls back to the most recent workspace when the archived one is not listed", () => {
    expect(resolve("gone", [[candidate("x"), candidate("y", { lastActivityAt: 1 })]])).toEqual({
      kind: "workspace",
      serverId: "server-1",
      workspaceId: "y",
    });
  });

  it("does not confuse a same-id workspace on another host with the archived one", () => {
    expect(
      resolve("a", [[candidate("a", { serverId: "server-2" }), candidate("a"), candidate("b")]]),
    ).toEqual({ kind: "workspace", serverId: "server-1", workspaceId: "b" });
  });

  it("returns home when no other workspace remains", () => {
    expect(resolve("a", [[candidate("a")], [candidate("b", { archiving: true })]])).toEqual({
      kind: "home",
    });
  });
});

function workspace(id: string, overrides: Partial<WorkspaceDescriptor> = {}): WorkspaceDescriptor {
  return {
    id,
    projectId: "project-1",
    projectDisplayName: "Project",
    projectRootPath: "/repo",
    workspaceDirectory: `/repo/${id}`,
    projectKind: "git",
    workspaceKind: "worktree",
    name: id,
    status: "done",
    archivingAt: null,
    statusEnteredAt: null,
    diffStat: null,
    scripts: [],
    ...overrides,
  };
}

function agent(input: {
  workspaceId: string;
  lastActivityAt: number;
  archivedAt?: Date;
}): Pick<Agent, "workspaceId" | "archivedAt" | "lastActivityAt"> {
  return {
    workspaceId: input.workspaceId,
    lastActivityAt: new Date(input.lastActivityAt),
    archivedAt: input.archivedAt ?? null,
  };
}

describe("collectArchiveNeighborCandidates", () => {
  it("keeps sidebar order and derives recency from live agents", () => {
    const project: WorkspaceStructureProject = {
      viewKey: "project-1",
      projectKey: null,
      projectName: "Project",
      projectKind: "git",
      iconWorkingDir: "/repo",
      hosts: [],
      workspaceKeys: ["server-1:b", "server-1:missing", "server-1:a"],
    };

    const candidates = collectArchiveNeighborCandidates({
      projects: [project],
      sessions: {
        "server-1": {
          workspaces: new Map([
            ["a", workspace("a", { statusEnteredAt: new Date(50) })],
            ["b", workspace("b", { archivingAt: "2026-01-01T00:00:00.000Z" })],
          ]),
          agents: new Map([
            ["1", agent({ workspaceId: "b", lastActivityAt: 200 })],
            ["2", agent({ workspaceId: "b", lastActivityAt: 300 })],
            ["3", agent({ workspaceId: "b", lastActivityAt: 900, archivedAt: new Date(1) })],
          ]),
        },
      },
    });

    expect(candidates).toEqual([
      [
        { serverId: "server-1", workspaceId: "b", lastActivityAt: 300, archiving: true },
        { serverId: "server-1", workspaceId: "a", lastActivityAt: 50, archiving: false },
      ],
    ]);
  });
});

function createFakeRouter(projects: ArchiveNeighborCandidate[][]): {
  deps: RedirectIfArchivingActiveWorkspaceDeps;
  navigations: Array<ActiveWorkspaceSelection | "home">;
} {
  const navigations: Array<ActiveWorkspaceSelection | "home"> = [];
  return {
    navigations,
    deps: {
      readSidebarWorkspaces: () => projects,
      navigateToWorkspace: (selection) => {
        navigations.push(selection);
      },
      navigateToHome: () => {
        navigations.push("home");
      },
    },
  };
}

describe("redirectIfArchivingActiveWorkspace", () => {
  it("does not navigate when archiving a workspace that is not being viewed", () => {
    const { deps, navigations } = createFakeRouter([[candidate("main"), candidate("feature")]]);

    expect(
      redirectIfArchivingActiveWorkspace(
        {
          serverId: "server-1",
          workspaceId: "feature",
          activeWorkspaceSelection: { serverId: "server-1", workspaceId: "main" },
        },
        deps,
      ),
    ).toBe(false);
    expect(navigations).toEqual([]);
  });

  it("opens the neighboring workspace when archiving the viewed workspace", () => {
    const { deps, navigations } = createFakeRouter([[candidate("main"), candidate("feature")]]);

    expect(
      redirectIfArchivingActiveWorkspace(
        {
          serverId: "server-1",
          workspaceId: "feature",
          activeWorkspaceSelection: { serverId: "server-1", workspaceId: "feature" },
        },
        deps,
      ),
    ).toBe(true);
    expect(navigations).toEqual([{ serverId: "server-1", workspaceId: "main" }]);
  });

  it("goes home when archiving the last workspace", () => {
    const { deps, navigations } = createFakeRouter([[candidate("feature")]]);

    redirectIfArchivingActiveWorkspace(
      {
        serverId: "server-1",
        workspaceId: "feature",
        activeWorkspaceSelection: { serverId: "server-1", workspaceId: "feature" },
      },
      deps,
    );
    expect(navigations).toEqual(["home"]);
  });
});
