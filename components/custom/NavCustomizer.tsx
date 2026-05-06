'use client'

import { useEffect, useState } from 'react'
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
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, Settings2 } from 'lucide-react'
import { toast } from 'sonner'

import { useModuleStore } from '@/stores/modules/useModuleStore'
import { saveUserNavPreferences } from '@/actions/user-nav-preference-actions'
import type { UserNavPref } from '@/types/nav-preference'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
    SheetTrigger,
} from '@/components/ui/sheet'

interface NavPrefRow {
    moduleId: string
    label: string
    displayLabel: string
    isHidden: boolean
    sortOrder: number
}

function SortableRow({
    row,
    onChange,
}: {
    row: NavPrefRow
    onChange: (updated: Partial<NavPrefRow>) => void
}) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
        useSortable({ id: row.moduleId })

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
    }

    return (
        <div
            ref={setNodeRef}
            style={style}
            className="flex items-center gap-2 rounded-md border border-border bg-background px-2 py-2"
        >
            <button
                type="button"
                {...attributes}
                {...listeners}
                className="cursor-grab text-muted-foreground hover:text-foreground"
            >
                <GripVertical className="h-4 w-4" />
            </button>

            <Input
                className="h-7 flex-1 text-xs"
                value={row.displayLabel}
                onChange={(e) => onChange({ displayLabel: e.target.value })}
                placeholder={row.label}
            />

            <Switch
                checked={!row.isHidden}
                onCheckedChange={(val) => onChange({ isHidden: !val })}
            />
        </div>
    )
}

export function NavCustomizer({ userId }: { userId: string }) {
    const { modules, navPrefs, setNavPrefs } = useModuleStore()
    const [open, setOpen] = useState(false)
    const [rows, setRows] = useState<NavPrefRow[]>([])
    const [saving, setSaving] = useState(false)

    const sensors = useSensors(useSensor(PointerSensor))

    useEffect(() => {
        if (!open) return
        const sidebarModules = modules.filter(m => m.showInSidebar)
        const built: NavPrefRow[] = sidebarModules.map((mod, idx) => {
            const pref = navPrefs.find(p => p.moduleId === mod.id)
            return {
                moduleId: mod.id,
                label: mod.label,
                displayLabel: pref?.displayLabel ?? mod.label,
                isHidden: pref?.isHidden ?? false,
                sortOrder: pref?.sortOrder ?? mod.order ?? idx,
            }
        }).sort((a, b) => a.sortOrder - b.sortOrder)
        setRows(built)
    }, [open, modules, navPrefs])

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event
        if (!over || active.id === over.id) return
        const oldIndex = rows.findIndex(r => r.moduleId === active.id)
        const newIndex = rows.findIndex(r => r.moduleId === over.id)
        setRows(prev => arrayMove(prev, oldIndex, newIndex))
    }

    const handleChange = (moduleId: string, updated: Partial<NavPrefRow>) => {
        setRows(prev => prev.map(r => r.moduleId === moduleId ? { ...r, ...updated } : r))
    }

    const handleSave = async () => {
        setSaving(true)
        const prefs: UserNavPref[] = rows.map((r, idx) => ({
            moduleId: r.moduleId,
            displayLabel: r.displayLabel !== r.label ? r.displayLabel : null,
            isHidden: r.isHidden,
            sortOrder: idx,
        }))

        const res = await saveUserNavPreferences(userId, prefs)
        if (res.success) {
            setNavPrefs(prefs)
            toast.success('Menú guardado')
            setOpen(false)
        } else {
            toast.error('Error al guardar')
        }
        setSaving(false)
    }

    const handleReset = () => {
        setRows(prev => prev.map((r, idx) => ({
            ...r,
            displayLabel: r.label,
            isHidden: false,
            sortOrder: idx,
        })))
    }

    return (
        <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8" title="Personalizar menú">
                    <Settings2 className="h-4 w-4" />
                </Button>
            </SheetTrigger>
            <SheetContent side="left" className="flex w-80 flex-col gap-4">
                <SheetHeader>
                    <SheetTitle>Personalizar menú</SheetTitle>
                </SheetHeader>

                <p className="text-xs text-muted-foreground">
                    Arrastra para reordenar, edita el nombre o activa/desactiva cada módulo.
                </p>

                <div className="flex-1 overflow-y-auto">
                    <DndContext
                        sensors={sensors}
                        collisionDetection={closestCenter}
                        onDragEnd={handleDragEnd}
                    >
                        <SortableContext
                            items={rows.map(r => r.moduleId)}
                            strategy={verticalListSortingStrategy}
                        >
                            <div className="flex flex-col gap-2">
                                {rows.map(row => (
                                    <SortableRow
                                        key={row.moduleId}
                                        row={row}
                                        onChange={(updated) => handleChange(row.moduleId, updated)}
                                    />
                                ))}
                            </div>
                        </SortableContext>
                    </DndContext>
                </div>

                <div className="flex gap-2 border-t pt-3">
                    <Button variant="outline" size="sm" className="flex-1" onClick={handleReset}>
                        Restablecer
                    </Button>
                    <Button variant="save" size="sm" className="flex-1" onClick={handleSave} disabled={saving}>
                        {saving ? 'Guardando...' : 'Guardar'}
                    </Button>
                </div>
            </SheetContent>
        </Sheet>
    )
}
