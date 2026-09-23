import { expect, type Page } from "@playwright/test";
import { escapeRegex } from "./regex";

export const gotoAppShell = async (page: Page) => {
  await page.goto("/");
};

export const gotoHome = async (page: Page) => {
  await gotoAppShell(page);
  const composer = page.getByRole("textbox", { name: "Message agent..." }).first();
  const entryButton = page
    .getByText("Add a project", { exact: true })
    .or(page.getByText("Add project", { exact: true }))
    .or(page.getByText("New agent", { exact: true }))
    .first();

  await expect
    .poll(
      async () =>
        (await composer.isVisible().catch(() => false)) ||
        (await entryButton.isVisible().catch(() => false)),
      { timeout: 10_000 },
    )
    .toBe(true);

  if (!(await composer.isVisible().catch(() => false))) {
    await entryButton.click();
  }

  await expect(composer).toBeVisible({ timeout: 30_000 });
};

export const openSettings = async (page: Page) => {
  // Navigate through the real app control so route changes stay aligned with UI behavior.
  const settingsButton = page.locator('[data-testid="sidebar-settings"]:visible').first();
  await expect(settingsButton).toBeVisible();
  await settingsButton.click();
  await expect(page).toHaveURL(/\/settings\/general$/);
};

export const setWorkingDirectory = async (page: Page, directory: string) => {
  const workingDirectorySelect = page
    .locator('[data-testid="working-directory-select"]:visible')
    .first();
  await expect(workingDirectorySelect).toBeVisible({ timeout: 30000 });

  const legacyInput = page.getByRole("textbox", { name: "/path/to/project" }).first();
  const directorySearchInput = page.getByRole("textbox", { name: /search directories/i }).first();
  const worktreePicker = page.getByTestId("worktree-attach-picker");
  const worktreeSheetTitle = page.getByText("Select worktree", { exact: true }).first();
  const closeBottomSheet = async () => {
    const bottomSheetBackdrop = page.getByRole("button", { name: "Bottom sheet backdrop" }).first();
    const bottomSheetHandle = page.getByRole("slider", { name: "Bottom sheet handle" }).first();
    for (let attempt = 0; attempt < 3; attempt += 1) {
      if (!(await bottomSheetBackdrop.isVisible())) {
        return;
      }
      await bottomSheetBackdrop.click({ force: true });
      await page.keyboard.press("Escape").catch(() => undefined);
      await page.waitForTimeout(200);
    }
    if (await bottomSheetBackdrop.isVisible()) {
      const box = await bottomSheetHandle.boundingBox();
      if (box) {
        const startX = box.x + box.width / 2;
        const startY = box.y + box.height / 2;
        await page.mouse.move(startX, startY);
        await page.mouse.down();
        await page.mouse.move(startX, startY + 400);
        await page.mouse.up();
        await page.waitForTimeout(200);
      }
    }
  };
  const closeWorktreeSheetIfOpen = async () => {
    if (!(await worktreeSheetTitle.isVisible()) && !(await worktreePicker.isVisible())) {
      return;
    }
    const attachToggle = page.getByTestId("worktree-attach-toggle");
    if (await attachToggle.isVisible()) {
      await attachToggle.click({ force: true });
      await page.waitForTimeout(200);
    }
    await closeBottomSheet();
  };

  await closeWorktreeSheetIfOpen();

  const pickerInputVisible = async () =>
    (await directorySearchInput.isVisible().catch(() => false)) ||
    (await legacyInput.isVisible().catch(() => false));

  if (!(await pickerInputVisible())) {
    await closeBottomSheet();
    await workingDirectorySelect.click({ force: true });
    if (!(await pickerInputVisible())) {
      await closeBottomSheet();
      await workingDirectorySelect.click({ force: true });
    }
    await expect.poll(async () => pickerInputVisible(), { timeout: 10000 }).toBe(true);
  }

  const trimmedDirectory = directory.replace(/\/+$/, "");
  const activeInput = (await directorySearchInput.isVisible().catch(() => false))
    ? directorySearchInput
    : legacyInput;

  await activeInput.fill(trimmedDirectory);

  if (activeInput === directorySearchInput) {
    // Combobox custom rows can be either plain path labels or prefixed labels.
    const plainOption = page
      .getByText(new RegExp(`^${escapeRegex(trimmedDirectory)}$`, "i"))
      .first();
    const prefixedUseOption = page
      .getByText(new RegExp(`^Use "${escapeRegex(trimmedDirectory)}"$`, "i"))
      .first();

    if (await plainOption.isVisible().catch(() => false)) {
      await plainOption.click({ force: true });
    } else if (await prefixedUseOption.isVisible().catch(() => false)) {
      await prefixedUseOption.click({ force: true });
    } else {
      // Fallback: accept highlighted option (directory suggestion).
      await activeInput.press("Enter");
    }
  } else {
    // Legacy path picker fallback.
    await activeInput.press("Enter");
  }

  // Wait for picker to close.
  await expect(activeInput).not.toBeVisible({ timeout: 10000 });

  const directoryCandidates = new Set<string>([trimmedDirectory]);
  if (trimmedDirectory.startsWith("/var/")) {
    directoryCandidates.add(`/private${trimmedDirectory}`);
  }
  if (trimmedDirectory.startsWith("/private/var/")) {
    directoryCandidates.add(trimmedDirectory.replace(/^\/private/, ""));
  }
  const basename = trimmedDirectory.split("/").findLast(Boolean) ?? trimmedDirectory;

  await expect
    .poll(
      async () => {
        const text = await workingDirectorySelect.innerText().catch(() => "");
        if (text.includes(basename)) return true;
        for (const candidate of directoryCandidates) {
          if (text.includes(candidate)) return true;
        }
        return false;
      },
      { timeout: 30000 },
    )
    .toBe(true);
};

export const ensureHostSelected = async (page: Page) => {
  const input = page.getByRole("textbox", { name: "Message agent..." });
  await expect(input).toBeVisible();

  if (await input.isEditable()) {
    return;
  }

  const selectHostLabel = page.getByText("Select host", { exact: true });
  if (await selectHostLabel.isVisible()) {
    await selectHostLabel.click();

    // We enforce a single seeded daemon, so the option should be unambiguous.
    const localhostOption = page.getByText("localhost", { exact: true }).first();
    const daemonIdOption = page
      .getByText(process.env.E2E_SERVER_ID ?? "srv_e2e_test_daemon", { exact: true })
      .first();

    if (await localhostOption.isVisible()) {
      await localhostOption.click();
    } else {
      await expect(daemonIdOption).toBeVisible();
      await daemonIdOption.click();
    }
  }

  await expect(input).toBeEditable();
};

export const createAgent = async (page: Page, message: string) => {
  const input = page.getByRole("textbox", { name: "Message agent..." });
  await expect(input).toBeEditable();
  await preferFastThinkingOption(page);
  await input.fill(message);
  await input.press("Enter");

  // The composer may remain on the draft screen briefly while the initial run starts,
  // so assert the user-visible result instead of forcing one route shape here.
  await expect(page).toHaveURL(/\/(workspace|agent|new-agent)(\/|$|\?)/, { timeout: 30000 });
  await expect(page.getByText(message, { exact: true }).first()).toBeVisible({
    timeout: 30000,
  });
};

async function preferFastThinkingOption(page: Page): Promise<void> {
  const trigger = page.getByTestId("combined-model-selector").filter({ visible: true }).first();
  if (!(await trigger.isVisible().catch(() => false))) {
    return;
  }
  // Only Codex is slow enough at high effort to matter; its model labels name GPT or Codex.
  const modelLabel = (await trigger.getAttribute("aria-label").catch(() => null)) ?? "";
  if (!/codex|gpt/i.test(modelLabel)) {
    return;
  }

  // Effort is a submenu row in the loadout picker; its page lists one row per level.
  await trigger.click();
  const effortRow = page.getByTestId("agent-thinking-selector").filter({ visible: true }).first();
  const effortLabel = (await effortRow.innerText().catch(() => "")).trim();
  if (!effortLabel || /\b(low|minimal|off)\b/i.test(effortLabel)) {
    await page.keyboard.press("Escape");
    return;
  }
  await effortRow.click();

  const options = page.locator('[data-testid^="model-loadout-effort-"]').filter({ visible: true });
  for (const label of ["low", "minimal", "off", "medium"]) {
    const option = options.filter({ hasText: new RegExp(`^${escapeRegex(label)}$`, "i") }).first();
    if (await option.isVisible().catch(() => false)) {
      await option.click();
      break;
    }
  }
  if (await effortRow.isVisible().catch(() => false)) {
    await page.keyboard.press("Escape");
  }
  await expect(effortRow).not.toBeVisible({ timeout: 5000 });
}

export interface AgentConfig {
  directory: string;
  model?: string;
  mode?: string;
  prompt: string;
}

/**
 * Picks a model through the loadout picker's catalog, which spans every
 * provider, so a model choice also sets the provider. On an empty loadout the
 * catalog row reads "Add models…" and the pick joins the loadout.
 */
export const selectModel = async (page: Page, model: string) => {
  const normalizedModel = model.trim();
  if (!normalizedModel) {
    throw new Error("Model must be a non-empty string.");
  }
  const exactLabel = new RegExp(`^${escapeRegex(normalizedModel)}$`, "i");

  const trigger = page.getByTestId("combined-model-selector").filter({ visible: true }).first();
  await expect(trigger).toBeVisible({ timeout: 30000 });
  if (
    await trigger
      .getByText(exactLabel)
      .first()
      .isVisible()
      .catch(() => false)
  ) {
    return;
  }

  await trigger.click();
  await page.getByTestId("browse-all-models").filter({ visible: true }).first().click();
  const searchInput = page.getByTestId("model-search-all-input").filter({ visible: true }).first();
  await expect(searchInput).toBeVisible({ timeout: 10000 });
  await searchInput.fill(normalizedModel);

  const rows = page.locator('[data-testid^="model-row-"]').filter({ visible: true });
  await expect(rows.first()).toBeVisible({ timeout: 10000 });
  const exactOption = rows.filter({ has: page.getByText(exactLabel) }).first();
  if (await exactOption.isVisible().catch(() => false)) {
    await exactOption.click();
  } else {
    // Model IDs and version suffixes ("Haiku 4.5") miss the exact label, so
    // take the best-ranked result instead.
    await rows.first().click();
  }

  if (await searchInput.isVisible().catch(() => false)) {
    await page.keyboard.press("Escape").catch(() => undefined);
  }
  await expect(searchInput).not.toBeVisible({ timeout: 5000 });
};

/** Picks a mode from the Mode page of the loadout picker. */
export const selectMode = async (page: Page, mode: string) => {
  const trigger = page.getByTestId("combined-model-selector").filter({ visible: true }).first();
  await trigger.click();
  const modeRow = page.getByTestId("mode-control").filter({ visible: true }).first();
  await expect(modeRow).toBeVisible({ timeout: 10000 });
  await modeRow.click();

  const option = page
    .locator('[data-testid^="model-loadout-mode-"]')
    .filter({ visible: true })
    .filter({ hasText: new RegExp(`^${escapeRegex(mode)}$`, "i") })
    .first();
  await expect(option).toBeVisible({ timeout: 10000 });
  await option.click();
  await expect(modeRow).not.toBeVisible({ timeout: 5000 });
};

export const createAgentWithConfig = async (page: Page, config: AgentConfig) => {
  await gotoHome(page);
  await ensureHostSelected(page);
  await setWorkingDirectory(page, config.directory);

  if (config.model) {
    await selectModel(page, config.model);
  }

  if (config.mode) {
    await selectMode(page, config.mode);
  }

  await createAgent(page, config.prompt);
};

export const createAgentInRepo = async (
  page: Page,
  config: Pick<AgentConfig, "directory" | "prompt">,
) => {
  await gotoHome(page);
  await ensureHostSelected(page);
  await setWorkingDirectory(page, config.directory);
  await createAgent(page, config.prompt);
};
