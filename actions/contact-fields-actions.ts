'use server';

import { db } from '@/lib/db';
import {
  ContactFieldDef,
  DEFAULT_CONTACT_FIELDS,
  comoSeGuardaLaFicha,
  normalizeContactFieldsConfig,
} from '@/lib/contact-fields';
import { laCuentaDeLaAccion } from '@/lib/cuenta-de-la-accion';

/**
 * Devuelve la lista EDITABLE de campos de la ficha de una cuenta (Nombre y
 * Teléfono son fijos y no viajan en ella). Sin config guardada la lista es
 * vacía. Una lista de ANTES (arreglo a secas) se migra al leerla —fuera los
 * apagados de fábrica— y se deja escrita ya migrada, para que la cuenta quede
 * en la versión 2 aunque nadie pulse Guardar.
 */
export async function getContactFieldsConfig(userId: string): Promise<ContactFieldDef[]> {
  try {
    // Su hermana `saveContactFieldsConfig` ya preguntaba; a esta se le había
    // pasado. Sin campos no se puede pintar la ficha, así que un rechazo
    // devuelve los de por defecto y no un hueco.
    const cuenta = await laCuentaDeLaAccion(userId);
    if (!cuenta) return DEFAULT_CONTACT_FIELDS;

    const u = await db.user.findUnique({
      where: { id: cuenta },
      select: { contactFieldsConfig: true },
    });
    if (!u?.contactFieldsConfig) return DEFAULT_CONTACT_FIELDS;
    const campos = normalizeContactFieldsConfig(u.contactFieldsConfig);
    if (Array.isArray(u.contactFieldsConfig)) {
      // Best-effort y condicionado a que siga siendo la lista vieja: si otra
      // pestaña guardó entre medias, no se pisa lo suyo.
      await db.$executeRaw`
        UPDATE "User" SET "contact_fields_config" = ${JSON.stringify(comoSeGuardaLaFicha(campos))}::jsonb
        WHERE "id" = ${cuenta} AND jsonb_typeof("contact_fields_config") = 'array'`
        .catch((error) => console.warn('[ficha] no se pudo dejar migrada la lista de campos', {
          cuenta, error: error instanceof Error ? error.message : String(error),
        }));
    }
    return campos;
  } catch {
    return DEFAULT_CONTACT_FIELDS;
  }
}

/**
 * Guarda la config de campos de la ficha de una CUENTA (validada/normalizada).
 *
 * Pasa por la MISMA puerta que su hermana `getContactFieldsConfig` y que el
 * resto de acciones de la ficha (Sheets, datos externos): `laCuentaDeLaAccion`.
 * Tenía una comprobación propia —mismo id, `isAdminOrReseller` del rol de la
 * PERSONA y un `linked_accounts` mirado hacia ARRIBA— que dejaba ver la ficha
 * de una conversación de una cuenta hija y rechazaba guardarla: el
 * administrador de una cuenta (rol `user` en su fila) recibía «No autorizado».
 * Leer y guardar contestan ahora la misma pregunta.
 */
export async function saveContactFieldsConfig(
  userId: string,
  fields: ContactFieldDef[],
): Promise<{ success: boolean; message: string }> {
  const cuenta = await laCuentaDeLaAccion(userId);
  if (!cuenta) {
    return {
      success: false,
      message: 'No autorizado: no tienes acceso a la cuenta dueña de esta conversación.',
    };
  }
  try {
    // Siempre la forma de la versión 2: una lista vacía se guarda vacía (antes
    // se convertía en los 14 campos de fábrica) y nunca lleva los dos fijos.
    const normalized = comoSeGuardaLaFicha(fields);
    // `updateMany` y no `update`: una cuenta que no existe no es una excepción
    // que se trague el `catch`, es un caso que se dice con su nombre.
    const { count } = await db.user.updateMany({
      where: { id: cuenta },
      data: { contactFieldsConfig: normalized as unknown as object },
    });
    if (count === 0) {
      console.warn('[ficha] se pidió guardar los campos de una cuenta que no existe', { cuenta });
      return { success: false, message: 'No se encontró la cuenta dueña de esta conversación.' };
    }
    return { success: true, message: 'Campos guardados' };
  } catch (error) {
    // Nunca mudo: sin esta línea un fallo aquí no deja rastro en ninguna parte.
    const codigo = (error as { code?: string; meta?: { code?: string } })?.meta?.code
      ?? (error as { code?: string })?.code;
    console.error('[ficha] no se pudo guardar la configuración de campos', {
      cuenta,
      codigo,
      error: error instanceof Error ? error.message : String(error),
    });
    return { success: false, message: 'No se pudo guardar la configuración de campos' };
  }
}
