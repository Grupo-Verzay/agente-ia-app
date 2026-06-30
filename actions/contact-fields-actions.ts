'use server';

import { db } from '@/lib/db';
import { currentUser } from '@/lib/auth';
import { isAdminOrReseller } from '@/lib/rbac';
import {
  ContactFieldDef,
  DEFAULT_CONTACT_FIELDS,
  normalizeContactFieldsConfig,
} from '@/lib/contact-fields';

/**
 * Resuelve la cuenta DUEÑA (principal) cuya ficha de contacto debe usarse, para
 * que todo el equipo vea/edite los MISMOS campos y datos:
 * - Subcuenta (User.ownerId) -> el dueño.
 * - Agente/admin vinculado (linked_accounts) -> la cuenta maestra.
 * - Si no, su propia cuenta (effectiveId).
 */
export async function getContactAccountOwnerId(): Promise<string | null> {
  const me = await currentUser();
  if (!me) return null;
  if (me.ownerId) return me.ownerId;
  const realId = me.sessionUserId ?? me.id;
  try {
    const rows = await db.$queryRaw<{ id: string }[]>`
      SELECT "master_user_id" as id FROM "linked_accounts"
      WHERE "linked_user_id" = ${realId}
      LIMIT 1
    `;
    if (rows.length && rows[0]?.id) return rows[0].id;
  } catch {
    // tabla linked_accounts ausente: usar la cuenta propia
  }
  return me.effectiveId ?? me.id;
}

/**
 * Devuelve la config de campos de la ficha de contacto del usuario.
 * Si no tiene config guardada, devuelve los campos por defecto.
 */
export async function getContactFieldsConfig(userId: string): Promise<ContactFieldDef[]> {
  try {
    const u = await db.user.findUnique({
      where: { id: userId },
      select: { contactFieldsConfig: true },
    });
    if (!u?.contactFieldsConfig) return DEFAULT_CONTACT_FIELDS;
    return normalizeContactFieldsConfig(u.contactFieldsConfig);
  } catch {
    return DEFAULT_CONTACT_FIELDS;
  }
}

/** Guarda la config de campos del usuario (validada/normalizada). */
export async function saveContactFieldsConfig(
  userId: string,
  fields: ContactFieldDef[],
): Promise<{ success: boolean; message: string }> {
  try {
    const me = await currentUser();
    if (!me) return { success: false, message: 'No autorizado.' };
    const effectiveId = me.effectiveId ?? me.id;
    const realId = me.sessionUserId ?? me.id;
    let authorized =
      me.id === userId ||
      effectiveId === userId ||
      me.ownerId === userId ||
      isAdminOrReseller(me.role);
    // Equipo: un agente/admin vinculado a la cuenta `userId` (dueño) puede editar
    // los campos de la ficha de esa cuenta, para que se propaguen a todo el equipo.
    if (!authorized) {
      try {
        const rows = await db.$queryRaw<{ ok: number }[]>`
          SELECT 1 as ok FROM "linked_accounts"
          WHERE "master_user_id" = ${userId} AND "linked_user_id" = ${realId}
          LIMIT 1
        `;
        authorized = rows.length > 0;
      } catch {
        // tabla linked_accounts ausente: degradar al chequeo base
      }
    }
    if (!authorized) {
      return { success: false, message: 'No autorizado.' };
    }
    const normalized = normalizeContactFieldsConfig(fields);
    await db.user.update({
      where: { id: userId },
      data: { contactFieldsConfig: normalized as unknown as object },
    });
    return { success: true, message: 'Campos guardados' };
  } catch {
    return { success: false, message: 'No se pudo guardar la configuración de campos' };
  }
}
