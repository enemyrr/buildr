import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Locator, TestInfo } from "@playwright/test";
import { expect, test as base, type Page } from "../fixtures";
import { gotoAppShell, openSettings } from "./app";
import {
  closeModelPicker,
  loadoutMenu,
  loadoutSlot,
  openModelBrowser,
  openModelPicker,
  searchAllModels,
  seedAgentProfiles,
  selectModelFromBrowser,
} from "./agent-profiles";
import { openAgentRoute } from "./mock-agent";
import { connectNewWorkspaceDaemonClient, openGlobalNewWorkspaceComposer } from "./new-workspace";
import { copyPluginExample } from "./plugin-fixture";
import { seedWorkspace, type SeededWorkspace } from "./seed-client";
import { getServerId } from "./server-id";
import { openSettingsHostSection } from "./settings";

const MODEL_LABEL = "Select model (Example 1)";
const PLUGIN_MODEL_ROW = "model-row-direct-example-example-1";
const WIDE = { width: 1400, height: 950 };
const COMPACT = { width: 390, height: 844 };

async function readIconPaths(page: Page, pluginDirectory: string): Promise<string[]> {
  const svg = await readFile(path.join(pluginDirectory, "icon.svg"), "utf8");
  return page.evaluate(
    (source) =>
      Array.from(
        new DOMParser().parseFromString(source, "image/svg+xml").querySelectorAll("path"),
        (element) => element.getAttribute("d") ?? "",
      ),
    svg,
  );
}

function readIconDrawings(icons: SVGElement[]): string[][] {
  return icons.map((icon) =>
    Array.from(icon.querySelectorAll("path"), (element) => element.getAttribute("d") ?? ""),
  );
}

async function expectProviderIcon(surface: Locator, paths: string[]): Promise<void> {
  await expect(surface).toBeVisible();
  // Provider icons are decorative SVGs without accessible names. Compare the
  // plugin asset's drawing, allowing surface-specific size and theme colours.
  await expect
    .poll(() => surface.locator("svg").evaluateAll(readIconDrawings))
    .toContainEqual(paths);
}

/**
 * The journey starts on an empty loadout, so this pick goes through "Add models…"
 * and also puts Example 1 in the loadout, where later steps find its icon.
 */
async function selectPluginModel(page: Page): Promise<void> {
  await selectModelFromBrowser(page, { provider: "direct-example", label: "Example 1" });
  await expect(page.getByRole("button", { name: MODEL_LABEL, exact: true })).toBeVisible();
}

/** The composer trigger shows only the label; the provider icon lives on the loadout slot. */
async function expectLoadoutSlotIcon(page: Page, iconPaths: string[]): Promise<void> {
  await openModelPicker(page);
  await expectProviderIcon(loadoutSlot(page, "Example 1"), iconPaths);
}

async function capture(page: Page, testInfo: TestInfo, name: string): Promise<void> {
  const screenshot = testInfo.outputPath(`${name}.png`);
  await page.screenshot({ path: screenshot });
  await testInfo.attach(name, { path: screenshot, contentType: "image/png" });
}

interface ProviderIconJourney {
  page: Page;
  testInfo: TestInfo;
  iconPaths: string[];
  workspace: SeededWorkspace;
}

export const test = base.extend<{ providerIcons: ProviderIconJourney }>({
  providerIcons: async ({ page }, provide, testInfo) => {
    const client = await connectNewWorkspaceDaemonClient();
    const loadout = await seedAgentProfiles([]);
    try {
      const previous = await client.getDaemonConfig();
      const plugin = await copyPluginExample("provider-direct");
      try {
        try {
          await client.patchDaemonConfig({ pluginsEnabled: true });
          await client.installDirectoryPlugin(plugin.directory);
          const workspace = await seedWorkspace({ repoPrefix: "plugin-provider-icons-" });
          try {
            await page.setViewportSize(WIDE);
            await gotoAppShell(page);
            const iconPaths = await readIconPaths(page, plugin.directory);
            await provide({ page, testInfo, iconPaths, workspace });
          } finally {
            await workspace.cleanup();
          }
        } finally {
          try {
            await client.removePlugin("provider-direct-example");
          } finally {
            await client.patchDaemonConfig({ pluginsEnabled: previous.config.pluginsEnabled });
          }
        }
      } finally {
        await plugin.cleanup();
      }
    } finally {
      await loadout.restore();
      await client.close();
    }
  },
});

export async function verifyProviderSettings({
  page,
  iconPaths,
  testInfo,
}: ProviderIconJourney): Promise<void> {
  await test.step("provider settings render the registered icon", async () => {
    await openSettings(page);
    await openSettingsHostSection(page, getServerId(), "providers");
    await expectProviderIcon(
      page.getByRole("button", { name: "Direct provider example provider details", exact: true }),
      iconPaths,
    );
    await capture(page, testInfo, "provider-settings");
    await page.getByTestId("settings-back-to-workspace").click();
  });
}

export async function verifyNewWorkspaceModelIcon({
  page,
  iconPaths,
  testInfo,
}: ProviderIconJourney): Promise<void> {
  await test.step("new workspace shows the picker icon on the catalog row and loadout slot", async () => {
    await openGlobalNewWorkspaceComposer(page);
    await selectPluginModel(page);
    await openModelBrowser(page);
    await searchAllModels(page, "Example 1");
    await expectProviderIcon(page.getByTestId(PLUGIN_MODEL_ROW), iconPaths);
    await capture(page, testInfo, "new-workspace-picker");
    await closeModelPicker(page);
    await expectLoadoutSlotIcon(page, iconPaths);
    await capture(page, testInfo, "new-workspace-loadout");
    await closeModelPicker(page);
    await expect(page.getByRole("button", { name: MODEL_LABEL, exact: true })).toBeVisible();
  });
}

export async function verifyCompactModelIcon({
  page,
  iconPaths,
  testInfo,
}: ProviderIconJourney): Promise<void> {
  await test.step("compact composer's loadout sheet preserves the same provider icon", async () => {
    await page.setViewportSize(COMPACT);
    await expect(page.getByRole("button", { name: MODEL_LABEL, exact: true })).toBeVisible();
    await expectLoadoutSlotIcon(page, iconPaths);
    await expect(loadoutMenu(page)).toBeVisible();
    await capture(page, testInfo, "compact-loadout");
  });
}

export async function verifyExistingAgentModelIcon({
  page,
  iconPaths,
  testInfo,
  workspace,
}: ProviderIconJourney): Promise<void> {
  await test.step("existing agent composer uses the same icon", async () => {
    const agent = await workspace.client.createAgent({
      provider: "direct-example",
      model: "example-1",
      cwd: workspace.repoPath,
      workspaceId: workspace.workspaceId,
      title: "Plugin icon agent",
    });
    await page.setViewportSize(WIDE);
    await openAgentRoute(page, { workspaceId: workspace.workspaceId, agentId: agent.id });
    await expect(page.getByRole("button", { name: MODEL_LABEL, exact: true })).toBeVisible();
    await expectLoadoutSlotIcon(page, iconPaths);
    await capture(page, testInfo, "agent-loadout");
    await closeModelPicker(page);
  });
}
