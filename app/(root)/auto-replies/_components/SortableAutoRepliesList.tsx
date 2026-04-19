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
import { QuickReply, Workflow } from '@prisma/client';
import { GripVertical } from 'lucide-react';
import { updateRROrder } from '@/actions/rr-actions';
import { AutoRepliesCard } from './AutoRepliesCard';

interface SortableAutoRepliesListProps {
  autoReplies: QuickReply[];
  workflows: Workflow[];
}

interface SortableItemProps {
  autoReplie: QuickReply;
  workflows: Workflow[];
}

const SortableAutoRepliesItem = ({ autoReplie, workflows }: SortableItemProps) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: autoReplie.id });

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
      className="flex items-start gap-2"
    >
      <div
        className="cursor-grab rounded p-2 text-muted-foreground hover:bg-slate-100"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="w-5 h-5" />
      </div>
      <div className="min-w-0 flex-1">
        <AutoRepliesCard autoReplie={autoReplie} workflows={workflows} />
      </div>
    </div>
  );
};

export const SortableAutoRepliesList = ({ autoReplies, workflows }: SortableAutoRepliesListProps) => {
  const [items, setItems] = useState<QuickReply[]>(autoReplies);
  const sensors = useSensors(useSensor(PointerSensor));

  useEffect(() => {
    setItems(autoReplies);
  }, [autoReplies]);

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
        newOrder.map((autoReplie, index) =>
          updateRROrder(autoReplie.id, index)
        )
      );
      toast.success('Orden actualizado', { id: toastId });
    } catch (error) {
      console.error('Error actualizando orden de respuestas rápidas:', error);
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
        items={items.map((autoReplie) => autoReplie.id)}
        strategy={verticalListSortingStrategy}
      >
        <div className="grid grid-cols-1 gap-4">
          {items.map((autoReplie) => (
            <SortableAutoRepliesItem
              key={autoReplie.id}
              autoReplie={autoReplie}
              workflows={workflows}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
};
