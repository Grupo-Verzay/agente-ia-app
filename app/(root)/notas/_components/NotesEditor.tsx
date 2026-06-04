'use client'

import dynamic from 'next/dynamic'
import { useCallback, useEffect, useState } from 'react'
import {
  Archive, Check, Download, FileText, Loader2,
  PanelLeftClose, PanelLeftOpen, Pin, PinOff, Smile,
  Trash2, User, UserPlus, X, Maximize2, Minimize2,
} from 'lucide-react'
import { NoteContactPicker } from './NoteContactPicker'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
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

const NOTE_COLORS = [
  { value: null, label: 'Sin color', bg: 'bg-background' },
  { value: '#fef9c3', label: 'Amarillo', bg: 'bg-yellow-100' },
  { value: '#fce7f3', label: 'Rosa', bg: 'bg-pink-100' },
  { value: '#dcfce7', label: 'Verde', bg: 'bg-green-100' },
  { value: '#dbeafe', label: 'Azul', bg: 'bg-blue-100' },
  { value: '#ede9fe', label: 'Violeta', bg: 'bg-violet-100' },
  { value: '#ffedd5', label: 'Naranja', bg: 'bg-orange-100' },
  { value: '#f1f5f9', label: 'Gris', bg: 'bg-slate-100' },
]

const TEMPLATES = [
  {
    label: '📋 Reunión',
    title: 'Notas de reunión',
    content: { type: 'doc', content: [
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Reunión' }] },
      { type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Fecha:' }, { type: 'text', text: ' ' }] },
      { type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Participantes:' }, { type: 'text', text: ' ' }] },
      { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Puntos tratados' }] },
      { type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: ' ' }] }] }] },
      { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Acuerdos' }] },
      { type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: ' ' }] }] }] },
    ]},
  },
  {
    label: '📞 Seguimiento cliente',
    title: 'Seguimiento de cliente',
    content: { type: 'doc', content: [
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Seguimiento' }] },
      { type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Cliente:' }, { type: 'text', text: ' ' }] },
      { type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Fecha contacto:' }, { type: 'text', text: ' ' }] },
      { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Resumen' }] },
      { type: 'paragraph', content: [{ type: 'text', text: ' ' }] },
      { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Próximos pasos' }] },
      { type: 'taskList', content: [{ type: 'taskItem', attrs: { checked: false }, content: [{ type: 'paragraph', content: [{ type: 'text', text: ' ' }] }] }] },
    ]},
  },
  {
    label: '✅ Lista de tareas',
    title: 'Lista de tareas',
    content: { type: 'doc', content: [
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Tareas pendientes' }] },
      { type: 'taskList', content: [
        { type: 'taskItem', attrs: { checked: false }, content: [{ type: 'paragraph', content: [{ type: 'text', text: ' ' }] }] },
        { type: 'taskItem', attrs: { checked: false }, content: [{ type: 'paragraph', content: [{ type: 'text', text: ' ' }] }] },
        { type: 'taskItem', attrs: { checked: false }, content: [{ type: 'paragraph', content: [{ type: 'text', text: ' ' }] }] },
      ]},
    ]},
  },
]

interface Props {
  note: UserNoteWithContent
  saving: boolean
  sidebarOpen: boolean
  onSave: (content: object, title: string) => void
  onTogglePin: (id: string, isPinned: boolean) => void
  onDelete: (id: string) => void
  onArchive: (id: string) => void
  onEmojiChange: (id: string, emoji: string | null) => void
  onColorChange: (id: string, color: string | null) => void
  onContactChange: (id: string, contactJid: string | null, contactName: string | null) => void
  onToggleSidebar: () => void
  onApplyTemplate: (content: object, title: string) => void
}

function countWords(content: object): number {
  try {
    const text = JSON.stringify(content)
    const words = text.replace(/<[^>]*>/g, '').replace(/[^a-zA-ZáéíóúñÁÉÍÓÚÑ\s]/g, ' ').split(/\s+/).filter(w => w.length > 1)
    return words.length
  } catch {
    return 0
  }
}

function extractMarkdown(content: object): string {
  try {
    const doc = content as any
    if (!doc?.content) return ''
    const lines: string[] = []
    const processNode = (node: any): string => {
      if (!node) return ''
      if (node.type === 'text') {
        let t = node.text ?? ''
        if (node.marks?.some((m: any) => m.type === 'bold')) t = `**${t}**`
        if (node.marks?.some((m: any) => m.type === 'italic')) t = `*${t}*`
        if (node.marks?.some((m: any) => m.type === 'code')) t = `\`${t}\``
        return t
      }
      const children = (node.content ?? []).map(processNode).join('')
      if (node.type === 'heading') return `${'#'.repeat(node.attrs?.level ?? 1)} ${children}`
      if (node.type === 'paragraph') return children
      if (node.type === 'bulletList') return (node.content ?? []).map((li: any) => `- ${processNode(li)}`).join('\n')
      if (node.type === 'orderedList') return (node.content ?? []).map((li: any, i: number) => `${i + 1}. ${processNode(li)}`).join('\n')
      if (node.type === 'listItem') return children
      if (node.type === 'taskList') return (node.content ?? []).map((li: any) => `- [${li.attrs?.checked ? 'x' : ' '}] ${processNode(li)}`).join('\n')
      if (node.type === 'taskItem') return children
      if (node.type === 'blockquote') return `> ${children}`
      if (node.type === 'codeBlock') return `\`\`\`\n${children}\n\`\`\``
      if (node.type === 'horizontalRule') return '---'
      return children
    }
    doc.content.forEach((node: any) => lines.push(processNode(node)))
    return lines.join('\n\n')
  } catch {
    return ''
  }
}

export function NotesEditor({
  note, saving, sidebarOpen,
  onSave, onTogglePin, onDelete, onArchive, onEmojiChange,
  onColorChange, onContactChange, onToggleSidebar, onApplyTemplate,
}: Props) {
  const [title, setTitle] = useState(note.title)
  const [wordCount, setWordCount] = useState(0)
  const [focusMode, setFocusMode] = useState(false)
  const [contactPickerOpen, setContactPickerOpen] = useState(false)

  useEffect(() => {
    setWordCount(countWords(note.content as object))
  }, [note.content])

  const handleTitleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => setTitle(e.target.value), [])
  const handleTitleBlur = useCallback(() => onSave(note.content as object, title), [title, note.content, onSave])
  const handleTitleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
  }, [])
  const handleEditorChange = useCallback((content: object) => {
    setWordCount(countWords(content))
    onSave(content, title)
  }, [title, onSave])

  const handleExportMd = () => {
    const md = `# ${title}\n\n${extractMarkdown(note.content as object)}`
    const blob = new Blob([md], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${title.replace(/[^a-z0-9]/gi, '-')}.md`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleExportTxt = () => {
    const txt = `${title}\n\n${extractMarkdown(note.content as object)}`
    const blob = new Blob([txt], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${title.replace(/[^a-z0-9]/gi, '-')}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  const initialContent = note.content && typeof note.content === 'object' && 'type' in (note.content as object)
    ? note.content as object
    : undefined

  const noteColor = note.color ?? undefined

  return (
    <div
      className={cn(
        "flex h-full flex-col min-h-0 transition-all",
        focusMode && "fixed inset-0 z-50 bg-background",
      )}
      style={noteColor ? { backgroundColor: noteColor } : undefined}
    >
      {/* Toolbar */}
      <div className="flex items-center justify-between border-b border-border/70 px-4 py-2 shrink-0">
        <div className="flex items-center gap-1">
          {/* Toggle sidebar */}
          {!focusMode && (
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onToggleSidebar} title={sidebarOpen ? 'Ocultar panel' : 'Mostrar panel'}>
              {sidebarOpen ? <PanelLeftClose className="h-4 w-4 text-muted-foreground" /> : <PanelLeftOpen className="h-4 w-4 text-muted-foreground" />}
            </Button>
          )}

          {/* Emoji */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-lg">
                {note.emoji ? note.emoji : <Smile className="h-4 w-4 text-muted-foreground" />}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="p-2 w-64">
              <div className="grid grid-cols-10 gap-1">
                {EMOJI_LIST.map(e => (
                  <button key={e}
                    className={cn('flex h-7 w-7 items-center justify-center rounded text-base hover:bg-muted transition-colors', note.emoji === e && 'bg-muted ring-1 ring-border')}
                    onClick={() => onEmojiChange(note.id, note.emoji === e ? null : e)}
                  >{e}</button>
                ))}
              </div>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Color */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8" title="Color de nota">
                <div className={cn('h-4 w-4 rounded-full border border-border', note.color ? '' : 'bg-muted')} style={note.color ? { backgroundColor: note.color } : undefined} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="p-2 w-48">
              <div className="grid grid-cols-4 gap-1.5">
                {NOTE_COLORS.map(c => (
                  <button key={String(c.value)}
                    title={c.label}
                    className={cn('h-8 w-full rounded border-2 transition-transform hover:scale-105', note.color === c.value ? 'border-foreground scale-105' : 'border-transparent', c.bg)}
                    onClick={() => onColorChange(note.id, c.value)}
                  />
                ))}
              </div>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Save status */}
          <div className="flex items-center gap-1 text-xs text-muted-foreground ml-1">
            {saving
              ? <><Loader2 className="h-3 w-3 animate-spin" /> Guardando...</>
              : <><Check className="h-3 w-3 text-emerald-500" /> Guardado</>
            }
          </div>
        </div>

        <div className="flex items-center gap-0.5">
          {/* Vincular contacto */}
          {note.contactName ? (
            <div className="flex items-center gap-1 text-xs text-blue-600 border border-blue-200 rounded-full px-2 py-0.5">
              <User className="h-3 w-3" />
              <span className="max-w-[80px] truncate">{note.contactName}</span>
              <button onClick={() => onContactChange(note.id, null, null)} className="hover:text-destructive">
                <X className="h-3 w-3" />
              </button>
            </div>
          ) : (
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setContactPickerOpen(true)} title="Vincular contacto">
              <UserPlus className="h-4 w-4 text-muted-foreground" />
            </Button>
          )}

          {/* Templates */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8" title="Templates">
                <FileText className="h-4 w-4 text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              {TEMPLATES.map(t => (
                <DropdownMenuItem key={t.label} onClick={() => onApplyTemplate(t.content, t.title)}>
                  {t.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Exportar */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8" title="Exportar">
                <Download className="h-4 w-4 text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
              <DropdownMenuItem onClick={handleExportMd}>
                Markdown (.md)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleExportTxt}>
                Texto (.txt)
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Modo enfoque */}
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setFocusMode(v => !v)} title={focusMode ? 'Salir del modo enfoque' : 'Modo enfoque'}>
            {focusMode ? <Minimize2 className="h-4 w-4 text-muted-foreground" /> : <Maximize2 className="h-4 w-4 text-muted-foreground" />}
          </Button>

          {/* Pin */}
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onTogglePin(note.id, note.isPinned)} title={note.isPinned ? 'Desfijar' : 'Fijar'}>
            {note.isPinned ? <PinOff className="h-4 w-4 text-amber-500" /> : <Pin className="h-4 w-4 text-amber-500" />}
          </Button>

          {/* Archivar */}
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onArchive(note.id)} title="Archivar nota">
            <Archive className="h-4 w-4 text-muted-foreground" />
          </Button>

          {/* Eliminar */}
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8" title="Eliminar nota">
                <Trash2 className="h-4 w-4 text-red-500" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>¿Eliminar nota?</AlertDialogTitle>
                <AlertDialogDescription>Esta acción no se puede deshacer.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => onDelete(note.id)}>
                  Eliminar
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      {/* Title */}
      <div className="px-8 pt-2 pb-0 shrink-0">
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
      <div className="flex-1 min-h-0 overflow-hidden px-4 pb-2">
        <TiptapEditor key={note.id} initialContent={initialContent} onChange={handleEditorChange} />
      </div>

      {/* Footer: word count + contact link */}
      <div className="flex items-center justify-between px-8 py-1 border-t border-border/40 shrink-0 text-xs text-muted-foreground">
        <span>{wordCount} palabras</span>
        {note.contactJid && (
          <button
            onClick={() => window.location.href = `/chats?jid=${encodeURIComponent(note.contactJid!)}`}
            className="flex items-center gap-1 text-blue-600 hover:underline"
          >
            <User className="h-3 w-3" />
            {note.contactName ?? note.contactJid}
          </button>
        )}
      </div>

      <NoteContactPicker
        open={contactPickerOpen}
        onClose={() => setContactPickerOpen(false)}
        onSelect={(jid, name) => onContactChange(note.id, jid, name)}
        userId={(note as any).userId}
      />
    </div>
  )
}
