import { Fragment, type ReactElement } from "react";
import type { DraggableListDragHandleProps } from "@/components/draggable-list.types";

export interface LoadoutSortableProps<T> {
  items: T[];
  keyExtractor: (item: T) => string;
  renderItem: (item: T, dragHandle: DraggableListDragHandleProps | null) => ReactElement;
  onReorder: (items: T[]) => void;
}

/** Native lists the rows as they are; the loadout is reordered in settings there. */
export function LoadoutSortable<T>({
  items,
  keyExtractor,
  renderItem,
}: LoadoutSortableProps<T>): ReactElement {
  return (
    <>
      {items.map((item) => (
        <Fragment key={keyExtractor(item)}>{renderItem(item, null)}</Fragment>
      ))}
    </>
  );
}
