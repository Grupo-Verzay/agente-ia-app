'use server';

import { db } from '@/lib/db';
import { auth } from '@/auth';

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
  } catch (error: any) {
    console.error('getFinanceCurrencies error:', error);
    return { success: false, message: 'Error al obtener monedas.' };
  }
}

export async function getUserFinanceSettings(): Promise<
  OperationResponse<{ userId: string; preferredCurrencyCode: string }>
> {
  try {
    const session = await auth();
    const email = session?.user?.email;
    if (!email) return { success: false, message: 'No autenticado.' };

    const me = await db.user.findUnique({
      where: { email },
      select: { id: true, preferredCurrencyCode: true },
    });

    if (!me?.id) return { success: false, message: 'Usuario no encontrado.' };

    return {
      success: true,
      message: 'Settings obtenidos.',
      data: { userId: me.id, preferredCurrencyCode: me.preferredCurrencyCode ?? 'COP' },
    };
  } catch (error: any) {
    console.error('getUserFinanceSettings error:', error);
    return { success: false, message: 'Error al obtener settings.' };
  }
}

export async function updatePreferredCurrencyCode(
  preferredCurrencyCode: string
): Promise<OperationResponse> {
  try {
    const session = await auth();
    const email = session?.user?.email;
    if (!email) return { success: false, message: 'No autenticado.' };

    const currency = await db.financeCurrency.findUnique({
      where: { code: preferredCurrencyCode },
      select: { code: true },
    });

    if (!currency) return { success: false, message: 'Moneda inválida.' };

    await db.user.update({
      where: { email },
      data: { preferredCurrencyCode },
    });

    return { success: true, message: 'Moneda actualizada.' };
  } catch (error: any) {
    console.error('updatePreferredCurrencyCode error:', error);
    return { success: false, message: error?.message || 'Error al actualizar moneda.' };
  }
}
