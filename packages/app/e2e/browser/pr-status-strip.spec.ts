import { writeFileSync } from "node:fs";
import path from "node:path";
import { expect, type Page } from "@playwright/test";
import { test } from "../support/fixtures";
import { waitForWorkspaceTabsVisible } from "../support/helpers/workspace-tabs";
import { gotoWorkspace } from "../support/helpers/launcher";
import {
  hasGithubAuth,
  createTempGithubRepo,
  type GhRepoFixture,
} from "../support/helpers/github-fixtures";
import {
  connectWorkspaceSetupClient,
  openProjectViaDaemon,
  type WorkspaceSetupDaemonClient,
} from "../support/helpers/workspace-setup";

const GITHUB_AUTH = hasGithubAuth();
const SCREENSHOT_DIR = process.env.PR_STRIP_SCREENSHOT_DIR;

async function expectStrip(
  page: Page,
  expected: { label: string; actions: string[] },
): Promise<void> {
  const strip = page.getByTestId("workspace-pr-status-strip");
  await expect(strip.getByTestId("workspace-pr-status-label")).toHaveText(expected.label, {
    timeout: 20_000,
  });
  for (const action of expected.actions) {
    await expect(strip.getByTestId(`workspace-pr-status-${action.toLowerCase()}`)).toBeVisible();
  }
  if (SCREENSHOT_DIR) {
    const slug = expected.label.toLowerCase().replaceAll(" ", "-");
    await page
      .getByTestId("workspace-explorer-sidebar")
      .screenshot({ path: `${SCREENSHOT_DIR}/${slug}.png` });
  }
}

test.describe("PR status strip", () => {
  // Each retry would re-create the GitHub fixture repos.
  test.describe.configure({ retries: 0 });
  test.use({ viewport: { width: 1600, height: 900 } });

  let seedClient: WorkspaceSetupDaemonClient;
  let repoFixture: GhRepoFixture;
  const workspaceByTitle = new Map<string, string>();
  const localPathByTitle = new Map<string, string>();

  test.beforeAll(async () => {
    if (!GITHUB_AUTH) return;
    seedClient = await connectWorkspaceSetupClient();
    repoFixture = await createTempGithubRepo({
      category: "pr-status-strip",
      prs: [
        {
          title: "Ready branch",
          state: "open",
          checks: [{ context: "build", state: "success" }],
        },
        { title: "Merged branch", state: "merged" },
        { title: "Closed branch", state: "closed" },
        { title: "Draft branch", state: "draft" },
        {
          title: "Failing branch",
          state: "open",
          checks: [{ context: "build", state: "failure" }],
        },
        {
          title: "Running branch",
          state: "open",
          checks: [{ context: "build", state: "pending" }],
        },
      ],
    });
    for (const pr of repoFixture.prs) {
      const workspace = await openProjectViaDaemon(seedClient, pr.localPath);
      workspaceByTitle.set(pr.title, workspace.id);
      localPathByTitle.set(pr.title, pr.localPath);
    }
  });

  test.afterAll(async () => {
    await repoFixture?.cleanup().catch(() => undefined);
    await seedClient?.close().catch(() => undefined);
  });

  test.beforeEach(async () => {
    test.skip(!GITHUB_AUTH, "Requires GitHub authentication (gh auth login)");
    test.setTimeout(90_000);
  });

  async function open(page: Page, title: string): Promise<void> {
    await gotoWorkspace(page, workspaceByTitle.get(title)!);
    await waitForWorkspaceTabsVisible(page);
    const explorer = page.getByTestId("workspace-explorer-sidebar");
    if (!(await explorer.isVisible())) {
      await page.getByTestId("workspace-explorer-toggle").first().click();
    }
    await expect(explorer).toBeVisible();
  }

  test("shows the merged state with Continue and Archive", async ({ page }) => {
    await open(page, "Merged branch");
    await expectStrip(page, { label: "Merged", actions: ["Continue", "Archive"] });
  });

  test("shows closed and draft PRs", async ({ page }) => {
    await open(page, "Closed branch");
    await expectStrip(page, { label: "Closed", actions: ["Continue"] });
    await open(page, "Draft branch");
    await expectStrip(page, { label: "Draft", actions: [] });
  });

  test("offers Fix for failing checks", async ({ page }) => {
    await open(page, "Failing branch");
    await expectStrip(page, { label: "Checks failed", actions: ["Fix"] });
  });

  test("shows running checks", async ({ page }) => {
    await open(page, "Running branch");
    await expectStrip(page, { label: "Checks running", actions: [] });
  });

  test("merges a ready PR from the strip", async ({ page }) => {
    await open(page, "Ready branch");
    await expectStrip(page, { label: "Open", actions: ["Merge"] });
    await page.getByTestId("workspace-pr-status-merge").click();
    await expectStrip(page, { label: "Merged", actions: ["Continue"] });
  });

  test("Continue refuses uncommitted changes and keeps the strip", async ({ page }) => {
    writeFileSync(path.join(localPathByTitle.get("Closed branch")!, "uncommitted.txt"), "wip\n");
    await open(page, "Closed branch");
    await page.getByTestId("workspace-pr-status-continue").click();
    await expect(page.getByTestId("app-toast-message")).toContainText("uncommitted changes");
    await expectStrip(page, { label: "Closed", actions: ["Continue"] });
  });

  test("Continue moves a merged PR's workspace onto a fresh branch", async ({ page }) => {
    await open(page, "Merged branch");
    await page.getByTestId("workspace-pr-status-continue").click();
    await expect(page.getByTestId("app-toast-message")).toContainText("Continued on ");
    await expect(page.getByTestId("workspace-pr-status-strip")).toHaveCount(0, {
      timeout: 20_000,
    });
    await expect(page.getByTestId("workspace-create-pr")).toBeVisible();
  });
});
