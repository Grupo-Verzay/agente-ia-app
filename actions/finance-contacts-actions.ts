'use server';

import { db } from '@/lib/db';
import type { Prisma } from '@prisma/client';
import { isSystemColumnKey, CONTACT_LINK_KEY } from '@/lib/finance-contact-fields';

/**
 * Directorio de contactos de finanzas (proveedores y clientes).
 * Scope por `userId`. Soft-delete con status ACTIVE/DELETED. Los valores llegan
 * en un mapa por clave de campo: las claves de sistema van a columnas reales y
 * el resto a `customFields` (JSON), de acuerdo con la config del constructor.
 * Vínculo opcional a una Session (contacto de WhatsApp), autodetectable por tel.
 */

type Kind = 'SUPPLIER' | 'CLIENT';

export type FinanceContactInput = {
  userId: string;
  values: Record<string, string>;
  sessionId?: number | null;
};

type Resp<T = unknown> = { success: boolean; message: string; data?: T };

const onlyDigits = (s?: string | null) => (s ?? '').replace(/\D/g, '');

/** Separa el mapa de valores en columnas de sistema vs campos personalizados. */
function splitValues(values: Record<string, string>) {
  const columns: Record<string, string | null> = {};
  const custom: Record<string, string> = {};
  for (const [k, raw] of Object.entries(values ?? {})) {
    if (k === CONTACT_LINK_KEY) continue; // el vínculo viaja en sessionId
    const v = (raw ?? '').trim();
    if (isSystemColumnKey(k)) {
      columns[k] = v || null;
    } else if (v) {
      custom[k] = v;
    }
  }
  return { columns, custom };
}

/** Busca una Session del usuario cuyo número coincida con el teléfono dado. */
async function findSessionIdByPhone(userId: string, phone?: string | null): Promise<number | null> {
  const d = onlyDigits(phone);
  if (d.length < 7) return null;
  const session = await db.session.findFirst({
    where: {
      userId,
      NOT: { remoteJid: { endsWith: '@lid' } },
      OR: [{ remoteJid: { contains: d } }, { remoteJidAlt: { contains: d } }],
    },
    orderBy: { createdAt: 'desc' },
    select: { id: true },
  });
  return session?.id ?? null;
}

/** Genera un código incremental por tipo: P-1, P-2… (proveedor) o C-1… (cliente). */
async function nextCode(userId: string, kind: Kind): Promise<string> {
  const prefix = kind === 'SUPPLIER' ? 'P' : 'C';
  const count = await db.financeContact.count({ where: { userId, kind } });
  return `${prefix}-${count + 1}`;
}

export async function getFinanceContacts(userId: string, kind: Kind): Promise<Resp> {
  try {
    if (!userId) return { success: false, message: 'No existe el userId', data: [] };
    const data = await db.financeContact.findMany({
      where: { userId, kind, status: 'ACTIVE' },
      orderBy: { createdAt: 'desc' },
      include: { session: { select: { id: true, pushName: true, customName: true, remoteJid: true } } },
    });
    return { success: true, message: 'OK', data };
  } catch (error) {
    console.error('getFinanceContacts error:', error);
    return { success: false, message: 'Error al obtener contactos', data: [] };
  }
}

export async function createFinanceContact(kind: Kind, input: FinanceContactInput): Promise<Resp> {
  try {
    if (!input.userId) return { success: false, message: 'No existe el userId' };
    const { columns, custom } = splitValues(input.values);
    const name = (columns.name ?? '').toString().trim();
    if (!name) return { success: false, message: 'El nombre es obligatorio' };

    const phone = columns.phone ?? null;
    const sessionId = input.sessionId ?? (await findSessionIdByPhone(input.userId, phone));
    const code = (columns.code || '').toString().trim() || (await nextCode(input.userId, kind));

    const created = await db.financeContact.create({
      data: {
        userId: input.userId,
        kind,
        code,
        name,
        phone,
        email: columns.email ?? null,
        department: columns.department ?? null,
        city: columns.city ?? null,
        address: columns.address ?? null,
        notes: columns.notes ?? null,
        customFields: custom as Prisma.InputJsonValue,
        sessionId,
      },
    });

    return { success: true, message: 'Contacto creado', data: created };
  } catch (error) {
    console.error('createFinanceContact error:', error);
    return { success: false, message: 'Error al crear el contacto' };
  }
}

export async function updateFinanceContact(
  id: string,
  kind: Kind,
  input: FinanceContactInput,
): Promise<Resp> {
  try {
    if (!input.userId) return { success: false, message: 'No existe el userId' };
    const { columns, custom } = splitValues(input.values);
    const name = (columns.name ?? '').toString().trim();
    if (!name) return { success: false, message: 'El nombre es obligatorio' };

    const phone = columns.phone ?? null;
    const sessionId = input.sessionId ?? (await findSessionIdByPhone(input.userId, phone));

    const res = await db.financeContact.updateMany({
      where: { id, userId: input.userId, kind, status: { not: 'DELETED' } },
      data: {
        code: (columns.code || '').toString().trim() || null,
        name,
        phone,
        email: columns.email ?? null,
        department: columns.department ?? null,
        city: columns.city ?? null,
        address: columns.address ?? null,
        notes: columns.notes ?? null,
        customFields: custom as Prisma.InputJsonValue,
        sessionId,
      },
    });

    if (res.count === 0) return { success: false, message: 'Contacto no encontrado' };
    return { success: true, message: 'Contacto actualizado' };
  } catch (error) {
    console.error('updateFinanceContact error:', error);
    return { success: false, message: 'Error al actualizar el contacto' };
  }
}

export async function deleteFinanceContact(id: string, userId: string): Promise<Resp> {
  try {
    if (!userId) return { success: false, message: 'No existe el userId' };
    const res = await db.financeContact.updateMany({
      where: { id, userId, status: { not: 'DELETED' } },
      data: { status: 'DELETED' },
    });
    if (res.count === 0) return { success: false, message: 'Contacto no encontrado' };
    return { success: true, message: 'Contacto eliminado' };
  } catch (error) {
    console.error('deleteFinanceContact error:', error);
    return { success: false, message: 'Error al eliminar el contacto' };
  }
}
