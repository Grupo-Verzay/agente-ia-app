'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Trash2, Plus, Pencil, Check, X, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useModuleStore, UserIntegrationItem } from '@/stores/modules/useModuleStore'
import {
    createUserIntegration,
    updateUserIntegration,
    deleteUserIntegration,
} from '@/actions/user-integration-actions'

function IntegrationRow({
    item,
    onUpdated,
    onDeleted,
}: {
    item: UserIntegrationItem
    onUpdated: (updated: UserIntegrationItem) => void
    onDeleted: (id: string) => void
}) {
    const [editing, setEditing] = useState(false)
    const [name, setName] = useState(item.name)
    const [url, setUrl] = useState(item.url)
    const [isPending, startTransition] = useTransition()

    const handleSave = () => {
        if (!name.trim() || !url.trim()) return
        startTransition(async () => {
            const res = await updateUserIntegration(item.id, { name: name.trim(), url: url.trim() })
            if (res.success) {
                onUpdated({ ...item, name: name.trim(), url: url.trim() })
                setEditing(false)
                toast.success('Integración actualizada')
            } else {
                toast.error('Error al actualizar')
            }
        })
    }

    const handleDelete = () => {
        startTransition(async () => {
            const res = await deleteUserIntegration(item.id)
            if (res.success) {
                onDeleted(item.id)
                toast.success('Integración eliminada')
            } else {
                toast.error('Error al eliminar')
            }
        })
    }

    if (editing) {
        return (
            <div className="flex flex-col gap-2 rounded-lg border border-blue-200 bg-blue-50 p-3 dark:border-blue-800 dark:bg-blue-950/30">
                <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Nombre"
                    className="h-8 text-sm"
                />
                <Input
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="https://..."
                    className="h-8 text-sm"
                />
                <div className="flex gap-2">
                    <Button size="sm" onClick={handleSave} disabled={isPending} className="h-7 px-3 text-xs">
                        <Check className="mr-1 h-3 w-3" /> Guardar
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => { setEditing(false); setName(item.name); setUrl(item.url) }} className="h-7 px-3 text-xs">
                        <X className="mr-1 h-3 w-3" /> Cancelar
                    </Button>
                </div>
            </div>
        )
    }

    return (
        <div className="flex items-center gap-3 rounded-lg border border-border bg-card p-3">
            <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{item.name}</p>
                <p className="truncate text-xs text-muted-foreground">{item.url}</p>
            </div>
            <a href={item.url} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-foreground">
                <ExternalLink className="h-4 w-4" />
            </a>
            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setEditing(true)}>
                <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:text-destructive" onClick={handleDelete} disabled={isPending}>
                <Trash2 className="h-3.5 w-3.5" />
            </Button>
        </div>
    )
}

export function MainIntegraciones({ initial }: { initial: UserIntegrationItem[] }) {
    const { userIntegrations, setUserIntegrations } = useModuleStore()
    const [isPending, startTransition] = useTransition()
    const [newName, setNewName] = useState('')
    const [newUrl, setNewUrl] = useState('')
    const [showForm, setShowForm] = useState(false)

    const items = userIntegrations.length > 0 ? userIntegrations : initial

    const handleCreate = () => {
        if (!newName.trim() || !newUrl.trim()) return
        startTransition(async () => {
            const res = await createUserIntegration({ name: newName.trim(), url: newUrl.trim() })
            if (res.success && res.item) {
                const updated = [...items, res.item]
                setUserIntegrations(updated)
                toast.success('Integración creada')
                setNewName('')
                setNewUrl('')
                setShowForm(false)
            } else {
                toast.error('Error al crear')
            }
        })
    }

    const handleUpdated = (updated: UserIntegrationItem) => {
        setUserIntegrations(items.map(i => i.id === updated.id ? updated : i))
    }

    const handleDeleted = (id: string) => {
        setUserIntegrations(items.filter(i => i.id !== id))
    }

    return (
        <div className="mx-auto max-w-2xl space-y-6 p-4">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-xl font-bold">Mis integraciones</h1>
                    <p className="text-sm text-muted-foreground">Apps externas embebidas en tu sidebar</p>
                </div>
                <Button size="sm" onClick={() => setShowForm(true)} className="gap-1.5">
                    <Plus className="h-4 w-4" /> Nueva
                </Button>
            </div>

            {showForm && (
                <div className="flex flex-col gap-3 rounded-lg border border-dashed border-blue-400 bg-blue-50 p-4 dark:bg-blue-950/30">
                    <div className="space-y-1.5">
                        <Label className="text-xs">Nombre</Label>
                        <Input
                            value={newName}
                            onChange={(e) => setNewName(e.target.value)}
                            placeholder="Ej: Mi Typebot"
                            className="h-9"
                        />
                    </div>
                    <div className="space-y-1.5">
                        <Label className="text-xs">URL</Label>
                        <Input
                            value={newUrl}
                            onChange={(e) => setNewUrl(e.target.value)}
                            placeholder="https://..."
                            className="h-9"
                        />
                    </div>
                    <div className="flex gap-2">
                        <Button size="sm" onClick={handleCreate} disabled={isPending || !newName.trim() || !newUrl.trim()}>
                            <Check className="mr-1 h-3.5 w-3.5" /> Agregar
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => { setShowForm(false); setNewName(''); setNewUrl('') }}>
                            Cancelar
                        </Button>
                    </div>
                </div>
            )}

            {items.length === 0 && !showForm ? (
                <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
                    No tienes integraciones aún. Haz clic en <strong>Nueva</strong> para agregar una.
                </div>
            ) : (
                <div className="flex flex-col gap-2">
                    {items.map((item) => (
                        <IntegrationRow
                            key={item.id}
                            item={item}
                            onUpdated={handleUpdated}
                            onDeleted={handleDeleted}
                        />
                    ))}
                </div>
            )}
        </div>
    )
}
