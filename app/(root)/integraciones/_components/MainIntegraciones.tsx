'use client'

import { useEffect, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Trash2, Pencil, ExternalLink, Globe, InboxIcon, Search, GripVertical, AlertTriangle } from 'lucide-react'
import {
    DndContext, closestCenter, useSensor, useSensors, PointerSensor, KeyboardSensor,
    type DragEndEvent,
} from '@dnd-kit/core'
import {
    arrayMove, SortableContext, useSortable, verticalListSortingStrategy, sortableKeyboardCoordinates,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { ModuleToolbar } from '@/components/shared/ModuleToolbar'
import { BotonDeCrear } from '@/components/shared/BarraDeAcciones'
import { useModuleStore, UserIntegrationItem } from '@/stores/modules/useModuleStore'
import {
    createUserIntegration,
    updateUserIntegration,
    deleteUserIntegration,
    reorderUserIntegrations,
} from '@/actions/user-integration-actions'
import {
    LARGO_MAXIMO_DEL_NOMBRE,
    TOPE_DE_INTEGRACIONES,
    cabeOtra,
    comoNombreDeIntegracion,
    comoUrlDeIntegracion,
    laUrlQueSeAbre,
} from '@/lib/integraciones'

/**
 * Una acción puede REVENTAR (la red, un despliegue a medias), no solo devolver
 * `success: false`. Sin esto el `await` se rompía y el botón se quedaba sin
 * respuesta, sin un solo aviso.
 */
async function pedir<T extends { success: boolean; error?: string }>(fn: () => Promise<T>): Promise<T | { success: false; error: string }> {
    try {
        return await fn()
    } catch (error) {
        console.error('[integraciones] la acción no respondió', error)
        return { success: false, error: 'No se pudo completar. Revisa la conexión e inténtalo de nuevo.' }
    }
}

// ── La ventana de crear y editar ─────────────────────────────────────────────
// La MISMA forma que «Crear contacto» de Leads: dos campos uno debajo del otro
// y el pie de siempre. Antes eran dos formularios en línea, en dos columnas que
// en un teléfono dejaban cada campo en media pantalla, y uno distinto para
// crear y para editar.

type Borrador = { id: string | null; name: string; url: string }

function VentanaDeIntegracion({
    borrador,
    onClose,
    onGuardada,
}: {
    borrador: Borrador | null
    onClose: () => void
    onGuardada: (item: UserIntegrationItem, nueva: boolean) => void
}) {
    const [name, setName] = useState('')
    const [url, setUrl] = useState('')
    const [errores, setErrores] = useState<{ name?: string; url?: string; general?: string }>({})
    const [isPending, startTransition] = useTransition()
    const editando = !!borrador?.id

    useEffect(() => {
        if (!borrador) return
        setName(borrador.name)
        setUrl(borrador.url)
        setErrores({})
    }, [borrador])

    const guardar = (e: React.FormEvent) => {
        e.preventDefault()
        if (!borrador) return
        // Las mismas reglas que el servidor, para decirlo debajo del campo sin
        // esperar la vuelta. El servidor las vuelve a pasar igual.
        const nombre = comoNombreDeIntegracion(name)
        const direccion = comoUrlDeIntegracion(url)
        const siguientes = {
            name: nombre.ok ? undefined : nombre.motivo,
            url: direccion.ok ? undefined : direccion.motivo,
        }
        setErrores(siguientes)
        if (!nombre.ok || !direccion.ok) return

        startTransition(async () => {
            if (borrador.id) {
                const res = await pedir(() => updateUserIntegration(borrador.id as string, { name: nombre.valor, url: direccion.valor }))
                if (!res.success) {
                    setErrores({ general: res.error ?? 'No se pudo guardar el cambio.' })
                    return
                }
                onGuardada({ id: borrador.id, name: nombre.valor, url: direccion.valor, order: 0 }, false)
                toast.success('App actualizada')
            } else {
                const res = await pedir(() => createUserIntegration({ name: nombre.valor, url: direccion.valor }))
                if (!res.success || !('item' in res) || !res.item) {
                    setErrores({ general: res.error ?? 'No se pudo guardar la app.' })
                    return
                }
                onGuardada(res.item, true)
                toast.success('App agregada: ya sale como pestaña en tus chats')
            }
        })
    }

    return (
        <Dialog open={!!borrador} onOpenChange={(abierto) => { if (!abierto) onClose() }}>
            <DialogContent className="sm:max-w-[400px]" data-ventana-de-integracion>
                <DialogHeader>
                    <DialogTitle>{editando ? 'Editar app' : 'Nueva app'}</DialogTitle>
                    <DialogDescription>
                        Sale como una pestaña más en tus chats, al lado de Mensajes y Notas.
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={guardar} className="flex flex-col gap-4 py-2">
                    <div className="flex flex-col gap-1.5">
                        <Label htmlFor="intg-nombre">Nombre</Label>
                        <Input
                            id="intg-nombre"
                            placeholder="Ej: Mi Typebot"
                            value={name}
                            maxLength={LARGO_MAXIMO_DEL_NOMBRE + 10}
                            onChange={(e) => setName(e.target.value)}
                            autoFocus
                        />
                        {errores.name && <p className="text-xs text-red-500" data-error-del-campo="nombre">{errores.name}</p>}
                    </div>
                    <div className="flex flex-col gap-1.5">
                        <Label htmlFor="intg-url">Dirección</Label>
                        <Input
                            id="intg-url"
                            placeholder="https://..."
                            inputMode="url"
                            autoCapitalize="none"
                            autoCorrect="off"
                            spellCheck={false}
                            value={url}
                            onChange={(e) => setUrl(e.target.value)}
                        />
                        {errores.url && <p className="text-xs text-red-500" data-error-del-campo="direccion">{errores.url}</p>}
                    </div>
                    {errores.general && <p className="text-sm text-red-500">{errores.general}</p>}
                    <DialogFooter>
                        <Button type="button" variant="ghost" onClick={onClose}>
                            Cancelar
                        </Button>
                        <Button type="submit" disabled={isPending} variant={editando ? 'save' : 'default'} className={editando ? undefined : 'bg-blue-600 hover:bg-blue-700 text-white'}>
                            {isPending ? 'Guardando…' : editando ? 'Guardar' : 'Agregar'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}

// ── Una fila ─────────────────────────────────────────────────────────────────

function FilaDeIntegracion({
    item,
    sePuedeArrastrar,
    onEditar,
    onEliminar,
}: {
    item: UserIntegrationItem
    sePuedeArrastrar: boolean
    onEditar: () => void
    onEliminar: () => void
}) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
        id: item.id,
        disabled: !sePuedeArrastrar,
    })
    const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }
    // La que se abre de verdad: una vieja sin «https://» se abre con él, y una
    // que no es web no lleva enlace y lo dice.
    const abre = laUrlQueSeAbre(item.url)

    return (
        <div
            ref={setNodeRef}
            style={style}
            data-fila-de-integracion={item.id}
            className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-3 hover:bg-accent/30 transition-colors"
        >
            <button
                type="button"
                {...attributes}
                {...listeners}
                disabled={!sePuedeArrastrar}
                aria-label={`Arrastrar ${item.name} para reordenar`}
                data-asa-de-integracion
                className="shrink-0 cursor-grab active:cursor-grabbing touch-none text-muted-foreground/50 hover:text-muted-foreground transition-colors p-0.5 disabled:cursor-not-allowed disabled:opacity-30"
                title={sePuedeArrastrar ? 'Arrastrar para reordenar' : 'Borra la búsqueda para reordenar'}
            >
                <GripVertical className="h-4 w-4" />
            </button>
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10">
                <Globe className="h-4 w-4 text-primary" />
            </div>
            <div className="min-w-0 flex-1" data-texto-de-la-fila>
                <p className="truncate text-sm font-medium" title={item.name}>{item.name}</p>
                <p className="truncate text-xs text-muted-foreground" title={item.url}>{item.url}</p>
                {!abre && (
                    <p className="mt-0.5 flex w-fit items-center gap-1 text-xs text-amber-600 dark:text-amber-400" data-aviso-de-la-fila>
                        <AlertTriangle className="h-3 w-3 shrink-0" />
                        Esta dirección no se puede abrir. Edítala.
                    </p>
                )}
            </div>
            <div className="flex items-center gap-1 shrink-0">
                {abre ? (
                    <a
                        href={abre}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                        title="Abrir en nueva pestaña"
                        aria-label={`Abrir ${item.name} en nueva pestaña`}
                    >
                        <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                ) : (
                    <span className="inline-flex h-7 w-7" aria-hidden />
                )}
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onEditar} title="Editar" aria-label={`Editar ${item.name}`}>
                    <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10"
                    onClick={onEliminar}
                    title="Eliminar"
                    aria-label={`Eliminar ${item.name}`}
                >
                    <Trash2 className="h-3.5 w-3.5" />
                </Button>
            </div>
        </div>
    )
}

// ── La pantalla ──────────────────────────────────────────────────────────────

export function MainIntegraciones({ initial }: { initial: UserIntegrationItem[] }) {
    const { userIntegrations, setUserIntegrations } = useModuleStore()
    const [, startTransition] = useTransition()
    const [borrador, setBorrador] = useState<Borrador | null>(null)
    const [aEliminar, setAEliminar] = useState<UserIntegrationItem | null>(null)
    const [search, setSearch] = useState('')

    // La lista vive en el store —de ahí salen también las pestañas de Chats—, y
    // se siembra con lo que trajo el servidor. Antes se leía
    // `store.length > 0 ? store : initial`, así que al borrar la ÚLTIMA el store
    // quedaba vacío y la pantalla volvía a pintar la borrada.
    const [sembrado, setSembrado] = useState(false)
    useEffect(() => {
        setUserIntegrations(initial)
        setSembrado(true)
    }, [initial, setUserIntegrations])
    const items = sembrado ? userIntegrations : initial

    const buscando = search.trim().length > 0
    const filteredItems = buscando
        ? items.filter(i => `${i.name} ${i.url}`.toLowerCase().includes(search.trim().toLowerCase()))
        : items
    const lleno = !cabeOtra(items.length)

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
    )

    // Con una búsqueda puesta NO se reordena: se estaría moviendo una lista a
    // la que le faltan filas, y las escondidas perderían su sitio al quitarla.
    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event
        if (buscando || !over || active.id === over.id) return
        const oldIndex = items.findIndex(i => i.id === active.id)
        const newIndex = items.findIndex(i => i.id === over.id)
        if (oldIndex < 0 || newIndex < 0) return
        const antes = items
        const reordered = arrayMove(items, oldIndex, newIndex)
        setUserIntegrations(reordered)
        startTransition(async () => {
            const res = await pedir(() => reorderUserIntegrations(reordered.map(i => i.id)))
            if (!res.success) {
                // Lo pintado tiene que ser lo guardado: si no se guardó, vuelve.
                setUserIntegrations(antes)
                toast.error(res.error ?? 'No se pudo guardar el orden.')
            }
        })
    }

    const handleGuardada = (item: UserIntegrationItem, nueva: boolean) => {
        setUserIntegrations(nueva ? [...items, item] : items.map(i => i.id === item.id ? { ...i, name: item.name, url: item.url } : i))
        setBorrador(null)
    }

    // La fila se quita ANTES de preguntar, y vuelve a su sitio si el servidor
    // dice que no: es la regla de borrar un chat.
    const confirmarEliminar = () => {
        const item = aEliminar
        if (!item) return
        setAEliminar(null)
        const antes = items
        setUserIntegrations(items.filter(i => i.id !== item.id))
        startTransition(async () => {
            const res = await pedir(() => deleteUserIntegration(item.id))
            if (res.success) {
                toast.success(`«${item.name}» eliminada`)
            } else {
                setUserIntegrations(antes)
                toast.error(res.error ?? 'No se pudo eliminar.')
            }
        })
    }

    return (
        <div className="flex h-full flex-col gap-3 p-4">
            <ModuleToolbar
                buscador={
                    <div className="relative w-56 sm:w-72">
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
                    <BotonDeCrear
                        onClick={() => setBorrador({ id: null, name: '', url: '' })}
                        disabled={lleno}
                        {...(lleno ? { title: `Ya tienes ${TOPE_DE_INTEGRACIONES} apps, que es el máximo` } : {})}
                    >
                        Nuevo
                    </BotonDeCrear>
                }
            />

            {/* Lista */}
            <div className="flex-1 overflow-y-auto" data-lista-de-integraciones>
                {items.length === 0 ? (
                    <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
                        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-accent">
                            <InboxIcon className="h-8 w-8 text-muted-foreground" />
                        </div>
                        <div>
                            <p className="text-sm font-medium">Sin integraciones</p>
                            <p className="text-xs text-muted-foreground">Haz clic en <strong>Nuevo</strong> para agregar tu primera app externa.</p>
                        </div>
                    </div>
                ) : (
                    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                        <SortableContext items={filteredItems.map(i => i.id)} strategy={verticalListSortingStrategy}>
                            <div className="flex flex-col gap-2">
                                {filteredItems.map((item) => (
                                    <FilaDeIntegracion
                                        key={item.id}
                                        item={item}
                                        sePuedeArrastrar={!buscando}
                                        onEditar={() => setBorrador({ id: item.id, name: item.name, url: item.url })}
                                        onEliminar={() => setAEliminar(item)}
                                    />
                                ))}
                                {filteredItems.length === 0 && (
                                    <p className="py-8 text-center text-sm text-muted-foreground">Sin resultados para &quot;{search}&quot;</p>
                                )}
                            </div>
                        </SortableContext>
                    </DndContext>
                )}
            </div>

            {/* La cifra va DEBAJO del contenido, nunca en la cabecera: no filtra
                nada. Antes eran cuatro pastillas arriba —«En sidebar» y «En
                chat» repetían el total, y «Disponibles» prometía un máximo que
                la acción no aplicaba—. */}
            {items.length > 0 && (
                <p className="shrink-0 text-center text-xs text-muted-foreground" data-pie-de-integraciones>
                    {lleno
                        ? `${items.length} de ${TOPE_DE_INTEGRACIONES} apps: llegaste al máximo. Borra una para agregar otra.`
                        : `${items.length} de ${TOPE_DE_INTEGRACIONES} apps · cada una sale como pestaña en tus chats${buscando ? ' · borra la búsqueda para reordenar' : ''}`}
                </p>
            )}

            <VentanaDeIntegracion borrador={borrador} onClose={() => setBorrador(null)} onGuardada={handleGuardada} />

            <AlertDialog open={!!aEliminar} onOpenChange={(abierto) => { if (!abierto) setAEliminar(null) }}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Eliminar «{aEliminar?.name}»</AlertDialogTitle>
                        <AlertDialogDescription>
                            Deja de salir como pestaña en tus chats. La app en sí no se toca: solo se quita de la plataforma.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={confirmarEliminar}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                            Eliminar
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    )
}
