'use server'

import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import type { NoteFolder, UserNote } from '@prisma/client'
import { getAuditActorId, writeAuditLog } from './audit-log-actions'
import { currentUser } from '@/lib/auth'
import { getAssociatedAccountIds } from '@/lib/cuentas-asociadas'

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
/**
 * El equipo de una cuenta: con quien se puede compartir una nota.
 *
 * Son cuatro cosas, y antes solo se miraba media:
 *
 *   - La cuenta misma.
 *   - Su cuenta dueña, si es que trabaja para otra.
 *   - Sus ASESORES: las personas que uno dio de alta dentro de la cuenta
 *     (`User.owner_id`). Estos no salian nunca, y son justamente el equipo
 *     de todos los dias. No estan en `linked_accounts` -esa tabla es para
 *     vincular cuentas enteras, no para las personas de dentro-, asi que la
 *     consulta anterior no los veia.
 *   - Las cuentas vinculadas, EN LAS DOS DIRECCIONES: las que uno vinculo
 *     bajo la suya y aquellas bajo las que a uno lo vincularon.
 *
 * Antes se subia primero a un "master" -el primer `master_user_id` que
 * apareciera, con un LIMIT 1 sin orden- y el equipo se armaba a partir de ESE.
 * Con Grupo Verzay eso daba una sola cuenta: subia a la que estuviera de
 * padre y listaba lo suyo, dejando fuera las hermanas y a todos los asesores.
 * Se quita ese salto: el equipo se arma alrededor de la cuenta que pregunta.
 */
async function getTeamIds(accountId: string): Promise<string[]> {
  try {
    const rows = await db.$queryRaw<{ id: string }[]>`
      SELECT ${accountId} AS id
      UNION
      SELECT "owner_id" AS id FROM "User"
      WHERE id = ${accountId} AND "owner_id" IS NOT NULL
      UNION
      SELECT id FROM "User" WHERE "owner_id" = ${accountId}
      UNION
      SELECT "linked_user_id" AS id FROM "linked_accounts"
      WHERE "master_user_id" = ${accountId}
      UNION
      SELECT "master_user_id" AS id FROM "linked_accounts"
      WHERE "linked_user_id" = ${accountId}
    `
    return rows.map(r => r.id).filter(Boolean)
  } catch {
    return [accountId]
  }
}

// Otras cuentas del equipo con las que se puede compartir (excluye a uno mismo).
export async function getTeamAccounts(accountId: string): Promise<{ success: boolean; data: TeamAccount[]; error?: string }> {
  try {
    // La cuenta viene del navegador, asi que hay que comprobar que sea de quien
    // pregunta. Sin esto, mandando el id de una cuenta ajena se sacaba su lista
    // de gente con nombre y correo.
    const user = await currentUser()
    if (!user?.id) return { success: false, data: [], error: 'No autorizado.' }
    const propias = await getAssociatedAccountIds(user)
    if (!propias.includes(accountId)) {
      return { success: false, data: [], error: 'No autorizado.' }
    }

    // Se arma con la MISMA lista que luego deja compartir (`setNoteShare`).
    // Antes eran dos consultas gemelas y bastaba con que se separaran para
    // ofrecer a alguien y luego rechazarlo.
    const ids = (await getTeamIds(accountId)).filter(id => id !== accountId)
    if (ids.length === 0) return { success: true, data: [] }

    const rows = await db.$queryRaw<TeamAccount[]>`
      SELECT u.id, u.name, u.email
      FROM "User" u
      WHERE u.id IN (${Prisma.join(ids)})
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
// El fijado y el orden son PROPIOS del receptor (columnas del share), para que
// cada quien acomode su lista sin alterar la nota del dueño.
export async function getSharedNotes(userId: string): Promise<{ success: boolean; data: SharedNoteListItem[]; error?: string }> {
  try {
    const rows = await db.$queryRaw<SharedNoteListItem[]>`
      SELECT n.id, n.title, n.emoji, n.color, ns."isPinned", n."isArchived", n."folderId",
             n."contactJid", n."contactName", n."updatedAt", n."createdAt",
             ns."canEdit", COALESCE(u.name, u.email) AS "ownerName"
      FROM "note_shares" ns
      JOIN "user_notes" n ON n.id = ns."noteId"
      JOIN "User" u ON u.id = n."userId"
      WHERE ns."userId" = ${userId}
        AND n."isArchived" = false
      ORDER BY ns."isPinned" DESC, ns."order" ASC, n."updatedAt" DESC
    `
    return { success: true, data: rows }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { success: false, data: [], error: msg }
  }
}

// Fijar/desfijar una nota compartida (solo para el receptor que lo pide).
export async function setNoteSharePin(noteId: string, userId: string, isPinned: boolean): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await db.noteShare.updateMany({ where: { noteId, userId }, data: { isPinned } })
    if (res.count === 0) return { success: false, error: 'No tienes esta nota compartida.' }
    return { success: true }
  } catch {
    return { success: false, error: 'No se pudo fijar la nota.' }
  }
}

// Guardar el orden propio del receptor para una nota compartida.
export async function updateNoteShareOrder(noteId: string, userId: string, order: number): Promise<{ success: boolean }> {
  try {
    await db.noteShare.updateMany({ where: { noteId, userId }, data: { order } })
    return { success: true }
  } catch {
    return { success: false }
  }
}
