'use server';

import { db } from '@/lib/db';
import { getFinanceUser } from '@/lib/finance-user';

type OperationResponse<T = unknown> = {
  success: boolean;
  message: string;
  data?: T;
};

export async function getFinanceCurrencies(): Promise<
  OperationResponse<{ code: string; name: string; symbol: string; decimals: number }[]>
> {
  try {
    const list = await db.financeCurrency.findMany({
      orderBy: { code: 'asc' },
      select: { code: true, name: true, symbol: true, decimals: true },
    });

    return { success: true, message: 'Monedas obtenidas.', data: list };
  } catch (error) {
    console.error('getFinanceCurrencies error:', error);
    return { success: false, message: 'Error al obtener monedas.' };
  }
}

export async function getUserFinanceSettings(): Promise<
  OperationResponse<{ userId: string; preferredCurrencyCode: string }>
> {
  try {
    // Cuenta que se está viendo, igual que el resto de Finanzas.
    const me = await getFinanceUser();
    if (!me?.id) return { success: false, message: 'Usuario no encontrado.' };

    return {
      success: true,
      message: 'Settings obtenidos.',
      data: { userId: me.id, preferredCurrencyCode: me.preferredCurrencyCode ?? 'COP' },
    };
  } catch (error) {
    console.error('getUserFinanceSettings error:', error);
    return { success: false, message: 'Error al obtener settings.' };
  }
}

export async function updatePreferredCurrencyCode(
  preferredCurrencyCode: string
): Promise<OperationResponse> {
  try {
    // Se escribe sobre la cuenta que se está viendo. Antes se resolvía por
    // email, así que administrando otra cuenta se cambiaba la moneda de la
    // PROPIA en lugar de la de esa cuenta, sin aviso alguno.
    const me = await getFinanceUser();
    if (!me?.id) return { success: false, message: 'No autenticado.' };

    const currency = await db.financeCurrency.findUnique({
      where: { code: preferredCurrencyCode },
      select: { code: true },
    });

    if (!currency) return { success: false, message: 'Moneda inválida.' };

    await db.user.update({
      where: { id: me.id },
      data: { preferredCurrencyCode },
    });

    return { success: true, message: 'Moneda actualizada.' };
  } catch (error) {
    console.error('updatePreferredCurrencyCode error:', error);
    return { success: false, message: error?.message || 'Error al actualizar moneda.' };
  }
}
