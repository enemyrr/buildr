import { expect, type Locator } from "@playwright/test";
import { test } from "../support/fixtures";
import { gotoAppShell } from "../support/helpers/app";
import {
  expectCommandCenterToRemainAtTheTop,
  expectPrimaryCommandCenterActions,
  expectTightTwoLineResultSpacing,
  expectVisibleKeyboardNavigationNotToScroll,
  expectWorkspaceResultsToBeLimitedUntilSearch,
  observeCommandCenterScroll,
  openCommandCenterWithKeyboard,
} from "../support/helpers/command-center-scroll";
import { seedWorkspace } from "../support/helpers/seed-client";

test.use({
  userAgent:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/145.0 Safari/537.36",
});

test("opening the command center keeps its first result fully visible", async ({ page }) => {
  const seeded = await seedWorkspace({
    repoPrefix: "command-center-scroll-",
    title: "Command Center Scroll 00",
  });

  try {
    for (let index = 1; index <= 8; index += 1) {
      const created = await seeded.client.createWorkspace({
        source: {
          kind: "worktree",
          projectId: seeded.projectId,
          baseBranch: "main",
          worktreeSlug: `command-center-scroll-${index}`,
        },
        title: `Command Center Scroll ${String(index).padStart(2, "0")}`,
      });
      if (!created.workspace) {
        throw new Error(created.error ?? `Failed to seed workspace ${index}`);
      }
    }

    await gotoAppShell(page);
    await observeCommandCenterScroll(page);
    const panel = await openCommandCenterWithKeyboard(page);

    await expectCommandCenterToRemainAtTheTop(page);
    await expectPrimaryCommandCenterActions(panel);
    await expectVisibleKeyboardNavigationNotToScroll(page, panel);
    await expectTightTwoLineResultSpacing(panel, "Command Center Scroll 00");
    await expectWorkspaceResultsToBeLimitedUntilSearch(panel);
  } finally {
    await seeded.cleanup();
  }
});

// A row is filled when its background isn't transparent. The active row and a hovered row draw
// the same fill, so an active row plus a hovered one counts as two.
function filledResultTitles(panel: Locator): Promise<string[]> {
  return panel.getByRole("button").evaluateAll((nodes) =>
    nodes
      .filter((node) => {
        const color = getComputedStyle(node).backgroundColor;
        return color !== "rgba(0, 0, 0, 0)" && color !== "transparent";
      })
      .map((node) => node.textContent ?? ""),
  );
}

test("only moving the pointer moves the command center's active row", async ({ page }) => {
  await gotoAppShell(page);
  const panelBox = { x: (page.viewportSize()?.width ?? 1280) / 2, y: 250 };
  // A pointer resting where the results appear must not take the active row from the first one.
  await page.mouse.move(panelBox.x, panelBox.y);
  const panel = await openCommandCenterWithKeyboard(page);
  const results = panel.getByRole("button");
  await expect(results.nth(3)).toBeVisible();
  await expect.poll(() => filledResultTitles(panel)).toEqual([await results.first().textContent()]);

  const hovered = results.nth(3);
  await hovered.hover();
  await expect.poll(() => filledResultTitles(panel)).toEqual([await hovered.textContent()]);

  // Arrow keys continue from the hovered row.
  await page.mouse.move(0, 0);
  await page.keyboard.press("ArrowUp");
  await expect.poll(() => filledResultTitles(panel)).toEqual([await results.nth(2).textContent()]);
});
