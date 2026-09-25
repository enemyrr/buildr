import { expect, test, type Page } from "../support/fixtures";
import { gotoAppShell, openSettings } from "../support/helpers/app";
import { openSettingsSection } from "../support/helpers/settings";
import { openWhatsNew, release, serveChangelog } from "../support/helpers/changelog";

const CHANGELOG_DESTINATION = /^https:\/\/paseo\.sh\/changelog(?:[/?#]|$)/;

async function expectDiagnosticReport(page: Page): Promise<void> {
  const sheet = page.getByTestId("app-diagnostic-sheet");
  await expect(sheet).toBeVisible();
  await expect(sheet.getByRole("button", { name: "Copy diagnostic" })).toBeEnabled();
  await expect(page.getByText(/App version:/).first()).toBeVisible();
}

async function closeSheet(page: Page, testID: string): Promise<void> {
  const sheet = page.getByTestId(testID);
  await sheet.getByLabel("Close").click();
  await expect(sheet).not.toBeVisible();
}

test("renders the changelog in the app and links the website", async ({ page }) => {
  // A callout, a section name the app has never seen, and a fenced sample whose
  // contents look like a release heading.
  await serveChangelog(page, [
    "# Changelog",
    "",
    "## 9.1.0 - 2026-03-04",
    "",
    "Headline release note.",
    "",
    "> [!WARNING]",
    "> Read this before upgrading.",
    "",
    "### Sparkles",
    "",
    "- Added a brand new thing",
    "",
    "```md",
    "## 0.0.0 - 1999-01-01",
    "```",
    "",
    "## 9.0.0 - 2026-02-01",
    "",
    "### Fixed",
    "",
    "- Fixed an older thing",
    "",
  ]);
  await gotoAppShell(page);

  const sheet = await openWhatsNew(page);
  const latest = release(sheet, "9.1.0");

  await expect(latest.getByText("March 4, 2026", { exact: true })).toBeVisible();
  await expect(latest.getByText("Headline release note.")).toBeVisible();
  await expect(latest.getByText("Read this before upgrading.")).toBeVisible();
  await expect(latest.getByText("Sparkles", { exact: true })).toBeVisible();
  await expect(latest.getByText("Added a brand new thing")).toBeVisible();
  await expect(release(sheet, "9.0.0")).toBeVisible();
  await expect(release(sheet, "0.0.0")).toHaveCount(0);

  const popupPromise = page.waitForEvent("popup");
  await page.getByTestId("changelog-open-website").click();
  const popup = await popupPromise;
  expect(popup.url()).toMatch(CHANGELOG_DESTINATION);
  await popup.close();
  await closeSheet(page, "changelog-sheet");
});

test("searches keyboard shortcuts opened with the ? shortcut", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "platform", { get: () => "MacIntel" });
  });
  await gotoAppShell(page);
  await page.keyboard.press("Shift+?");

  const dialog = page.getByTestId("keyboard-shortcuts-dialog");
  const search = page.getByPlaceholder("Search shortcuts");

  await search.fill("command+n");
  await expect(dialog.getByText("New workspace", { exact: true })).toBeVisible();

  await search.fill("interrupt");

  await expect(dialog.getByText("Interrupt agent", { exact: true })).toBeVisible();
  await expect(dialog.getByText("New workspace", { exact: true })).toHaveCount(0);

  await search.fill("no matching shortcut");
  await expect(dialog.getByText("No results found", { exact: true })).toBeVisible();

  await search.fill("");
  await expect(dialog.getByText("New workspace", { exact: true })).toBeVisible();
});

test("runs diagnostics from Settings", async ({ page }) => {
  await gotoAppShell(page);
  await openSettings(page);
  await openSettingsSection(page, "about");

  await page.getByRole("button", { name: "Run", exact: true }).click();
  await expectDiagnosticReport(page);
});
