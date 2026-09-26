import { expect, test } from "../support/fixtures";
import {
  applyLoadoutSlot,
  closeModelPicker,
  expectComposerDoesNotName,
  expectComposerMode,
  expectCreateProfileFromModelRow,
  expectComposerModel,
  expectEmptyLoadout,
  expectLoadoutSlotActive,
  expectLoadoutSlots,
  expectModelRowProfileActionBesideRow,
  expectModelRowSelected,
  openDefaultModelsFromPicker,
  openModelBrowser,
  openModelPicker,
  seedAgentProfiles,
  selectModelRow,
} from "../support/helpers/agent-profiles";
import { expectWorkspaceAgentConfiguration } from "../support/helpers/command-center-agent-controls";
import { expectComposerVisible } from "../support/helpers/composer";
import { openAgentRoute, seedMockAgentWorkspace } from "../support/helpers/mock-agent";

const PROFILE = {
  id: "agent_profile_e2e_ui_work",
  name: "UI work",
  icon: "🎨",
  provider: "mock",
  model: "one-minute-stream",
  modeId: "approval-test",
  notes: "Use for UI work.",
};

test.describe("Model loadout in the composer picker", () => {
  test("an empty loadout offers Add models and links to Default models settings", async ({
    page,
  }) => {
    const seed = await seedAgentProfiles([]);
    const workspace = await seedMockAgentWorkspace({
      repoPrefix: "agent-profiles-empty-",
      title: "Agent profiles empty",
    });

    try {
      await openAgentRoute(page, workspace);
      await expectComposerVisible(page);
      await openModelPicker(page);
      await expectEmptyLoadout(page);
      await openDefaultModelsFromPicker(page);
    } finally {
      await workspace.cleanup();
      await seed.restore();
    }
  });

  test("applying a loadout slot materializes it into the composer", async ({ page }) => {
    const seed = await seedAgentProfiles([PROFILE]);
    // A live agent is one provider's process, so the slot has to name that
    // same provider or the picker shows it as unavailable.
    const workspace = await seedMockAgentWorkspace({
      repoPrefix: "agent-profiles-picker-",
      title: "Agent profiles picker",
      model: "ten-second-stream",
      modeId: "load-test",
    });

    try {
      await test.step("the agent starts on its seeded model and mode", async () => {
        await openAgentRoute(page, workspace);
        await expectComposerVisible(page);
        await expectComposerModel(page, "Ten second stream");
        await expectComposerMode(page, "Load test");
      });

      await test.step("the loadout lists the slot by name, not yet active", async () => {
        await openModelPicker(page);
        await expectLoadoutSlots(page, [PROFILE.name]);
        await expectLoadoutSlotActive(page, PROFILE.name, false);
        await closeModelPicker(page);
      });

      await test.step("More models opens the catalog flat, without provider rows", async () => {
        await openModelBrowser(page);
        await expectModelRowSelected(page, { provider: "mock", modelId: "ten-second-stream" });
        await expect(page.locator('[data-testid^="model-provider-"]')).toHaveCount(0);
        await expect(page.getByTestId("sheet-header-back")).toHaveCount(0);
        await closeModelPicker(page);
      });

      await test.step("applying it writes its model and mode into the composer", async () => {
        await openModelPicker(page);
        await applyLoadoutSlot(page, PROFILE.name);
        await expectComposerModel(page, "One minute stream");
        await expectComposerMode(page, "Approval test");
        await expectWorkspaceAgentConfiguration(workspace, {
          id: workspace.agentId,
          provider: "mock",
          model: "one-minute-stream",
          modeId: "approval-test",
        });
      });

      await test.step("the composer names the model, never the profile", async () => {
        await expectComposerDoesNotName(page, PROFILE.name);
      });

      await test.step("reopening marks the applied slot active", async () => {
        await openModelPicker(page);
        await expectLoadoutSlotActive(page, PROFILE.name, true);
        await closeModelPicker(page);
      });
    } finally {
      await workspace.cleanup();
      await seed.restore();
    }
  });

  test("a model row and its create-profile action are separate buttons", async ({ page }) => {
    const seed = await seedAgentProfiles([]);
    const workspace = await seedMockAgentWorkspace({
      repoPrefix: "agent-profiles-row-action-",
      title: "Agent profiles row action",
      model: "ten-second-stream",
      modeId: "load-test",
    });

    try {
      const oneMinute = {
        provider: "mock",
        modelId: "one-minute-stream",
        modelLabel: "One minute stream",
      };
      await openAgentRoute(page, workspace);
      await expectComposerVisible(page);
      await openModelPicker(page);
      await expectModelRowProfileActionBesideRow(page, oneMinute);
      await expectCreateProfileFromModelRow(page, oneMinute);
      await expectComposerModel(page, "Ten second stream");
      await openModelPicker(page);
      await selectModelRow(page, oneMinute);
      await expectComposerModel(page, oneMinute.modelLabel);
    } finally {
      await workspace.cleanup();
      await seed.restore();
    }
  });
});
