import { useCallback, type ReactElement } from "react";
import { DraggableList } from "@/components/draggable-list";
import type { DraggableRenderItemInfo } from "@/components/draggable-list.types";
import type { LoadoutSortableProps } from "./loadout-sortable";

/** Drag by the row's handle only, so a press on the rest of the row still applies it. */
export function LoadoutSortable<T>({
  items,
  keyExtractor,
  renderItem,
  onReorder,
}: LoadoutSortableProps<T>): ReactElement {
  const renderDraggable = useCallback(
    ({ item, dragHandleProps }: DraggableRenderItemInfo<T>) =>
      renderItem(item, dragHandleProps ?? null),
    [renderItem],
  );
  return (
    <DraggableList
      data={items}
      keyExtractor={keyExtractor}
      renderItem={renderDraggable}
      onDragEnd={onReorder}
      scrollEnabled={false}
      useDragHandle
    />
  );
}
