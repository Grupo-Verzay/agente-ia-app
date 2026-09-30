'use client'

import dynamic from 'next/dynamic'
import { useCallback, useEffect, useState } from 'react'
import {
  Archive, ArchiveRestore, ArrowLeft, Check, Download, FileText, Loader2,
  PanelLeftClose, PanelLeftOpen, Pin, PinOff, Smile,
  Trash2, User, UserPlus, X, Maximize2, Minimize2, Users, Eye,
} from 'lucide-react'
import { NoteContactPicker } from './NoteContactPicker'
import { ShareNoteDialog } from './ShareNoteDialog'
import { AuditHistoryButton } from '@/components/shared/AuditHistoryButton'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
// El walker de tiptap a markdown vive en `lib/exportar-documento.ts`: lo usan
// esta pantalla y Documentacion, que comparten el MISMO editor. Con una copia
// en cada una, el dia que se afine como sale una lista de tareas se afina en
// una y la otra se queda atras.
import { comoMarkdown, comoTextoPlano, cuerpoComoTexto, nombreDeArchivo } from '@/lib/exportar-documento'
import { elMandoDeArchivo } from '@/lib/archivo-de-notas'
import { contarPalabras, elRotuloDePalabras, PLACEHOLDER_DE_LA_NOTA } from '@/lib/pantalla-de-notas'
import type { UserNoteWithContent } from '@/actions/notes-actions'

const TiptapEditor = dynamic(
  // Compartido con Documentacion: una sola barra de herramientas y un solo
  // juego de estilos. Con dos copias, el dia que se afine una la otra se queda
  // atras, y eso no se ve como un error sino como «en Notas va distinto».
  () => import('@/components/shared/EditorDeTexto'),
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
  /** Cuenta que ve la nota (para el diálogo de compartir). */
  currentUserId: string
  /** Puede editar (dueño o compartida con permiso de edición). */
  canEdit: boolean
  /** Es el dueño de la nota (controles de compartir/archivar/eliminar). */
  isOwner: boolean
  /** Nombre de quien la comparte, cuando NO es propia. */
  ownerName: string | null
  onSave: (content: object, title: string) => void
  onTogglePin: (id: string, isPinned: boolean) => void
  onDelete: (id: string) => void
  /** Archiva o desarchiva según `note.isArchived`: un mando, dos caras. */
  onToggleArchive: (id: string, estaArchivada: boolean) => void
  onEmojiChange: (id: string, emoji: string | null) => void
  onColorChange: (id: string, color: string | null) => void
  onContactChange: (id: string, contactJid: string | null, contactName: string | null) => void
  onToggleSidebar: () => void
  onBackToList: () => void
  onApplyTemplate: (content: object, title: string) => void
}

// Las palabras que se ESCRIBIERON. Lo de antes contaba el JSON entero del
// editor —«type», «doc», «paragraph», «content»…—, así que una nota vacía ya
// decía unas cuantas palabras y cada párrafo sumaba tres de más. El texto sale
// del mismo aplanado que Exportar (`cuerpoComoTexto`), sin marcas.
function countWords(content: object): number {
  try {
    return contarPalabras(cuerpoComoTexto(content, false))
  } catch {
    return 0
  }
}


export function NotesEditor({
  note, saving, sidebarOpen, currentUserId, canEdit, isOwner, ownerName,
  onSave, onTogglePin, onDelete, onToggleArchive, onEmojiChange,
  onColorChange, onContactChange, onToggleSidebar, onBackToList, onApplyTemplate,
}: Props) {
  const [title, setTitle] = useState(note.title)
  const [wordCount, setWordCount] = useState(0)
  const [focusMode, setFocusMode] = useState(false)
  const [contactPickerOpen, setContactPickerOpen] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)

  useEffect(() => {
    setWordCount(countWords(note.content as object))
  }, [note.content])

  const handleTitleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (!canEdit) return
    setTitle(e.target.value.toUpperCase())
  }, [canEdit])
  // Salir del título solo guarda si el título CAMBIÓ: si no, cada clic fuera
  // del campo mandaba la nota entera al servidor y la barra decía «Guardando…»
  // sin que nadie hubiera tocado nada.
  const handleTitleBlur = useCallback(() => { if (canEdit && title !== note.title) onSave(note.content as object, title) }, [canEdit, title, note.title, note.content, onSave])
  const handleTitleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
  }, [])
  const handleEditorChange = useCallback((content: object) => {
    setWordCount(countWords(content))
    if (canEdit) onSave(content, title)
  }, [canEdit, title, onSave])

  const bajar = (texto: string, tipo: string, extension: 'md' | 'txt') => {
    const blob = new Blob([texto], { type: tipo })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = nombreDeArchivo(title, extension)
    a.click()
    URL.revokeObjectURL(url)
  }

  const doc = { titulo: title, contenido: note.content }
  const handleExportMd = () => bajar(comoMarkdown(doc), 'text/markdown', 'md')
  const handleExportTxt = () => bajar(comoTextoPlano(doc), 'text/plain', 'txt')

  const initialContent = note.content && typeof note.content === 'object' && 'type' in (note.content as object)
    ? note.content as object
    : undefined

  const noteColor = note.color ?? undefined
  const mandoDeArchivo = elMandoDeArchivo(note.isArchived)

  return (
    <div
      data-nota-abierta
      className={cn(
        "flex h-full flex-col min-h-0 transition-all",
        focusMode && "fixed inset-0 z-50 bg-background",
      )}
      style={noteColor ? { backgroundColor: noteColor } : undefined}
    >
      {/* Toolbar */}
      <div data-barra-de-la-nota className="flex items-center justify-between border-b border-border/70 px-4 py-2 shrink-0">
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-8 w-8 md:hidden" onClick={onBackToList} title="Volver a notas">
            <ArrowLeft className="h-4 w-4 text-muted-foreground" />
          </Button>

          {/* Toggle sidebar */}
          {!focusMode && (
            <Button variant="ghost" size="icon" className="hidden h-8 w-8 md:inline-flex" onClick={onToggleSidebar} title={sidebarOpen ? 'Ocultar panel' : 'Mostrar panel'}>
              {sidebarOpen ? <PanelLeftClose className="h-4 w-4 text-muted-foreground" /> : <PanelLeftOpen className="h-4 w-4 text-muted-foreground" />}
            </Button>
          )}

          {isOwner && (
            <>
              {/* Emoji */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-lg" title="Icono de la nota" aria-label="Icono de la nota">
                    {note.emoji ? note.emoji : <Smile className="h-4 w-4 text-muted-foreground" />}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="p-2 w-64">
                  {/* Cada icono es un ELEMENTO del menú, no un botón suelto dentro:
                      así elegir uno cierra el menú —antes se quedaba abierto
                      encima de la nota— y se recorren con las flechas. */}
                  <div className="grid grid-cols-10 gap-1">
                    {EMOJI_LIST.map(e => (
                      <DropdownMenuItem key={e}
                        aria-label={e}
                        className={cn('h-7 w-7 justify-center rounded p-0 text-base', note.emoji === e && 'bg-muted ring-1 ring-border')}
                        onSelect={() => onEmojiChange(note.id, note.emoji === e ? null : e)}
                      >{e}</DropdownMenuItem>
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
                      <DropdownMenuItem key={String(c.value)}
                        title={c.label}
                        aria-label={c.label}
                        className={cn('h-8 rounded border-2 p-0.5', note.color === c.value ? 'border-foreground' : 'border-transparent')}
                        onSelect={() => onColorChange(note.id, c.value)}
                      >
                        <span className={cn('h-full w-full rounded-sm ring-1 ring-inset ring-black/5', c.bg)} />
                      </DropdownMenuItem>
                    ))}
                  </div>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          )}

          {/* Estado / permiso */}
          {canEdit ? (
            <div data-estado-de-guardado className="flex items-center gap-1 text-xs text-muted-foreground ml-1">
              {saving
                ? <><Loader2 className="h-3 w-3 animate-spin" /><span className="hidden sm:inline">Guardando...</span></>
                : <><Check className="h-3 w-3 text-emerald-500" /><span className="hidden sm:inline">Guardado</span></>
              }
            </div>
          ) : (
            <div data-estado-de-guardado className="flex items-center gap-1 text-xs text-amber-600 ml-1" title="No puedes editar esta nota">
              <Eye className="h-3.5 w-3.5" /><span className="hidden sm:inline">Solo lectura</span>
            </div>
          )}

          {/* Compartida por (cuando no es propia) */}
          {!isOwner && ownerName && (
            <div data-de-quien-es className="hidden md:flex items-center gap-1 text-xs text-muted-foreground ml-2 border border-border rounded-full px-2 py-0.5">
              <Users className="h-3 w-3" />
              <span className="max-w-[120px] truncate">de {ownerName}</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-0.5">
          {isOwner && (
            <>
              {/* Compartir con el equipo */}
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setShareOpen(true)} title="Compartir con el equipo">
                <Users className="h-4 w-4 text-muted-foreground" />
              </Button>

              {/* Vincular contacto */}
              {note.contactName ? (
                <div data-contacto-de-la-nota className="flex items-center gap-1 text-xs text-blue-600 border border-blue-200 rounded-full px-2 py-0.5">
                  <User className="h-3 w-3" />
                  <span className="max-w-[80px] truncate">{note.contactName}</span>
                  <button onClick={() => onContactChange(note.id, null, null)} className="hover:text-destructive" title="Quitar contacto" aria-label="Quitar contacto">
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ) : (
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setContactPickerOpen(true)} title="Vincular contacto">
                  <UserPlus className="h-4 w-4 text-muted-foreground" />
                </Button>
              )}

              {/* Plantillas: crean una nota NUEVA con esa forma, no tocan la abierta. */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8" title="Nueva nota desde plantilla" aria-label="Nueva nota desde plantilla">
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
            </>
          )}

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

          {isOwner && (
            <>
              <AuditHistoryButton entityType="note" entityId={note.id} />

              {/* Pin */}
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onTogglePin(note.id, note.isPinned)} title={note.isPinned ? 'Desfijar' : 'Fijar'}>
                {note.isPinned ? <PinOff className="h-4 w-4 text-amber-500" /> : <Pin className="h-4 w-4 text-amber-500" />}
              </Button>

              {/* Archivar / Desarchivar: el mismo botón en el mismo sitio. */}
              <Button
                variant="ghost" size="icon" className="h-8 w-8"
                data-mando-archivo={mandoDeArchivo.accion}
                onClick={() => onToggleArchive(note.id, note.isArchived)}
                title={mandoDeArchivo.titulo}
                aria-label={mandoDeArchivo.titulo}
              >
                {mandoDeArchivo.accion === 'desarchivar'
                  ? <ArchiveRestore className="h-4 w-4 text-muted-foreground" />
                  : <Archive className="h-4 w-4 text-muted-foreground" />}
              </Button>

              {/* Eliminar: la confirmación es UNA y vive en NotesClient, la misma
                  que la del menú «⋯» de la lista. */}
              <Button variant="ghost" size="icon" className="h-8 w-8" title="Eliminar nota" aria-label="Eliminar nota" onClick={() => onDelete(note.id)}>
                <Trash2 className="h-4 w-4 text-red-500" />
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Title */}
      <div data-titulo-de-la-nota className="px-8 pt-2 pb-0 shrink-0">
        <Input
          value={title}
          onChange={handleTitleChange}
          onBlur={handleTitleBlur}
          onKeyDown={handleTitleKeyDown}
          readOnly={!canEdit}
          placeholder="Sin título"
          className="border-none bg-transparent text-2xl font-bold shadow-none ring-0 focus-visible:ring-0 focus-visible:ring-offset-0 p-0 h-auto placeholder:text-muted-foreground/40"
        />
      </div>

      {/* Editor */}
      <div data-texto-de-la-nota className="flex-1 min-h-0 overflow-hidden px-4 pb-2">
        <TiptapEditor key={note.id} initialContent={initialContent} onChange={handleEditorChange} editable={canEdit} placeholder={PLACEHOLDER_DE_LA_NOTA} />
      </div>

      {/* Footer: word count + contact link */}
      <div data-pie-de-la-nota className="flex items-center justify-between px-8 py-1 border-t border-border/40 shrink-0 text-xs text-muted-foreground">
        <span data-palabras>{elRotuloDePalabras(wordCount)}</span>
        {note.contactJid && (
          <button
            data-contacto-del-pie
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
      />

      {isOwner && (
        <ShareNoteDialog
          open={shareOpen}
          onClose={() => setShareOpen(false)}
          noteId={note.id}
          ownerId={currentUserId}
        />
      )}
    </div>
  )
}
