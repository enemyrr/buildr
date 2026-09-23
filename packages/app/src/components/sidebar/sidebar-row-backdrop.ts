import type { SidebarSurfaceBackdrop } from "@/styles/surface-backdrop";

/**
 * Which surface a sidebar row is currently painting, so anything knocking out of it — the status
 * badge on a project icon — can match.
 *
 * This restates the precedence of the row style arrays, which live in two separate renderers
 * (`sidebar-workspace-list`, `sidebar-status-list`). One copy of the rule here rather than two
 * ternaries beside two stylesheets: drifting from them is how the badge ends up with a halo, and a
 * halo in one grouping mode but not the other is worse than either.
 *
 */
export function getSidebarRowBackdrop({
  isDragging = false,
  isPressed = false,
  selected = false,
  isHovered = false,
}: {
  isDragging?: boolean;
  isPressed?: boolean;
  selected?: boolean;
  isHovered?: boolean;
}): SidebarSurfaceBackdrop {
  if (isDragging || isPressed) return "surface2";
  if (selected) return "surfaceSidebarSelected";
  if (isHovered) return "surfaceSidebarHover";
  return "surfaceSidebar";
}
