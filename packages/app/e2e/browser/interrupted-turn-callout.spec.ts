import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { expect, type Page } from "@playwright/test";
import { metroTest as test } from "../support/fixtures";
import { buildCreateAgentPreferences, buildSeededHost } from "../support/helpers/daemon-registry";
import {
  startIsolatedHostDaemon,
  type IsolatedHostDaemon,
} from "../support/helpers/isolated-host-daemon";
import { buildAgentRoute } from "../support/helpers/mock-agent";
import { connectSeedClient, type SeedDaemonClient } from "../support/helpers/seed-client";
import { createTempGitRepo } from "../support/helpers/workspace";

// The thirty-minute mock stream keeps the turn open until the daemon dies.
const HELD_MODEL = "thirty-minute-stream";

async function readAgentRecord(paseoHome: string, agentId: string): Promise<string | null> {
  const agentsDir = path.join(paseoHome, "agents");
  const projectDirs = await readdir(agentsDir, { withFileTypes: true }).catch(() => []);
  for (const entry of projectDirs) {
    if (!entry.isDirectory()) continue;
    const record = await readFile(
      path.join(agentsDir, entry.name, `${agentId}.json`),
      "utf8",
    ).catch(() => null);
    if (record) return record;
  }
  return null;
}

// The marker is written asynchronously after the turn starts. Restarting before it lands
// would make the daemon see a turn that never started.
async function waitForUnfinishedTurnMarker(paseoHome: string, agentId: string): Promise<void> {
  await expect
    .poll(
      async () => {
        const record = await readAgentRecord(paseoHome, agentId);
        if (!record) return null;
        const parsed = JSON.parse(record) as { unfinishedTurn?: { state?: string } | null };
        return parsed.unfinishedTurn?.state ?? null;
      },
      { timeout: 15_000 },
    )
    .toBe("running");
}

test.describe("Interrupted turn callout", () => {
  const serverId = `srv_interrupted_turn_${randomUUID().replaceAll("-", "").slice(0, 12)}`;
  let daemon: IsolatedHostDaemon;
  let client: SeedDaemonClient;
  let repo: Awaited<ReturnType<typeof createTempGitRepo>>;

  test.describe.configure({ retries: 0, timeout: 180_000 });

  // The private host's teardown removes its PASEO_HOME, so the host owns the project. A
  // client-owned project would be removed when the client closes before the restart.
  test.beforeEach(async () => {
    daemon = await startIsolatedHostDaemon(serverId);
    client = await connectSeedClient({ port: daemon.port, projectOwnership: "host" });
    repo = await createTempGitRepo("interrupted-turn-");
  });

  test.afterEach(async () => {
    await client?.close().catch(() => undefined);
    await daemon?.close().catch(() => undefined);
    await repo?.cleanup().catch(() => undefined);
  });

  async function seedBrowser(page: Page): Promise<void> {
    const nowIso = new Date().toISOString();
    await page.addInitScript(
      ({ host, preferences }) => {
        localStorage.setItem("@paseo:e2e", "1");
        localStorage.setItem("@paseo:daemon-registry", JSON.stringify([host]));
        localStorage.removeItem("@paseo:settings");
        localStorage.setItem("@paseo:create-agent-preferences", JSON.stringify(preferences));
      },
      {
        host: buildSeededHost({
          serverId,
          endpoint: `127.0.0.1:${daemon.port}`,
          label: "interrupted turn daemon",
          nowIso,
        }),
        preferences: buildCreateAgentPreferences(),
      },
    );
  }

  test("a daemon restart during a turn shows the callout, and Dismiss removes it", async ({
    page,
  }) => {
    const created = await client.createWorkspace({
      source: { kind: "directory", path: repo.path },
    });
    if (!created.workspace) throw new Error(created.error ?? "Failed to create workspace");
    const workspaceId = created.workspace.id;
    const agent = await client.createAgent({
      provider: "mock",
      cwd: repo.path,
      workspaceId,
      title: "Interrupted turn",
      modeId: "load-test",
      model: HELD_MODEL,
    });
    await client.sendAgentMessage(agent.id, "Hold this turn open.");
    await client.waitForAgentUpsert(agent.id, (snapshot) => snapshot.status === "running", 15_000);
    await waitForUnfinishedTurnMarker(daemon.paseoHome, agent.id);

    await client.close().catch(() => undefined);
    await daemon.restart();
    client = await connectSeedClient({ port: daemon.port, projectOwnership: "host" });

    await seedBrowser(page);
    await page.goto(buildAgentRoute(workspaceId, agent.id, serverId));

    const callout = page.getByTestId("agent-interrupted-turn-callout");
    await expect(callout).toBeVisible({ timeout: 60_000 });
    await expect(callout).toContainText("A daemon restart interrupted this turn");

    await callout.getByTestId("agent-interrupted-turn-dismiss").click();
    await expect(callout).toHaveCount(0, { timeout: 15_000 });
  });
});
