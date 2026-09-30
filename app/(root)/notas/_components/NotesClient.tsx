'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import {
  createNote, deleteNote, getNotes, getNote, archiveNote, getArchivedNotes, unarchiveNote,
  getFolders, createFolder, updateFolder, deleteFolder, updateNote, getSharedNotes,
  type NoteFolderWithCount, type UserNoteListItem, type UserNoteWithContent, type SharedNoteListItem,
} from '@/actions/notes-actions'
import { NotesSidebar } from './NotesSidebar'
import { NotesEditor } from './NotesEditor'
import { NoteEmptyState } from './NoteEmptyState'
import { Button } from '@/components/ui/button'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { ArrowLeft } from 'lucide-react'
import { cn } from '@/lib/utils'
import { elMandoDeArchivo, sinLaNota } from '@/lib/archivo-de-notas'
import { ARCHIVO, COMPARTIDAS, elAvisoDeMover, laNotaSigueEnLaVista } from '@/lib/pantalla-de-notas'

interface Props {
  userId: string
  // Al abrir/crear una nota, contrae la lista lateral para dar más ancho al
  // editor (útil en paneles angostos como la pestaña Notas dentro del chat).
  // Se reabre con el botón de panel del editor. Default: false (página /notas).
  collapseSidebarOnSelect?: boolean
}

export function NotesClient({ userId, collapseSidebarOnSelect = false }: Props) {
  const [folders, setFolders] = useState<NoteFolderWithCount[]>([])
  const [notes, setNotes] = useState<UserNoteListItem[]>([])
  const [sharedNotes, setSharedNotes] = useState<SharedNoteListItem[]>([])
  // El número de la pestaña Compartidas es el TOTAL: con una búsqueda puesta
  // la lista de esa pestaña se acota, y el número no puede cambiar con ella.
  const [sharedTotal, setSharedTotal] = useState(0)
  // Eliminar pide confirmación, llegue de la lista o de la nota abierta: UNA
  // confirmación para los dos sitios, que es lo que hace que no se pueda borrar
  // una nota de un clic desde el menú de la lista.
  const [aEliminar, setAEliminar] = useState<{ id: string; title: string } | null>(null)
  const [selectedNote, setSelectedNote] = useState<UserNoteWithContent | null>(null)
  // Permiso de la nota abierta: dueño = acceso total; compartida = según share.
  const [notePerm, setNotePerm] = useState<{ canEdit: boolean; isOwner: boolean; ownerName: string | null }>(
    { canEdit: true, isOwner: true, ownerName: null },
  )
  const [activeFolderId, setActiveFolderId] = useState<string | null | undefined>(undefined)
  const [search, setSearch] = useState('')
  const [loadingNote, setLoadingNote] = useState(false)
  const [saving, setSaving] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const loadFolders = useCallback(async () => {
    const res = await getFolders(userId)
    if (res.success) setFolders(res.data)
    else toast.error('Error al cargar carpetas: ' + (res as { error?: string }).error)
  }, [userId])

  const loadShared = useCallback(async (q?: string) => {
    const res = await getSharedNotes(userId, q)
    if (!res.success) return
    setSharedNotes(res.data)
    if (!q?.trim()) setSharedTotal(res.data.length)
  }, [userId])

  const loadNotes = useCallback(async (folderId?: string | null, q?: string) => {
    if (folderId === COMPARTIDAS) {
      await loadShared(q)
    } else if (folderId === ARCHIVO) {
      const res = await getArchivedNotes(userId, q)
      if (res.success) setNotes(res.data)
      else toast.error('Error al cargar notas: ' + (res as { error?: string }).error)
    } else {
      const res = await getNotes(userId, folderId, q)
      if (res.success) setNotes(res.data)
      else toast.error('Error al cargar notas: ' + (res as { error?: string }).error)
    }
  }, [userId, loadShared])

  useEffect(() => {
    loadFolders()
    loadNotes(undefined, '')
    loadShared()
  }, [loadFolders, loadNotes, loadShared])

  // Debounced search
  useEffect(() => {
    const t = setTimeout(() => loadNotes(activeFolderId, search), 300)
    return () => clearTimeout(t)
  }, [search, activeFolderId, loadNotes])

  const handleSelectFolder = useCallback(async (folderId: string | null | undefined) => {
    setActiveFolderId(folderId)
    setSelectedNote(null)
    await loadNotes(folderId, search)
  }, [loadNotes, search])

  const handleSelectNote = useCallback(async (id: string) => {
    if (collapseSidebarOnSelect) setSidebarOpen(false)
    setLoadingNote(true)
    const res = await getNote(id, userId)
    if (res.success && res.data) {
      setSelectedNote(res.data)
      setNotePerm({
        canEdit: res.canEdit ?? true,
        isOwner: res.isOwner ?? true,
        ownerName: res.ownerName ?? null,
      })
    } else if (!res.success) {
      toast.error((res as { error?: string }).error ?? 'No se pudo abrir la nota')
    }
    setLoadingNote(false)
  }, [userId, collapseSidebarOnSelect])

  const handleNewNote = useCallback(async (templateContent?: object, templateTitle?: string) => {
    const folderId = (activeFolderId && activeFolderId !== ARCHIVO && activeFolderId !== COMPARTIDAS) ? activeFolderId : null
    const res = await createNote(userId, folderId, templateContent, templateTitle)
    if (!res.success || !res.data) return toast.error('No se pudo crear la nota')
    setNotes(prev => [res.data!, ...prev])
    await handleSelectNote(res.data.id)
    await loadFolders()
  }, [userId, activeFolderId, handleSelectNote, loadFolders])

  const handleDeleteNote = useCallback((id: string) => {
    const title = notes.find(n => n.id === id)?.title
      ?? (selectedNote?.id === id ? selectedNote.title : undefined)
    setAEliminar({ id, title: title || 'Sin título' })
  }, [notes, selectedNote])

  const confirmarEliminar = useCallback(async () => {
    if (!aEliminar) return
    const { id } = aEliminar
    setAEliminar(null)
    const res = await deleteNote(id, userId)
    if (!res.success) return toast.error(res.error)
    setNotes(prev => prev.filter(n => n.id !== id))
    if (selectedNote?.id === id) setSelectedNote(null)
    toast.success('Nota eliminada')
    await loadFolders()
  }, [aEliminar, userId, selectedNote, loadFolders])

  // Archivar y desarchivar son el MISMO mando con dos caras (lib/archivo-de-notas):
  // las dos sacan la nota de la lista que se mira y la cierran.
  const handleToggleArchive = useCallback(async (id: string, estaArchivada: boolean) => {
    const mando = elMandoDeArchivo(estaArchivada)
    const res = mando.accion === 'archivar'
      ? await archiveNote(id, userId)
      : await unarchiveNote(id, userId)
    if (!res.success) return toast.error(res.error)
    setNotes(prev => sinLaNota(prev, id))
    if (selectedNote?.id === id) setSelectedNote(null)
    toast.success(mando.aviso)
    await loadFolders()
  }, [userId, selectedNote, loadFolders])

  const handleSave = useCallback((content: object, title: string) => {
    if (!selectedNote) return
    if (!notePerm.canEdit) return
    if (saveTimer.current) clearTimeout(saveTimer.current)
    setSaving(true)
    saveTimer.current = setTimeout(async () => {
      // El aplanado que antes se hacia aqui a mano vive ahora en el editor
      // (`comoJsonPlano`, en `EditorDeTexto`), que es quien produce los `attrs`
      // sin prototipo que Next no sabe mandar. Estaba escrito aqui **sin decir
      // por que**, asi que Documentacion —que reutiliza el mismo editor— no lo
      // copio y sus documentos no se guardaban. Ver `lib/json-plano.ts`.
      const res = await updateNote(selectedNote.id, userId, { content, title })
      setSaving(false)
      if (!res.success) return toast.error(res.error)
      setNotes(prev => prev.map(n => n.id === selectedNote.id ? { ...n, title, updatedAt: new Date() } : n))
      setSharedNotes(prev => prev.map(n => n.id === selectedNote.id ? { ...n, title, updatedAt: new Date() } : n))
      setSelectedNote(prev => prev ? { ...prev, content, title } : prev)
    }, 1500)
  }, [selectedNote, userId, notePerm.canEdit])

  const handleTogglePin = useCallback(async (id: string, isPinned: boolean) => {
    const res = await updateNote(id, userId, { isPinned: !isPinned })
    if (!res.success) return toast.error(res.error)
    setNotes(prev => [...prev.map(n => n.id === id ? { ...n, isPinned: !isPinned } : n)].sort((a, b) => (b.isPinned ? 1 : 0) - (a.isPinned ? 1 : 0)))
    if (selectedNote?.id === id) setSelectedNote(prev => prev ? { ...prev, isPinned: !isPinned } : prev)
  }, [userId, selectedNote])

  const handleEmojiChange = useCallback(async (id: string, emoji: string | null) => {
    const res = await updateNote(id, userId, { emoji })
    if (!res.success) return toast.error(res.error)
    setNotes(prev => prev.map(n => n.id === id ? { ...n, emoji } : n))
    if (selectedNote?.id === id) setSelectedNote(prev => prev ? { ...prev, emoji } : prev)
  }, [userId, selectedNote])

  const handleColorChange = useCallback(async (id: string, color: string | null) => {
    const res = await updateNote(id, userId, { color })
    if (!res.success) return toast.error(res.error)
    setNotes(prev => prev.map(n => n.id === id ? { ...n, color } : n))
    if (selectedNote?.id === id) setSelectedNote(prev => prev ? { ...prev, color } : prev)
  }, [userId, selectedNote])

  const handleContactChange = useCallback(async (id: string, contactJid: string | null, contactName: string | null) => {
    const res = await updateNote(id, userId, { contactJid, contactName })
    if (!res.success) return toast.error(res.error)
    setNotes(prev => prev.map(n => n.id === id ? { ...n, contactJid, contactName } : n))
    if (selectedNote?.id === id) setSelectedNote(prev => prev ? { ...prev, contactJid, contactName } : prev)
  }, [userId, selectedNote])

  // Mover una nota a otra carpeta (o sacarla de todas). Si deja de pertenecer a
  // la lista que se mira, sale de ella al momento; el número de cada carpeta se
  // vuelve a pedir, que es lo que dice cuántas tiene.
  const handleMoveNote = useCallback(async (id: string, folderId: string | null) => {
    const res = await updateNote(id, userId, { folderId })
    if (!res.success) return toast.error(res.error)
    setNotes(prev => laNotaSigueEnLaVista(activeFolderId, folderId)
      ? prev.map(n => n.id === id ? { ...n, folderId } : n)
      : prev.filter(n => n.id !== id))
    if (selectedNote?.id === id) setSelectedNote(prev => prev ? { ...prev, folderId } : prev)
    toast.success(elAvisoDeMover(folderId ? folders.find(f => f.id === folderId)?.name ?? null : null))
    await loadFolders()
  }, [userId, activeFolderId, selectedNote, folders, loadFolders])

  const handleApplyTemplate = useCallback(async (content: object, title: string) => {
    await handleNewNote(content, title)
  }, [handleNewNote])

  const handleCreateFolder = useCallback(async (name: string, color?: string) => {
    const res = await createFolder(userId, name, color)
    if (!res.success) return toast.error(res.error)
    setFolders(prev => [...prev, res.data!])
  }, [userId])

  const handleUpdateFolder = useCallback(async (id: string, payload: { name?: string; color?: string }) => {
    const res = await updateFolder(id, userId, payload)
    if (!res.success) return toast.error(res.error)
    setFolders(prev => prev.map(f => f.id === id ? res.data! : f))
  }, [userId])

  const handleDeleteFolder = useCallback(async (id: string) => {
    const res = await deleteFolder(id, userId)
    if (!res.success) return toast.error(res.error)
    setFolders(prev => prev.filter(f => f.id !== id))
    toast.success('Carpeta eliminada: sus notas pasaron a Sueltas')
    // Sus notas pasan a Sueltas, así que la lista que se mira puede cambiar
    // aunque no fuera la de esa carpeta (Todas, Sueltas).
    if (activeFolderId === id) await handleSelectFolder(undefined)
    else await loadNotes(activeFolderId, search)
  }, [userId, activeFolderId, handleSelectFolder, loadNotes, search])

  const showEditorPane = Boolean(selectedNote) || loadingNote
  const handleBackToList = useCallback(() => {
    setSelectedNote(null)
    setSidebarOpen(true)
  }, [])

  return (
    <div className="flex h-full min-h-0 overflow-hidden">
      {sidebarOpen && (
        <NotesSidebar
          className={cn(showEditorPane && 'hidden md:flex')}
          folders={folders}
          notes={notes}
          sharedNotes={sharedNotes}
          sharedTotal={sharedTotal}
          userId={userId}
          onReorder={setNotes}
          onReorderShared={setSharedNotes}
          selectedNoteId={selectedNote?.id}
          activeFolderId={activeFolderId}
          search={search}
          onSearchChange={setSearch}
          onSelectNote={handleSelectNote}
          onNewNote={() => handleNewNote()}
          onDeleteNote={handleDeleteNote}
          onTogglePin={handleTogglePin}
          onMoveNote={handleMoveNote}
          onSelectFolder={handleSelectFolder}
          onCreateFolder={handleCreateFolder}
          onUpdateFolder={handleUpdateFolder}
          onDeleteFolder={handleDeleteFolder}
        />
      )}
      <div className={cn(
        'flex flex-1 min-w-0 flex-col bg-background',
        !showEditorPane && 'hidden md:flex',
      )}>
        {!selectedNote && !loadingNote && (
          <NoteEmptyState onNewNote={() => handleNewNote()} sidebarOpen={sidebarOpen} onToggleSidebar={() => setSidebarOpen(v => !v)} />
        )}
        {loadingNote && (
          <div className="relative flex flex-1 items-center justify-center text-muted-foreground text-sm gap-2">
            <Button variant="ghost" size="icon" className="absolute left-2 top-2 h-8 w-8 md:hidden" onClick={handleBackToList}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-border border-t-primary" />
            Cargando...
          </div>
        )}
        {selectedNote && !loadingNote && (
          <NotesEditor
            key={selectedNote.id}
            note={selectedNote}
            saving={saving}
            sidebarOpen={sidebarOpen}
            currentUserId={userId}
            canEdit={notePerm.canEdit}
            isOwner={notePerm.isOwner}
            ownerName={notePerm.ownerName}
            onSave={handleSave}
            onTogglePin={handleTogglePin}
            onDelete={handleDeleteNote}
            onToggleArchive={handleToggleArchive}
            onEmojiChange={handleEmojiChange}
            onColorChange={handleColorChange}
            onContactChange={handleContactChange}
            onToggleSidebar={() => setSidebarOpen(v => !v)}
            onBackToList={handleBackToList}
            onApplyTemplate={handleApplyTemplate}
          />
        )}
      </div>

      <AlertDialog open={Boolean(aEliminar)} onOpenChange={v => !v && setAEliminar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar la nota «{aEliminar?.title}»?</AlertDialogTitle>
            <AlertDialogDescription>
              Se borra para siempre, también para quienes la tengan compartida. Si solo quieres
              quitarla de la vista, archívala.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              data-confirmar-eliminar-nota
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={confirmarEliminar}
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
