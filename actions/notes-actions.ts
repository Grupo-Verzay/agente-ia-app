'use server'

import { db } from '@/lib/db'
import type { NoteFolder, UserNote } from '@prisma/client'
import { getAuditActorId, writeAuditLog } from './audit-log-actions'

export type NoteFolderWithCount = NoteFolder & { _count: { notes: number } }
export type UserNoteListItem = Pick<
  UserNote,
  'id' | 'title' | 'emoji' | 'color' | 'isPinned' | 'isArchived' |
  'folderId' | 'contactJid' | 'contactName' | 'updatedAt' | 'createdAt'
>
export type UserNoteWithContent = UserNote

// Nota compartida conmigo: incluye quién la comparte y si la puedo editar.
export type SharedNoteListItem = UserNoteListItem & {
  ownerName: string | null
  canEdit: boolean
}
export type TeamAccount = { id: string; name: string | null; email: string }
export type NoteShareRow = { userId: string; canEdit: boolean; name: string | null; email: string }
export type NoteSharePermission = 'none' | 'read' | 'edit'

// ── Folders ──────────────────────────────────────────────────────────────────

export async function getFolders(userId: string) {
  try {
    const data = await db.noteFolder.findMany({
      where: { userId },
      orderBy: { order: 'asc' },
      include: { _count: { select: { notes: true } } },
    })
    return { success: true, data }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { success: false, data: [] as NoteFolderWithCount[], error: msg }
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

export async function getNotes(userId: string, folderId?: string | null, search?: string) {
  try {
    const baseWhere: any = {
      userId,
      isArchived: false,
      ...(folderId !== undefined ? { folderId } : {}),
    }

    let data
    if (search?.trim()) {
      // Search in title and content
      data = await db.userNote.findMany({
        where: {
          ...baseWhere,
          OR: [
            { title: { contains: search, mode: 'insensitive' } },
            { content: { path: [], string_contains: search } },
          ],
        },
        select: { id: true, title: true, emoji: true, color: true, isPinned: true, isArchived: true, folderId: true, contactJid: true, contactName: true, updatedAt: true, createdAt: true },
        orderBy: [{ isPinned: 'desc' }, { order: 'asc' }, { updatedAt: 'desc' }],
      })
    } else {
      data = await db.userNote.findMany({
        where: baseWhere,
        select: { id: true, title: true, emoji: true, color: true, isPinned: true, isArchived: true, folderId: true, contactJid: true, contactName: true, updatedAt: true, createdAt: true },
        orderBy: [{ isPinned: 'desc' }, { order: 'asc' }, { updatedAt: 'desc' }],
      })
    }
    return { success: true, data }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { success: false, data: [] as UserNoteListItem[], error: msg }
  }
}

export async function getArchivedNotes(userId: string) {
  try {
    const data = await db.userNote.findMany({
      where: { userId, isArchived: true },
      select: { id: true, title: true, emoji: true, color: true, isPinned: true, isArchived: true, folderId: true, contactJid: true, contactName: true, updatedAt: true, createdAt: true },
      orderBy: { updatedAt: 'desc' },
    })
    return { success: true, data }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { success: false, data: [] as UserNoteListItem[], error: msg }
  }
}

export async function getNote(id: string, userId: string) {
  try {
    const data = await db.userNote.findUnique({ where: { id } })
    if (!data) return { success: false, error: 'Nota no encontrada.' }
    // Dueño: acceso total.
    if (data.userId === userId) {
      return { success: true, data, canEdit: true, isOwner: true, ownerName: null }
    }
    // Compartida: acceso solo si existe un share para esta cuenta.
    const share = await db.noteShare.findUnique({
      where: { noteId_userId: { noteId: id, userId } },
      select: { canEdit: true },
    })
    if (!share) return { success: false, error: 'No autorizado.' }
    const owner = await db.user.findUnique({
      where: { id: data.userId },
      select: { name: true, email: true },
    })
    return {
      success: true,
      data,
      canEdit: share.canEdit,
      isOwner: false,
      ownerName: owner?.name ?? owner?.email ?? null,
    }
  } catch {
    return { success: false, error: 'No se pudo cargar la nota.' }
  }
}

export async function createNote(userId: string, folderId?: string | null, templateContent?: object, templateTitle?: string) {
  try {
    const data = await db.userNote.create({
      data: {
        userId,
        folderId: folderId ?? null,
        title: (templateTitle ?? 'Sin título').toUpperCase(),
        content: templateContent ?? {},
      },
      select: { id: true, title: true, emoji: true, color: true, isPinned: true, isArchived: true, folderId: true, contactJid: true, contactName: true, updatedAt: true, createdAt: true },
    })
    await writeAuditLog({
      userId,
      actorId: await getAuditActorId(),
      entityType: 'note',
      entityId: data.id,
      action: 'created',
      summary: `Creo la nota "${data.title}"`,
      metadata: { folderId: data.folderId },
    })
    return { success: true, data }
  } catch {
    return { success: false, error: 'No se pudo crear la nota.' }
  }
}

export async function updateNote(
  id: string,
  userId: string,
  payload: {
    title?: string
    content?: object
    isPinned?: boolean
    emoji?: string | null
    folderId?: string | null
    color?: string | null
    isArchived?: boolean
    contactJid?: string | null
    contactName?: string | null
  },
) {
  try {
    const existing = await db.userNote.findUnique({ where: { id }, select: { userId: true } })
    if (!existing) return { success: false, error: 'Nota no encontrada.' }

    // Cuenta que NO es dueña: solo puede editar si tiene un share con canEdit,
    // y únicamente contenido/título (no fija, archiva, mueve ni etiqueta).
    if (existing.userId !== userId) {
      const share = await db.noteShare.findUnique({
        where: { noteId_userId: { noteId: id, userId } },
        select: { canEdit: true },
      })
      if (!share?.canEdit) return { success: false, error: 'No tienes permiso para editar esta nota.' }
      const safe: { content?: object; title?: string } = {}
      if (payload.content !== undefined) safe.content = payload.content
      if (payload.title !== undefined) safe.title = payload.title
      const data = await db.userNote.update({ where: { id }, data: safe })
      await writeAuditLog({
        userId: existing.userId,
        actorId: await getAuditActorId(),
        entityType: 'note',
        entityId: id,
        action: 'updated',
        summary: `Actualizo la nota compartida "${data.title}"`,
        metadata: { fields: Object.keys(safe), sharedEditor: userId },
      })
      return { success: true, data }
    }

    const data = await db.userNote.update({ where: { id, userId }, data: payload })
    const action = payload.isArchived === true
      ? 'archived'
      : payload.isArchived === false
        ? 'restored'
        : 'updated'
    await writeAuditLog({
      userId,
      actorId: await getAuditActorId(),
      entityType: 'note',
      entityId: id,
      action,
      summary: action === 'archived'
        ? `Archivo la nota "${data.title}"`
        : action === 'restored'
          ? `Restauro la nota "${data.title}"`
          : `Actualizo la nota "${data.title}"`,
      metadata: { fields: Object.keys(payload) },
    })
    return { success: true, data }
  } catch {
    return { success: false, error: 'No se pudo guardar la nota.' }
  }
}

export async function updateNoteOrder(id: string, userId: string, order: number) {
  try {
    await db.userNote.update({ where: { id, userId }, data: { order } })
    return { success: true }
  } catch {
    return { success: false }
  }
}

export async function archiveNote(id: string, userId: string) {
  try {
    const data = await db.userNote.update({ where: { id, userId }, data: { isArchived: true } })
    await writeAuditLog({
      userId,
      actorId: await getAuditActorId(),
      entityType: 'note',
      entityId: id,
      action: 'archived',
      summary: `Archivo la nota "${data.title}"`,
    })
    return { success: true }
  } catch {
    return { success: false, error: 'No se pudo archivar la nota.' }
  }
}

export async function unarchiveNote(id: string, userId: string) {
  try {
    const data = await db.userNote.update({ where: { id, userId }, data: { isArchived: false } })
    await writeAuditLog({
      userId,
      actorId: await getAuditActorId(),
      entityType: 'note',
      entityId: id,
      action: 'restored',
      summary: `Restauro la nota "${data.title}"`,
    })
    return { success: true }
  } catch {
    return { success: false, error: 'No se pudo desarchivar la nota.' }
  }
}

export async function deleteNote(id: string, userId: string) {
  try {
    const data = await db.userNote.delete({ where: { id, userId } })
    await writeAuditLog({
      userId,
      actorId: await getAuditActorId(),
      entityType: 'note',
      entityId: id,
      action: 'deleted',
      summary: `Elimino la nota "${data.title}"`,
    })
    return { success: true }
  } catch {
    return { success: false, error: 'No se pudo eliminar la nota.' }
  }
}

// ── Compartir con el equipo ─────────────────────────────────────────────────

// Cuentas del mismo equipo (linked_accounts): el master del grupo + todos sus
// miembros. Toma como referencia la cuenta `accountId` (puede ser el master o
// un miembro). Devuelve los ids (incluye a `accountId`).
async function getTeamIds(accountId: string): Promise<string[]> {
  try {
    const rows = await db.$queryRaw<{ id: string }[]>`
      WITH master AS (
        SELECT COALESCE(
          (SELECT "master_user_id" FROM "linked_accounts" WHERE "linked_user_id" = ${accountId} LIMIT 1),
          ${accountId}
        ) AS id
      ),
      team AS (
        SELECT id FROM master
        UNION
        SELECT "linked_user_id" AS id FROM "linked_accounts"
        WHERE "master_user_id" = (SELECT id FROM master)
      )
      SELECT id FROM team
    `
    return rows.map(r => r.id)
  } catch {
    return [accountId]
  }
}

// Otras cuentas del equipo con las que se puede compartir (excluye a uno mismo).
export async function getTeamAccounts(accountId: string): Promise<{ success: boolean; data: TeamAccount[]; error?: string }> {
  try {
    const rows = await db.$queryRaw<TeamAccount[]>`
      WITH master AS (
        SELECT COALESCE(
          (SELECT "master_user_id" FROM "linked_accounts" WHERE "linked_user_id" = ${accountId} LIMIT 1),
          ${accountId}
        ) AS id
      ),
      team AS (
        SELECT id FROM master
        UNION
        SELECT "linked_user_id" AS id FROM "linked_accounts"
        WHERE "master_user_id" = (SELECT id FROM master)
      )
      SELECT u.id, u.name, u.email
      FROM team t
      JOIN "User" u ON u.id = t.id
      WHERE u.id <> ${accountId}
      ORDER BY u.name ASC NULLS LAST, u.email ASC
    `
    return { success: true, data: rows }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { success: false, data: [], error: msg }
  }
}

// Con quién está compartida una nota (solo el dueño puede consultarlo).
export async function getNoteShares(noteId: string, ownerId: string): Promise<{ success: boolean; data: NoteShareRow[]; error?: string }> {
  try {
    const note = await db.userNote.findFirst({ where: { id: noteId, userId: ownerId }, select: { id: true } })
    if (!note) return { success: false, data: [], error: 'No autorizado.' }
    const rows = await db.$queryRaw<NoteShareRow[]>`
      SELECT ns."userId", ns."canEdit", u.name, u.email
      FROM "note_shares" ns
      JOIN "User" u ON u.id = ns."userId"
      WHERE ns."noteId" = ${noteId}
    `
    return { success: true, data: rows }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { success: false, data: [], error: msg }
  }
}

// Define el permiso de una cuenta sobre una nota: 'none' (quita), 'read' o 'edit'.
export async function setNoteShare(
  noteId: string,
  ownerId: string,
  targetUserId: string,
  permission: NoteSharePermission,
): Promise<{ success: boolean; error?: string }> {
  try {
    const note = await db.userNote.findFirst({ where: { id: noteId, userId: ownerId }, select: { id: true, title: true } })
    if (!note) return { success: false, error: 'No autorizado.' }
    if (targetUserId === ownerId) return { success: false, error: 'No puedes compartir contigo mismo.' }

    const team = await getTeamIds(ownerId)
    if (!team.includes(targetUserId)) return { success: false, error: 'La cuenta no pertenece a tu equipo.' }

    if (permission === 'none') {
      await db.noteShare.deleteMany({ where: { noteId, userId: targetUserId } })
    } else {
      const canEdit = permission === 'edit'
      await db.noteShare.upsert({
        where: { noteId_userId: { noteId, userId: targetUserId } },
        create: { noteId, userId: targetUserId, canEdit },
        update: { canEdit },
      })
    }

    await writeAuditLog({
      userId: ownerId,
      actorId: await getAuditActorId(),
      entityType: 'note',
      entityId: noteId,
      action: 'updated',
      summary: permission === 'none'
        ? `Dejo de compartir la nota "${note.title}"`
        : `Compartio la nota "${note.title}" (${permission === 'edit' ? 'edición' : 'solo lectura'})`,
      metadata: { targetUserId, permission },
    })
    return { success: true }
  } catch {
    return { success: false, error: 'No se pudo actualizar el compartir.' }
  }
}

// Notas que otras cuentas del equipo compartieron CONMIGO (no archivadas).
export async function getSharedNotes(userId: string): Promise<{ success: boolean; data: SharedNoteListItem[]; error?: string }> {
  try {
    const rows = await db.$queryRaw<SharedNoteListItem[]>`
      SELECT n.id, n.title, n.emoji, n.color, n."isPinned", n."isArchived", n."folderId",
             n."contactJid", n."contactName", n."updatedAt", n."createdAt",
             ns."canEdit", COALESCE(u.name, u.email) AS "ownerName"
      FROM "note_shares" ns
      JOIN "user_notes" n ON n.id = ns."noteId"
      JOIN "User" u ON u.id = n."userId"
      WHERE ns."userId" = ${userId}
        AND n."isArchived" = false
      ORDER BY n."isPinned" DESC, n."updatedAt" DESC
    `
    return { success: true, data: rows }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { success: false, data: [], error: msg }
  }
}
