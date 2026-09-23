import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { test, expect, type Page } from "../support/fixtures";
import { seedMockAgentWorkspace, openAgentRoute } from "../support/helpers/mock-agent";
import { openChangesPanel } from "../support/helpers/workspace-tabs";

function visibleComposer(page: Page) {
  return page.locator("textarea[data-composer-input]").filter({ visible: true }).first();
}

test("mentions a changed file inline in the focused chat without replacing its draft", async ({
  page,
}) => {
  const workspace = await seedMockAgentWorkspace({
    repoPrefix: "add-file-to-chat-",
    title: "Target chat",
  });
  const relativePath = "src/changed file.ts";

  try {
    await mkdir(path.join(workspace.cwd, "src"), { recursive: true });
    await writeFile(path.join(workspace.cwd, relativePath), "export const changed = true;\n");
    await workspace.client.checkoutRefresh(workspace.cwd);

    await page.setViewportSize({ width: 1400, height: 900 });
    await openAgentRoute(page, {
      workspaceId: workspace.workspaceId,
      agentId: workspace.agentId,
    });

    const agentComposer = visibleComposer(page);
    await expect(agentComposer).toBeEditable({ timeout: 30_000 });
    await agentComposer.fill("Preserve this thought");

    await openChangesPanel(page);
    const changedFile = page.getByText("changed file.ts", { exact: true }).first();
    await expect(changedFile).toBeVisible({ timeout: 30_000 });
    await page.getByTestId("diff-file-0-toggle").click({ button: "right" });
    await page.getByTestId("diff-file-0-add-to-chat").click();

    await expect(agentComposer).toHaveValue(`Preserve this thought "${relativePath}" `);
    await expect(page.getByTestId("composer-workspace-file-attachment-pill")).toHaveCount(0);
    await expect(agentComposer).toBeFocused();
  } finally {
    await workspace.cleanup();
  }
});
