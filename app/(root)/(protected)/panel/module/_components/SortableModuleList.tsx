'use client'

import { useRouter } from 'next/navigation'
import {
    DndContext,
    closestCenter,
    useSensor,
    useSensors,
    PointerSensor,
    DragEndEvent,
} from '@dnd-kit/core'
import {
    arrayMove,
    SortableContext,
    useSortable,
    verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { useEffect, useState } from 'react'
import { updateModuleOrder } from '@/actions/module-actions'
import { ModuleWithItems } from '@/schema/module'
import { toast } from 'sonner'
import { ModuleCard } from './ModuleCard'
import { ModuleCardSkeleton } from './ModuleCardSkeleton'

interface SortableListProps {
    modules: ModuleWithItems[]
    setOpenModule: (state: boolean, module: ModuleWithItems) => void
}

export function SortableModuleList({ modules, setOpenModule }: SortableListProps) {
    const router = useRouter();

    const [items, setItems] = useState(modules)

    useEffect(() => {
        setItems(modules)
    }, [modules])

    const sensors = useSensors(useSensor(PointerSensor))

    const handleDragEnd = async (event: DragEndEvent) => {

        const { active, over } = event
        if (!over || active.id === over.id) return

        const oldIndex = items.findIndex((i) => i.id === active.id)
        const newIndex = items.findIndex((i) => i.id === over.id)
        const newOrder = arrayMove(items, oldIndex, newIndex)

        setItems(newOrder)

        const toastId = toast.loading("Actualizando orden...")

        try {
            await Promise.all(
                newOrder.map((mod, index) =>
                    updateModuleOrder(mod.id, index)
                )
            )
            toast.success("Orden actualizado correctamente", { id: toastId })
        } catch (err) {
            console.error('Error al actualizar orden:', err)
            toast.error("Error al guardar el orden", { id: toastId })
        }

        router.refresh()
    }

    if (!items || items.length === 0) {
        return <ModuleCardSkeleton />
    }

    return (
        <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
        >
            <SortableContext items={items.map(i => i.id)} strategy={verticalListSortingStrategy}>
                {items.map((moduleComponent) => (
                    <ModuleCard
                        key={moduleComponent.id}
                        module={moduleComponent}
                        setOpenModule={setOpenModule}
                    />
                ))}
            </SortableContext>
        </DndContext>
    )
}