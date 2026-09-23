import { router, type Href } from "expo-router";
import { navigateToLastWorkspace } from "@/stores/navigation-active-workspace-store";
import {
  buildOpenProjectRoute,
  buildProjectSettingsRoute,
  buildSettingsHostSectionRoute,
  buildSettingsRoute,
  type HostSectionSlug,
  type ProjectSettingsSectionSlug,
  type SettingsSectionSlug,
} from "@/utils/host-routes";

export type SettingsView =
  | { kind: "plugin"; serverId: string; pluginId: string; screenId: string }
  | { kind: "root" }
  | { kind: "section"; section: SettingsSectionSlug }
  | { kind: "host"; serverId: string; section: HostSectionSlug }
  | {
      kind: "project";
      serverId: string;
      projectId: string;
      section: ProjectSettingsSectionSlug;
    };

export function openHostOverview(serverId: string): void {
  router.push(buildSettingsHostSectionRoute(serverId, "host"));
}

export function openDefaultModelsSettings(serverId: string): void {
  router.push(buildSettingsHostSectionRoute(serverId, "models"));
}

export function openProjectSettings(
  serverId: string,
  projectId: string,
  section?: ProjectSettingsSectionSlug,
): void {
  router.push(buildProjectSettingsRoute(serverId, projectId, section));
}

export function returnFromSettings(view: SettingsView): void {
  if (view.kind === "root") {
    if (!navigateToLastWorkspace()) {
      router.replace(buildOpenProjectRoute());
    }
    return;
  }

  let parent: Href = buildSettingsRoute();
  if (view.kind === "plugin") parent = buildSettingsHostSectionRoute(view.serverId, "plugins");
  router.dismissTo(parent as Href);
}
