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
    if (me.id !== userId && effectiveId !== userId && !isAdminOrReseller(me.role)) {
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
