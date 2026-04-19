'use server';

import { db } from '@/lib/db';

export async function getFinanceAccounts(userId: string) {
  try {
    const data = await db.financeAccount.findMany({
      where: { userId },
      include: { currency: true },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });

    return { success: true, data };
  } catch (e: any) {
    return { success: false, message: e?.message || 'Error listando cuentas' };
  }
}

export async function createFinanceAccount(payload: {
  userId: string;
  name: string;
  type: 'PERSONAL' | 'COMPANY';
  currencyCode: string;
  isDefault?: boolean;
}) {
  try {
    const { userId, isDefault } = payload;

    // si viene default -> desmarcar las otras
    if (isDefault) {
      await db.financeAccount.updateMany({
        where: { userId, isDefault: true },
        data: { isDefault: false },
      });
    }

    const created = await db.financeAccount.create({
      data: {
        userId,
        name: payload.name,
        type: payload.type,
        currencyCode: payload.currencyCode,
        isDefault: !!payload.isDefault,
      },
      include: { currency: true },
    });

    return { success: true, data: created };
  } catch (e: any) {
    return { success: false, message: e?.message || 'Error creando cuenta' };
  }
}

// ESTA ES LA QUE TE FALTA / NO ESTÁ EXPORTADA
export async function updateFinanceAccount(
  accountId: string,
  userId: string,
  payload: Partial<{
    name: string;
    type: 'PERSONAL' | 'COMPANY';
    currencyCode: string;
    isDefault: boolean;
  }>
) {
  try {
    // si se marca default -> desmarcar las otras
    if (payload.isDefault) {
      await db.financeAccount.updateMany({
        where: { userId, isDefault: true },
        data: { isDefault: false },
      });
    }

    const updated = await db.financeAccount.update({
      where: { id: accountId },
      data: {
        ...(payload.name !== undefined ? { name: payload.name } : {}),
        ...(payload.type !== undefined ? { type: payload.type } : {}),
        ...(payload.currencyCode !== undefined ? { currencyCode: payload.currencyCode } : {}),
        ...(payload.isDefault !== undefined ? { isDefault: payload.isDefault } : {}),
      },
      include: { currency: true },
    });

    return { success: true, data: updated };
  } catch (e: any) {
    return { success: false, message: e?.message || 'Error actualizando cuenta' };
  }
}

export async function deleteFinanceAccount(accountId: string, userId: string) {
  try {
    // opcional: impedir borrar default si quieres
    // const acc = await db.financeAccount.findUnique({ where: { id: accountId } });
    // if (acc?.isDefault) return { success:false, message:'No puedes borrar la cuenta default' };

    await db.financeAccount.delete({
      where: { id: accountId },
    });

    // opcional: si quedó sin default, setear uno
    const hasDefault = await db.financeAccount.findFirst({
      where: { userId, isDefault: true },
      select: { id: true },
    });

    if (!hasDefault) {
      const first = await db.financeAccount.findFirst({
        where: { userId },
        orderBy: { createdAt: 'asc' },
        select: { id: true },
      });

      if (first?.id) {
        await db.financeAccount.update({
          where: { id: first.id },
          data: { isDefault: true },
        });
      }
    }

    return { success: true };
  } catch (e: any) {
    return { success: false, message: e?.message || 'Error eliminando cuenta' };
  }
}
