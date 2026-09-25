import type { Locator } from "@playwright/test";
import { buildSettingsHostSectionRoute } from "@/utils/host-routes";
import { expect, test, type Page } from "../support/fixtures";
import { gotoAppShell } from "../support/helpers/app";
import { openModelBrowser } from "../support/helpers/agent-profiles";
import { expectComposerVisible } from "../support/helpers/composer";
import { openAgentRoute, seedMockAgentWorkspace } from "../support/helpers/mock-agent";
import { getServerId } from "../support/helpers/server-id";

const MOBILE_VIEWPORT = { width: 390, height: 844 };

// The composer's catalog is a flat list with no provider page, so provider
// settings are reached from a drill-down model selector. Metadata generation's
// manual picker is one; opening it without picking a model saves nothing.
async function openMetadataModelSelector(page: Page) {
  await gotoAppShell(page);
  await page.goto(buildSettingsHostSectionRoute(getServerId(), "environment"));
  await page.getByRole("button", { name: "Manual", exact: true }).click();
  await page.getByRole("button", { name: /Select model/ }).click();
  await page.getByTestId("model-provider-mock").click();
  await expectModelBrowserVisible(page);
}

async function expectModelBrowserVisible(page: Page) {
  await expect(page.getByTestId("model-search-input")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole("button", { name: /Open .* settings/ })).toBeVisible();
}

async function closeTopSheet(page: Page) {
  const closeTarget = page.getByLabel("Close", { exact: true }).last();
  if (await closeTarget.isVisible().catch(() => false)) {
    await closeTarget.click({ force: true });
    return;
  }

  const handle = page.getByRole("slider", { name: "Bottom sheet handle" }).last();
  const handleBox = await handle.boundingBox();
  if (!handleBox) {
    throw new Error("Bottom sheet handle was not measurable");
  }
  const startX = handleBox.x + handleBox.width / 2;
  const startY = handleBox.y + handleBox.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX, startY + 400, { steps: 8 });
  await page.mouse.up();
}

async function closeSheetByHeaderButton(page: Page, testId: string) {
  const sheet = page.getByTestId(testId);
  await sheet.getByLabel("Close", { exact: true }).click();
  await expect(sheet).not.toBeVisible({ timeout: 10_000 });
}

async function expectOverlayAbove(page: Page, frontTestId: string, backTestId: string) {
  const frontCoversBack = await page.evaluate(
    ({ frontTestId: frontId, backTestId: backId }) => {
      const front = document.querySelector(`[data-testid="${frontId}"]`);
      const back = document.querySelector(`[data-testid="${backId}"]`);
      if (!(front instanceof HTMLElement) || !(back instanceof HTMLElement)) return false;

      const frontRect = front.getBoundingClientRect();
      const backRect = back.getBoundingClientRect();
      const left = Math.max(frontRect.left, backRect.left);
      const right = Math.min(frontRect.right, backRect.right);
      const top = Math.max(frontRect.top, backRect.top);
      const bottom = Math.min(frontRect.bottom, backRect.bottom);
      if (left >= right || top >= bottom) return false;

      const topElement = document.elementFromPoint((left + right) / 2, (top + bottom) / 2);
      return topElement != null && front.contains(topElement);
    },
    { frontTestId, backTestId },
  );
  expect(frontCoversBack).toBe(true);
}

async function hasFocusWithin(locator: Locator): Promise<boolean> {
  return locator.evaluate((element) => element.contains(document.activeElement));
}

async function expectProviderSettingsVisible(page: Page) {
  await expect(page.getByTestId("provider-settings-sheet")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole("button", { name: "Add model" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Diagnostic", exact: true })).toBeVisible();
}

async function exerciseProviderSettingsStack(page: Page) {
  await expectProviderSettingsVisible(page);

  await page.getByRole("button", { name: "Add model" }).click();
  await expect(page.getByTestId("add-custom-model-sheet")).toBeVisible({ timeout: 10_000 });
  await closeSheetByHeaderButton(page, "add-custom-model-sheet");
  await expect(page.getByPlaceholder("e.g. openai/gpt-5")).not.toBeVisible({ timeout: 10_000 });
  await expectProviderSettingsVisible(page);

  await page.getByRole("button", { name: "Diagnostic", exact: true }).click();
  await expect(page.getByTestId("provider-diagnostic-sheet")).toBeVisible({ timeout: 10_000 });
  await page.getByRole("button", { name: /Refresh diagnostic/ }).click();
  await expect(page.getByTestId("provider-diagnostic-sheet")).toBeVisible({ timeout: 10_000 });
  await closeSheetByHeaderButton(page, "provider-diagnostic-sheet");
  await expectProviderSettingsVisible(page);

  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await expectProviderSettingsVisible(page);
}

test.describe("provider settings overlay stack", () => {
  test("app overlays open above the composer model browser without closing it", async ({
    page,
  }) => {
    const session = await seedMockAgentWorkspace({
      repoPrefix: "provider-modal-layer-",
      title: "Provider modal layer e2e",
    });

    try {
      await openAgentRoute(page, session);
      await expectComposerVisible(page);

      await openModelBrowser(page);
      const selector = page.getByTestId("combobox-desktop-container");
      await expect(selector).toBeVisible({ timeout: 10_000 });
      await expect(page.getByTestId("model-search-all-input")).toBeFocused();
      await page.keyboard.press("Shift+Tab");
      await expect.poll(() => hasFocusWithin(selector)).toBe(true);

      await page.keyboard.press("Shift+?");
      const shortcuts = page.getByTestId("keyboard-shortcuts-dialog");
      await expect(shortcuts).toBeVisible({ timeout: 10_000 });
      await expect(page.getByPlaceholder("Search shortcuts")).toBeFocused();
      await page.keyboard.press("Escape");
      await expect(shortcuts).not.toBeVisible({ timeout: 10_000 });
      await expect(selector).toBeVisible();

      await page.keyboard.press("ControlOrMeta+K");
      const commandCenter = page.getByTestId("command-center-panel");
      await expect(commandCenter).toBeVisible({ timeout: 10_000 });
      await expect(commandCenter.getByTestId("command-center-input")).toBeFocused();
      await page.keyboard.press("Escape");
      await expect(commandCenter).not.toBeVisible({ timeout: 10_000 });
      await expect(selector).toBeVisible();

      await page.keyboard.press("ControlOrMeta+K");
      await expect(commandCenter).toBeVisible({ timeout: 10_000 });
      await commandCenter.getByTestId("command-center-input").fill("add project");
      await commandCenter.getByText("Add project", { exact: true }).click();
      const addProject = page.getByTestId("add-project-flow");
      await expect(addProject).toBeVisible({ timeout: 10_000 });
      await page.keyboard.press("Escape");
      await expect(addProject).not.toBeVisible({ timeout: 10_000 });
      await expect(selector).toBeVisible();
    } finally {
      await session.cleanup();
    }
  });

  test("provider settings covers the desktop model selector without closing it", async ({
    page,
  }) => {
    await openMetadataModelSelector(page);
    const selector = page.getByTestId("combobox-desktop-container");
    await expect(selector).toBeVisible({ timeout: 10_000 });

    const settingsButton = page.getByTestId("selector-header-settings-mock");
    await settingsButton.click();

    const settings = page.getByTestId("provider-settings-sheet");
    await expect(settings).toBeVisible({ timeout: 10_000 });
    await expectOverlayAbove(page, "provider-settings-sheet", "combobox-desktop-container");

    await page.keyboard.press("Escape");
    await expect(settings).not.toBeVisible({ timeout: 10_000 });
    await expect(selector).toBeVisible();
    await expect(settingsButton).toBeFocused();
  });

  test("provider settings and children close back through the model browser", async ({ page }) => {
    test.setTimeout(180_000);
    await page.setViewportSize(MOBILE_VIEWPORT);

    await openMetadataModelSelector(page);
    await page.getByRole("button", { name: /Open .* settings/ }).click();
    await exerciseProviderSettingsStack(page);
    await closeSheetByHeaderButton(page, "provider-settings-sheet");

    await expectModelBrowserVisible(page);
    await page.getByRole("button", { name: /Open .* settings/ }).click();
    await expect(page.getByTestId("provider-settings-sheet")).toBeVisible({ timeout: 10_000 });
    await exerciseProviderSettingsStack(page);
    await closeSheetByHeaderButton(page, "provider-settings-sheet");

    await expectModelBrowserVisible(page);
    await closeTopSheet(page);
    await expect(page.getByTestId("model-search-input")).not.toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole("button", { name: /Select model/ })).toBeVisible();
  });
});
