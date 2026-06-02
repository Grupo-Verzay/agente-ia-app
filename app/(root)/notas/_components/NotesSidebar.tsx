'use client'

import { useState } from 'react'
import {
  ChevronDown, ChevronRight, FileText, Folder, FolderOpen,
  MoreHorizontal, Pin, PinOff, Plus, Search, Trash2, Pencil,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import type { NoteFolderWithCount, UserNoteListItem } from '@/actions/notes-actions'

const FOLDER_COLORS = [
  '#6366f1', '#ec4899', '#f59e0b', '#10b981', '#3b82f6',
  '#8b5cf6', '#ef4444', '#14b8a6', '#f97316', '#84cc16',
]

interface Props {
  folders: NoteFolderWithCount[]
  notes: UserNoteListItem[]
  selectedNoteId?: string
  activeFolderId: string | null | undefined
  search: string
  onSearchChange: (v: string) => void
  onSelectNote: (id: string) => void
  onNewNote: () => void
  onDeleteNote: (id: string) => void
  onTogglePin: (id: string, isPinned: boolean) => void
  onSelectFolder: (folderId: string | null | undefined) => void
  onCreateFolder: (name: string, color?: string) => void
  onUpdateFolder: (id: string, payload: { name?: string; color?: string }) => void
  onDeleteFolder: (id: string) => void
}

export function NotesSidebar({
  folders, notes, selectedNoteId, activeFolderId, search,
  onSearchChange, onSelectNote, onNewNote, onDeleteNote, onTogglePin,
  onSelectFolder, onCreateFolder, onUpdateFolder, onDeleteFolder,
}: Props) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [folderDialog, setFolderDialog] = useState<{ open: boolean; editId?: string; name: string; color: string }>({
    open: false, name: '', color: FOLDER_COLORS[0],
  })

  const toggleCollapse = (id: string) => setCollapsed(p => ({ ...p, [id]: !p[id] }))

  const openNewFolder = () => setFolderDialog({ open: true, name: '', color: FOLDER_COLORS[0] })
  const openEditFolder = (f: NoteFolderWithCount) =>
    setFolderDialog({ open: true, editId: f.id, name: f.name, color: f.color ?? FOLDER_COLORS[0] })

  const handleFolderSubmit = () => {
    if (!folderDialog.name.trim()) return
    if (folderDialog.editId) {
      onUpdateFolder(folderDialog.editId, { name: folderDialog.name, color: folderDialog.color })
    } else {
      onCreateFolder(folderDialog.name, folderDialog.color)
    }
    setFolderDialog({ open: false, name: '', color: FOLDER_COLORS[0] })
  }

  return (
    <aside className="flex w-72 min-w-[240px] max-w-xs flex-col border-r border-border/70 bg-background">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border/70 px-3 py-2.5">
        <span className="text-sm font-semibold text-foreground">Notas</span>
        <div className="flex gap-1">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={openNewFolder} title="Nueva carpeta">
            <Folder className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onNewNote} title="Nueva nota">
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Search */}
      <div className="px-3 py-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Buscar notas..."
            value={search}
            onChange={e => onSearchChange(e.target.value)}
            className="h-8 pl-8 text-xs w-72"
          />
        </div>
      </div>

      {/* Note list */}
      <div className="flex-1 overflow-y-auto">
        {/* All notes */}
        <SectionHeader
          label="TODAS"
          active={activeFolderId === undefined}
          onClick={() => onSelectFolder(undefined)}
        />

        {activeFolderId === undefined && (
          <NoteList
            notes={notes}
            selectedId={selectedNoteId}
            onSelect={onSelectNote}
            onDelete={onDeleteNote}
            onTogglePin={onTogglePin}
          />
        )}

        {/* Unfiled */}
        <SectionHeader
          label="SIN CARPETA"
          active={activeFolderId === null}
          onClick={() => onSelectFolder(null)}
        />
        {activeFolderId === null && (
          <NoteList
            notes={notes}
            selectedId={selectedNoteId}
            onSelect={onSelectNote}
            onDelete={onDeleteNote}
            onTogglePin={onTogglePin}
          />
        )}

        {/* Folders */}
        {folders.map(folder => (
          <div key={folder.id}>
            <div
              className={cn(
                'group flex cursor-pointer items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted/50 transition-colors',
                activeFolderId === folder.id && 'bg-muted text-foreground',
              )}
              onClick={() => {
                onSelectFolder(folder.id)
                toggleCollapse(folder.id)
              }}
            >
              <span onClick={e => { e.stopPropagation(); toggleCollapse(folder.id) }} className="flex items-center">
                {collapsed[folder.id]
                  ? <ChevronRight className="h-3 w-3 mr-0.5" />
                  : <ChevronDown className="h-3 w-3 mr-0.5" />}
              </span>
              {activeFolderId === folder.id
                ? <FolderOpen className="h-3.5 w-3.5 shrink-0" style={{ color: folder.color ?? undefined }} />
                : <Folder className="h-3.5 w-3.5 shrink-0" style={{ color: folder.color ?? undefined }} />
              }
              <span className="flex-1 truncate uppercase tracking-wide">{folder.name}</span>
              <span className="text-[10px] opacity-60">{folder._count.notes}</span>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    className="invisible group-hover:visible flex h-5 w-5 items-center justify-center rounded hover:bg-muted"
                    onClick={e => e.stopPropagation()}
                  >
                    <MoreHorizontal className="h-3 w-3" />
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
              <NoteList
                notes={notes}
                selectedId={selectedNoteId}
                onSelect={onSelectNote}
                onDelete={onDeleteNote}
                onTogglePin={onTogglePin}
              />
            )}
          </div>
        ))}
      </div>

      {/* Folder dialog */}
      <Dialog open={folderDialog.open} onOpenChange={o => setFolderDialog(p => ({ ...p, open: o }))}>
        <DialogContent className="sm:max-w-sm h-[585px]">
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
            <div className="flex flex-col gap-1.5">
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

function SectionHeader({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      className={cn(
        'w-full px-3 py-1.5 text-left text-[10px] font-semibold tracking-widest uppercase text-muted-foreground hover:bg-muted/50 transition-colors',
        active && 'bg-muted text-foreground',
      )}
      onClick={onClick}
    >
      {label}
    </button>
  )
}

function NoteList({ notes, selectedId, onSelect, onDelete, onTogglePin }: {
  notes: UserNoteListItem[]
  selectedId?: string
  onSelect: (id: string) => void
  onDelete: (id: string) => void
  onTogglePin: (id: string, isPinned: boolean) => void
}) {
  if (notes.length === 0) {
    return <p className="px-4 py-3 text-xs text-muted-foreground">Sin notas</p>
  }
  return (
    <ul>
      {notes.map(note => (
        <li key={note.id}>
          <div
            className={cn(
              'group relative flex cursor-pointer flex-col gap-0.5 px-3 py-2.5 hover:bg-muted/50 transition-colors border-b border-border/30',
              selectedId === note.id && 'bg-muted',
            )}
            onClick={() => onSelect(note.id)}
          >
            <div className="flex items-center gap-1.5 pr-6">
              {note.emoji
                ? <span className="text-sm leading-none">{note.emoji}</span>
                : <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              }
              <span className="truncate text-sm font-medium">{note.title || 'Sin título'}</span>
              {note.isPinned && <Pin className="h-3 w-3 shrink-0 text-muted-foreground" />}
            </div>
            <span className="text-[11px] text-muted-foreground pl-5">
              {new Date(note.updatedAt).toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' })}
            </span>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="invisible group-hover:visible absolute right-2 top-2.5 flex h-6 w-6 items-center justify-center rounded hover:bg-muted"
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
