'use server';

import { revalidatePath } from 'next/cache';

import { db } from '@/lib/db';
import { getFinanceUser } from '@/lib/finance-user';

interface WipeResult {
  success: boolean;
  message: string;
  data?: { deleted: number };
}

/**
 * Vacía la contabilidad de la cuenta que se está viendo: marca como DELETED
 * todas las ventas y gastos para poder recargarlos desde cero.
 *
 * Solo toca movimientos. NO borra cuentas bancarias, categorías, clientes ni
 * proveedores: esos quedan listos para volver a registrar.
 *
 * Es un borrado lógico (status DELETED), igual que el botón "Eliminar" de cada
 * fila: todas las pantallas y totales de Finanzas ya excluyen los DELETED, así
 * que la vista queda en cero y el dato sigue recuperable en base de datos si
 * hiciera falta.
 */
export async function wipeFinanceTransactions(): Promise<WipeResult> {
  const me = await getFinanceUser();
  if (!me?.id) {
    return { success: false, message: 'No autenticado.' };
  }

  try {
    const wiped = await db.financeTransaction.updateMany({
      where: {
        userId: me.id,
        type: { in: ['SALE', 'EXPENSE'] },
        status: { not: 'DELETED' },
      },
      data: { status: 'DELETED', deletedAt: new Date() },
    });

    revalidatePath('/dashboard/finance');
    revalidatePath('/dashboard/finance/sales');
    revalidatePath('/dashboard/finance/expenses');
    revalidatePath('/dashboard/finance/accounts');

    return {
      success: true,
      message:
        wiped.count > 0
          ? `Se vaciaron ${wiped.count} movimientos.`
          : 'No había movimientos por vaciar.',
      data: { deleted: wiped.count },
    };
  } catch (error) {
    console.error('wipeFinanceTransactions error:', error);
    return { success: false, message: 'No se pudo vaciar la contabilidad.' };
  }
}
