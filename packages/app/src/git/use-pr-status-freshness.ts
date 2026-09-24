import { useEffect } from "react";
import { AppState } from "react-native";
import type { DaemonClient } from "@getpaseo/client/internal/daemon-client";
import { isWeb } from "@/constants/platform";
import { useHostFeature } from "@/runtime/host-features";
import { useHostRuntimeClient, useHostRuntimeIsConnected } from "@/runtime/host-runtime";

const REFRESH_THROTTLE_MS = 15_000;
const lastRefreshAt = new Map<string, number>();

function refreshCheckout(
  client: DaemonClient,
  { serverId, cwd }: { serverId: string; cwd: string },
) {
  const key = `${serverId}::${cwd}`;
  const now = Date.now();
  if (now - (lastRefreshAt.get(key) ?? 0) < REFRESH_THROTTLE_MS) return;
  lastRefreshAt.set(key, now);
  // Fire and forget: the snapshot arrives through the checkout status push, and a failed
  // refresh leaves the daemon's own poll in charge.
  client.checkoutRefresh(cwd).catch(() => undefined);
}

/**
 * Forge state (merged on github.com, auto-merge, `gh` in a terminal) otherwise only arrives with
 * the daemon's idle poll. Asks the daemon for a forge-inclusive snapshot on mount, reconnect, and
 * whenever the app comes back to the foreground, throttled per checkout.
 */
export function usePrStatusFreshness({ serverId, cwd }: { serverId: string; cwd: string }): void {
  const client = useHostRuntimeClient(serverId);
  const isConnected = useHostRuntimeIsConnected(serverId);
  const supportsRefresh = useHostFeature(serverId, "checkoutRefresh");

  useEffect(() => {
    if (!client || !isConnected || !supportsRefresh || !cwd) return;
    const refresh = () => refreshCheckout(client, { serverId, cwd });
    refresh();

    if (isWeb) {
      const refreshWhenVisible = () => {
        if (document.visibilityState === "visible") refresh();
      };
      window.addEventListener("focus", refresh);
      document.addEventListener("visibilitychange", refreshWhenVisible);
      return () => {
        window.removeEventListener("focus", refresh);
        document.removeEventListener("visibilitychange", refreshWhenVisible);
      };
    }

    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") refresh();
    });
    return () => subscription.remove();
  }, [client, isConnected, supportsRefresh, serverId, cwd]);
}
