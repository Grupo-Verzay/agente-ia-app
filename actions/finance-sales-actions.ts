'use server';

import { db } from '@/lib/db';
import { Prisma } from '@prisma/client';

type AttachmentInput = {
  url: string;
  fileName?: string | null;
  mimeType?: string | null;
  sizeBytes?: number | null;
};

interface OperationResponse<T = unknown> {
  success: boolean;
  message: string;
  data?: T;
}

function serializeTx(tx: any) {
  return {
    ...tx,
    amount: tx.amount?.toString?.() ?? String(tx.amount ?? '0'),
    extra: tx.extra?.toString?.() ?? String(tx.extra ?? '0'),
    discount: tx.discount?.toString?.() ?? String(tx.discount ?? '0'),
    occurredAt: tx.occurredAt ? new Date(tx.occurredAt).toISOString() : null,
    createdAt: tx.createdAt ? new Date(tx.createdAt).toISOString() : null,
    updatedAt: tx.updatedAt ? new Date(tx.updatedAt).toISOString() : null,
    deletedAt: tx.deletedAt ? new Date(tx.deletedAt).toISOString() : null,
  };
}

// IMPORTANTE: tu enum es FinanceTxType: SALE | EXPENSE
const SALES_TYPE = 'SALE' as any;

function toDecimalOrUndefined(v: any) {
  if (v === undefined) return undefined;
  if (v === null) return new Prisma.Decimal('0');
  const s = String(v).trim();
  if (!s) return new Prisma.Decimal('0');
  return new Prisma.Decimal(s);
}

export async function ensureFinanceSalesDefaults(userId: string): Promise<OperationResponse> {
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
        data: { userId, name: 'Empresa', type: 'COMPANY' as any, isDefault: true },
      });
    }

    // Categorías base (ventas)
    const defaultCats = ['Ventas', 'Servicios', 'Suscripciones', 'Otros'];

    await db.financeCategory.createMany({
      data: defaultCats.map((name, idx) => ({
        userId,
        name,
        type: SALES_TYPE,
        order: idx + 1,
      })),
      skipDuplicates: true,
    });

    return { success: true, message: 'Defaults de ventas verificados.' };
  } catch (error: any) {
    console.error('ensureFinanceSalesDefaults error:', error);
    return { success: false, message: `Defaults ventas: ${error?.message || 'Error'}` };
  }
}

export async function getAllSales(userId: string): Promise<OperationResponse<any[]>> {
  try {
    await ensureFinanceSalesDefaults(userId);

    const list = await db.financeTransaction.findMany({
      where: {
        userId,
        type: SALES_TYPE,
        status: { not: 'DELETED' as any },
      },
      orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }],
      include: {
        account: true,
        category: true,
        currency: true,
        attachments: true,
        session: {
          select: {
            id: true,
            pushName: true,
            remoteJid: true,
          },
        },
      },
      take: 200,
    });

    return {
      success: true,
      message: 'Ventas obtenidas correctamente.',
      data: list.map(serializeTx),
    };
  } catch (error) {
    console.error('getAllSales error:', error);
    return { success: false, message: 'Error al obtener ventas.' };
  }
}

export async function getSalesMeta(
  userId: string
): Promise<OperationResponse<{ accounts: any[]; categories: any[]; currencies: any[] }>> {
  try {
    await ensureFinanceSalesDefaults(userId);

    const [accounts, categories, currencies] = await Promise.all([
      db.financeAccount.findMany({
        where: { userId },
        orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
      }),
      db.financeCategory.findMany({
        where: { userId, type: SALES_TYPE },
        orderBy: [{ order: 'asc' }, { name: 'asc' }],
      }),
      db.financeCurrency.findMany({ orderBy: { code: 'asc' } }),
    ]);

    return { success: true, message: 'Meta de ventas obtenida.', data: { accounts, categories, currencies } };
  } catch (error) {
    console.error('getSalesMeta error:', error);
    return { success: false, message: 'Error al obtener meta de ventas.' };
  }
}

export async function createSale(data: {
  userId: string;
  occurredAt: string | Date;
  amount: string | number;
  extra?: string | number | null;
  discount?: string | number | null;
  currencyCode: string;
  accountId: string;
  categoryId?: string | null;
  title?: string | null;
  description?: string | null;

  // contacto/sesión
  sessionId?: number | null;
  counterparty?: string | null;
  reference?: string | null;

  // 👇 si llega desde el front lo ignoramos
  productId?: any;
}): Promise<OperationResponse<{ id: string }>> {
  try {
    await ensureFinanceSalesDefaults(data.userId);

    const created = await db.financeTransaction.create({
      data: {
        userId: data.userId,
        type: SALES_TYPE,
        status: 'ACTIVE' as any,
        occurredAt: data.occurredAt instanceof Date ? data.occurredAt : new Date(data.occurredAt),
        amount: new Prisma.Decimal(String(data.amount)),
        extra: toDecimalOrUndefined(data.extra) ?? new Prisma.Decimal('0'),
        discount: toDecimalOrUndefined(data.discount) ?? new Prisma.Decimal('0'),
        currencyCode: data.currencyCode,
        accountId: data.accountId,
        categoryId: data.categoryId ?? null,
        title: data.title ?? null,
        description: data.description ?? null,

        // guarda contacto real
        sessionId: data.sessionId ?? null,

        // snapshot opcional
        counterparty: data.counterparty ?? null,
        reference: data.reference ?? null,
      },
      select: { id: true },
    });

    return { success: true, message: 'Venta creada.', data: { id: created.id } };
  } catch (error: any) {
    console.error('createSale error:', error);
    return { success: false, message: error?.message || 'Error al crear venta.' };
  }
}

export async function updateSale(
  id: string,
  userId: string,
  data: Partial<{
    occurredAt: string | Date;
    amount: string | number | null;
    extra: string | number | null;
    discount: string | number | null;
    currencyCode: string;
    accountId: string;
    categoryId: string | null;
    title: string | null;
    description: string | null;

    // contacto/sesión
    sessionId: number | null;
    counterparty: string | null;
    reference: string | null;

    // 👇 si por error te llega desde el front, lo ignoramos
    userId?: string;
    type?: any;
    status?: any;
    createdAt?: any;
    updatedAt?: any;
    deletedAt?: any;
    productId?: any;
  }>
): Promise<OperationResponse> {
  try {
    const payload: any = {};

    if (data.occurredAt !== undefined) {
      payload.occurredAt = data.occurredAt instanceof Date ? data.occurredAt : new Date(data.occurredAt);
    }

    const amount = toDecimalOrUndefined(data.amount);
    if (amount !== undefined) payload.amount = amount;

    const extra = toDecimalOrUndefined(data.extra);
    if (extra !== undefined) payload.extra = extra;

    const discount = toDecimalOrUndefined(data.discount);
    if (discount !== undefined) payload.discount = discount;

    if (data.currencyCode !== undefined) payload.currencyCode = data.currencyCode;
    if (data.accountId !== undefined) payload.accountId = data.accountId;
    if (data.categoryId !== undefined) payload.categoryId = data.categoryId;
    if (data.title !== undefined) payload.title = data.title;
    if (data.description !== undefined) payload.description = data.description;

    // contacto real + snapshot
    if (data.sessionId !== undefined) payload.sessionId = data.sessionId;
    if (data.counterparty !== undefined) payload.counterparty = data.counterparty;
    if (data.reference !== undefined) payload.reference = data.reference;

    const updated = await db.financeTransaction.updateMany({
      where: {
        id,
        userId,
        type: SALES_TYPE,
        status: { not: 'DELETED' as any },
      },
      data: payload,
    });

    if (updated.count === 0) return { success: false, message: 'Venta no encontrada o no editable.' };
    return { success: true, message: 'Venta actualizada.' };
  } catch (error: any) {
    console.error('updateSale error:', error);
    return { success: false, message: error?.message || 'Error al actualizar venta.' };
  }
}

export async function deleteSale(id: string, userId: string): Promise<OperationResponse> {
  try {
    const deleted = await db.financeTransaction.updateMany({
      where: { id, userId, type: SALES_TYPE },
      data: { status: 'DELETED' as any, deletedAt: new Date() },
    });

    if (deleted.count === 0) return { success: false, message: 'Venta no encontrada.' };
    return { success: true, message: 'Venta eliminada.' };
  } catch (error) {
    console.error('deleteSale error:', error);
    return { success: false, message: 'Error al eliminar venta.' };
  }
}

export async function addSaleAttachments(params: {
  userId: string;
  transactionId: string;
  attachments: AttachmentInput[];
}): Promise<OperationResponse> {
  try {
    const { userId, transactionId, attachments } = params;
    if (!attachments?.length) return { success: true, message: 'Sin soportes.' };

    const tx = await db.financeTransaction.findFirst({
      where: { id: transactionId, userId, type: SALES_TYPE, status: { not: 'DELETED' as any } },
      select: { id: true },
    });

    if (!tx) return { success: false, message: 'Venta no encontrada.' };

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
    console.error('addSaleAttachments error:', error);
    return { success: false, message: 'Error al agregar soportes.' };
  }
}

export async function deleteSaleAttachment(params: {
  userId: string;
  attachmentId: string;
}): Promise<OperationResponse> {
  try {
    const { userId, attachmentId } = params;

    const deleted = await db.financeAttachment.deleteMany({
      where: { id: attachmentId, userId },
    });

    if (deleted.count === 0) return { success: false, message: 'Soporte no encontrado.' };
    return { success: true, message: 'Soporte eliminado.' };
  } catch (error) {
    console.error('deleteSaleAttachment error:', error);
    return { success: false, message: 'Error al eliminar soporte.' };
  }
}
