import { expect, test } from "../support/fixtures";
import { gotoAppShell, openSettings } from "../support/helpers/app";
import { installProviderUsageFixture } from "../support/helpers/provider-usage";
import { getServerId } from "../support/helpers/server-id";
import { openAgentsTab } from "../support/helpers/settings";

test.describe("provider usage settings", () => {
  test("Usage button opens provider limits and refreshes without sidebar meters", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1400, height: 900 });
    const unavailableProviders = ["copilot", "cursor", "zai", "grok", "kimi", "minimax"].map(
      (providerId) => ({
        providerId,
        displayName: providerId,
        status: "unavailable" as const,
        planLabel: null,
        windows: [],
      }),
    );
    const usageFixture = await installProviderUsageFixture(
      page,
      [7, 64].map((usedPct) => ({
        fetchedAt: "2026-09-26T00:00:00.000Z",
        providers: [
          {
            providerId: "claude",
            displayName: "Claude",
            status: "available" as const,
            planLabel: "Max 20x",
            windows: [
              { id: "session", label: "Session", usedPct },
              { id: "weekly", label: "Weekly", usedPct: 12 },
              { id: "premium", label: "Premium", usedPct: 6 },
            ],
          },
          {
            providerId: "codex",
            displayName: "Codex",
            status: "error" as const,
            planLabel: null,
            windows: [],
            error: "Usage temporarily unavailable",
          },
          ...unavailableProviders,
        ],
      })),
      { responseDelayMs: 300 },
    );
    await gotoAppShell(page);
    const trigger = page.getByTestId("sidebar-resources");
    await expect(trigger).toHaveAccessibleName("Usage");
    await expect(trigger).toHaveText("Usage");
    await expect(page.getByTestId("sidebar-usage-switch")).toHaveCount(0);
    expect(usageFixture.requestCount()).toBe(0);
    await trigger.click();
    const popover = page.getByTestId("sidebar-resources-menu");
    await expect(popover).toBeVisible();
    await expect(popover.getByText("Plan limits", { exact: true })).toBeVisible();
    await expect(popover.getByText("Claude", { exact: true })).toBeVisible();
    await expect(popover.getByText("7%", { exact: true })).toBeVisible();
    await expect(popover.getByText("Usage temporarily unavailable")).toBeVisible();
    await expect(popover.getByText("copilot", { exact: true })).toHaveCount(0);
    await popover.getByTestId("sidebar-usage-unavailable").click();
    await expect(popover.getByText("copilot", { exact: true })).toBeVisible();
    // Reanimated's custom keyframe cleanup used to restore the smaller loading position.
    await page.waitForTimeout(1100);
    await expect(popover).toBeInViewport({ ratio: 1 });
    await popover.getByTestId("sidebar-usage-refresh").click();
    await usageFixture.waitForRequestCount(2);
    await expect(popover.getByText("64%", { exact: true })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(popover).toHaveCount(0);
    await expect(trigger).toBeFocused();
    await trigger.click();
    await expect(popover).toBeVisible();
  });

  test("Usage button explains an empty usage response", async ({ page }) => {
    await page.setViewportSize({ width: 1400, height: 900 });
    await installProviderUsageFixture(page, [
      { fetchedAt: "2026-09-26T00:00:00.000Z", providers: [] },
    ]);
    await gotoAppShell(page);
    await page.getByTestId("sidebar-resources").click();
    await expect(
      page.getByTestId("sidebar-resources-menu").getByText("No usage data", { exact: true }),
    ).toBeVisible();
  });

  test("renders every provider returned by the daemon usage RPC", async ({ page }) => {
    test.setTimeout(120_000);
    const serverId = getServerId();
    const usageFixture = await installProviderUsageFixture(page, [
      {
        fetchedAt: "2026-06-19T00:00:00.000Z",
        providers: [
          {
            providerId: "claude",
            displayName: "Claude",
            status: "available",
            planLabel: "Max 20x",
            windows: [{ id: "session", label: "Session", usedPct: 7 }],
          },
          {
            providerId: "codex",
            displayName: "Codex",
            status: "available",
            planLabel: "Pro 20x",
            windows: [{ id: "weekly", label: "Weekly", usedPct: 29 }],
          },
          {
            providerId: "glm",
            displayName: "GLM coding plan",
            status: "available",
            planLabel: "GLM coding plan",
            sourceLabel: "OpenUsage 0.6.27",
            windows: [
              { id: "biweekly", label: "Biweekly", usedPct: 23 },
              { id: "daily", label: "Daily", remainingPct: 30 },
            ],
            balances: [
              { id: "credits", label: "Credits", remaining: 1234, unit: "credits" },
              { id: "extra", label: "Extra usage", used: 5, limit: 20, unit: "usd" },
            ],
            details: [{ id: "valid", label: "Valid until", value: "2026-12-31" }],
          },
        ],
      },
    ]);

    await gotoAppShell(page);
    await openSettings(page);
    expect(usageFixture.requestCount()).toBe(0);
    await openAgentsTab(page, serverId, "usage");
    await usageFixture.waitForRequestCount(1);

    const card = page.getByTestId("provider-usage-card");
    await expect(card).toBeVisible({ timeout: 10_000 });
    await expect(card.getByText("Claude", { exact: true })).toBeVisible();
    await expect(card.getByText("Codex", { exact: true })).toBeVisible();
    await expect(card.getByText("GLM coding plan", { exact: true }).first()).toBeVisible();
    await expect(card.getByText("Biweekly", { exact: true })).toBeVisible();
    await expect(card.getByText("Daily", { exact: true })).toBeVisible();
    await expect(card.getByText("70%")).toBeVisible();
    await expect(card.getByText("Credits", { exact: true })).toBeVisible();
    await expect(card.getByText("1,234 left", { exact: true })).toBeVisible();
    await expect(card.getByText("Extra usage", { exact: true })).toBeVisible();
    await expect(card.getByText("$5.00 / $20.00", { exact: true })).toBeVisible();
    await expect(card.getByText("Valid until", { exact: true })).toBeVisible();
    await expect(card.getByText("2026-12-31", { exact: true })).toBeVisible();
    await expect(card.getByText(/OpenUsage 0\.6\.27/)).toBeVisible();
  });

  test("refresh invalidates and refetches usage", async ({ page }) => {
    test.setTimeout(120_000);
    const serverId = getServerId();
    const usageFixture = await installProviderUsageFixture(page, [
      {
        fetchedAt: "2026-06-19T00:00:00.000Z",
        providers: [
          {
            providerId: "glm",
            displayName: "GLM coding plan",
            status: "available",
            planLabel: "GLM coding plan",
            windows: [{ id: "biweekly", label: "Biweekly", usedPct: 23 }],
          },
        ],
      },
      {
        fetchedAt: "2026-06-19T00:01:00.000Z",
        providers: [
          {
            providerId: "glm",
            displayName: "GLM coding plan",
            status: "available",
            planLabel: "GLM coding plan",
            windows: [{ id: "biweekly", label: "Biweekly", usedPct: 64 }],
          },
        ],
      },
    ]);

    await gotoAppShell(page);
    await openSettings(page);
    await openAgentsTab(page, serverId, "usage");
    await usageFixture.waitForRequestCount(1);
    await expect(page.getByText("23%")).toBeVisible({ timeout: 10_000 });

    await page.getByRole("button", { name: "Refresh", exact: true }).click();
    await usageFixture.waitForRequestCount(2);

    expect(usageFixture.requestCount()).toBe(2);
    await expect(page.getByText("64%")).toBeVisible();
  });

  test("one provider error does not collapse the usage list", async ({ page }) => {
    test.setTimeout(120_000);
    const serverId = getServerId();
    await installProviderUsageFixture(page, [
      {
        fetchedAt: "2026-06-19T00:00:00.000Z",
        providers: [
          {
            providerId: "claude",
            displayName: "Claude",
            status: "error",
            planLabel: null,
            windows: [],
            error: "Claude auth expired",
          },
          {
            providerId: "codex",
            displayName: "Codex",
            status: "available",
            planLabel: "Pro 20x",
            windows: [{ id: "weekly", label: "Weekly", usedPct: 71 }],
          },
        ],
      },
    ]);

    await gotoAppShell(page);
    await openSettings(page);
    await openAgentsTab(page, serverId, "usage");

    const card = page.getByTestId("provider-usage-card");
    await expect(card).toBeVisible({ timeout: 10_000 });
    await expect(card.getByText("Error", { exact: true })).toBeVisible();
    await expect(card.getByText("Claude auth expired", { exact: true })).toBeVisible();
    await expect(card.getByText("Codex", { exact: true })).toBeVisible();
    await expect(card.getByText("71%")).toBeVisible();
  });
});
