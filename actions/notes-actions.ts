'use server'

import { db } from '@/lib/db'
import type { NoteFolder, UserNote } from '@prisma/client'

export type NoteFolderWithCount = NoteFolder & { _count: { notes: number } }
export type UserNoteListItem = Pick<UserNote, 'id' | 'title' | 'emoji' | 'isPinned' | 'folderId' | 'updatedAt' | 'createdAt'>
export type UserNoteWithContent = UserNote

// ── Folders ──────────────────────────────────────────────────────────────────

export async function getFolders(userId: string) {
  try {
    const data = await db.noteFolder.findMany({
      where: { userId },
      orderBy: { order: 'asc' },
      include: { _count: { select: { notes: true } } },
    })
    return { success: true, data }
  } catch {
    return { success: false, data: [] as NoteFolderWithCount[] }
  }
}

export async function createFolder(userId: string, name: string, color?: string) {
  try {
    const last = await db.noteFolder.findFirst({ where: { userId }, orderBy: { order: 'desc' } })
    const data = await db.noteFolder.create({
      data: { userId, name, color, order: (last?.order ?? 0) + 1 },
      include: { _count: { select: { notes: true } } },
    })
    return { success: true, data }
  } catch {
    return { success: false, error: 'No se pudo crear la carpeta.' }
  }
}

export async function updateFolder(id: string, userId: string, payload: { name?: string; color?: string }) {
  try {
    const data = await db.noteFolder.update({
      where: { id, userId },
      data: payload,
      include: { _count: { select: { notes: true } } },
    })
    return { success: true, data }
  } catch {
    return { success: false, error: 'No se pudo actualizar la carpeta.' }
  }
}

export async function deleteFolder(id: string, userId: string) {
  try {
    await db.noteFolder.delete({ where: { id, userId } })
    return { success: true }
  } catch {
    return { success: false, error: 'No se pudo eliminar la carpeta.' }
  }
}

// ── Notes ─────────────────────────────────────────────────────────────────────

export async function getNotes(userId: string, folderId?: string | null) {
  try {
    const data = await db.userNote.findMany({
      where: { userId, ...(folderId !== undefined ? { folderId } : {}) },
      select: { id: true, title: true, emoji: true, isPinned: true, folderId: true, updatedAt: true, createdAt: true },
      orderBy: [{ isPinned: 'desc' }, { updatedAt: 'desc' }],
    })
    return { success: true, data }
  } catch {
    return { success: false, data: [] as UserNoteListItem[] }
  }
}

export async function getNote(id: string, userId: string) {
  try {
    const data = await db.userNote.findFirst({ where: { id, userId } })
    if (!data) return { success: false, error: 'Nota no encontrada.' }
    return { success: true, data }
  } catch {
    return { success: false, error: 'No se pudo cargar la nota.' }
  }
}

export async function createNote(userId: string, folderId?: string | null) {
  try {
    const data = await db.userNote.create({
      data: { userId, folderId: folderId ?? null, title: 'Sin título', content: {} },
      select: { id: true, title: true, emoji: true, isPinned: true, folderId: true, updatedAt: true, createdAt: true },
    })
    return { success: true, data }
  } catch {
    return { success: false, error: 'No se pudo crear la nota.' }
  }
}

export async function updateNote(
  id: string,
  userId: string,
  payload: { title?: string; content?: object; isPinned?: boolean; emoji?: string | null; folderId?: string | null },
) {
  try {
    const data = await db.userNote.update({
      where: { id, userId },
      data: payload,
    })
    return { success: true, data }
  } catch {
    return { success: false, error: 'No se pudo guardar la nota.' }
  }
}

export async function deleteNote(id: string, userId: string) {
  try {
    await db.userNote.delete({ where: { id, userId } })
    return { success: true }
  } catch {
    return { success: false, error: 'No se pudo eliminar la nota.' }
  }
}
