import { useMemo } from "react";
import { useProjects, type ProjectHostError } from "@/hooks/use-projects";
import { useProjectIcons } from "@/projects/icons";
import { createProjectIconTarget } from "@/projects/icon-target";
import type { ProjectHostEntry, ProjectSummary } from "@/utils/projects";

export interface HostProject {
  project: ProjectSummary;
  host: ProjectHostEntry;
}

export interface HostProjectsResult {
  hostProjects: HostProject[];
  hostErrors: ProjectHostError[];
  isLoading: boolean;
  iconDataByProjectViewKey: Map<string, string | null>;
}

export function useHostProjects(serverId: string | null): HostProjectsResult {
  const { projects, hostErrors, isLoading } = useProjects();
  const hostProjects = useMemo<HostProject[]>(
    () =>
      serverId
        ? projects.flatMap((project) =>
            project.hosts
              .filter((host) => host.serverId === serverId)
              .map((host) => ({ project, host })),
          )
        : [],
    [projects, serverId],
  );
  const scopedErrors = useMemo(
    () => hostErrors.filter((error) => error.serverId === serverId),
    [hostErrors, serverId],
  );
  const iconTargets = useMemo(
    () =>
      hostProjects.flatMap(({ project, host }) => {
        const target = createProjectIconTarget({
          projectViewKey: project.viewKey,
          placement: { ...host, iconWorkingDir: host.repoRoot },
        });
        return target ? [target] : [];
      }),
    [hostProjects],
  );
  const iconDataByProjectViewKey = useProjectIcons({ projects: iconTargets });
  return { hostProjects, hostErrors: scopedErrors, isLoading, iconDataByProjectViewKey };
}
