import { expect, test } from "../support/fixtures";
import { gotoAppShell } from "../support/helpers/app";
import {
  archiveLocalWorkspaceFromDaemon,
  assertNewWorkspaceSidebarAndHeader,
  connectNewWorkspaceDaemonClient,
  expectWorkspaceIsolationSelected,
  openNewWorkspaceComposer,
  openProjectViaDaemon,
  workspaceIsolationControl,
} from "../support/helpers/new-workspace";
import { expectNoTruncation } from "../support/helpers/no-truncation";
import { createTempGitRepo } from "../support/helpers/workspace";
import { getServerId } from "../support/helpers/server-id";
import { waitForSidebarHydration } from "../support/helpers/workspace-ui";

// New Workspace opens on "New worktree" until the user picks otherwise. The
// isolation choice persists in the create-form preferences
// (FormPreferences.isolation), so it must survive the create→reopen remount:
// creating a workspace navigates away from /new and unmounts it, and reopening
// New Workspace has to still show the last choice.
test.describe("New workspace isolation memory", () => {
  let client: Awaited<ReturnType<typeof connectNewWorkspaceDaemonClient>>;
  const localWorkspaceIds = new Set<string>();

  test.describe.configure({ timeout: 240_000 });

  test.beforeEach(async () => {
    client = await connectNewWorkspaceDaemonClient();
  });

  test.afterEach(async () => {
    if (client) {
      for (const workspaceId of localWorkspaceIds) {
        await archiveLocalWorkspaceFromDaemon(client, workspaceId).catch(() => undefined);
      }
    }
    localWorkspaceIds.clear();
    await client?.close().catch(() => undefined);
  });

  test("defaults to a worktree and remembers a local choice after creating a workspace", async ({
    page,
  }) => {
    const serverId = getServerId();
    const tempRepo = await createTempGitRepo("isolation-memory-", { branches: ["main", "dev"] });

    try {
      const openedProject = await openProjectViaDaemon(client, tempRepo.path);
      localWorkspaceIds.add(openedProject.workspaceId);

      await gotoAppShell(page);
      await waitForSidebarHydration(page);

      // First visit: the screen opens on New worktree, switch it to Local and create.
      await openNewWorkspaceComposer(page, {
        projectKey: openedProject.projectKey,
        projectDisplayName: openedProject.projectDisplayName,
      });
      await expectWorkspaceIsolationSelected(page, "worktree");
      await workspaceIsolationControl(page).click();
      const isolationOption = page.getByTestId("workspace-create-isolation-local");
      await expect(isolationOption).toBeVisible({ timeout: 30_000 });
      await expectNoTruncation(isolationOption);
      await isolationOption.click();
      await expectWorkspaceIsolationSelected(page, "local");

      const createButton = page
        .getByTestId("message-input-root")
        .getByRole("button", { name: "Create" });
      await expect(createButton).toBeVisible({ timeout: 30_000 });
      await createButton.click();

      const createdWorkspace = await assertNewWorkspaceSidebarAndHeader(page, {
        serverId,
        client,
        previousWorkspaceId: openedProject.workspaceId,
        projectDisplayName: openedProject.projectDisplayName,
      });
      localWorkspaceIds.add(createdWorkspace.workspaceId);

      // Second visit (fresh mount of /new): the local choice must stick.
      await openNewWorkspaceComposer(page, {
        projectKey: openedProject.projectKey,
        projectDisplayName: openedProject.projectDisplayName,
      });
      await expectWorkspaceIsolationSelected(page, "local");
    } finally {
      await tempRepo.cleanup();
    }
  });
});
