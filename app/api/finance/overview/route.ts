import { NextRequest, NextResponse } from 'next/server';

import { currentUser } from '@/lib/auth';
import { db } from '@/lib/db';

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
}

function startOfNextMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 1, 0, 0, 0, 0);
}

function parseMonthParam(value: string | null) {
  const match = value?.match(/^(\d{4})-(\d{2})$/);
  if (!match) return startOfMonth(new Date());

  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  if (!Number.isFinite(year) || !Number.isFinite(monthIndex) || monthIndex < 0 || monthIndex > 11) {
    return startOfMonth(new Date());
  }

  return new Date(year, monthIndex, 1, 0, 0, 0, 0);
}

function toAmountNumber(v: unknown): number {
  const n = Number(String(v ?? 0));
  return Number.isFinite(n) ? n : 0;
}

function calcTotal(row: { amount?: unknown; extra?: unknown; discount?: unknown }) {
  return toAmountNumber(row.amount) + toAmountNumber(row.extra) - toAmountNumber(row.discount);
}

export async function GET(request: NextRequest) {
  // Cuenta activa (respeta impersonación/cuenta seleccionada), igual que las
  // sub-páginas de Finanzas. Antes se resolvía por email → siempre el usuario
  // logueado, dejando las tarjetas en $0 al ver la cuenta de otro.
  const me = await currentUser();
  if (!me?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const selectedMonth = parseMonthParam(request.nextUrl.searchParams.get('month'));
  const from = startOfMonth(selectedMonth);
  const to = startOfNextMonth(selectedMonth);
  const currencyCode = me.preferredCurrencyCode || 'COP';

  const txs = await db.financeTransaction.findMany({
    where: {
      userId: me.id,
      status: { not: 'DELETED' },
      occurredAt: { gte: from, lt: to },
      type: { in: ['SALE', 'EXPENSE'] },
    },
    select: {
      type: true,
      amount: true,
      extra: true,
      discount: true,
    },
  });

  let sales = 0;
  let expenses = 0;

  for (const tx of txs) {
    const total = calcTotal(tx);
    if (tx.type === 'SALE') sales += total;
    if (tx.type === 'EXPENSE') expenses += total;
  }

  return NextResponse.json({
    currencyCode,
    sales,
    expenses,
    balance: sales - expenses,
    transactions: txs.length,
  });
}
