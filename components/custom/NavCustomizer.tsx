'use client'

import { useEffect, useState } from 'react'
import { Settings2 } from 'lucide-react'
import { toast } from 'sonner'

import type { User } from '@prisma/client'
import { useModuleStore } from '@/stores/modules/useModuleStore'
import { getVisibleSidebarModules } from '@/lib/sidebar-modules'
import { saveUserNavPreferences } from '@/actions/user-nav-preference-actions'
import type { UserNavPref } from '@/types/nav-preference'
import { Button } from '@/components/ui/button'
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
    isHidden: boolean
    sortOrder: number
}

export function NavCustomizer({ user }: { user: User }) {
    const { modules, navPrefs, setNavPrefs } = useModuleStore()
    const [open, setOpen] = useState(false)
    const [rows, setRows] = useState<NavPrefRow[]>([])
    const [saving, setSaving] = useState(false)

    useEffect(() => {
        if (!open) return
        // Mismos módulos visibles que el sidebar. El orden es SIEMPRE el del
        // sistema (mod.order); aquí solo se puede mostrar u ocultar cada módulo.
        const sidebarModules = getVisibleSidebarModules(user, modules)
        const built: NavPrefRow[] = sidebarModules.map((mod, idx) => {
            const pref = navPrefs.find(p => p.moduleId === mod.id)
            return {
                moduleId: mod.id,
                label: mod.label,
                isHidden: pref?.isHidden ?? false,
                sortOrder: mod.order ?? idx,
            }
        }).sort((a, b) => a.sortOrder - b.sortOrder)
        setRows(built)
    }, [open, modules, navPrefs, user])

    const handleToggle = (moduleId: string, isHidden: boolean) => {
        setRows(prev => prev.map(r => r.moduleId === moduleId ? { ...r, isHidden } : r))
    }

    const handleSave = async () => {
        setSaving(true)
        // Se persiste SOLO la visibilidad; el orden y el nombre son del sistema.
        const prefs: UserNavPref[] = rows.map(r => ({
            moduleId: r.moduleId,
            displayLabel: null,
            isHidden: r.isHidden,
            sortOrder: r.sortOrder,
        }))

        const res = await saveUserNavPreferences(user.id, prefs)
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
        setRows(prev => prev.map(r => ({ ...r, isHidden: false })))
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
                    Activa o desactiva los módulos que quieres ver en el menú. El orden es fijo del sistema.
                </p>

                <div className="flex-1 overflow-y-auto">
                    <div className="flex flex-col gap-2">
                        {rows.map(row => (
                            <div
                                key={row.moduleId}
                                className="flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2"
                            >
                                <span className="flex-1 truncate text-sm">{row.label}</span>
                                <Switch
                                    checked={!row.isHidden}
                                    onCheckedChange={(val) => handleToggle(row.moduleId, !val)}
                                />
                            </div>
                        ))}
                    </div>
                </div>

                <div className="flex gap-2 border-t pt-3">
                    <Button variant="outline" size="sm" className="flex-1" onClick={handleReset}>
                        Mostrar todos
                    </Button>
                    <Button variant="save" size="sm" className="flex-1" onClick={handleSave} disabled={saving}>
                        {saving ? 'Guardando...' : 'Guardar'}
                    </Button>
                </div>
            </SheetContent>
        </Sheet>
    )
}
