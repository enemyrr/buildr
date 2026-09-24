import { useEffect, useRef, useState } from "react";
import { getIsElectronRuntimeMac } from "@/constants/layout";
import { useAgentDirectoryDemand } from "./use-aggregated-agents";
import { getDesktopHost } from "@/desktop/host";
import { useSessionStore, type Agent } from "@/stores/session-store";
import { useActionableWorkspaceCount } from "@/stores/session-store-hooks";
import { isNative } from "@/constants/platform";

type FaviconStatus = "none" | "running" | "attention";
type ColorScheme = "dark" | "light";

/* eslint-disable @typescript-eslint/no-require-imports */
const FAVICON_IMAGES: Record<ColorScheme, Record<FaviconStatus, { uri: string } | number>> = {
  dark: {
    none: require("../../assets/images/favicon-dark.png"),
    running: require("../../assets/images/favicon-dark-running.png"),
    attention: require("../../assets/images/favicon-dark-attention.png"),
  },
  light: {
    none: require("../../assets/images/favicon-light.png"),
    running: require("../../assets/images/favicon-light-running.png"),
    attention: require("../../assets/images/favicon-light-attention.png"),
  },
};
/* eslint-enable @typescript-eslint/no-require-imports */

const faviconStatusByAgents = new WeakMap<Map<string, Agent>, FaviconStatus>();

function deriveFaviconStatus(agents: Map<string, Agent>): FaviconStatus {
  let status: FaviconStatus = "none";
  for (const agent of agents.values()) {
    if (agent.archivedAt) continue;
    if (agent.status === "running") return "running";
    if (agent.requiresAttention || agent.pendingPermissions.length > 0) status = "attention";
  }
  return status;
}

// Runs on every session-store commit; only a replaced agents Map is rescanned.
function selectFaviconStatus(state: ReturnType<typeof useSessionStore.getState>): FaviconStatus {
  let status: FaviconStatus = "none";
  for (const { agents } of Object.values(state.sessions)) {
    let sessionStatus = faviconStatusByAgents.get(agents);
    if (sessionStatus === undefined) {
      sessionStatus = deriveFaviconStatus(agents);
      faviconStatusByAgents.set(agents, sessionStatus);
    }
    if (sessionStatus === "running") return "running";
    if (sessionStatus === "attention") status = "attention";
  }
  return status;
}

function getFaviconUri(status: FaviconStatus, colorScheme: ColorScheme): string {
  const image = FAVICON_IMAGES[colorScheme][status];
  if (typeof image === "object" && "uri" in image) {
    return image.uri;
  }
  const suffix = status === "none" ? "" : `-${status}`;
  return `/assets/images/favicon-${colorScheme}${suffix}.png`;
}

function getOrCreateFaviconLink(): HTMLLinkElement | null {
  if (typeof document === "undefined") return null;

  let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (!link) {
    link = document.createElement("link");
    link.rel = "icon";
    link.type = "image/png";
    document.head.appendChild(link);
  }
  return link;
}

function updateFavicon(status: FaviconStatus, colorScheme: ColorScheme) {
  const link = getOrCreateFaviconLink();
  if (!link) return;

  const newHref = getFaviconUri(status, colorScheme);
  if (link.href !== newHref) {
    link.href = newHref;
  }
}

function getSystemColorScheme(): ColorScheme {
  if (isNative || typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return "dark";
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

async function updateMacDockBadge(count?: number) {
  if (isNative || !getIsElectronRuntimeMac()) return;

  const desktopWindow = getDesktopHost()?.window?.getCurrentWindow?.();
  if (!desktopWindow || typeof desktopWindow.setBadgeCount !== "function") {
    return;
  }

  try {
    await desktopWindow.setBadgeCount(count);
  } catch (error) {
    console.warn("[useFaviconStatus] Failed to update macOS dock badge", error);
  }
}

export function useFaviconStatus() {
  useAgentDirectoryDemand(!isNative);
  const status = useSessionStore(selectFaviconStatus);
  const actionableWorkspaceCount = useActionableWorkspaceCount();
  const [colorScheme, setColorScheme] = useState<ColorScheme>(getSystemColorScheme);
  const lastDockBadgeCountRef = useRef<number | undefined>(undefined);

  // Listen for system color scheme changes
  useEffect(() => {
    if (isNative || typeof window === "undefined") return;

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e: MediaQueryListEvent) => {
      setColorScheme(e.matches ? "dark" : "light");
    };

    mediaQuery.addEventListener("change", handler);
    return () => mediaQuery.removeEventListener("change", handler);
  }, []);

  useEffect(() => {
    if (isNative) return;

    updateFavicon(status, colorScheme);

    const dockBadgeCount = actionableWorkspaceCount > 0 ? actionableWorkspaceCount : undefined;
    if (dockBadgeCount !== lastDockBadgeCountRef.current) {
      lastDockBadgeCountRef.current = dockBadgeCount;
      void updateMacDockBadge(dockBadgeCount);
    }
  }, [actionableWorkspaceCount, colorScheme, status]);
}
