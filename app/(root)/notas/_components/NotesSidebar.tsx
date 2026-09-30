'use client'

import { useState } from 'react'
import {
  ChevronDown, ChevronRight, Folder, FolderOpen,
  MoreHorizontal, Plus, Search, Trash2, Pencil, FolderPlus,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  alPulsarUnaCarpeta, ARCHIVO, COMPARTIDAS, elMensajeDeLaListaVacia, laVista,
  MANDO_QUE_APARECE_AL_PASAR, sePuedeReordenar,
} from '@/lib/pantalla-de-notas'
import type { NoteFolderWithCount, UserNoteListItem, SharedNoteListItem } from '@/actions/notes-actions'
import { SortableNoteList } from './SortableNoteList'
import { SortableSharedNoteList } from './SortableSharedNoteList'

const FOLDER_COLORS = [
  '#6366f1', '#ec4899', '#f59e0b', '#10b981', '#3b82f6',
  '#8b5cf6', '#ef4444', '#14b8a6', '#f97316', '#84cc16',
]

interface Props {
  className?: string
  folders: NoteFolderWithCount[]
  notes: UserNoteListItem[]
  sharedNotes: SharedNoteListItem[]
  /** El total de compartidas, sin la búsqueda: es lo que dice su pestaña. */
  sharedTotal: number
  selectedNoteId?: string
  activeFolderId: string | null | undefined
  search: string
  userId: string
  onSearchChange: (v: string) => void
  onSelectNote: (id: string) => void
  onNewNote: () => void
  onDeleteNote: (id: string) => void
  onTogglePin: (id: string, isPinned: boolean) => void
  onMoveNote: (id: string, folderId: string | null) => void
  onReorder: (notes: UserNoteListItem[]) => void
  onReorderShared: (notes: SharedNoteListItem[]) => void
  onSelectFolder: (folderId: string | null | undefined) => void
  onCreateFolder: (name: string, color?: string) => void
  onUpdateFolder: (id: string, payload: { name?: string; color?: string }) => void
  onDeleteFolder: (id: string) => void
}

export function NotesSidebar({
  className,
  folders, notes, sharedNotes, sharedTotal, selectedNoteId, activeFolderId, search, userId,
  onSearchChange, onSelectNote, onNewNote, onDeleteNote, onTogglePin, onMoveNote, onReorder, onReorderShared,
  onSelectFolder, onCreateFolder, onUpdateFolder, onDeleteFolder,
}: Props) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [folderDialog, setFolderDialog] = useState<{
    open: boolean; editId?: string; name: string; color: string
  }>({ open: false, name: '', color: FOLDER_COLORS[0] })
  // Borrar una carpeta pide confirmación y dice qué pasa con sus notas: no se
  // borran, pasan a Sueltas. Antes se borraba de un clic desde su «⋯».
  const [carpetaABorrar, setCarpetaABorrar] = useState<NoteFolderWithCount | null>(null)

  const openNewFolder = () => setFolderDialog({ open: true, name: '', color: FOLDER_COLORS[0] })
  const openEditFolder = (f: NoteFolderWithCount) =>
    setFolderDialog({ open: true, editId: f.id, name: f.name, color: f.color ?? FOLDER_COLORS[0] })

  const handleFolderSubmit = () => {
    if (!folderDialog.name.trim()) return
    if (folderDialog.editId)
      onUpdateFolder(folderDialog.editId, { name: folderDialog.name, color: folderDialog.color })
    else
      onCreateFolder(folderDialog.name, folderDialog.color)
    setFolderDialog({ open: false, name: '', color: FOLDER_COLORS[0] })
  }

  const vista = laVista(activeFolderId)
  const tabValue = vista === 'todas' ? 'todas'
    : vista === 'sueltas' ? 'sin'
    : vista === 'archivo' ? 'archivadas'
    : vista === 'compartidas' ? 'compartidas'
    : 'folder'
  const vacio = elMensajeDeLaListaVacia({ vista, busqueda: search })
  const reordenable = sePuedeReordenar(search)

  return (
    <aside data-panel-de-notas className={cn('flex w-full min-w-0 max-w-none flex-col border-r border-border bg-background md:w-72 md:min-w-[240px] md:max-w-xs', className)}>
      {/* Header */}
      <div data-cabecera-del-panel className="flex items-center justify-between px-4 py-2 border-b border-border">
        <span className="font-semibold text-sm">Notas</span>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={openNewFolder} title="Nueva carpeta">
            <FolderPlus className="h-4 w-4 text-muted-foreground" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onNewNote} title="Nueva nota">
            <Plus className="h-4 w-4 text-muted-foreground" />
          </Button>
        </div>
      </div>

      {/* Filter tabs. Sin iconos y con la palabra entera: con un icono en cada
          una no cabían las cuatro en el ancho del panel (18rem) y se leían
          «Suelt…», «Co…», «Archi…». Cada pestaña mide lo que dice
          (`flex-auto`), como las pastillas de Chats. */}
      <div data-pestanas-del-panel className="px-3 py-2 border-b border-border">
        <Tabs value={tabValue}>
          <TabsList className="h-7 w-full overflow-hidden">
            <TabsTrigger value="todas" title="Todas" className="flex-auto min-w-0 gap-1 px-1.5 text-[11px] h-5" onClick={() => onSelectFolder(undefined)}>
              <span className="truncate">Todas</span>
            </TabsTrigger>
            <TabsTrigger value="sin" title="Sin carpeta" className="flex-auto min-w-0 gap-1 px-1.5 text-[11px] h-5" onClick={() => onSelectFolder(null)}>
              <span className="truncate">Sueltas</span>
            </TabsTrigger>
            <TabsTrigger value="compartidas" title="Compartidas" className="flex-auto min-w-0 gap-1 px-1.5 text-[11px] h-5" onClick={() => onSelectFolder(COMPARTIDAS)}>
              <span className="truncate">Compartidas</span>
              {sharedTotal > 0 && <span className="shrink-0 tabular-nums" data-total-compartidas>{sharedTotal}</span>}
            </TabsTrigger>
            <TabsTrigger value="archivadas" title="Archivadas" className="flex-auto min-w-0 gap-1 px-1.5 text-[11px] h-5" onClick={() => onSelectFolder(ARCHIVO)}>
              <span className="truncate">Archivo</span>
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Search */}
      <div data-buscador-de-notas className="px-3 py-1.5 border-b border-border">
        <div className="relative">
          <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Buscar notas..."
            value={search}
            onChange={e => onSearchChange(e.target.value)}
            className="h-8 pl-8 text-xs w-full bg-muted/40 border-transparent shadow-none ring-0 focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-border focus-visible:bg-background"
          />
        </div>
      </div>

      {/* Note list + folders */}
      <div className="flex-1 overflow-y-auto">
        {/* Notes for selected filter (non-folder) */}
        {(vista === 'todas' || vista === 'sueltas') && (
          <SortableNoteList
            notes={notes}
            selectedId={selectedNoteId}
            userId={userId}
            vacio={vacio}
            reordenable={reordenable}
            onSelect={onSelectNote}
            onDelete={onDeleteNote}
            onTogglePin={onTogglePin}
            carpetas={folders}
            onMove={onMoveNote}
            onReorder={onReorder}
          />
        )}

        {/* Archived notes list */}
        {vista === 'archivo' && (
          <SortableNoteList
            notes={notes}
            selectedId={selectedNoteId}
            userId={userId}
            vacio={vacio}
            reordenable={reordenable}
            onSelect={onSelectNote}
            onDelete={onDeleteNote}
            onTogglePin={onTogglePin}
            carpetas={folders}
            onMove={onMoveNote}
            onReorder={onReorder}
          />
        )}

        {/* Shared-with-me notes: reordenar (arrastrar) y fijar como en "Todas",
            con orden/fijado propios del receptor. Sin eliminar (no es el dueño). */}
        {vista === 'compartidas' && (
          <SortableSharedNoteList
            notes={sharedNotes}
            selectedId={selectedNoteId}
            userId={userId}
            vacio={vacio}
            reordenable={reordenable}
            onSelect={onSelectNote}
            onReorder={onReorderShared}
          />
        )}

        {/* Folders */}
        {folders.length > 0 && (
          <div data-carpetas-del-panel className="mt-1">
            {/* El rótulo sale siempre que hay carpetas: debajo de Archivo o de
                Compartidas, sin él, las carpetas parecían notas de esa lista. */}
            <p className="px-4 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70">
              Carpetas
            </p>
            {folders.map(folder => (
              <div key={folder.id}>
                <div
                  className={cn(
                    'group flex cursor-pointer items-center gap-2 px-3 py-2 text-sm hover:bg-muted/50 transition-colors',
                    activeFolderId === folder.id && 'bg-muted',
                  )}
                  data-carpeta={folder.id}
                  onClick={() => {
                    const r = alPulsarUnaCarpeta({ esLaActiva: activeFolderId === folder.id, estaPlegada: Boolean(collapsed[folder.id]) })
                    if (r.seleccionar) onSelectFolder(folder.id)
                    setCollapsed(p => ({ ...p, [folder.id]: r.plegada }))
                  }}
                >
                  <span className="text-muted-foreground">
                    {collapsed[folder.id] || activeFolderId !== folder.id
                      ? <ChevronRight className="h-3.5 w-3.5" />
                      : <ChevronDown className="h-3.5 w-3.5" />}
                  </span>
                  {activeFolderId === folder.id
                    ? <FolderOpen className="h-4 w-4 shrink-0" style={{ color: folder.color ?? undefined }} />
                    : <Folder className="h-4 w-4 shrink-0" style={{ color: folder.color ?? undefined }} />
                  }
                  <span className="flex-1 truncate text-sm">{folder.name}</span>
                  <span className="text-xs text-muted-foreground tabular-nums" title="Notas en la carpeta (sin las archivadas)">{folder._count.notes}</span>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        className={cn(MANDO_QUE_APARECE_AL_PASAR, 'flex h-5 w-5 items-center justify-center rounded hover:bg-muted')}
                        onClick={e => e.stopPropagation()}
                        title="Opciones de la carpeta"
                        aria-label="Opciones de la carpeta"
                        data-mas-opciones-de-la-carpeta
                      >
                        <MoreHorizontal className="h-3.5 w-3.5" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-40">
                      <DropdownMenuItem onClick={() => openEditFolder(folder)}>
                        <Pencil className="mr-2 h-3.5 w-3.5" /> Editar
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onClick={() => setCarpetaABorrar(folder)}
                      >
                        <Trash2 className="mr-2 h-3.5 w-3.5" /> Eliminar
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                {!collapsed[folder.id] && activeFolderId === folder.id && (
                  <SortableNoteList
                    notes={notes}
                    selectedId={selectedNoteId}
                    userId={userId}
                    vacio={vacio}
                    reordenable={reordenable}
                    onSelect={onSelectNote}
                    onDelete={onDeleteNote}
                    onTogglePin={onTogglePin}
                    carpetas={folders}
                    onMove={onMoveNote}
                    onReorder={onReorder}
                  />
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Folder dialog */}
      <Dialog open={folderDialog.open} onOpenChange={o => setFolderDialog(p => ({ ...p, open: o }))}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{folderDialog.editId ? 'Editar carpeta' : 'Nueva carpeta'}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-2">
            <div className="flex flex-col gap-1.5">
              <Label>Nombre</Label>
              <Input
                value={folderDialog.name}
                onChange={e => setFolderDialog(p => ({ ...p, name: e.target.value }))}
                placeholder="Nombre de la carpeta"
                onKeyDown={e => e.key === 'Enter' && handleFolderSubmit()}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label>Color</Label>
              <div className="flex flex-wrap gap-2">
                {FOLDER_COLORS.map(c => (
                  <button
                    key={c}
                    className={cn(
                      'h-6 w-6 rounded-full border-2 transition-transform hover:scale-110',
                      folderDialog.color === c ? 'border-foreground scale-110' : 'border-transparent',
                    )}
                    style={{ backgroundColor: c }}
                    aria-label={`Color ${c}`}
                    aria-pressed={folderDialog.color === c}
                    onClick={() => setFolderDialog(p => ({ ...p, color: c }))}
                  />
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFolderDialog(p => ({ ...p, open: false }))}>
              Cancelar
            </Button>
            <Button onClick={handleFolderSubmit} disabled={!folderDialog.name.trim()}>
              {folderDialog.editId ? 'Guardar' : 'Crear'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(carpetaABorrar)} onOpenChange={v => !v && setCarpetaABorrar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar la carpeta «{carpetaABorrar?.name}»?</AlertDialogTitle>
            <AlertDialogDescription>
              Sus notas no se borran: pasan a Sueltas, donde las encuentras sin carpeta.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              data-confirmar-eliminar-carpeta
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => { if (carpetaABorrar) onDeleteFolder(carpetaABorrar.id); setCarpetaABorrar(null) }}
            >
              Eliminar carpeta
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </aside>
  )
}
