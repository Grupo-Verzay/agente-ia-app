'use client'

import dynamic from 'next/dynamic'
import { useCallback, useState } from 'react'
import { Check, Loader2, Pin, PinOff, Smile, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { cn } from '@/lib/utils'
import type { UserNoteWithContent } from '@/actions/notes-actions'

const TiptapEditor = dynamic(
  () => import('./BlockNoteEditorInner'),
  { ssr: false, loading: () => <div className="flex flex-1 items-center justify-center text-muted-foreground text-sm">Cargando editor...</div> }
)

const EMOJI_LIST = [
  '📝','📌','💡','🔖','⭐','🎯','📊','💼','🗒️','📋',
  '🔑','💬','🚀','✅','❤️','🌟','🎨','📚','🔍','⚡',
  '🌱','🏆','💎','🎉','🔔','📅','🌙','☀️','🌊','🎵',
]

interface Props {
  note: UserNoteWithContent
  saving: boolean
  onSave: (content: object, title: string) => void
  onTogglePin: (id: string, isPinned: boolean) => void
  onDelete: (id: string) => void
  onEmojiChange: (id: string, emoji: string | null) => void
}

export function NotesEditor({ note, saving, onSave, onTogglePin, onDelete, onEmojiChange }: Props) {
  const [title, setTitle] = useState(note.title)

  const handleTitleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setTitle(e.target.value)
  }, [])

  const handleTitleBlur = useCallback(() => {
    onSave(note.content as object, title)
  }, [title, note.content, onSave])

  const handleTitleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
  }, [])

  const handleEditorChange = useCallback((content: object) => {
    onSave(content, title)
  }, [title, onSave])

  const initialContent = note.content && typeof note.content === 'object' && 'type' in (note.content as object)
    ? note.content as object
    : undefined

  return (
    <div className="flex h-full flex-col min-h-0">
      {/* Toolbar */}
      <div className="flex items-center justify-between border-b border-border/70 px-4 py-2 shrink-0">
        <div className="flex items-center gap-2">
          {/* Emoji picker */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-lg" title="Cambiar emoji">
                {note.emoji ? note.emoji : <Smile className="h-4 w-4 text-muted-foreground" />}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="p-2 w-64">
              <div className="grid grid-cols-10 gap-1">
                {EMOJI_LIST.map(e => (
                  <button
                    key={e}
                    className={cn(
                      'flex h-7 w-7 items-center justify-center rounded text-base hover:bg-muted transition-colors',
                      note.emoji === e && 'bg-muted ring-1 ring-border',
                    )}
                    onClick={() => onEmojiChange(note.id, note.emoji === e ? null : e)}
                  >
                    {e}
                  </button>
                ))}
              </div>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Save status */}
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            {saving
              ? <><Loader2 className="h-3 w-3 animate-spin" /> Guardando...</>
              : <><Check className="h-3 w-3 text-emerald-500" /> Guardado</>
            }
          </div>
        </div>

        <div className="flex items-center gap-1">
          <Button
            variant="ghost" size="icon" className="h-8 w-8"
            onClick={() => onTogglePin(note.id, note.isPinned)}
            title={note.isPinned ? 'Desfijar' : 'Fijar'}
          >
            {note.isPinned
              ? <PinOff className="h-4 w-4 text-muted-foreground" />
              : <Pin className="h-4 w-4 text-muted-foreground" />
            }
          </Button>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8" title="Eliminar nota">
                <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>¿Eliminar nota?</AlertDialogTitle>
                <AlertDialogDescription>
                  Esta acción no se puede deshacer. La nota se eliminará permanentemente.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  onClick={() => onDelete(note.id)}
                >
                  Eliminar
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      {/* Title */}
      <div className="px-8 pt-6 pb-2 shrink-0">
        <Input
          value={title}
          onChange={handleTitleChange}
          onBlur={handleTitleBlur}
          onKeyDown={handleTitleKeyDown}
          placeholder="Sin título"
          className="border-none bg-transparent text-2xl font-bold shadow-none ring-0 focus-visible:ring-0 focus-visible:ring-offset-0 p-0 h-auto placeholder:text-muted-foreground/40"
        />
      </div>

      {/* Editor */}
      <div className="flex-1 min-h-0 overflow-hidden px-4 pb-4">
        <TiptapEditor
          key={note.id}
          initialContent={initialContent}
          onChange={handleEditorChange}
        />
      </div>
    </div>
  )
}
