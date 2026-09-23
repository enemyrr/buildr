import { describe, expect, it } from "vitest";
import {
  darkPureBlackTheme,
  darkTheme,
  FONT_SIZE,
  getNextThemePreference,
  lightTheme,
  REGISTERED_THEMES,
  THEME_OPTIONS,
} from "./theme";

describe("Typography scale", () => {
  it("names 14px as the default interface tier", () => {
    expect(FONT_SIZE).toEqual({
      code: 12,
      content: 15,
      sm: 12,
      base: 14,
      lg: 16,
      xl: 18,
      "2xl": 20,
      "3xl": 22,
      "4xl": 26,
    });
  });
});

describe("Theme catalog", () => {
  it("owns the picker and shortcut order", () => {
    expect(THEME_OPTIONS.map((option) => option.name)).toEqual([
      "light",
      "dark",
      "auto",
      "paseo",
      "zinc",
      "midnight",
      "claude",
      "ghostty",
      "pureBlack",
    ]);
    expect(getNextThemePreference("dark")).toBe("auto");
    expect(getNextThemePreference("pureBlack")).toBe("light");
  });
});

describe("Conductor theme", () => {
  it("is the default dark theme", () => {
    expect(darkTheme.colors.surface0).toBe("#161413");
    expect(darkTheme.colors.surfaceWorkspace).toBe("#161413");
    expect(darkTheme.colors.surfaceSidebar).toBe("#1c1a19");
    expect(darkTheme.colors.tabIndicator).toBe("#e0a080");
  });
});

describe("Pure black theme", () => {
  it("uses a pure black application and terminal background", () => {
    expect(darkPureBlackTheme.colors.surface0).toBe("#000000");
    expect(darkPureBlackTheme.colors.background).toBe("#000000");
    expect(darkPureBlackTheme.colors.terminal.background).toBe("#000000");
  });

  it("uses Paseo's muted green accent", () => {
    expect(darkPureBlackTheme.colors.accent).toBe("#20744A");
    expect(darkPureBlackTheme.colors.accentBright).toBe("#7ccba0");
  });

  it("derives sidebar interaction surfaces from the surface scale", () => {
    expect(darkPureBlackTheme.colors.surfaceSidebar).toBe("#000000");
    expect(darkPureBlackTheme.colors.surfaceSidebarHover).toBe(darkPureBlackTheme.colors.surface1);
    expect(darkPureBlackTheme.colors.surfaceSidebarSelected).toBe(
      darkPureBlackTheme.colors.surface2,
    );
  });

  it("keeps ANSI black output readable on its zero-luminance terminal background", () => {
    expect(darkPureBlackTheme.colors.terminal.black).toBe("#595959");
    expect(darkPureBlackTheme.colors.terminal.brightBlack).toBe("#8a8a8a");
  });
});

describe("Sidebar interaction surfaces", () => {
  it("keeps Light selection distinct from the sidebar surface", () => {
    expect(lightTheme.colors.surfaceSidebarHover).toBe(lightTheme.colors.surface1);
    expect(lightTheme.colors.surfaceSidebarSelected).toBe(lightTheme.colors.surface3);
    expect(lightTheme.colors.surfaceSidebarSelected).not.toBe(lightTheme.colors.surfaceSidebar);
  });

  it("derives Dark hover and selection from the first two raised surfaces", () => {
    expect(darkTheme.colors.surfaceSidebarHover).toBe(darkTheme.colors.surface1);
    expect(darkTheme.colors.surfaceSidebarSelected).toBe(darkTheme.colors.surface2);
  });
});

describe("Built-in light theme", () => {
  it("preserves its authored aliases and terminal contrast through the semantic builder", () => {
    expect(lightTheme.colors).toMatchObject({
      primary: "#18181b",
      primaryForeground: "#fafafa",
      destructiveForeground: "#ffffff",
      successForeground: "#ffffff",
      terminal: {
        black: "#1a1a1e",
        brightBlack: "#3f3f46",
      },
    });
  });
});

describe("Status subtle colors", () => {
  it("tints each status color at one alpha per scheme", () => {
    expect(darkTheme.colors.statusMergedSubtle).toBe("rgba(168, 144, 213, 0.14)");
    expect(darkTheme.colors.statusSuccessSubtle).toBe("rgba(108, 177, 123, 0.14)");
    expect(lightTheme.colors.statusDangerSubtle).toBe("rgba(157, 67, 59, 0.1)");
  });

  it("derives neutral from the theme foreground", () => {
    expect(darkTheme.colors.statusNeutralSubtle).toBe("rgba(232, 230, 227, 0.06)");
  });

  it("steps up to a tint and a border from the same status color", () => {
    expect(darkTheme.colors.statusSuccessTint).toBe("rgba(108, 177, 123, 0.22)");
    expect(darkTheme.colors.statusMergedBorder).toBe("rgba(168, 144, 213, 0.4)");
    expect(lightTheme.colors.statusDangerTint).toBe("rgba(157, 67, 59, 0.16)");
  });

  it("exists on every registered theme", () => {
    for (const theme of Object.values(REGISTERED_THEMES)) {
      expect(theme.colors.statusSuccessSubtle).toMatch(/^rgba\(/);
      expect(theme.colors.statusDangerSubtle).toMatch(/^rgba\(/);
      expect(theme.colors.statusWarningSubtle).toMatch(/^rgba\(/);
      expect(theme.colors.statusMergedSubtle).toMatch(/^rgba\(/);
      expect(theme.colors.statusNeutralSubtle).toMatch(/^rgba\(/);
    }
  });
});
