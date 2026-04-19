'use client';

import { useEffect, useState } from 'react';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { toast } from 'sonner';
import { Workflow } from '@prisma/client';
import { GripVertical } from 'lucide-react';
import { updateWorkflowOrder } from '@/actions/workflow-actions';
import { WorkflowCard } from './WorkflowCard';

interface SortableWorkflowListProps {
  workflows: Workflow[];
  userId: string;
}

interface SortableItemProps {
  workflow: Workflow;
  userId: string;
}

const SortableWorkflowItem = ({ workflow, userId }: SortableItemProps) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: workflow.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    cursor: 'grab',
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2"
    >
      <div
        className="cursor-grab p-2 text-muted-foreground hover:bg-slate-100 rounded"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="w-5 h-5" />
      </div>
      <div className="flex-1">
        <WorkflowCard workflow={workflow} userId={userId} />
      </div>
    </div>
  );
};

export const SortableWorkflowList = ({ workflows, userId }: SortableWorkflowListProps) => {
  const [items, setItems] = useState<Workflow[]>(workflows);
  const sensors = useSensors(useSensor(PointerSensor));

  useEffect(() => {
    setItems(workflows);
  }, [workflows]);

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) {
      return;
    }

    const oldIndex = items.findIndex((item) => item.id === active.id);
    const newIndex = items.findIndex((item) => item.id === over.id);

    if (oldIndex < 0 || newIndex < 0) {
      return;
    }

    const newOrder = arrayMove(items, oldIndex, newIndex);
    setItems(newOrder);

    const toastId = toast.loading('Guardando nuevo orden...');

    try {
      await Promise.all(
        newOrder.map((workflow, index) =>
          updateWorkflowOrder(workflow.id, index)
        )
      );
      toast.success('Orden actualizado', { id: toastId });
    } catch (error) {
      console.error('Error actualizando orden de workflows:', error);
      toast.error('Error guardando orden', { id: toastId });
    }
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext
        items={items.map((workflow) => workflow.id)}
        strategy={verticalListSortingStrategy}
      >
        <div className="grid grid-cols-1 gap-2">
          {items.map((workflow) => (
            <SortableWorkflowItem
              key={workflow.id}
              workflow={workflow}
              userId={userId}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
};
