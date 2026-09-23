import type { ReactNode } from "react";

export interface LoadoutDragProviderProps {
  /** Called when a source with `sourceId` is released over slot `targetIndex`. */
  onDrop: (sourceId: string, targetIndex: number) => void;
  renderOverlay: (sourceId: string) => ReactNode;
  children: ReactNode;
}

export interface LoadoutDragSourceProps {
  id: string;
  disabled?: boolean;
  children: ReactNode;
}

export interface LoadoutDropTargetProps {
  index: number;
  children: (isOver: boolean) => ReactNode;
}
