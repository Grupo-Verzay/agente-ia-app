'use client';

import {
    DndContext,
    closestCenter,
    PointerSensor,
    useSensor,
    useSensors,
    DragEndEvent,
} from '@dnd-kit/core'
import {
    SortableContext,
    arrayMove,
    verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { updateNodeOrder } from '@/actions/workflow-node-action'
import { WorkflowNode, User } from '@prisma/client'
import { NodeCard } from './NodeCard'

interface SortableNodeListProps {
    nodes: WorkflowNode[]
    workflowId: string
    user: User
}

export const SortableNodeList = ({ nodes, workflowId, user }: SortableNodeListProps) => {
    const [items, setItems] = useState(nodes)
    const sensors = useSensors(useSensor(PointerSensor))

    useEffect(() => {
        setItems(nodes)
    }, [nodes])

    const handleDragEnd = async (event: DragEndEvent) => {
        const { active, over } = event
        if (!over || active.id === over.id) return

        const oldIndex = items.findIndex(i => i.id === active.id)
        const newIndex = items.findIndex(i => i.id === over.id)
        const newOrder = arrayMove(items, oldIndex, newIndex)

        setItems(newOrder)

        const toastId = toast.loading("Guardando nuevo orden...")

        try {
            await Promise.all(
                newOrder.map((node, index) =>
                    updateNodeOrder(node.id, index)
                )
            )
            toast.success("Orden actualizado", { id: toastId })
        } catch (error) {
            console.error(error)
            toast.error("Error guardando orden", { id: toastId })
        }
    }

    return (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={items.map(n => n.id)} strategy={verticalListSortingStrategy}>
                <div className="flex flex-col gap-3">
                    {items.map((node) => (
                        <NodeCard
                            key={node.id}
                            nodes={node}
                            workflowId={workflowId}
                            user={user}
                        />
                    ))}
                </div>
            </SortableContext>
        </DndContext>
    )
}
