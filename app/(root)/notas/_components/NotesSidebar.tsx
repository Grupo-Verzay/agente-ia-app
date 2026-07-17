'use client'

import { useState } from 'react'
import {
  ChevronDown, ChevronRight, FileText, Folder, FolderOpen,
  MoreHorizontal, Pin, PinOff, Plus, Search, Trash2, Pencil, FolderPlus,
  Eye, Users,
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
import type { NoteFolderWithCount, UserNoteListItem, SharedNoteListItem } from '@/actions/notes-actions'
import { SortableNoteList } from './SortableNoteList'

const FOLDER_COLORS = [
  '#6366f1', '#ec4899', '#f59e0b', '#10b981', '#3b82f6',
  '#8b5cf6', '#ef4444', '#14b8a6', '#f97316', '#84cc16',
]

interface Props {
  className?: string
  folders: NoteFolderWithCount[]
  notes: UserNoteListItem[]
  sharedNotes: SharedNoteListItem[]
  selectedNoteId?: string
  activeFolderId: string | null | undefined
  search: string
  userId: string
  onSearchChange: (v: string) => void
  onSelectNote: (id: string) => void
  onNewNote: () => void
  onDeleteNote: (id: string) => void
  onTogglePin: (id: string, isPinned: boolean) => void
  onReorder: (notes: UserNoteListItem[]) => void
  onSelectFolder: (folderId: string | null | undefined) => void
  onCreateFolder: (name: string, color?: string) => void
  onUpdateFolder: (id: string, payload: { name?: string; color?: string }) => void
  onDeleteFolder: (id: string) => void
}

export function NotesSidebar({
  className,
  folders, notes, sharedNotes, selectedNoteId, activeFolderId, search, userId,
  onSearchChange, onSelectNote, onNewNote, onDeleteNote, onTogglePin, onReorder,
  onSelectFolder, onCreateFolder, onUpdateFolder, onDeleteFolder,
}: Props) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [folderDialog, setFolderDialog] = useState<{
    open: boolean; editId?: string; name: string; color: string
  }>({ open: false, name: '', color: FOLDER_COLORS[0] })

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

  const tabValue = activeFolderId === undefined ? 'todas'
    : activeFolderId === null ? 'sin'
    : activeFolderId === '__archived__' ? 'archivadas'
    : activeFolderId === '__shared__' ? 'compartidas'
    : 'folder'

  return (
    <aside className={cn('flex w-full min-w-0 max-w-none flex-col border-r border-border bg-background md:w-72 md:min-w-[240px] md:max-w-xs', className)}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border">
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

      {/* Filter tabs */}
      <div className="px-3 py-2 border-b border-border">
        <Tabs value={tabValue}>
          <TabsList className="h-7 w-full">
            <TabsTrigger value="todas" className="flex-1 text-xs h-5" onClick={() => onSelectFolder(undefined)}>
              Todas
            </TabsTrigger>
            <TabsTrigger value="sin" className="flex-1 text-xs h-5" onClick={() => onSelectFolder(null)}>
              Sin carpeta
            </TabsTrigger>
            <TabsTrigger value="compartidas" className="flex-1 text-xs h-5 gap-1" onClick={() => onSelectFolder('__shared__')}>
              <Users className="h-3 w-3" />
              {sharedNotes.length > 0 && <span>{sharedNotes.length}</span>}
              <span className="hidden lg:inline">Compartidas</span>
            </TabsTrigger>
            <TabsTrigger value="archivadas" className="flex-1 text-xs h-5" onClick={() => onSelectFolder('__archived__')}>
              Archivadas
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Search */}
      <div className="px-3 py-1.5 border-b border-border">
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
        {(activeFolderId === undefined || activeFolderId === null) && (
          <SortableNoteList
            notes={notes}
            selectedId={selectedNoteId}
            userId={userId}
            onSelect={onSelectNote}
            onDelete={onDeleteNote}
            onTogglePin={onTogglePin}
            onReorder={onReorder}
          />
        )}

        {/* Archived notes list */}
        {activeFolderId === '__archived__' && (
          <SortableNoteList
            notes={notes}
            selectedId={selectedNoteId}
            userId={userId}
            onSelect={onSelectNote}
            onDelete={onDeleteNote}
            onTogglePin={onTogglePin}
            onReorder={onReorder}
          />
        )}

        {/* Shared-with-me notes list (solo lectura de acciones: no reordenar/eliminar) */}
        {activeFolderId === '__shared__' && (
          <SharedNotesList
            notes={sharedNotes}
            selectedId={selectedNoteId}
            onSelect={onSelectNote}
          />
        )}

        {/* Folders */}
        {folders.length > 0 && (
          <div className="mt-1">
            {(activeFolderId === undefined || activeFolderId === null) && (
              <p className="px-4 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70">
                Carpetas
              </p>
            )}
            {folders.map(folder => (
              <div key={folder.id}>
                <div
                  className={cn(
                    'group flex cursor-pointer items-center gap-2 px-3 py-2 text-sm hover:bg-muted/50 transition-colors',
                    activeFolderId === folder.id && 'bg-muted',
                  )}
                  onClick={() => {
                    onSelectFolder(folder.id)
                    setCollapsed(p => ({ ...p, [folder.id]: !p[folder.id] }))
                  }}
                >
                  <span className="text-muted-foreground">
                    {collapsed[folder.id]
                      ? <ChevronRight className="h-3.5 w-3.5" />
                      : <ChevronDown className="h-3.5 w-3.5" />}
                  </span>
                  {activeFolderId === folder.id
                    ? <FolderOpen className="h-4 w-4 shrink-0" style={{ color: folder.color ?? undefined }} />
                    : <Folder className="h-4 w-4 shrink-0" style={{ color: folder.color ?? undefined }} />
                  }
                  <span className="flex-1 truncate text-sm">{folder.name}</span>
                  <span className="text-xs text-muted-foreground">{folder._count.notes}</span>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        className="invisible group-hover:visible flex h-5 w-5 items-center justify-center rounded hover:bg-muted"
                        onClick={e => e.stopPropagation()}
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
                        onClick={() => onDeleteFolder(folder.id)}
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
                    onSelect={onSelectNote}
                    onDelete={onDeleteNote}
                    onTogglePin={onTogglePin}
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
        <DialogContent className="sm:max-w-sm max-h-[585px]">
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
    </aside>
  )
}

function SharedNotesList({ notes, selectedId, onSelect }: {
  notes: SharedNoteListItem[]
  selectedId?: string
  onSelect: (id: string) => void
}) {
  if (notes.length === 0) {
    return (
      <div className="px-4 py-6 text-center text-xs text-muted-foreground">
        Aún no te han compartido notas.
      </div>
    )
  }
  return (
    <ul>
      {notes.map(note => (
        <li key={note.id}>
          <div
            className={cn(
              'group relative flex cursor-pointer flex-col gap-0.5 px-4 py-2.5 transition-colors border-b border-border/40 hover:bg-muted/50',
              selectedId === note.id && 'bg-muted border-l-2 border-l-primary',
            )}
            onClick={() => onSelect(note.id)}
          >
            <div className="flex items-center gap-1.5 pr-6 min-w-0">
              {note.emoji
                ? <span className="text-sm shrink-0">{note.emoji}</span>
                : <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              }
              <span className="truncate text-sm font-medium leading-snug">
                {note.title || 'Sin título'}
              </span>
              {note.canEdit
                ? <Pencil className="h-3 w-3 shrink-0 text-emerald-500" aria-label="Puede editar" />
                : <Eye className="h-3 w-3 shrink-0 text-amber-500" aria-label="Solo lectura" />
              }
            </div>
            <span className="text-[11px] text-muted-foreground pl-5 truncate">
              de {note.ownerName ?? 'otra cuenta'}
            </span>
          </div>
        </li>
      ))}
    </ul>
  )
}

function NoteList({ notes, selectedId, onSelect, onDelete, onTogglePin, indent }: {
  notes: UserNoteListItem[]
  selectedId?: string
  onSelect: (id: string) => void
  onDelete: (id: string) => void
  onTogglePin: (id: string, isPinned: boolean) => void
  indent?: boolean
}) {
  if (notes.length === 0) {
    return (
      <div className={cn('px-4 py-4 text-xs text-muted-foreground', indent && 'pl-8')}>
        Sin notas aquí
      </div>
    )
  }
  return (
    <ul>
      {notes.map(note => (
        <li key={note.id}>
          <div
            className={cn(
              'group relative flex cursor-pointer flex-col gap-0.5 px-4 py-2.5 transition-colors border-b border-border/40',
              'hover:bg-muted/50',
              selectedId === note.id && 'bg-muted border-l-2 border-l-primary',
              indent && 'pl-8',
            )}
            onClick={() => onSelect(note.id)}
          >
            <div className="flex items-center gap-1.5 pr-6 min-w-0">
              {note.emoji
                ? <span className="text-sm shrink-0">{note.emoji}</span>
                : <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              }
              <span className="truncate text-sm font-medium leading-snug">
                {note.title || 'Sin título'}
              </span>
              {note.isPinned && <Pin className="h-3 w-3 shrink-0 text-muted-foreground/60" />}
            </div>
            <span className="text-[11px] text-muted-foreground pl-5">
              {new Date(note.updatedAt).toLocaleDateString('es', {
                day: 'numeric', month: 'short', year: 'numeric',
              })}
            </span>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="invisible group-hover:visible absolute right-2 top-2.5 flex h-6 w-6 items-center justify-center rounded hover:bg-background"
                  onClick={e => e.stopPropagation()}
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
        </li>
      ))}
    </ul>
  )
}
