import { useMemo, type ReactElement } from "react";
import { Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { GitBranch, ScrollText, SlidersHorizontal, Sparkles } from "lucide-react-native";
import { SettingsTabs } from "@/components/settings/settings-tabs";
import { useProjects } from "@/hooks/use-projects";
import { useHostFeature } from "@/runtime/host-features";
import ProjectSettingsScreen from "@/screens/project-settings-screen";
import { settingsStyles } from "@/styles/settings";
import type { ProjectSettingsSectionSlug } from "@/utils/host-routes";
import { getProjectHostEntry, getProjectSummaryForHostProject } from "@/utils/projects";

interface ProjectSettingsPageProps {
  serverId: string;
  projectId: string;
  section: ProjectSettingsSectionSlug;
  onSelectSection: (section: ProjectSettingsSectionSlug) => void;
  showTitle: boolean;
}

export function ProjectSettingsPage({
  serverId,
  projectId,
  section,
  onSelectSection,
  showTitle,
}: ProjectSettingsPageProps): ReactElement {
  const { t } = useTranslation();
  const { projects } = useProjects();
  const supportsGitSettings = useHostFeature(serverId, "projectGitSettings");
  const project = getProjectSummaryForHostProject(projects, serverId, projectId);
  const projectName = getProjectHostEntry(project, serverId, projectId)?.projectName;
  const tabs = useMemo(
    () => [
      { value: "scripts" as const, label: t("settings.project.scripts.title"), icon: ScrollText },
      ...(supportsGitSettings
        ? [{ value: "git" as const, label: t("settings.project.git.title"), icon: GitBranch }]
        : []),
      { value: "metadata" as const, label: t("settings.hostSections.metadata"), icon: Sparkles },
      { value: "general" as const, label: t("settings.sections.general"), icon: SlidersHorizontal },
    ],
    [supportsGitSettings, t],
  );

  return (
    <View>
      {showTitle && projectName ? (
        <Text style={settingsStyles.pageTitle} testID="settings-detail-header-title">
          {projectName}
        </Text>
      ) : null}
      <SettingsTabs
        tabs={tabs}
        value={section}
        onChange={onSelectSection}
        testID="settings-project-tabs"
      />
      <ProjectSettingsScreen serverId={serverId} projectId={projectId} section={section} />
    </View>
  );
}
