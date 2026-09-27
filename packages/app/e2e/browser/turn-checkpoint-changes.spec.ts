import { execFileSync } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "../support/fixtures";
import { cancelAgent, expectComposerVisible } from "../support/helpers/composer";
import { openAgentRoute } from "../support/helpers/mock-agent";
import {
  archiveWorkspaceFromDaemon,
  connectNewWorkspaceDaemonClient,
  createWorktreeViaDaemon,
  openProjectViaDaemon,
} from "../support/helpers/new-workspace";
import { connectSeedClient, type SeedDaemonClient } from "../support/helpers/seed-client";
import { createTempGitRepo } from "../support/helpers/workspace";

const TURN_PROMPT = "Edit a file during this turn.";
const EDITED_FILE = "turn-edit.txt";

interface TurnWorkspace {
  workspaceId: string;
  cwd: string;
}

function checkpointRefs(cwd: string, agentId: string): string[] {
  const output = execFileSync(
    "git",
    ["for-each-ref", "--format=%(refname)", `refs/buildr/checkpoints/${agentId}/`],
    { cwd, encoding: "utf8" },
  );
  return output.split("\n").filter(Boolean);
}

async function waitForCheckpointRef(cwd: string, agentId: string, phase: "start" | "end") {
  await expect
    .poll(() => checkpointRefs(cwd, agentId).some((ref) => ref.endsWith(`/${phase}`)), {
      timeout: 15_000,
    })
    .toBe(true);
}

/**
 * Runs one held mock turn that writes a file between the turn's start and end
 * checkpoints, then stops it from the composer. The mock provider never writes
 * files itself, so the test plays the agent's edit.
 */
async function runTurnThatEditsFile(
  page: Page,
  client: SeedDaemonClient,
  workspace: TurnWorkspace,
): Promise<string> {
  const agent = await client.createAgent({
    provider: "mock",
    cwd: workspace.cwd,
    workspaceId: workspace.workspaceId,
    title: "Checkpoint turn",
    modeId: "load-test",
    model: "thirty-minute-stream",
  });
  await openAgentRoute(page, { workspaceId: workspace.workspaceId, agentId: agent.id });
  await expectComposerVisible(page);
  await client.sendAgentMessage(agent.id, TURN_PROMPT);
  await waitForCheckpointRef(workspace.cwd, agent.id, "start");

  writeFileSync(path.join(workspace.cwd, EDITED_FILE), "written by the turn\n");

  await cancelAgent(page);
  await client.waitForFinish(agent.id, 20_000);
  await waitForCheckpointRef(workspace.cwd, agent.id, "end");
  return agent.id;
}

async function openTurnChanges(page: Page): Promise<void> {
  const message = page.getByTestId("user-message").filter({ hasText: TURN_PROMPT }).first();
  await expect(message).toBeVisible({ timeout: 15_000 });
  // The trailing row reveals on hover of the bubble's content, not the full-width row.
  await message.getByText(TURN_PROMPT, { exact: true }).hover();
  const button = message.getByTestId("turn-changes-button");
  await expect(button).toBeVisible();
  await button.click();
  const panel = page.getByTestId("turn-diff-panel").filter({ visible: true });
  await expect(panel).toBeVisible({ timeout: 15_000 });
  // The diff paints to a canvas; the file header carries the path as its accessible name.
  await expect(panel.getByTestId("diff-file-0")).toHaveAccessibleName(`${EDITED_FILE}, +1, -0`, {
    timeout: 15_000,
  });
}

test.describe("Turn checkpoint changes", () => {
  test.describe.configure({ timeout: 120_000 });

  let client: SeedDaemonClient;
  let repo: Awaited<ReturnType<typeof createTempGitRepo>>;

  test.beforeEach(async () => {
    client = await connectSeedClient();
    repo = await createTempGitRepo("turn-checkpoint-");
  });

  test.afterEach(async () => {
    await client?.close().catch(() => undefined);
    await repo?.cleanup().catch(() => undefined);
  });

  test("a worktree turn's diff lists the edited file and Restore files reverts it", async ({
    page,
  }) => {
    const workspaceClient = await connectNewWorkspaceDaemonClient();
    let worktreeDirectory: string | null = null;
    try {
      await openProjectViaDaemon(workspaceClient, repo.path);
      const worktree = await createWorktreeViaDaemon(workspaceClient, {
        cwd: repo.path,
        slug: `turn-checkpoint-${Date.now()}`,
      });
      worktreeDirectory = worktree.workspaceDirectory;
      const editedPath = path.join(worktree.workspaceDirectory, EDITED_FILE);

      await runTurnThatEditsFile(page, client, {
        workspaceId: worktree.workspaceId,
        cwd: worktree.workspaceDirectory,
      });
      await openTurnChanges(page);

      const restore = page.getByTestId("turn-diff-restore-files").filter({ visible: true });
      await expect(restore).toBeEnabled({ timeout: 15_000 });
      page.once("dialog", (dialog) => void dialog.accept());
      await restore.click();

      await expect.poll(() => existsSync(editedPath), { timeout: 15_000 }).toBe(false);
    } finally {
      if (worktreeDirectory) {
        await archiveWorkspaceFromDaemon(workspaceClient, worktreeDirectory).catch(() => undefined);
      }
      await workspaceClient.close().catch(() => undefined);
    }
  });

  test("a checkout turn's diff lists the edited file and explains why restore is disabled", async ({
    page,
  }) => {
    const created = await client.createWorkspace({
      source: { kind: "directory", path: repo.path },
    });
    if (!created.workspace) throw new Error(created.error ?? "Failed to create workspace");
    const workspace = created.workspace;
    try {
      await runTurnThatEditsFile(page, client, { workspaceId: workspace.id, cwd: repo.path });
      await openTurnChanges(page);

      const restore = page.getByTestId("turn-diff-restore-files").filter({ visible: true });
      await expect(restore).toBeDisabled();
      await restore.hover();
      await expect(
        page.getByText("File restore requires the agent to run in its own worktree.", {
          exact: true,
        }),
      ).toBeVisible();
      expect(existsSync(path.join(repo.path, EDITED_FILE))).toBe(true);
    } finally {
      await client.removeProject(workspace.projectId).catch(() => undefined);
    }
  });
});
