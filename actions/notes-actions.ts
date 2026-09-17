'use server'

import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import type { NoteFolder, UserNote } from '@prisma/client'
import { getAuditActorId, writeAuditLog } from './audit-log-actions'
import { currentUser } from '@/lib/auth'
import { getAssociatedAccountIds } from '@/lib/cuentas-asociadas'
import { identidadesQueRecibenCompartidos } from '@/lib/notas-compartidas'

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

/**
 * De quién son las notas que se piden: SIEMPRE de quien está mirando.
 *
 * Las notas son de la PERSONA, no de la cuenta. Compartir es lo único que hace
 * que otro las vea, y eso vive en `note_shares`. Pero el id llegaba desde el
 * navegador y aquí se usaba tal cual, así que bastaba con mandar otro para
 * sacar la lista entera de otra persona.
 *
 * Y no era teórico: la pestaña Notas de un chat pasaba el id de la CUENTA
 * (`effectiveOwnerId`), así que un asesor abría cualquier conversación y veía
 * TODAS las notas de su dueño, también las que no le había compartido.
 *
 * Por eso no se comprueba el id que llega: se ignora. `assertCanAccessTargetUser`
 * no vale aquí —deja pasar al asesor hacia su dueño, que es justo el caso que
 * hay que cerrar—. Si alguna pantalla manda otro id, se arregla la pantalla.
 */
async function elDuenoDeLasNotas(pedido: string): Promise<string | null> {
  const user = await currentUser()
  if (!user?.id) return null
  if (pedido && pedido !== user.id) {
    console.warn('[notas] se pidieron las notas de otra cuenta; se usan las de quien mira', {
      pedido,
      quienMira: user.id,
    })
  }
  return user.id
}

/**
 * Bajo qué identidades le llega a quien mira una nota compartida.
 *
 * **Es otra pregunta que la de arriba, y por eso son dos funciones.**
 * `elDuenoDeLasNotas` dice de quién SON las notas y contesta siempre «de quien
 * mira»; sin eso, un `agente` vería las notas privadas de su dueño. Esto dice
 * a quién le LLEGA lo que otra cuenta compartió, y ahí sí cuenta la cuenta:
 * compartir se hace **con una cuenta** y `note_shares` guarda su id, así que
 * buscando solo por el id de la persona, su administrador no encuentra nada.
 *
 * Quién hereda está en `lib/notas-compartidas.ts`, que es puro: administrador
 * sí, agente no.
 */
async function quienesMeCompartenA(): Promise<string[]> {
  const user = await currentUser()
  return identidadesQueRecibenCompartidos(user ?? {})
}

/**
 * El share de una nota para quien mira, mirando TODAS sus identidades.
 *
 * Si hay dos filas —una compartida con la persona y otra con su cuenta— gana
 * **la que más deja hacer**: cuando a alguien se le dio edición por un camino,
 * quitársela por tener además una de lectura sería un permiso que desaparece
 * según por dónde se mire.
 */
async function elShareDeLaNota(noteId: string, identidades: string[]) {
  if (identidades.length === 0) return null
  return db.noteShare.findFirst({
    where: { noteId, userId: { in: identidades } },
    select: { canEdit: true },
    orderBy: { canEdit: 'desc' },
  })
}

// ── Folders ──────────────────────────────────────────────────────────────────

export async function getFolders(userId: string) {
  try {
    const dueno = await elDuenoDeLasNotas(userId)
    if (!dueno) return { success: false, data: [] as NoteFolderWithCount[], error: 'No autorizado.' }
    const data = await db.noteFolder.findMany({
      where: { userId: dueno },
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
    const dueno = await elDuenoDeLasNotas(userId)
    if (!dueno) return { success: false, error: 'No autorizado.' }
    const last = await db.noteFolder.findFirst({ where: { userId: dueno }, orderBy: { order: 'desc' } })
    const data = await db.noteFolder.create({
      data: { userId: dueno, name, color, order: (last?.order ?? 0) + 1 },
      include: { _count: { select: { notes: true } } },
    })
    return { success: true, data }
  } catch {
    return { success: false, error: 'No se pudo crear la carpeta.' }
  }
}

export async function updateFolder(id: string, userId: string, payload: { name?: string; color?: string }) {
  try {
    const dueno = await elDuenoDeLasNotas(userId)
    if (!dueno) return { success: false, error: 'No autorizado.' }
    const data = await db.noteFolder.update({
      where: { id, userId: dueno },
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
    const dueno = await elDuenoDeLasNotas(userId)
    if (!dueno) return { success: false, error: 'No autorizado.' }
    await db.noteFolder.delete({ where: { id, userId: dueno } })
    return { success: true }
  } catch {
    return { success: false, error: 'No se pudo eliminar la carpeta.' }
  }
}

// ── Notes ─────────────────────────────────────────────────────────────────────

export async function getNotes(userId: string, folderId?: string | null, search?: string) {
  try {
    const dueno = await elDuenoDeLasNotas(userId)
    if (!dueno) return { success: false, data: [] as UserNoteListItem[], error: 'No autorizado.' }
    const baseWhere: any = {
      userId: dueno,
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
    const dueno = await elDuenoDeLasNotas(userId)
    if (!dueno) return { success: false, data: [] as UserNoteListItem[], error: 'No autorizado.' }
    const data = await db.userNote.findMany({
      where: { userId: dueno, isArchived: true },
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
    const quienMira = await elDuenoDeLasNotas(userId)
    if (!quienMira) return { success: false, error: 'No autorizado.' }
    const data = await db.userNote.findUnique({ where: { id } })
    if (!data) return { success: false, error: 'Nota no encontrada.' }
    // Dueño: acceso total.
    if (data.userId === quienMira) {
      return { success: true, data, canEdit: true, isOwner: true, ownerName: null }
    }
    // Compartida: acceso si hay un share para cualquiera de sus identidades
    // —la suya, o la de la cuenta de la que es administrador—.
    const share = await elShareDeLaNota(id, await quienesMeCompartenA())
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
    const dueno = await elDuenoDeLasNotas(userId)
    if (!dueno) return { success: false, error: 'No autorizado.' }
    const data = await db.userNote.create({
      data: {
        userId: dueno,
        folderId: folderId ?? null,
        title: (templateTitle ?? 'Sin título').toUpperCase(),
        content: templateContent ?? {},
      },
      select: { id: true, title: true, emoji: true, color: true, isPinned: true, isArchived: true, folderId: true, contactJid: true, contactName: true, updatedAt: true, createdAt: true },
    })
    await writeAuditLog({
      userId: dueno,
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
    const quienEdita = await elDuenoDeLasNotas(userId)
    if (!quienEdita) return { success: false, error: 'No autorizado.' }
    const existing = await db.userNote.findUnique({ where: { id }, select: { userId: true } })
    if (!existing) return { success: false, error: 'Nota no encontrada.' }

    // Cuenta que NO es dueña: solo puede editar si tiene un share con canEdit,
    // y únicamente contenido/título (no fija, archiva, mueve ni etiqueta).
    if (existing.userId !== quienEdita) {
      const share = await elShareDeLaNota(id, await quienesMeCompartenA())
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
        metadata: { fields: Object.keys(safe), sharedEditor: quienEdita },
      })
      return { success: true, data }
    }

    const data = await db.userNote.update({ where: { id, userId: quienEdita }, data: payload })
    const action = payload.isArchived === true
      ? 'archived'
      : payload.isArchived === false
        ? 'restored'
        : 'updated'
    await writeAuditLog({
      userId: quienEdita,
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
    const dueno = await elDuenoDeLasNotas(userId)
    if (!dueno) return { success: false }
    await db.userNote.update({ where: { id, userId: dueno }, data: { order } })
    return { success: true }
  } catch {
    return { success: false }
  }
}

export async function archiveNote(id: string, userId: string) {
  try {
    const dueno = await elDuenoDeLasNotas(userId)
    if (!dueno) return { success: false, error: 'No autorizado.' }
    const data = await db.userNote.update({ where: { id, userId: dueno }, data: { isArchived: true } })
    await writeAuditLog({
      userId: dueno,
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
    const dueno = await elDuenoDeLasNotas(userId)
    if (!dueno) return { success: false, error: 'No autorizado.' }
    const data = await db.userNote.update({ where: { id, userId: dueno }, data: { isArchived: false } })
    await writeAuditLog({
      userId: dueno,
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
    const dueno = await elDuenoDeLasNotas(userId)
    if (!dueno) return { success: false, error: 'No autorizado.' }
    const data = await db.userNote.delete({ where: { id, userId: dueno } })
    await writeAuditLog({
      userId: dueno,
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
    const dueno = await elDuenoDeLasNotas(ownerId)
    if (!dueno) return { success: false, data: [], error: 'No autorizado.' }
    const note = await db.userNote.findFirst({ where: { id: noteId, userId: dueno }, select: { id: true } })
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
    const dueno = await elDuenoDeLasNotas(ownerId)
    if (!dueno) return { success: false, error: 'No autorizado.' }
    const note = await db.userNote.findFirst({ where: { id: noteId, userId: dueno }, select: { id: true, title: true } })
    if (!note) return { success: false, error: 'No autorizado.' }
    if (targetUserId === dueno) return { success: false, error: 'No puedes compartir contigo mismo.' }

    const team = await getTeamIds(dueno)
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
      userId: dueno,
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
    const quienMira = await elDuenoDeLasNotas(userId)
    if (!quienMira) return { success: false, data: [], error: 'No autorizado.' }
    const identidades = await quienesMeCompartenA()
    if (identidades.length === 0) return { success: true, data: [] }

    // `DISTINCT ON (n.id)` porque una misma nota puede llegar por dos caminos
    // —compartida con la persona y compartida con su cuenta—; sin él saldría
    // dos veces en la lista. Se queda con la que más deja hacer.
    //
    // Y se descarta lo que ya es SUYO: con la cuenta dentro, alguien que
    // comparte una nota propia con su propia cuenta la vería a la vez en «mis
    // notas» y en «compartidas conmigo». Antes no podía pasar, porque
    // compartir con uno mismo está prohibido.
    // El `DISTINCT ON` obliga a que su `ORDER BY` empiece por `n.id`, así que
    // el orden de la LISTA —fijadas arriba, luego el orden propio del receptor—
    // va en la consulta de fuera. Mezclarlos daría un orden que no es ninguno
    // de los dos.
    const rows = await db.$queryRaw<SharedNoteListItem[]>`
      SELECT q.id, q.title, q.emoji, q.color, q."isPinned", q."isArchived", q."folderId",
             q."contactJid", q."contactName", q."updatedAt", q."createdAt",
             q."canEdit", q."ownerName"
      FROM (
        SELECT DISTINCT ON (n.id)
               n.id, n.title, n.emoji, n.color, ns."isPinned", n."isArchived", n."folderId",
               n."contactJid", n."contactName", n."updatedAt", n."createdAt",
               ns."canEdit", ns."order" AS "ordenPropio",
               COALESCE(u.name, u.email) AS "ownerName"
        FROM "note_shares" ns
        JOIN "user_notes" n ON n.id = ns."noteId"
        JOIN "User" u ON u.id = n."userId"
        WHERE ns."userId" = ANY(${identidades}::text[])
          AND n."isArchived" = false
          AND n."userId" <> ${quienMira}
        ORDER BY n.id, ns."canEdit" DESC
      ) q
      ORDER BY q."isPinned" DESC, q."ordenPropio" ASC, q."updatedAt" DESC
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
    const quienMira = await elDuenoDeLasNotas(userId)
    if (!quienMira) return { success: false, error: 'No autorizado.' }
    // Se escribe sobre TODAS sus identidades: cuando la nota llegó por la
    // cuenta, el fijado es **de la cuenta** y lo comparten su dueño y sus
    // administradores. Es lo mismo que pasa hoy entre dos pestañas del dueño, y
    // es coherente con que el compartido sea de la cuenta y no de la persona.
    const res = await db.noteShare.updateMany({
      where: { noteId, userId: { in: await quienesMeCompartenA() } },
      data: { isPinned },
    })
    if (res.count === 0) return { success: false, error: 'No tienes esta nota compartida.' }
    return { success: true }
  } catch {
    return { success: false, error: 'No se pudo fijar la nota.' }
  }
}

// Guardar el orden propio del receptor para una nota compartida.
export async function updateNoteShareOrder(noteId: string, userId: string, order: number): Promise<{ success: boolean }> {
  try {
    const quienMira = await elDuenoDeLasNotas(userId)
    if (!quienMira) return { success: false }
    // Igual que el fijado: si llegó por la cuenta, el orden es de la cuenta.
    await db.noteShare.updateMany({
      where: { noteId, userId: { in: await quienesMeCompartenA() } },
      data: { order },
    })
    return { success: true }
  } catch {
    return { success: false }
  }
}
