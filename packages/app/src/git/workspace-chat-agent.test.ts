import { describe, expect, it } from "vitest";
import type { WorkspaceLayout } from "@/stores/workspace-layout-store";
import type { WorkspaceTab } from "@/workspace-tabs/model";
import { selectWorkspaceChatAgentId } from "@/git/workspace-chat-agent";

function agentTab(agentId: string, createdAt: number): WorkspaceTab {
  return { tabId: `agent_${agentId}`, target: { kind: "agent", agentId }, createdAt };
}

function layout(tabs: WorkspaceTab[], focusedTabId: string | null): WorkspaceLayout {
  const pane = { id: "main", tabIds: tabs.map((tab) => tab.tabId), focusedTabId, tabs };
  return { root: { kind: "pane", pane }, focusedPaneId: "main" } as WorkspaceLayout;
}

describe("selectWorkspaceChatAgentId", () => {
  it("prefers the focused agent tab", () => {
    const tabs = [agentTab("a", 1), agentTab("b", 2)];
    expect(selectWorkspaceChatAgentId(layout(tabs, "agent_a"))).toBe("a");
  });

  it("falls back to the newest agent tab", () => {
    const files: WorkspaceTab = { tabId: "files", target: { kind: "files" }, createdAt: 9 };
    const tabs = [agentTab("a", 1), agentTab("b", 2), files];
    expect(selectWorkspaceChatAgentId(layout(tabs, "files"))).toBe("b");
  });

  it("returns null without agents", () => {
    expect(selectWorkspaceChatAgentId(layout([], null))).toBeNull();
    expect(selectWorkspaceChatAgentId(undefined)).toBeNull();
  });
});
