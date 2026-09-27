import type { MouseEvent } from "react-native";
import { isWeb } from "@/constants/platform";

/**
 * Focuses the hovered row on web. A list that fills its focused row for the keyboard would
 * otherwise fill the hovered row too; moving focus with the pointer keeps one filled row, as
 * native menus do. Pass it to the row Pressable's `onHoverIn`.
 */
export function focusOnHover(event: MouseEvent): void {
  if (!isWeb) return;
  const node: unknown = event.currentTarget;
  if (node instanceof HTMLElement) node.focus({ preventScroll: true });
}
