'use client'

import { useState, useEffect } from 'react'
import {
    DndContext,
    closestCenter,
    PointerSensor,
    useSensor,
    useSensors,
    type DragEndEvent,
} from '@dnd-kit/core'
import {
    SortableContext,
    arrayMove,
    verticalListSortingStrategy,
    useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical } from 'lucide-react'
import { toast } from 'sonner'
import type { Reminders, Workflow } from '@prisma/client'
import { ReminderList } from './'
import { updateReminderOrder } from '@/actions/reminders-actions'

function SortableReminderItem({ reminder, workflow }: { reminder: Reminders; workflow: Workflow | undefined }) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: reminder.id })

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
    }

    return (
        <div ref={setNodeRef} style={style} className="flex items-center gap-2">
            <div
                className="cursor-grab p-1.5 text-muted-foreground hover:bg-muted rounded shrink-0"
                {...attributes}
                {...listeners}
            >
                <GripVertical className="h-4 w-4" />
            </div>
            <div className="flex-1">
                <ReminderList reminder={reminder} workflow={workflow} />
            </div>
        </div>
    )
}

export function SortableReminderList({
    reminders,
    workflows,
}: {
    reminders: Reminders[]
    workflows: Workflow[]
}) {
    const [items, setItems] = useState<Reminders[]>(reminders)
    const sensors = useSensors(useSensor(PointerSensor))

    useEffect(() => {
        setItems(reminders)
    }, [reminders])

    const handleDragEnd = async (event: DragEndEvent) => {
        const { active, over } = event
        if (!over || active.id === over.id) return

        const oldIndex = items.findIndex((r) => r.id === active.id)
        const newIndex = items.findIndex((r) => r.id === over.id)
        if (oldIndex < 0 || newIndex < 0) return

        const reordered = arrayMove(items, oldIndex, newIndex)
        setItems(reordered)

        const toastId = toast.loading('Guardando orden...')
        try {
            await Promise.all(reordered.map((r, i) => updateReminderOrder(r.id, i)))
            toast.success('Orden guardado', { id: toastId })
        } catch {
            toast.error('Error al guardar el orden', { id: toastId })
        }
    }

    if (items.length === 0) {
        return (
            <p className="text-sm text-muted-foreground text-center mt-8">
                No se encontraron recordatorios.
            </p>
        )
    }

    return (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={items.map((r) => r.id)} strategy={verticalListSortingStrategy}>
                <div className="flex flex-col gap-2">
                    {items.map((reminder) => (
                        <SortableReminderItem
                            key={reminder.id}
                            reminder={reminder}
                            workflow={workflows.find((w) => w.id === reminder.workflowId)}
                        />
                    ))}
                </div>
            </SortableContext>
        </DndContext>
    )
}
