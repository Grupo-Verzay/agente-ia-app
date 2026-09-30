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
import { GripVertical, FileText, MoreHorizontal, Pin, PinOff, Eye, Pencil } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { AVISO_SIN_REORDENAR, CLASE_DE_LA_LISTA_VACIA, MANDO_QUE_APARECE_AL_PASAR } from '@/lib/pantalla-de-notas'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  updateNoteShareOrder, setNoteSharePin, type SharedNoteListItem,
} from '@/actions/notes-actions'

function pinnedFirst(list: SharedNoteListItem[]): SharedNoteListItem[] {
  return [...list].sort((a, b) => (b.isPinned ? 1 : 0) - (a.isPinned ? 1 : 0))
}

function SharedItem({
  note, selectedId, reordenable, onSelect, onTogglePin,
}: {
  note: SharedNoteListItem
  selectedId?: string
  reordenable: boolean
  onSelect: (id: string) => void
  onTogglePin: (id: string, isPinned: boolean) => void
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
            'group relative flex cursor-pointer flex-col gap-0.5 px-2 py-2 transition-colors border-b border-border/40 rounded-sm hover:bg-muted/50',
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
                {note.canEdit
                  ? <Pencil className="h-3 w-3 shrink-0 text-emerald-500" aria-label="Puede editar" />
                  : <Eye className="h-3 w-3 shrink-0 text-amber-500" aria-label="Solo lectura" />
                }
                {note.isPinned && <Pin className="h-3 w-3 shrink-0 text-muted-foreground/60" />}
              </div>
              <span className="text-[11px] text-muted-foreground truncate">
                de {note.ownerName ?? 'otra cuenta'}
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
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  )
}

export function SortableSharedNoteList({
  notes, selectedId, userId, vacio, reordenable = true, onSelect, onReorder,
}: {
  notes: SharedNoteListItem[]
  selectedId?: string
  vacio: string
  reordenable?: boolean
  /** Cuenta receptora (dueña del orden/fijado propio). */
  userId: string
  onSelect: (id: string) => void
  onReorder: (notes: SharedNoteListItem[]) => void
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
      await Promise.all(reordered.map((n, i) => updateNoteShareOrder(n.id, userId, i)))
    } catch {
      toast.error('Error al guardar el orden')
    }
  }

  const handleTogglePin = async (id: string, isPinned: boolean) => {
    const next = pinnedFirst(items.map(n => n.id === id ? { ...n, isPinned: !isPinned } : n))
    setItems(next)
    onReorder(next)
    const res = await setNoteSharePin(id, userId, !isPinned)
    if (!res.success) toast.error(res.error ?? 'No se pudo fijar')
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={items.map(n => n.id)} strategy={verticalListSortingStrategy}>
        <div role="list">
          {items.map(note => (
            <SharedItem
              key={note.id}
              note={note}
              selectedId={selectedId}
              reordenable={reordenable}
              onSelect={onSelect}
              onTogglePin={handleTogglePin}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  )
}
