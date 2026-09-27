import { expect, test, type Page } from "../support/fixtures";
import { composerLocator, expectComposerVisible } from "../support/helpers/composer";
import {
  openAgentRoute,
  seedMockAgentWorkspace,
  type MockAgentWorkspace,
} from "../support/helpers/mock-agent";

const SENT_PROMPT = "Summarize the release notes.";

async function openFinishedAgent(page: Page, agent: MockAgentWorkspace): Promise<void> {
  await agent.client.waitForFinish(agent.agentId, 20_000);
  await openAgentRoute(page, agent);
  await expectComposerVisible(page);
  await expect(page.getByText(SENT_PROMPT, { exact: true }).first()).toBeVisible({
    timeout: 15_000,
  });
}

async function pasteText(page: Page, text: string): Promise<void> {
  await composerLocator(page).evaluate((element, pasted) => {
    const clipboardData = new DataTransfer();
    clipboardData.setData("text/plain", pasted);
    element.dispatchEvent(
      new ClipboardEvent("paste", { clipboardData, bubbles: true, cancelable: true }),
    );
  }, text);
}

test.describe("Composer editing shortcuts", () => {
  let agent: MockAgentWorkspace;

  test.beforeEach(async () => {
    agent = await seedMockAgentWorkspace({
      repoPrefix: "composer-editing-",
      title: "Composer editing",
      initialPrompt: SENT_PROMPT,
    });
  });

  test.afterEach(async () => {
    await agent?.cleanup();
  });

  test("ArrowUp recalls the sent prompt and ArrowDown restores the empty draft", async ({
    page,
  }) => {
    await openFinishedAgent(page, agent);
    const composer = composerLocator(page);
    await composer.click();
    await expect(composer).toHaveValue("");

    await composer.press("ArrowUp");
    await expect(composer).toHaveValue(SENT_PROMPT);

    await composer.press("ArrowDown");
    await expect(composer).toHaveValue("");
  });

  test("the newline key continues a list, exits on an empty item, and undoes only the marker", async ({
    page,
  }) => {
    await openFinishedAgent(page, agent);
    const composer = composerLocator(page);
    await composer.click();
    await composer.pressSequentially("- item");

    await composer.press("Shift+Enter");
    await expect(composer).toHaveValue("- item\n- ");

    await test.step("Mod+Z undoes only the inserted marker", async () => {
      await composer.press("ControlOrMeta+z");
      await expect(composer).toHaveValue("- item");
    });

    await test.step("an empty item exits the list", async () => {
      await composer.press("Shift+Enter");
      await expect(composer).toHaveValue("- item\n- ");
      await composer.press("Shift+Enter");
      await expect(composer).toHaveValue("- item\n");
    });
  });

  test("a 40 KB paste becomes a text attachment instead of inline text", async ({ page }) => {
    await openFinishedAgent(page, agent);
    const composer = composerLocator(page);
    await composer.click();

    await pasteText(page, "x".repeat(40 * 1024));

    await expect(page.getByTestId("composer-file-attachment-pill")).toContainText(
      /pasted-text-\d{8}-\d{6}\.txt/,
      { timeout: 15_000 },
    );
    // The attachment's inline chip reserves its file name in the textarea; the body stays out.
    await expect(composer).not.toHaveValue(/x{64}/);
  });

  test("Mod+S stashes the draft and the stash menu restores it", async ({ page }) => {
    await openFinishedAgent(page, agent);
    const composer = composerLocator(page);
    const draft = "Draft to keep for later";
    await composer.fill(draft);

    await composer.press("ControlOrMeta+s");
    await expect(composer).toHaveValue("");
    const stashButton = page.getByTestId("composer-stash-button").filter({ visible: true });
    await expect(stashButton).toBeVisible();

    await stashButton.click();
    const menu = page.getByTestId("composer-stash-menu");
    await expect(menu).toBeVisible();
    await menu.locator('[data-testid^="composer-stash-entry-"]').filter({ hasText: draft }).click();

    await expect(composer).toHaveValue(draft);
  });
});
