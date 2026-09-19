'use server';

import { db } from '@/lib/db';
import { exigirLaCuentaDeLaAccion } from '@/lib/cuenta-de-la-accion';
import { revalidatePath } from 'next/cache';
import { Decimal } from '@prisma/client/runtime/library';

export type CotizacionStatus = 'borrador' | 'enviada' | 'confirmada' | 'cancelada';

export interface CotizacionItemInput {
  productId?: string | null;
  title: string;
  unitPrice: number;
  quantity: number;
}

export interface CotizacionInput {
  userId: string;
  clientName: string;
  clientPhone?: string;
  status?: CotizacionStatus;
  notes?: string;
  items: CotizacionItemInput[];
}

function calcTotal(items: CotizacionItemInput[]): number {
  return items.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0);
}

export async function listCotizaciones(userId: string) {
  const cuenta = await exigirLaCuentaDeLaAccion(userId);
  const rows = await db.cotizacion.findMany({
    where: { userId: cuenta },
    orderBy: { createdAt: 'desc' },
    include: { items: true },
  });
  return rows.map((c) => ({
    ...c,
    total: Number(c.total),
    items: c.items.map((i) => ({
      ...i,
      unitPrice: Number(i.unitPrice),
      subtotal: Number(i.subtotal),
    })),
  }));
}

export async function getCotizacion(id: string, userId: string) {
  const cuenta = await exigirLaCuentaDeLaAccion(userId);
  const c = await db.cotizacion.findFirst({
    where: { id, userId: cuenta },
    include: { items: true },
  });
  if (!c) return null;
  return {
    ...c,
    total: Number(c.total),
    items: c.items.map((i) => ({
      ...i,
      unitPrice: Number(i.unitPrice),
      subtotal: Number(i.subtotal),
    })),
  };
}

export async function createCotizacion(input: CotizacionInput) {
  const cuenta = await exigirLaCuentaDeLaAccion(input.userId);
  const total = calcTotal(input.items);
  const cotizacion = await db.cotizacion.create({
    data: {
      userId: cuenta,
      clientName: input.clientName.trim(),
      clientPhone: input.clientPhone?.trim() || null,
      status: input.status ?? 'borrador',
      notes: input.notes?.trim() || null,
      total,
      items: {
        create: input.items.map((i) => ({
          productId: i.productId ?? null,
          title: i.title.trim(),
          unitPrice: i.unitPrice,
          quantity: i.quantity,
          subtotal: i.unitPrice * i.quantity,
        })),
      },
    },
    include: { items: true },
  });
  revalidatePath('/cotizaciones');
  return { ...cotizacion, total: Number(cotizacion.total) };
}

export async function updateCotizacion(id: string, userId: string, input: Partial<CotizacionInput>) {
  const cuenta = await exigirLaCuentaDeLaAccion(userId);
  const existing = await db.cotizacion.findFirst({ where: { id, userId: cuenta } });
  if (!existing) throw new Error('Cotización no encontrada.');
  if (existing.status === 'confirmada') throw new Error('No se puede editar una cotización confirmada.');

  const updateData: any = {};
  if (input.clientName !== undefined) updateData.clientName = input.clientName.trim();
  if (input.clientPhone !== undefined) updateData.clientPhone = input.clientPhone?.trim() || null;
  if (input.status !== undefined) updateData.status = input.status;
  if (input.notes !== undefined) updateData.notes = input.notes?.trim() || null;

  if (input.items) {
    updateData.total = calcTotal(input.items);
    await db.cotizacionItem.deleteMany({ where: { cotizacionId: id } });
    updateData.items = {
      create: input.items.map((i) => ({
        productId: i.productId ?? null,
        title: i.title.trim(),
        unitPrice: i.unitPrice,
        quantity: i.quantity,
        subtotal: i.unitPrice * i.quantity,
      })),
    };
  }

  const updated = await db.cotizacion.update({
    where: { id },
    data: updateData,
    include: { items: true },
  });
  revalidatePath('/cotizaciones');
  return { ...updated, total: Number(updated.total) };
}

export async function deleteCotizacion(id: string, userId: string) {
  const cuenta = await exigirLaCuentaDeLaAccion(userId);
  await db.cotizacion.deleteMany({ where: { id, userId: cuenta } });
  revalidatePath('/cotizaciones');
  return { ok: true };
}

export async function confirmarVenta(id: string, userId: string) {
  const cuenta = await exigirLaCuentaDeLaAccion(userId);
  const cotizacion = await db.cotizacion.findFirst({
    where: { id, userId: cuenta },
    include: { items: true },
  });
  if (!cotizacion) throw new Error('Cotización no encontrada.');
  if (cotizacion.status === 'confirmada') throw new Error('Ya está confirmada.');

  // Descontar stock de cada producto vinculado
  for (const item of cotizacion.items) {
    if (!item.productId) continue;
    await db.product.updateMany({
      where: { id: item.productId, userId: cuenta, stock: { gte: item.quantity } },
      data: { stock: { decrement: item.quantity } },
    });
  }

  const updated = await db.cotizacion.update({
    where: { id },
    data: { status: 'confirmada' },
  });
  revalidatePath('/cotizaciones');
  revalidatePath('/products');
  return updated;
}
