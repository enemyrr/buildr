import { type Page } from "@playwright/test";
import { test, expect } from "../support/fixtures";

async function openProjectHome(page: Page) {
  await page.goto("/open-project");
  await expect(page.getByText("Add a project", { exact: true })).toBeVisible();
}

async function scrollToHomeFooter(page: Page) {
  await page.mouse.move(160, 350);
  await page.mouse.wheel(0, 1500);
}

async function expectHomeActionsReachable(page: Page) {
  await expect(page.getByTestId("open-project-setup-providers")).toBeInViewport({ ratio: 1 });
}

test("home actions remain reachable on a short phone screen", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await openProjectHome(page);
  await scrollToHomeFooter(page);
  await expectHomeActionsReachable(page);
  await page.screenshot({ path: testInfo.outputPath("home-scrolled.png") });
});

test("home actions fit on a desktop screen without overlap", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await openProjectHome(page);
  await expectHomeActionsReachable(page);
  await expect(page.getByTestId("open-project-setup-providers")).toHaveCSS(
    "-webkit-app-region",
    "none",
  );
});
