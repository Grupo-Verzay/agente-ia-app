'use server';

import { db } from '@/lib/db';
import type { Prisma } from '@prisma/client';

/**
 * Directorio de contactos de finanzas (proveedores y clientes).
 * Scope por `userId` (mismo patrón que el resto de finanzas). Soft-delete con
 * status ACTIVE/DELETED. Vínculo opcional a una Session (contacto de WhatsApp),
 * autodetectable por teléfono.
 */

type Kind = 'SUPPLIER' | 'CLIENT';

export type CustomField = { label: string; value: string };

export type FinanceContactInput = {
  userId: string;
  name: string;
  code?: string | null;
  phone?: string | null;
  email?: string | null;
  department?: string | null;
  city?: string | null;
  address?: string | null;
  notes?: string | null;
  customFields?: CustomField[] | null;
  sessionId?: number | null;
};

type Resp<T = unknown> = { success: boolean; message: string; data?: T };

const onlyDigits = (s?: string | null) => (s ?? '').replace(/\D/g, '');

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

function sanitizeCustomFields(fields?: CustomField[] | null): Prisma.InputJsonValue | undefined {
  if (!Array.isArray(fields)) return undefined;
  const clean = fields
    .map((f) => ({ label: String(f?.label ?? '').trim(), value: String(f?.value ?? '').trim() }))
    .filter((f) => f.label || f.value);
  return clean.length ? clean : [];
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
    if (!input.name?.trim()) return { success: false, message: 'El nombre es obligatorio' };

    // Autodetección de session por teléfono si no se vinculó una manualmente.
    const sessionId =
      input.sessionId ?? (await findSessionIdByPhone(input.userId, input.phone));

    const code = input.code?.trim() || (await nextCode(input.userId, kind));

    const created = await db.financeContact.create({
      data: {
        userId: input.userId,
        kind,
        code,
        name: input.name.trim(),
        phone: input.phone?.trim() || null,
        email: input.email?.trim() || null,
        department: input.department?.trim() || null,
        city: input.city?.trim() || null,
        address: input.address?.trim() || null,
        notes: input.notes?.trim() || null,
        customFields: sanitizeCustomFields(input.customFields),
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
    if (!input.name?.trim()) return { success: false, message: 'El nombre es obligatorio' };

    const sessionId =
      input.sessionId ?? (await findSessionIdByPhone(input.userId, input.phone));

    const res = await db.financeContact.updateMany({
      where: { id, userId: input.userId, kind, status: { not: 'DELETED' } },
      data: {
        code: input.code?.trim() || null,
        name: input.name.trim(),
        phone: input.phone?.trim() || null,
        email: input.email?.trim() || null,
        department: input.department?.trim() || null,
        city: input.city?.trim() || null,
        address: input.address?.trim() || null,
        notes: input.notes?.trim() || null,
        customFields: sanitizeCustomFields(input.customFields),
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
