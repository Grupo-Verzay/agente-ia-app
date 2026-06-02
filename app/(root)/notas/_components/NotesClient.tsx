'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import {
  createNote, deleteNote, getNotes, getNote,
  getFolders, createFolder, updateFolder, deleteFolder, updateNote,
  type NoteFolderWithCount, type UserNoteListItem, type UserNoteWithContent,
} from '@/actions/notes-actions'
import { NotesSidebar } from './NotesSidebar'
import { NotesEditor } from './NotesEditor'
import { NoteEmptyState } from './NoteEmptyState'

interface Props {
  userId: string
}

export function NotesClient({ userId }: Props) {
  const [folders, setFolders] = useState<NoteFolderWithCount[]>([])
  const [notes, setNotes] = useState<UserNoteListItem[]>([])
  const [selectedNote, setSelectedNote] = useState<UserNoteWithContent | null>(null)
  const [activeFolderId, setActiveFolderId] = useState<string | null | undefined>(undefined)
  const [search, setSearch] = useState('')
  const [loadingNote, setLoadingNote] = useState(false)
  const [saving, setSaving] = useState(false)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const loadFolders = useCallback(async () => {
    const res = await getFolders(userId)
    if (res.success) setFolders(res.data)
  }, [userId])

  const loadNotes = useCallback(async (folderId?: string | null) => {
    const res = await getNotes(userId, folderId)
    if (res.success) setNotes(res.data)
  }, [userId])

  useEffect(() => {
    loadFolders()
    loadNotes(undefined)
  }, [loadFolders, loadNotes])

  const handleSelectFolder = useCallback(async (folderId: string | null | undefined) => {
    setActiveFolderId(folderId)
    setSelectedNote(null)
    await loadNotes(folderId)
  }, [loadNotes])

  const handleSelectNote = useCallback(async (id: string) => {
    setLoadingNote(true)
    const res = await getNote(id, userId)
    if (res.success && res.data) setSelectedNote(res.data)
    setLoadingNote(false)
  }, [userId])

  const handleNewNote = useCallback(async () => {
    const res = await createNote(userId, activeFolderId ?? null)
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
  }, [userId, selectedNote])

  const handleSave = useCallback((content: object, title: string) => {
    if (!selectedNote) return
    if (saveTimer.current) clearTimeout(saveTimer.current)
    setSaving(true)
    saveTimer.current = setTimeout(async () => {
      const res = await updateNote(selectedNote.id, userId, { content, title })
      setSaving(false)
      if (!res.success) return toast.error(res.error)
      setNotes(prev => prev.map(n => n.id === selectedNote.id ? { ...n, title, updatedAt: new Date() } : n))
      setSelectedNote(prev => prev ? { ...prev, content, title } : prev)
    }, 1500)
  }, [selectedNote, userId])

  const handleTogglePin = useCallback(async (id: string, isPinned: boolean) => {
    const res = await updateNote(id, userId, { isPinned: !isPinned })
    if (!res.success) return toast.error(res.error)
    setNotes(prev =>
      [...prev.map(n => n.id === id ? { ...n, isPinned: !isPinned } : n)]
        .sort((a, b) => (b.isPinned ? 1 : 0) - (a.isPinned ? 1 : 0))
    )
    if (selectedNote?.id === id) setSelectedNote(prev => prev ? { ...prev, isPinned: !isPinned } : prev)
  }, [userId, selectedNote])

  const handleEmojiChange = useCallback(async (id: string, emoji: string | null) => {
    const res = await updateNote(id, userId, { emoji })
    if (!res.success) return toast.error(res.error)
    setNotes(prev => prev.map(n => n.id === id ? { ...n, emoji } : n))
    if (selectedNote?.id === id) setSelectedNote(prev => prev ? { ...prev, emoji } : prev)
  }, [userId, selectedNote])

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

  const filteredNotes = search.trim()
    ? notes.filter(n => n.title.toLowerCase().includes(search.toLowerCase()))
    : notes

  return (
    <div className="flex h-full min-h-0 overflow-hidden">
      <NotesSidebar
        folders={folders}
        notes={filteredNotes}
        selectedNoteId={selectedNote?.id}
        activeFolderId={activeFolderId}
        search={search}
        onSearchChange={setSearch}
        onSelectNote={handleSelectNote}
        onNewNote={handleNewNote}
        onDeleteNote={handleDeleteNote}
        onTogglePin={handleTogglePin}
        onSelectFolder={handleSelectFolder}
        onCreateFolder={handleCreateFolder}
        onUpdateFolder={handleUpdateFolder}
        onDeleteFolder={handleDeleteFolder}
      />
      <div className="flex flex-1 min-w-0 flex-col">
        {!selectedNote && !loadingNote && (
          <NoteEmptyState onNewNote={handleNewNote} />
        )}
        {loadingNote && (
          <div className="flex flex-1 items-center justify-center text-muted-foreground text-sm">
            Cargando nota...
          </div>
        )}
        {selectedNote && !loadingNote && (
          <NotesEditor
            key={selectedNote.id}
            note={selectedNote}
            saving={saving}
            onSave={handleSave}
            onTogglePin={handleTogglePin}
            onDelete={handleDeleteNote}
            onEmojiChange={handleEmojiChange}
          />
        )}
      </div>
    </div>
  )
}
