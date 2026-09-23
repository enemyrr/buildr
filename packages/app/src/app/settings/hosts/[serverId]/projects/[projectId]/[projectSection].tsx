import { useLocalSearchParams } from "expo-router";
import { useMemo } from "react";
import { HostRouteBootstrapBoundary } from "@/components/host-route-bootstrap-boundary";
import SettingsScreen from "@/screens/settings-screen";
import {
  DEFAULT_PROJECT_SETTINGS_SECTION,
  isProjectSettingsSectionSlug,
  normalizeProjectSettingsRouteId,
} from "@/utils/host-routes";

export default function SettingsHostProjectSectionRoute() {
  const params = useLocalSearchParams<{
    serverId?: string | string[];
    projectId?: string | string[];
    projectSection?: string | string[];
  }>();
  const serverId = normalizeProjectSettingsRouteId(params.serverId);
  const projectId = normalizeProjectSettingsRouteId(params.projectId);
  const rawSection = normalizeProjectSettingsRouteId(params.projectSection);
  const section = isProjectSettingsSectionSlug(rawSection)
    ? rawSection
    : DEFAULT_PROJECT_SETTINGS_SECTION;
  const view = useMemo(
    () => ({ kind: "project" as const, serverId, projectId, section }),
    [projectId, section, serverId],
  );

  return (
    <HostRouteBootstrapBoundary>
      <SettingsScreen view={view} />
    </HostRouteBootstrapBoundary>
  );
}
