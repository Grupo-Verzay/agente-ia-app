'use server';

import { db } from '@/lib/db';
import type { Prisma } from '@prisma/client';
import {
  defaultFields,
  normalizeFields,
  type FinanceContactKind,
  type FinanceFieldDef,
} from '@/lib/finance-contact-fields';

type Resp<T = unknown> = { success: boolean; message: string; data?: T };

/** Obtiene la config de campos del negocio para un tipo, o los defaults. */
export async function getContactFieldConfig(
  userId: string,
  kind: FinanceContactKind,
): Promise<Resp<FinanceFieldDef[]>> {
  try {
    if (!userId) return { success: false, message: 'No existe el userId', data: defaultFields(kind) };
    const row = await db.financeContactFieldConfig.findUnique({
      where: { userId_kind: { userId, kind } },
    });
    const fields = row ? normalizeFields(row.fields, kind) : defaultFields(kind);
    return { success: true, message: 'OK', data: fields };
  } catch (error) {
    console.error('getContactFieldConfig error:', error);
    return { success: false, message: 'Error al obtener la configuración', data: defaultFields(kind) };
  }
}

/** Guarda (upsert) la config de campos del negocio para un tipo. */
export async function saveContactFieldConfig(
  userId: string,
  kind: FinanceContactKind,
  fields: FinanceFieldDef[],
): Promise<Resp<FinanceFieldDef[]>> {
  try {
    if (!userId) return { success: false, message: 'No existe el userId' };

    const normalized = normalizeFields(fields, kind);
    const json = normalized as unknown as Prisma.InputJsonValue;

    await db.financeContactFieldConfig.upsert({
      where: { userId_kind: { userId, kind } },
      create: { userId, kind, fields: json },
      update: { fields: json },
    });

    return { success: true, message: 'Configuración guardada', data: normalized };
  } catch (error) {
    console.error('saveContactFieldConfig error:', error);
    return { success: false, message: 'Error al guardar la configuración' };
  }
}
