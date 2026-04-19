import Link from 'next/link';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

import { db } from '@/lib/db';
import { auth } from '@/auth';

import { CalendarDays, TrendingUp, TrendingDown, Wallet, Settings } from 'lucide-react';
import { FinanceMonthChart } from './_components/FinanceMonthChart';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
}
function startOfNextMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 1, 0, 0, 0, 0);
}

function toAmountNumber(v: any): number {
  const n = Number(String(v ?? 0));
  return Number.isFinite(n) ? n : 0;
}

function calcTotal(row: { amount?: any; extra?: any; discount?: any }) {
  const base = toAmountNumber(row.amount);
  const extra = toAmountNumber(row.extra);
  const disc = toAmountNumber(row.discount);
  return base + extra - disc;
}

function pad2(n: number) {
  return String(n).padStart(2, '0');
}
function keyYMD(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function moneyFormat(meta: { code: string; symbol: string; decimals: number } | undefined, value: number) {
  const code = meta?.code ?? 'COP';
  const decimals = typeof meta?.decimals === 'number' ? meta.decimals : 2;

  try {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: code,
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(value);
  } catch {
    const symbol = meta?.symbol ? `${meta.symbol} ` : '';
    return `${symbol}${value.toFixed(decimals)} ${code}`;
  }
}

export default async function FinanceHomePage() {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) return null;

  const me = await db.user.findUnique({
    where: { email },
    select: { id: true, preferredCurrencyCode: true },
  });
  if (!me?.id) return null;

  const now = new Date();
  const from = startOfMonth(now);
  const to = startOfNextMonth(now);

  const currencies = await db.financeCurrency.findMany({
    orderBy: { code: 'asc' },
    select: { code: true, symbol: true, decimals: true },
  });

  const preferredCode = me.preferredCurrencyCode || 'COP';
  const preferredMeta = currencies.find((c) => c.code === preferredCode);
  const formatPreferred = (n: number) => moneyFormat(preferredMeta, n);

  const monthTx = await db.financeTransaction.findMany({
    where: {
      userId: me.id,
      status: { not: 'DELETED' as any },
      occurredAt: { gte: from, lt: to },
      type: { in: ['SALE', 'EXPENSE'] as any },
    },
    select: {
      type: true,
      occurredAt: true,
      amount: true,
      extra: true,
      discount: true,
    },
    orderBy: { occurredAt: 'asc' },
  });

  let salesCombined = 0;
  let expensesCombined = 0;

  for (const r of monthTx) {
    const total = calcTotal(r);
    if (r.type === 'SALE') salesCombined += total;
    if (r.type === 'EXPENSE') expensesCombined += total;
  }

  const netCombined = salesCombined - expensesCombined;

  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const dayRows = Array.from({ length: daysInMonth }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth(), i + 1);
    return { day: i + 1, key: keyYMD(d), sales: 0, expenses: 0 };
  });

  const dayIndex = new Map<string, number>();
  dayRows.forEach((r, idx) => dayIndex.set(r.key, idx));

  for (const r of monthTx) {
    const k = keyYMD(new Date(r.occurredAt));
    const idx = dayIndex.get(k);
    if (idx === undefined) continue;

    const total = calcTotal(r);
    if (r.type === 'SALE') dayRows[idx].sales += total;
    if (r.type === 'EXPENSE') dayRows[idx].expenses += total;
  }

  const monthLabel = now.toLocaleDateString('es-CO', { month: 'long', year: 'numeric' });

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-0.5">
          <h1 className="text-xl font-semibold leading-none tracking-tight">Finanzas</h1>
          <p className="text-sm text-muted-foreground">Resumen del mes actual.</p>
        </div>

        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="h-8 px-3 text-xs">
            <span className="inline-flex items-center gap-1">
              <CalendarDays className="h-4 w-4" />
              {monthLabel}
            </span>
          </Badge>

          <Button asChild variant="outline" className="h-9">
            <Link href="/dashboard/finance/settings" className="inline-flex items-center gap-2">
              <Settings className="h-4 w-4" />
              Configuración
            </Link>
          </Button>
        </div>
      </div>

      {/* Totales clickeables */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {/* Ventas */}
        <Link href="/dashboard/finance/sales" className="block">
          <Card className="border-border transition hover:bg-muted/40">
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl border bg-muted/40">
                    <TrendingUp className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div className="space-y-0.5">
                    <CardTitle className="text-sm">Ventas del mes</CardTitle>
                    <p className="text-xs text-muted-foreground">Ver ventas</p>
                  </div>
                </div>

                <Badge variant="outline" className="h-7 px-2 text-[11px]">
                  {preferredCode}
                </Badge>
              </div>
            </CardHeader>

            <CardContent className="pt-0">
              <p className="text-2xl font-semibold tracking-tight">{formatPreferred(salesCombined)}</p>
              <p className="mt-1 text-xs text-muted-foreground">Click para abrir Ventas</p>
            </CardContent>
          </Card>
        </Link>

        {/* Gastos */}
        <Link href="/dashboard/finance/expenses" className="block">
          <Card className="border-border transition hover:bg-muted/40">
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl border bg-muted/40">
                    <TrendingDown className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div className="space-y-0.5">
                    <CardTitle className="text-sm">Gastos del mes</CardTitle>
                    <p className="text-xs text-muted-foreground">Ver gastos</p>
                  </div>
                </div>

                <Badge variant="outline" className="h-7 px-2 text-[11px]">
                  {preferredCode}
                </Badge>
              </div>
            </CardHeader>

            <CardContent className="pt-0">
              <p className="text-2xl font-semibold tracking-tight">{formatPreferred(expensesCombined)}</p>
              <p className="mt-1 text-xs text-muted-foreground">Click para abrir Gastos</p>
            </CardContent>
          </Card>
        </Link>

        {/* Neto */}
        <Link href="/dashboard/finance/accounts" className="block">
          <Card className="border-border transition hover:bg-muted/40">
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl border bg-muted/40">
                    <Wallet className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div className="space-y-0.5">
                    <CardTitle className="text-sm">Estado de cuentas</CardTitle>
                    <p className="text-xs text-muted-foreground">Ventas - Gastos</p>
                  </div>
                </div>

                <Badge variant="outline" className="h-7 px-2 text-[11px]">
                  {preferredCode}
                </Badge>
              </div>
            </CardHeader>

            <CardContent className="pt-0">
              <p className="text-2xl font-semibold tracking-tight">{formatPreferred(netCombined)}</p>
              <p className="mt-1 text-xs text-muted-foreground">Click para abrir Cuentas</p>
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* Chart */}
      <Card className="border-border">
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-0.5">
              <CardTitle className="text-sm">Ventas vs Gastos por día</CardTitle>
              <p className="text-xs text-muted-foreground">{monthLabel}</p>
            </div>
            <Badge variant="outline" className="h-7 px-2 text-[11px]">
              {daysInMonth} días
            </Badge>
          </div>
        </CardHeader>

        <CardContent className="pt-0">
          <FinanceMonthChart data={dayRows.map((r) => ({ day: r.day, sales: r.sales, expenses: r.expenses }))} />
        </CardContent>
      </Card>
    </div>
  );
}