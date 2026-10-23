import { useTranslation } from "react-i18next";
import { useShallow } from "zustand/shallow";
import { useProviderIcon } from "@/components/provider-icons";
import type { PanelDescriptor } from "@/panels/panel-registry";
import { useSessionStore, selectAgentTurnPresentation, type Agent } from "@/stores/session-store";
import { deriveSidebarStateBucket } from "@/utils/sidebar-agent-state";

function formatProviderLabel(provider: Agent["provider"]): string {
  if (!provider) {
    return "Agent";
  }
  return provider
    .split(/[-_\s]+/)
    .filter((part) => part.length > 0)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function resolveAgentLabel(title: string | null | undefined): string | null {
  if (typeof title !== "string") {
    return null;
  }
  const normalized = title.trim();
  if (!normalized) {
    return null;
  }
  if (normalized.toLowerCase() === "new agent") {
    return null;
  }
  return normalized;
}

export function useAgentDescriptor(
  target: { kind: "agent"; agentId: string },
  context: { serverId: string },
): PanelDescriptor {
  const descriptorState = useSessionStore(
    useShallow((state) => {
      const session = state.sessions[context.serverId];
      const agent =
        session?.agents?.get(target.agentId) ?? session?.agentDetails?.get(target.agentId) ?? null;
      return {
        isLoaded: agent !== null,
        provider: agent?.provider ?? "codex",
        title: agent?.title ?? null,
        status: agent?.status ?? null,
        pendingPermissionCount: agent?.pendingPermissions.length ?? 0,
        requiresAttention: agent?.requiresAttention ?? false,
        attentionReason: agent?.attentionReason ?? null,
        isTurnActive: selectAgentTurnPresentation(session, target.agentId).isActive,
      };
    }),
  );
  const { t } = useTranslation();
  const { isLoaded, ...agentState } = descriptorState;
  const icon = useProviderIcon(agentState.provider, context.serverId);
  // Only a missing agent record counts as loading; an untitled agent matches its draft tab.
  const untitledLabel = isLoaded ? t("panels.draft.untitled") : null;
  return buildAgentDescriptor({ ...agentState, icon, untitledLabel });
}

export function buildAgentDescriptor(input: {
  provider: Agent["provider"];
  title: string | null;
  status: Agent["status"] | null;
  pendingPermissionCount: number;
  requiresAttention: boolean;
  attentionReason: Agent["attentionReason"];
  isTurnActive: boolean;
  icon: PanelDescriptor["icon"];
  /** Label for a loaded agent without a title. Without it, an untitled agent stays loading. */
  untitledLabel?: string | null;
}): PanelDescriptor {
  const provider = input.provider;
  const label = resolveAgentLabel(input.title) ?? input.untitledLabel ?? null;

  return {
    label: label ?? "",
    subtitle: `${formatProviderLabel(provider)} agent`,
    tooltip: label ?? `${formatProviderLabel(provider)} agent`,
    titleState: label ? "ready" : "loading",
    icon: input.icon,
    statusBucket: input.status
      ? deriveSidebarStateBucket({
          status: input.isTurnActive ? "running" : input.status,
          pendingPermissionCount: input.pendingPermissionCount,
          requiresAttention: input.requiresAttention,
          attentionReason: input.attentionReason,
        })
      : null,
  };
}
