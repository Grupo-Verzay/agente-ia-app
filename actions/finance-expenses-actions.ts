'use server';

import { db } from '@/lib/db';
import { Prisma, FinanceTxType, FinanceTxStatus } from '@prisma/client';

type ExpenseRow = Prisma.FinanceTransactionGetPayload<{
  include: {
    account: true;
    category: true;
    currency: true;
    attachments: true;
  };
}>;

type AttachmentInput = {
  url: string;
  fileName?: string | null;
  mimeType?: string | null;
  sizeBytes?: number | null;
};

interface ExpenseOperationResponse<T = unknown> {
  success: boolean;
  message: string;
  data?: T;
}

/**
 * Defaults mínimos:
 * - Monedas USD/COP (catálogo)
 * - Cuenta por defecto "Empresa"
 * - Categorías base de gastos
 */
export async function ensureFinanceDefaults(userId: string): Promise<ExpenseOperationResponse> {
  try {
    // Monedas (catálogo global)
    await db.financeCurrency.upsert({
      where: { code: 'USD' },
      update: {},
      create: { code: 'USD', name: 'US Dollar', symbol: '$', decimals: 2 },
    });

    await db.financeCurrency.upsert({
      where: { code: 'COP' },
      update: {},
      create: { code: 'COP', name: 'Peso Colombiano', symbol: 'COP$', decimals: 2 },
    });

    // Cuenta por defecto
    const hasAccount = await db.financeAccount.findFirst({
      where: { userId },
      select: { id: true },
    });

    if (!hasAccount) {
      await db.financeAccount.create({
        data: {
          userId,
          name: 'Empresa',
          type: 'COMPANY',
          isDefault: true,
        },
      });
    }

    // Categorías base (gastos)
    const defaultCats = ['API', 'Servidores', 'Salarios', 'Marketing', 'Herramientas'];

    await db.financeCategory.createMany({
      data: defaultCats.map((name) => ({
        userId,
        name,
        type: 'EXPENSE',
      })),
      skipDuplicates: true,
    });

    return { success: true, message: 'Defaults de finanzas verificados.' };
  } catch (error) {
    console.error('ensureFinanceDefaults error:', error);
    return { success: false, message: 'Error al crear/verificar defaults de finanzas.' };
  }
}

//  helper para convertir Decimal -> string (plain object)
function serializeExpense(row: ExpenseRow) {
  return {
    ...row,
    amount: row.amount?.toString?.() ?? String(row.amount),
  };
}

export async function getAllExpenses(
  userId: string
): Promise<ExpenseOperationResponse<any[]>> {
  try {
    await ensureFinanceDefaults(userId);

    const list = await db.financeTransaction.findMany({
      where: {
        userId,
        type: 'EXPENSE',
        status: { not: 'DELETED' },
      },
      orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }],
      include: {
        account: true,
        category: true,
        currency: true,
        attachments: true,
      },
      take: 200,
    });

    //  aquí quitamos Decimal
    const safe = list.map(serializeExpense);

    return {
      success: true,
      message: 'Gastos obtenidos correctamente.',
      data: safe,
    };
  } catch (error) {
    console.error('getAllExpenses error:', error);
    return { success: false, message: 'Error al obtener los gastos.' };
  }
}


export async function getExpensesMeta(userId: string): Promise<
  ExpenseOperationResponse<{
    accounts: any[];
    categories: any[];
    currencies: any[];
  }>
> {
  try {
    await ensureFinanceDefaults(userId);

    const [accounts, categories, currencies] = await Promise.all([
      db.financeAccount.findMany({
        where: { userId },
        orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
      }),
      db.financeCategory.findMany({
        where: { userId, type: 'EXPENSE' },
        orderBy: [{ order: 'asc' }, { name: 'asc' }],
      }),
      db.financeCurrency.findMany({
        orderBy: { code: 'asc' },
      }),
    ]);

    return {
      success: true,
      message: 'Meta de gastos obtenida correctamente.',
      data: { accounts, categories, currencies },
    };
  } catch (error) {
    console.error('getExpensesMeta error:', error);
    return { success: false, message: 'Error al obtener meta de gastos.' };
  }
}

/**
 *  Crea gasto y devuelve el id (necesario para adjuntar recibos luego)
 */
export async function createExpense(data: {
  userId: string;
  occurredAt: string | Date;
  amount: string | number;
  currencyCode: string;
  accountId: string;
  categoryId?: string | null;
  title?: string | null;
  description?: string | null;
  counterparty?: string | null;
  reference?: string | null;
}): Promise<ExpenseOperationResponse<{ id: string }>> {
  try {
    await ensureFinanceDefaults(data.userId);

    const created = await db.financeTransaction.create({
      data: {
        userId: data.userId,
        type: 'EXPENSE',
        status: 'ACTIVE',
        occurredAt: data.occurredAt instanceof Date ? data.occurredAt : new Date(data.occurredAt),
        amount: new Prisma.Decimal(String(data.amount)),
        currencyCode: data.currencyCode,
        accountId: data.accountId,
        categoryId: data.categoryId ?? null,
        title: data.title ?? null,
        description: data.description ?? null,
        counterparty: data.counterparty ?? null,
        reference: data.reference ?? null,
      },
      select: { id: true },
    });

    return { success: true, message: 'Gasto creado correctamente.', data: { id: created.id } };
  } catch (error) {
    console.error('createExpense error:', error);
    return { success: false, message: 'Error al crear el gasto.' };
  }
}

export async function updateExpense(
  id: string,
  userId: string,
  data: Partial<{
    occurredAt: string | Date;
    amount: string | number;
    currencyCode: string;
    accountId: string;
    categoryId: string | null;
    title: string | null;
    description: string | null;
    counterparty: string | null;
    reference: string | null;
  }>
): Promise<ExpenseOperationResponse> {
  try {
    const payload: any = { ...data };

    if (payload.occurredAt) {
      payload.occurredAt =
        payload.occurredAt instanceof Date ? payload.occurredAt : new Date(payload.occurredAt);
    }

    if (payload.amount !== undefined) {
      payload.amount = new Prisma.Decimal(String(payload.amount));
    }

    const updated = await db.financeTransaction.updateMany({
      where: { id, userId, type: 'EXPENSE', status: { not: 'DELETED' } },
      data: payload,
    });

    if (updated.count === 0) {
      return { success: false, message: 'Gasto no encontrado o no editable.' };
    }

    return { success: true, message: 'Gasto actualizado correctamente.' };
  } catch (error) {
    console.error('updateExpense error:', error);
    return { success: false, message: 'Error al actualizar el gasto.' };
  }
}

export async function deleteExpense(id: string, userId: string): Promise<ExpenseOperationResponse> {
  try {
    const deleted = await db.financeTransaction.updateMany({
      where: { id, userId, type: 'EXPENSE' },
      data: { status: 'DELETED', deletedAt: new Date() },
    });

    if (deleted.count === 0) {
      return { success: false, message: 'Gasto no encontrado.' };
    }

    return { success: true, message: 'Gasto eliminado correctamente.' };
  } catch (error) {
    console.error('deleteExpense error:', error);
    return { success: false, message: 'Error al eliminar el gasto.' };
  }
}

/**
 *  Adjuntar soportes (recibos) a un gasto
 */
export async function addExpenseAttachments(params: {
  userId: string;
  transactionId: string;
  attachments: AttachmentInput[];
}): Promise<ExpenseOperationResponse> {
  try {
    const { userId, transactionId, attachments } = params;

    if (!attachments?.length) {
      return { success: true, message: 'Sin soportes para agregar.' };
    }

    //  Validar que el gasto existe y pertenece al user
    const tx = await db.financeTransaction.findFirst({
      where: {
        id: transactionId,
        userId,
        type: FinanceTxType.EXPENSE,
        status: { not: FinanceTxStatus.DELETED },
      },
      select: { id: true },
    });

    if (!tx) return { success: false, message: 'Gasto no encontrado.' };

    await db.financeAttachment.createMany({
      data: attachments.map((a) => ({
        userId,
        transactionId,
        url: a.url,
        fileName: a.fileName ?? null,
        mimeType: a.mimeType ?? null,
        sizeBytes: a.sizeBytes ?? null,
      })),
      skipDuplicates: true,
    });

    return { success: true, message: 'Soportes agregados.' };
  } catch (error) {
    console.error('addExpenseAttachments error:', error);
    return { success: false, message: 'Error al agregar soportes.' };
  }
}

/**
 *  Eliminar un soporte (solo si pertenece al user)
 */
export async function deleteExpenseAttachment(params: {
  userId: string;
  attachmentId: string;
}): Promise<ExpenseOperationResponse> {
  try {
    const { userId, attachmentId } = params;

    const deleted = await db.financeAttachment.deleteMany({
      where: { id: attachmentId, userId },
    });

    if (deleted.count === 0) {
      return { success: false, message: 'Soporte no encontrado.' };
    }

    return { success: true, message: 'Soporte eliminado.' };
  } catch (error) {
    console.error('deleteExpenseAttachment error:', error);
    return { success: false, message: 'Error al eliminar soporte.' };
  }
}
