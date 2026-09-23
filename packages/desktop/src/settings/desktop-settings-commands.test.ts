import {
  parseCliVersion,
  isNewerCliVersion,
  providerUpdateCommand,
} from "../features/provider-updates";
import { describe, expect, it, vi } from "vitest";

import { DEFAULT_DESKTOP_SETTINGS, type DesktopSettingsStore } from "./desktop-settings";
import { createDesktopSettingsCommandHandlers } from "./desktop-settings-commands";

function createStoreMock(): DesktopSettingsStore {
  return {
    get: vi.fn(async () => DEFAULT_DESKTOP_SETTINGS),
    patch: vi.fn(async () => ({
      ...DEFAULT_DESKTOP_SETTINGS,
      releaseChannel: "beta",
    })),
    migrateLegacyRendererSettings: vi.fn(async () => ({
      ...DEFAULT_DESKTOP_SETTINGS,
      releaseChannel: "beta",
      daemon: {
        manageBuiltInDaemon: false,
        keepRunningAfterQuit: true,
      },
    })),
  };
}

describe("desktop-settings-commands", () => {
  it("exposes get and patch handlers through the desktop command bus shape", async () => {
    const store = createStoreMock();
    const handlers = createDesktopSettingsCommandHandlers({ settingsStore: store });

    await expect(handlers.get_desktop_settings()).resolves.toEqual(DEFAULT_DESKTOP_SETTINGS);
    await expect(
      handlers.patch_desktop_settings({
        daemon: { keepRunningAfterQuit: false },
      }),
    ).resolves.toEqual({
      ...DEFAULT_DESKTOP_SETTINGS,
      releaseChannel: "beta",
    });

    expect(store.get).toHaveBeenCalledTimes(1);
    expect(store.patch).toHaveBeenCalledWith({
      daemon: { keepRunningAfterQuit: false },
    });
  });

  it("accepts legacy renderer settings migration payloads", async () => {
    const store = createStoreMock();
    const handlers = createDesktopSettingsCommandHandlers({ settingsStore: store });

    const result = await handlers.migrate_legacy_desktop_settings({
      releaseChannel: "beta",
      manageBuiltInDaemon: false,
    });

    expect(result).toEqual({
      ...DEFAULT_DESKTOP_SETTINGS,
      releaseChannel: "beta",
      daemon: {
        manageBuiltInDaemon: false,
        keepRunningAfterQuit: true,
      },
    });
    expect(store.migrateLegacyRendererSettings).toHaveBeenCalledWith({
      releaseChannel: "beta",
      manageBuiltInDaemon: false,
    });
  });
});

describe("provider update checks", () => {
  it("compares versions numerically and recognizes prereleases", () => {
    expect(parseCliVersion("codex-cli 0.143.0")).toBe("0.143.0");
    expect(parseCliVersion("2.1.207 (Claude Code)")).toBe("2.1.207");
    expect(isNewerCliVersion("2.1.9", "2.1.10")).toBe(true);
    expect(isNewerCliVersion("2.1.10", "2.1.9")).toBe(false);
    expect(isNewerCliVersion("2.1.10", "2.1.10")).toBe(false);
    expect(isNewerCliVersion("0.143.0-beta.1", "0.143.0")).toBe(true);
  });

  it("updates through the detected installer and leaves unknown installations alone", () => {
    expect(
      providerUpdateCommand("claude", "/Users/test/.local/share/claude/versions/2.1.207"),
    ).toEqual({ command: "claude", args: ["update"] });
    expect(
      providerUpdateCommand("codex", "/Users/test/.local/share/codex/versions/0.143.0/codex"),
    ).toEqual({ command: "codex", args: ["update"] });
    expect(
      providerUpdateCommand("codex", "/opt/homebrew/lib/node_modules/@openai/codex/bin/codex.js"),
    ).toEqual({ command: "npm", args: ["install", "-g", "@openai/codex@latest"] });
    expect(
      providerUpdateCommand("claude", "/opt/homebrew/Caskroom/claude-code@latest/2.1.207/claude"),
    ).toEqual({ command: "brew", args: ["upgrade", "--cask", "claude-code@latest"] });
    expect(providerUpdateCommand("codex", "/usr/bin/codex")).toBeNull();
  });
});
