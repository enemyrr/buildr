import { useCallback, useState, type CSSProperties, type ReactElement } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import type {
  LoadoutDragProviderProps,
  LoadoutDragSourceProps,
  LoadoutDropTargetProps,
} from "./drag-types";

const ACTIVATION_DISTANCE = 6;
// dnd-kit treats a falsy id as "no target", so slot 0 can't be id 0.
const TARGET_ID_OFFSET = 1;
const SOURCE_STYLE: CSSProperties = { userSelect: "none" };
const DRAGGING_SOURCE_STYLE: CSSProperties = { userSelect: "none", opacity: 0.4 };

export function LoadoutDragProvider({
  onDrop,
  renderOverlay,
  children,
}: LoadoutDragProviderProps): ReactElement {
  const [activeId, setActiveId] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: ACTIVATION_DISTANCE } }),
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(String(event.active.id));
  }, []);
  const handleDragCancel = useCallback(() => setActiveId(null), []);
  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveId(null);
      const target = event.over?.id;
      if (typeof target === "number") onDrop(String(event.active.id), target - TARGET_ID_OFFSET);
    },
    [onDrop],
  );

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragStart={handleDragStart}
      onDragCancel={handleDragCancel}
      onDragEnd={handleDragEnd}
    >
      {children}
      <DragOverlay dropAnimation={null}>{activeId ? renderOverlay(activeId) : null}</DragOverlay>
    </DndContext>
  );
}

export function LoadoutDragSource({
  id,
  disabled = false,
  children,
}: LoadoutDragSourceProps): ReactElement {
  const { setNodeRef, listeners, isDragging } = useDraggable({ id, disabled });
  return (
    <div ref={setNodeRef} {...listeners} style={isDragging ? DRAGGING_SOURCE_STYLE : SOURCE_STYLE}>
      {children}
    </div>
  );
}

export function LoadoutDropTarget({ index, children }: LoadoutDropTargetProps): ReactElement {
  const { setNodeRef, isOver } = useDroppable({ id: index + TARGET_ID_OFFSET });
  return <div ref={setNodeRef}>{children(isOver)}</div>;
}
