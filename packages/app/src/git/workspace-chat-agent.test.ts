import { describe, expect, it } from "vitest";
import type { WorkspaceLayout } from "@/stores/workspace-layout-store";
import type { WorkspaceTab } from "@/workspace-tabs/model";
import { selectWorkspaceChatTab } from "@/git/workspace-chat-agent";

function agentTab(agentId: string, createdAt: number): WorkspaceTab {
  return { tabId: `agent_${agentId}`, target: { kind: "agent", agentId }, createdAt };
}

function draftTab(draftId: string, createdAt: number): WorkspaceTab {
  return { tabId: `draft_${draftId}`, target: { kind: "draft", draftId }, createdAt };
}

function layout(tabs: WorkspaceTab[], focusedTabId: string | null): WorkspaceLayout {
  const pane = { id: "main", tabIds: tabs.map((tab) => tab.tabId), focusedTabId, tabs };
  return { root: { kind: "pane", pane }, focusedPaneId: "main" } as WorkspaceLayout;
}

const focused = { preferFocused: true };

describe("selectWorkspaceChatTab", () => {
  it("prefers the focused agent tab", () => {
    const tabs = [agentTab("a", 1), agentTab("b", 2)];
    expect(selectWorkspaceChatTab(layout(tabs, "agent_a"), focused)?.tabId).toBe("agent_a");
  });

  it("prefers the focused draft tab over existing chats", () => {
    const tabs = [agentTab("a", 1), draftTab("d", 2)];
    expect(selectWorkspaceChatTab(layout(tabs, "draft_d"), focused)?.tabId).toBe("draft_d");
  });

  it("falls back to the newest agent tab when the focused tab is not a chat", () => {
    const files: WorkspaceTab = { tabId: "files", target: { kind: "files" }, createdAt: 9 };
    const tabs = [agentTab("a", 1), agentTab("b", 2), draftTab("d", 3), files];
    expect(selectWorkspaceChatTab(layout(tabs, "files"), focused)?.tabId).toBe("agent_b");
  });

  it("ignores focus when not preferring it", () => {
    const tabs = [agentTab("a", 1), agentTab("b", 2), draftTab("d", 3)];
    expect(selectWorkspaceChatTab(layout(tabs, "draft_d"), { preferFocused: false })?.tabId).toBe(
      "agent_b",
    );
  });

  it("uses a draft when the workspace has no chats", () => {
    const files: WorkspaceTab = { tabId: "files", target: { kind: "files" }, createdAt: 9 };
    const tabs = [draftTab("d", 1), files];
    expect(selectWorkspaceChatTab(layout(tabs, "files"), focused)?.tabId).toBe("draft_d");
  });

  it("returns null without chats", () => {
    expect(selectWorkspaceChatTab(layout([], null), focused)).toBeNull();
    expect(selectWorkspaceChatTab(undefined, focused)).toBeNull();
  });
});
