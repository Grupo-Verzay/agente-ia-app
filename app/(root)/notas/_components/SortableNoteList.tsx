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
import { Check, FileX, Folder, FolderInput, GripVertical, FileText, MoreHorizontal, Pin, PinOff, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { AVISO_SIN_REORDENAR, CLASE_DE_LA_LISTA_VACIA, MANDO_QUE_APARECE_AL_PASAR } from '@/lib/pantalla-de-notas'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent,
  DropdownMenuSubTrigger, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { updateNoteOrder, type UserNoteListItem } from '@/actions/notes-actions'

/** Una carpeta a la que se puede mover una nota: lo justo para pintarla. */
export type CarpetaDestino = { id: string; name: string; color: string | null }

function SortableNoteItem({
  note, selectedId, reordenable, carpetas, onSelect, onDelete, onTogglePin, onMove,
}: {
  note: UserNoteListItem
  selectedId?: string
  reordenable: boolean
  carpetas: CarpetaDestino[]
  onSelect: (id: string) => void
  onDelete: (id: string) => void
  onTogglePin: (id: string, isPinned: boolean) => void
  onMove?: (id: string, folderId: string | null) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: note.id, disabled: !reordenable })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <div ref={setNodeRef} style={style} className="flex items-center gap-1">
      <div
        className={cn(
          'flex items-center justify-center p-1 shrink-0 transition-colors',
          reordenable
            ? 'cursor-grab text-muted-foreground/30 hover:text-muted-foreground/60'
            : 'cursor-not-allowed text-muted-foreground/15',
        )}
        title={reordenable ? 'Arrastra para ordenar' : AVISO_SIN_REORDENAR}
        data-asa-de-la-nota
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" />
      </div>
      <div className="flex-1 min-w-0">
        <div
          className={cn(
            'group relative flex cursor-pointer flex-col gap-0.5 px-2 py-2 transition-colors border-b border-border/40 rounded-sm',
            'hover:bg-muted/50',
            selectedId === note.id && 'bg-muted border-l-2 border-l-primary',
          )}
          data-nota-de-la-lista={note.id}
          onClick={() => onSelect(note.id)}
        >
          <div className="flex items-center gap-2 pr-6 min-w-0">
            {note.emoji
              ? <span className="text-base shrink-0">{note.emoji}</span>
              : <FileText className="h-4 w-4 shrink-0 text-primary" />
            }
            <div className="flex flex-col min-w-0">
              <div className="flex items-center gap-1 min-w-0">
                <span className="truncate text-sm font-medium leading-snug">
                  {note.title || 'Sin título'}
                </span>
                {note.isPinned && <Pin className="h-3 w-3 shrink-0 text-muted-foreground/60" />}
              </div>
              <span className="text-[11px] text-muted-foreground">
                {new Date(note.updatedAt).toLocaleDateString('es', {
                  day: 'numeric', month: 'short', year: 'numeric',
                })}
              </span>
            </div>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className={cn(MANDO_QUE_APARECE_AL_PASAR, 'absolute right-2 top-2.5 flex h-6 w-6 items-center justify-center rounded hover:bg-background')}
                onClick={e => e.stopPropagation()}
                title="Más opciones"
                aria-label="Más opciones"
                data-mas-opciones-de-la-nota
              >
                <MoreHorizontal className="h-3.5 w-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
              <DropdownMenuItem onClick={e => { e.stopPropagation(); onTogglePin(note.id, note.isPinned) }}>
                {note.isPinned
                  ? <><PinOff className="mr-2 h-3.5 w-3.5" /> Desfijar</>
                  : <><Pin className="mr-2 h-3.5 w-3.5" /> Fijar</>
                }
              </DropdownMenuItem>
              {/* Mover a otra carpeta: sin esto, una nota solo entraba en una
                  carpeta si se CREABA con ella abierta. Sin carpetas no hay a
                  dónde moverla, así que la opción no sale. */}
              {onMove && carpetas.length > 0 && (
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger onClick={e => e.stopPropagation()} data-mover-la-nota>
                    <FolderInput className="mr-2 h-3.5 w-3.5" /> Mover a carpeta
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="w-48 max-h-[min(60vh,var(--radix-dropdown-menu-content-available-height))] overflow-y-auto">
                    <DropdownMenuItem
                      disabled={note.folderId === null}
                      onClick={e => { e.stopPropagation(); onMove(note.id, null) }}
                    >
                      <FileX className="mr-2 h-3.5 w-3.5" /> Sin carpeta
                      {note.folderId === null && <Check className="ml-auto h-3.5 w-3.5" />}
                    </DropdownMenuItem>
                    {carpetas.map(c => (
                      <DropdownMenuItem
                        key={c.id}
                        disabled={note.folderId === c.id}
                        onClick={e => { e.stopPropagation(); onMove(note.id, c.id) }}
                      >
                        <Folder className="mr-2 h-3.5 w-3.5 shrink-0" style={{ color: c.color ?? undefined }} />
                        <span className="truncate">{c.name}</span>
                        {note.folderId === c.id && <Check className="ml-auto h-3.5 w-3.5 shrink-0" />}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={e => { e.stopPropagation(); onDelete(note.id) }}
              >
                <Trash2 className="mr-2 h-3.5 w-3.5" /> Eliminar
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  )
}

export function SortableNoteList({
  notes, selectedId, userId, vacio, reordenable = true, carpetas = [], onSelect, onDelete, onTogglePin, onMove, onReorder,
}: {
  notes: UserNoteListItem[]
  selectedId?: string
  userId: string
  /** Qué dice la lista vacía: por qué está vacía (`elMensajeDeLaListaVacia`). */
  vacio: string
  /** Con una búsqueda puesta no se reordena (`sePuedeReordenar`). */
  reordenable?: boolean
  onSelect: (id: string) => void
  onDelete: (id: string) => void
  onTogglePin: (id: string, isPinned: boolean) => void
  /** Las carpetas a las que se puede mover una nota desde su «⋯». */
  carpetas?: CarpetaDestino[]
  onMove?: (id: string, folderId: string | null) => void
  onReorder: (notes: UserNoteListItem[]) => void
}) {
  const [items, setItems] = useState(notes)
  const sensors = useSensors(useSensor(PointerSensor))

  useEffect(() => { setItems(notes) }, [notes])

  if (items.length === 0) {
    return <div className={CLASE_DE_LA_LISTA_VACIA} data-lista-vacia>{vacio}</div>
  }

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id || !reordenable) return

    const oldIndex = items.findIndex(n => n.id === active.id)
    const newIndex = items.findIndex(n => n.id === over.id)
    const reordered = arrayMove(items, oldIndex, newIndex)

    setItems(reordered)
    onReorder(reordered)

    try {
      await Promise.all(reordered.map((n, i) => updateNoteOrder(n.id, userId, i)))
    } catch {
      toast.error('Error al guardar el orden')
    }
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={items.map(n => n.id)} strategy={verticalListSortingStrategy}>
        <div role="list">
          {items.map(note => (
            <SortableNoteItem
              key={note.id}
              note={note}
              selectedId={selectedId}
              reordenable={reordenable}
              carpetas={carpetas}
              onSelect={onSelect}
              onDelete={onDelete}
              onTogglePin={onTogglePin}
              onMove={onMove}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  )
}
