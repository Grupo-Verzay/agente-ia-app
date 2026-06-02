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
import { IntentTrigger } from '@prisma/client';
import { WorkflowCard } from './WorkflowCard';

interface SortableWorkflowListProps {
  workflows: Workflow[];
  userId: string;
  triggers?: IntentTrigger[];
}

interface SortableItemProps {
  workflow: Workflow;
  userId: string;
  trigger?: IntentTrigger | null;
}

const SortableWorkflowItem = ({ workflow, userId, trigger }: SortableItemProps) => {
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
      className="flex items-center gap-1.5"
    >
      <div
        className="cursor-grab rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" />
      </div>
      <div className="flex-1">
        <WorkflowCard workflow={workflow} userId={userId} trigger={trigger} />
      </div>
    </div>
  );
};

export const SortableWorkflowList = ({ workflows, userId, triggers = [] }: SortableWorkflowListProps) => {
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
              trigger={triggers.find(t => t.workflowId === workflow.id) ?? null}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
};
