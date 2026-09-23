import { memo, type ReactElement } from "react";
import { AgentTaskList } from "@/composer/task-list";
import { ComposerTrackBar } from "@/composer/tracks";
import { useIsCompactFormFactor } from "@/constants/layout";
import { PluginComposerPills } from "@/plugins";
import type { TodoEntry } from "@/types/stream";

/**
 * The pane's ambient context — tasks and plugin pills — as a row of pills above the composer.
 * Subagents open as workspace tabs, so they have no pill here.
 *
 * The row shares the composer's keyboard transform and owns the space between itself and the
 * transcript.
 */
export const AgentTracks = memo(function AgentTracks({
  serverId,
  workspaceId,
  agentId,
  tasks,
  hasPluginComposerPills,
}: {
  serverId: string;
  workspaceId: string;
  agentId: string;
  tasks: TodoEntry[] | undefined;
  hasPluginComposerPills: boolean;
}): ReactElement | null {
  const isCompact = useIsCompactFormFactor();
  if (!hasAgentTracks({ tasks, hasPluginComposerPills })) {
    return null;
  }

  return (
    <ComposerTrackBar>
      <AgentTaskList tasks={tasks} />
      <PluginComposerPills
        serverId={serverId}
        workspaceId={workspaceId}
        agentId={agentId}
        compact={isCompact}
      />
    </ComposerTrackBar>
  );
});

export function hasAgentTracks({
  tasks,
  hasPluginComposerPills = false,
}: {
  tasks: readonly TodoEntry[] | undefined;
  hasPluginComposerPills?: boolean;
}): boolean {
  return Boolean(tasks?.length) || hasPluginComposerPills;
}
