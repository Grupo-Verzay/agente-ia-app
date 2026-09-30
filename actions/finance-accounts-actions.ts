'use server';

import { db } from '@/lib/db';
import { exigirLaCuentaDeLaAccion } from '@/lib/cuenta-de-la-accion';

export async function getFinanceAccounts(userIdPedido: string) {
  const userId = await exigirLaCuentaDeLaAccion(userIdPedido);
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
    const { userId: userIdPedido, isDefault } = payload;
    const userId = await exigirLaCuentaDeLaAccion(userIdPedido);

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

/**
 * La cuenta de Finanzas SOLO si es de quien la toca. Editar y borrar iban con
 * `where: { id }` a secas: con la sesión de cualquier cuenta y el id de otra se
 * renombraba —o se borraba— una cuenta ajena, y encima antes se le quitaba la
 * marca de predeterminada a las propias. Es el «un `where` sin dueño es el
 * mismo hueco sin el id delante» de la auditoría: el dueño sale de la fila.
 */
async function laCuentaDeFinanzasPropia(accountId: string, userId: string) {
  if (!accountId || !userId) return null;
  return db.financeAccount.findFirst({ where: { id: accountId, userId }, select: { id: true, name: true } });
}

export async function updateFinanceAccount(
  accountId: string,
  userIdPedido: string,
  payload: Partial<{
    name: string;
    type: 'PERSONAL' | 'COMPANY';
    currencyCode: string;
    isDefault: boolean;
  }>
) {
  const userId = await exigirLaCuentaDeLaAccion(userIdPedido);
  try {
    if (!(await laCuentaDeFinanzasPropia(accountId, userId))) {
      return { success: false, message: 'Cuenta no encontrada.' };
    }

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

export async function deleteFinanceAccount(accountId: string, userIdPedido: string) {
  const userId = await exigirLaCuentaDeLaAccion(userIdPedido);
  try {
    const propia = await laCuentaDeFinanzasPropia(accountId, userId);
    if (!propia) return { success: false, message: 'Cuenta no encontrada.' };

    // Una cuenta con movimientos no se puede borrar: la base lo impide (sus
    // ventas y gastos apuntan a ella) y el error que salía era el de Prisma,
    // en inglés. Se dice antes, con palabras, y cuántos son. Los movimientos
    // ya eliminados también la sujetan —se borran marcándolos, la fila sigue—,
    // pero no se ven en ninguna lista: contarlos como «tiene 3 movimientos»
    // mandaría a buscar tres filas que no están.
    const [vivos, todos] = await Promise.all([
      db.financeTransaction.count({ where: { accountId, userId, status: { not: 'DELETED' } } }),
      db.financeTransaction.count({ where: { accountId, userId } }),
    ]);
    if (vivos > 0) {
      return {
        success: false,
        message: `«${propia.name}» tiene ${vivos} movimiento(s) y no se puede eliminar.`,
      };
    }
    if (todos > 0) {
      return {
        success: false,
        message: `«${propia.name}» guarda movimientos ya eliminados y no se puede eliminar.`,
      };
    }

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
