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
import type { RepeticionesDeFlujo } from '@/lib/repeticiones-de-flujo';

interface SortableWorkflowListProps {
  workflows: Workflow[];
  userId: string;
  triggers?: IntentTrigger[];
  repeticiones?: Record<string, RepeticionesDeFlujo>;
  /**
   * Por qué no se puede arrastrar ahora (una búsqueda o un filtro puestos), o
   * `null`. El orden se guarda con la posición de cada flujo: reordenar una
   * lista a la que le faltan filas movería de sitio a las escondidas.
   */
  motivoSinOrdenar?: string | null;
}

interface SortableItemProps {
  workflow: Workflow;
  userId: string;
  trigger?: IntentTrigger | null;
  repeticiones?: RepeticionesDeFlujo;
  motivoSinOrdenar?: string | null;
}

const SortableWorkflowItem = ({ workflow, userId, trigger, repeticiones, motivoSinOrdenar }: SortableItemProps) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: workflow.id, disabled: !!motivoSinOrdenar });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      data-fila-de-flujo={workflow.id}
      className="flex items-center gap-1.5"
    >
      <div
        data-asa-de-flujo
        title={motivoSinOrdenar ?? 'Arrastrar para reordenar'}
        className={motivoSinOrdenar
          ? 'cursor-not-allowed rounded-md p-1.5 text-muted-foreground/40'
          : 'cursor-grab rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted'}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" />
      </div>
      <div className="flex-1">
        <WorkflowCard workflow={workflow} userId={userId} trigger={trigger} repeticiones={repeticiones} />
      </div>
    </div>
  );
};

export const SortableWorkflowList = ({ workflows, userId, triggers = [], repeticiones = {}, motivoSinOrdenar = null }: SortableWorkflowListProps) => {
  const [items, setItems] = useState<Workflow[]>(workflows);
  const sensors = useSensors(useSensor(PointerSensor));

  useEffect(() => {
    setItems(workflows);
  }, [workflows]);

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id || motivoSinOrdenar) {
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
              repeticiones={repeticiones[workflow.id]}
              motivoSinOrdenar={motivoSinOrdenar}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
};
