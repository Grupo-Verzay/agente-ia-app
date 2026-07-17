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
import { ArrowLeft } from 'lucide-react'
import { cn } from '@/lib/utils'

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

  const loadShared = useCallback(async () => {
    const res = await getSharedNotes(userId)
    if (res.success) setSharedNotes(res.data)
  }, [userId])

  const loadNotes = useCallback(async (folderId?: string | null, q?: string) => {
    if (folderId === '__shared__') {
      await loadShared()
    } else if (folderId === '__archived__') {
      const res = await getArchivedNotes(userId)
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
    const folderId = (activeFolderId && activeFolderId !== '__archived__' && activeFolderId !== '__shared__') ? activeFolderId : null
    const res = await createNote(userId, folderId, templateContent, templateTitle)
    if (!res.success || !res.data) return toast.error('No se pudo crear la nota')
    setNotes(prev => [res.data!, ...prev])
    await handleSelectNote(res.data.id)
    await loadFolders()
  }, [userId, activeFolderId, handleSelectNote, loadFolders])

  const handleDeleteNote = useCallback(async (id: string) => {
    const res = await deleteNote(id, userId)
    if (!res.success) return toast.error(res.error)
    setNotes(prev => prev.filter(n => n.id !== id))
    if (selectedNote?.id === id) setSelectedNote(null)
    await loadFolders()
  }, [userId, selectedNote, loadFolders])

  const handleArchiveNote = useCallback(async (id: string) => {
    const res = await archiveNote(id, userId)
    if (!res.success) return toast.error(res.error)
    setNotes(prev => prev.filter(n => n.id !== id))
    if (selectedNote?.id === id) setSelectedNote(null)
    toast.success('Nota archivada')
    await loadFolders()
  }, [userId, selectedNote, loadFolders])

  const handleSave = useCallback((content: object, title: string) => {
    if (!selectedNote) return
    if (!notePerm.canEdit) return
    if (saveTimer.current) clearTimeout(saveTimer.current)
    setSaving(true)
    saveTimer.current = setTimeout(async () => {
      const plainContent = JSON.parse(JSON.stringify(content))
      const res = await updateNote(selectedNote.id, userId, { content: plainContent, title })
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
    if (activeFolderId === id) handleSelectFolder(undefined)
  }, [userId, activeFolderId, handleSelectFolder])

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
            onArchive={handleArchiveNote}
            onEmojiChange={handleEmojiChange}
            onColorChange={handleColorChange}
            onContactChange={handleContactChange}
            onToggleSidebar={() => setSidebarOpen(v => !v)}
            onBackToList={handleBackToList}
            onApplyTemplate={handleApplyTemplate}
          />
        )}
      </div>
    </div>
  )
}
