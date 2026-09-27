import { expect, test, type Page } from "../support/fixtures";
import { gotoAppShell } from "../support/helpers/app";
import { seedWorkspace, type SeededWorkspace } from "../support/helpers/seed-client";
import { getServerId } from "../support/helpers/server-id";
import {
  archiveWorkspaceFromSidebar,
  expectWorkspaceAbsentFromSidebar,
  pinWorkspaceFromSidebar,
} from "../support/helpers/sidebar";
import { waitForSidebarHydration } from "../support/helpers/workspace-ui";

function workspaceKey(workspaceId: string): string {
  return `${getServerId()}:${workspaceId}`;
}

function workspaceRow(page: Page, workspaceId: string) {
  return page.getByTestId(`sidebar-workspace-row-${workspaceKey(workspaceId)}`);
}

function snoozedSection(page: Page) {
  return page.getByTestId("sidebar-snoozed-section");
}

async function openSnoozePage(page: Page, workspaceId: string): Promise<void> {
  const row = workspaceRow(page, workspaceId);
  await expect(row).toBeVisible({ timeout: 30_000 });
  await row.click({ button: "right" });
  await page.getByTestId(`sidebar-workspace-menu-snooze-${workspaceKey(workspaceId)}`).click();
}

async function blurFocusedElement(page: Page): Promise<void> {
  await page.evaluate(() => {
    const active = document.activeElement;
    if (active instanceof HTMLElement) active.blur();
  });
}

// A row is filled when its background isn't transparent. Hover and keyboard focus draw the same
// fill, so a focused row plus a hovered row counts as two.
function countFilledMenuRows(page: Page): Promise<number> {
  return page.locator('[data-menu-surface="true"] [data-menu-item="true"]').evaluateAll(
    (nodes) =>
      nodes.filter((node) => {
        const color = getComputedStyle(node).backgroundColor;
        return color !== "rgba(0, 0, 0, 0)" && color !== "transparent";
      }).length,
  );
}

test.describe("Sidebar snooze and undo", () => {
  let workspace: SeededWorkspace;

  test.beforeEach(async ({ page }) => {
    workspace = await seedWorkspace({ repoPrefix: "sidebar-snooze-undo-" });
    await gotoAppShell(page);
    await waitForSidebarHydration(page);
  });

  test.afterEach(async () => {
    await workspace?.cleanup();
  });

  test("a snoozed workspace moves to Snoozed and Wake now returns it", async ({ page }) => {
    await openSnoozePage(page, workspace.workspaceId);
    await page.getByTestId("workspace-snooze-menu-tomorrow").click();

    await expect(snoozedSection(page)).toBeVisible({ timeout: 10_000 });
    await expect(workspaceRow(page, workspace.workspaceId)).toHaveCount(0);
    await page.getByTestId("sidebar-snoozed-section-header").click();
    await expect(
      snoozedSection(page).getByTestId(
        `sidebar-workspace-row-${workspaceKey(workspace.workspaceId)}`,
      ),
    ).toBeVisible();

    await openSnoozePage(page, workspace.workspaceId);
    await page.getByTestId("workspace-snooze-menu-wake").click();

    await expect(snoozedSection(page)).toHaveCount(0, { timeout: 10_000 });
    await expect(workspaceRow(page, workspace.workspaceId)).toBeVisible();
  });

  test("Undo in the archive toast restores the workspace", async ({ page }) => {
    await archiveWorkspaceFromSidebar(page, workspace.workspaceId);
    await expectWorkspaceAbsentFromSidebar(page, workspace.workspaceId);

    const toast = page.getByTestId("workspace-undo-toast");
    await expect(toast).toBeVisible();
    await toast.getByTestId("workspace-undo-toast-action").click();

    await expect(workspaceRow(page, workspace.workspaceId)).toBeVisible({ timeout: 15_000 });
  });

  test("only the hovered workspace menu row is filled", async ({ page }) => {
    const key = workspaceKey(workspace.workspaceId);
    const row = workspaceRow(page, workspace.workspaceId);
    await expect(row).toBeVisible({ timeout: 30_000 });
    await row.click({ button: "right" });

    const items = page.locator('[data-menu-surface="true"] [data-menu-item="true"]');
    await expect(items.first()).toBeVisible();
    await page.getByTestId(`sidebar-workspace-menu-snooze-${key}`).hover();

    await expect.poll(() => countFilledMenuRows(page)).toBe(1);
  });

  test("Mod+Z outside text fields undoes a pin", async ({ page }) => {
    await pinWorkspaceFromSidebar(page, workspace.workspaceId);
    const pinned = page.getByTestId("sidebar-pinned-section");
    await expect(pinned).toBeVisible({ timeout: 10_000 });

    await blurFocusedElement(page);
    await page.keyboard.press("ControlOrMeta+z");

    await expect(pinned).toHaveCount(0, { timeout: 10_000 });
    await expect(workspaceRow(page, workspace.workspaceId)).toBeVisible();
  });
});
