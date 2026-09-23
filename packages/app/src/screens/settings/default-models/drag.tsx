import type { ReactNode } from "react";
import type {
  LoadoutDragProviderProps,
  LoadoutDragSourceProps,
  LoadoutDropTargetProps,
} from "./drag-types";

// Native has no drag: slots and models are managed by tap.
export function LoadoutDragProvider({ children }: LoadoutDragProviderProps): ReactNode {
  return children;
}

export function LoadoutDragSource({ children }: LoadoutDragSourceProps): ReactNode {
  return children;
}

export function LoadoutDropTarget({ children }: LoadoutDropTargetProps): ReactNode {
  return children(false);
}
