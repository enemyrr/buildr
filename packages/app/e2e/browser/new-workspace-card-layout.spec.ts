import { expect, test } from "../support/fixtures";
import { gotoAppShell } from "../support/helpers/app";
import { getE2EDaemonPort } from "../support/helpers/daemon-port";
import {
  openNewWorkspaceComposer,
  openStartingRefPicker,
  selectBranchInPicker,
  selectWorkspaceIsolation,
} from "../support/helpers/new-workspace";
import { seedWorkspace, type SeededWorkspace } from "../support/helpers/seed-client";
import { getServerId } from "../support/helpers/server-id";
import { seedSavedSettingsHosts } from "../support/helpers/settings";
import { waitForSidebarHydration } from "../support/helpers/workspace-ui";

const LONG_HOST_NAME =
  "development-macbook-pro.local-connected-through-a-very-long-private-hostname";
const LONG_BRANCH_NAME =
  "feat/app/add-amoled-theme-with-a-very-long-pull-request-and-branch-description";

interface ControlBox {
  label: string | null;
  right: number;
  centerY: number;
}

function measureControls(controls: HTMLElement[]): ControlBox[] {
  return controls.map((control) => {
    const rect = control.getBoundingClientRect();
    return {
      label: control.getAttribute("aria-label"),
      right: rect.right,
      centerY: rect.top + rect.height / 2,
    };
  });
}

test.describe("New workspace card layout", () => {
  let workspace: SeededWorkspace;

  test.beforeEach(async () => {
    workspace = await seedWorkspace({
      repoPrefix: "new-workspace-layout-",
      repo: { branches: [LONG_BRANCH_NAME] },
    });
  });

  test.afterEach(async () => {
    await workspace?.cleanup();
  });

  test("long host and branch names keep the create card's header chips on one row", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 2048, height: 878 });
    await seedSavedSettingsHosts(page, [
      {
        serverId: getServerId(),
        label: LONG_HOST_NAME,
        endpoint: `127.0.0.1:${getE2EDaemonPort()}`,
      },
      {
        serverId: "srv_e2e_layout_offline",
        label: "Offline host",
        endpoint: "127.0.0.1:9",
      },
    ]);

    await gotoAppShell(page);
    await waitForSidebarHydration(page);
    await openNewWorkspaceComposer(page, {
      projectKey: workspace.projectKey,
      projectDisplayName: workspace.projectDisplayName,
    });
    await selectWorkspaceIsolation(page, "worktree");
    await openStartingRefPicker(page);
    await selectBranchInPicker(page, LONG_BRANCH_NAME);

    const card = page.getByTestId("new-workspace-dialog").getByRole("dialog");
    const headerRow = page.getByTestId("new-workspace-ref-picker-row");
    const composer = page.locator('[data-testid="message-input-root"]:visible');
    const createButton = composer.getByTestId("workspace-create-submit");
    await expect(card).toBeVisible();
    await expect(headerRow).toBeVisible();
    await expect(createButton).toBeVisible();

    const [cardBox, headerBox, createBox, controls] = await Promise.all([
      card.boundingBox(),
      headerRow.boundingBox(),
      createButton.boundingBox(),
      headerRow.getByRole("button").evaluateAll(measureControls),
    ]);
    const [firstControl] = controls;
    if (!cardBox || !headerBox || !createBox || !firstControl) {
      throw new Error("New workspace card geometry could not be measured");
    }
    expect(controls.length).toBeGreaterThanOrEqual(3);

    const cardRight = cardBox.x + cardBox.width;
    const rowCenterY = firstControl.centerY;
    for (const control of controls) {
      const name = control.label ?? "Header chip";
      expect(control.right, `${name} crossed the card's right edge`).toBeLessThanOrEqual(
        cardRight + 1,
      );
      expect(control.centerY, `${name} wrapped off the header row`).toBeCloseTo(rowCenterY, 0);
    }

    // Create lives in the composer's footer, below the header chips.
    expect(createBox.y).toBeGreaterThan(headerBox.y + headerBox.height);
    expect(createBox.x + createBox.width).toBeLessThanOrEqual(cardRight + 1);
  });
});
