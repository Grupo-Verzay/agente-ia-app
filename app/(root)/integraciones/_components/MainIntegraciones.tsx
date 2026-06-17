'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Trash2, Plus, Pencil, Check, X, ExternalLink, Globe, InboxIcon, LayoutGrid, MessageSquare, Sidebar, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ModuleToolbar } from '@/components/shared/ModuleToolbar'
import { MetricCard } from '@/components/custom/MetricCard'
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
                <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                        <Label className="text-xs">Nombre</Label>
                        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Mi App" className="h-8 text-sm" />
                    </div>
                    <div className="space-y-1">
                        <Label className="text-xs">URL</Label>
                        <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://..." className="h-8 text-sm" />
                    </div>
                </div>
                <div className="flex gap-2">
                    <Button size="sm" variant="ghost" onClick={() => { setEditing(false); setName(item.name); setUrl(item.url) }} className="h-7 px-3 text-xs">
                        <X className="mr-1 h-3 w-3" /> Cancelar
                    </Button>
                    <Button size="sm" onClick={handleSave} disabled={isPending} className="h-7 px-3 text-xs">
                        <Check className="mr-1 h-3 w-3" /> Guardar
                    </Button>
                </div>
            </div>
        )
    }

    return (
        <div className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 hover:bg-accent/30 transition-colors">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10">
                <Globe className="h-4 w-4 text-primary" />
            </div>
            <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{item.name}</p>
                <p className="truncate text-xs text-muted-foreground">{item.url}</p>
            </div>
            <div className="flex items-center gap-1 shrink-0">
                <a
                    href={item.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                    title="Abrir en nueva pestaña"
                >
                    <ExternalLink className="h-3.5 w-3.5" />
                </a>
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditing(true)} title="Editar">
                    <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10" onClick={handleDelete} disabled={isPending} title="Eliminar">
                    <Trash2 className="h-3.5 w-3.5" />
                </Button>
            </div>
        </div>
    )
}

export function MainIntegraciones({ initial }: { initial: UserIntegrationItem[] }) {
    const { userIntegrations, setUserIntegrations } = useModuleStore()
    const [isPending, startTransition] = useTransition()
    const [newName, setNewName] = useState('')
    const [newUrl, setNewUrl] = useState('')
    const [showForm, setShowForm] = useState(false)

    const [search, setSearch] = useState('')
    const items = userIntegrations.length > 0 ? userIntegrations : initial
    const filteredItems = search.trim()
        ? items.filter(i => `${i.name} ${i.url}`.toLowerCase().includes(search.toLowerCase()))
        : items

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
        <div className="flex h-full flex-col gap-3 p-4">
            {/* Métricas */}
            <div className="grid shrink-0 grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
                <MetricCard
                    icon={<Globe className="h-4 w-4" />}
                    label="Total"
                    value={items.length}
                    helper="Apps externas configuradas"
                    color="#3B82F6"
                />
                <MetricCard
                    icon={<Sidebar className="h-4 w-4" />}
                    label="En sidebar"
                    value={items.length}
                    helper="Visibles en el menú lateral"
                    color="#8B5CF6"
                />
                <MetricCard
                    icon={<MessageSquare className="h-4 w-4" />}
                    label="En chat"
                    value={items.length}
                    helper="Disponibles como tabs en chats"
                    color="#10B981"
                />
                <MetricCard
                    icon={<LayoutGrid className="h-4 w-4" />}
                    label="Disponibles"
                    value={Math.max(0, 10 - items.length)}
                    helper="Slots restantes (máx. 10)"
                    color="#F59E0B"
                />
            </div>

            {/* Toolbar */}
            <ModuleToolbar
                left={
                    <div className="relative w-72 shrink-0">
                        <Search className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="Buscar integración..."
                            className="pl-8 text-sm"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                        />
                    </div>
                }
                right={
                    <Button size="sm" onClick={() => setShowForm(true)} className="gap-1.5 shrink-0">
                        <Plus className="h-4 w-4" /> Nueva
                    </Button>
                }
            />

            {/* Formulario de creación */}
            {showForm && (
                <div className="shrink-0 flex flex-col gap-3 rounded-lg border border-dashed border-blue-400 bg-blue-50 p-4 dark:bg-blue-950/30">
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                            <Label className="text-xs">Nombre</Label>
                            <Input
                                value={newName}
                                onChange={(e) => setNewName(e.target.value)}
                                placeholder="Ej: Mi Typebot"
                                className="h-9"
                                autoFocus
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
                    </div>
                    <div className="flex gap-2">
                        <Button size="sm" variant="ghost" onClick={() => { setShowForm(false); setNewName(''); setNewUrl('') }}>
                            Cancelar
                        </Button>
                        <Button size="sm" onClick={handleCreate} disabled={isPending || !newName.trim() || !newUrl.trim()}>
                            <Check className="mr-1 h-3.5 w-3.5" /> Agregar
                        </Button>
                    </div>
                </div>
            )}

            {/* Lista */}
            <div className="flex-1 overflow-y-auto">
                {items.length === 0 && !showForm ? (
                    <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
                        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-accent">
                            <InboxIcon className="h-8 w-8 text-muted-foreground" />
                        </div>
                        <div>
                            <p className="text-sm font-medium">Sin integraciones</p>
                            <p className="text-xs text-muted-foreground">Haz clic en <strong>Nueva</strong> para agregar tu primera app externa.</p>
                        </div>
                    </div>
                ) : (
                    <div className="flex flex-col gap-2">
                        {filteredItems.map((item) => (
                            <IntegrationRow
                                key={item.id}
                                item={item}
                                onUpdated={handleUpdated}
                                onDeleted={handleDeleted}
                            />
                        ))}
                        {filteredItems.length === 0 && (
                            <p className="py-8 text-center text-sm text-muted-foreground">Sin resultados para &quot;{search}&quot;</p>
                        )}
                    </div>
                )}
            </div>
        </div>
    )
}
