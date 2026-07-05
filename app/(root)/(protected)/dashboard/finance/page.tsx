import Link from 'next/link';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

import { db } from '@/lib/db';
import { auth } from '@/auth';

import { CalendarDays, ChevronLeft, ChevronRight, TrendingUp, TrendingDown, Wallet, Settings, ReceiptText } from 'lucide-react';
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

function parseMonthParam(value?: string | string[]) {
  const raw = Array.isArray(value) ? value[0] : value;
  const match = raw?.match(/^(\d{4})-(\d{2})$/);
  if (!match) return startOfMonth(new Date());

  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  if (!Number.isFinite(year) || !Number.isFinite(monthIndex) || monthIndex < 0 || monthIndex > 11) {
    return startOfMonth(new Date());
  }

  return new Date(year, monthIndex, 1, 0, 0, 0, 0);
}

function monthInputValue(date: Date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}`;
}

function addMonths(date: Date, amount: number) {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1, 0, 0, 0, 0);
}

export default async function FinanceHomePage({
  searchParams,
}: {
  searchParams?: { month?: string | string[] };
}) {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) return null;

  const me = await db.user.findUnique({
    where: { email },
    select: { id: true, preferredCurrencyCode: true },
  });
  if (!me?.id) return null;

  const selectedMonth = parseMonthParam(searchParams?.month);
  const from = startOfMonth(selectedMonth);
  const to = startOfNextMonth(selectedMonth);
  const yearFrom = new Date(selectedMonth.getFullYear(), 0, 1, 0, 0, 0, 0);
  const yearTo = new Date(selectedMonth.getFullYear() + 1, 0, 1, 0, 0, 0, 0);

  const currencies = await db.financeCurrency.findMany({
    orderBy: { code: 'asc' },
    select: { code: true, symbol: true, decimals: true },
  });

  const preferredCode = me.preferredCurrencyCode || 'COP';
  const preferredMeta = currencies.find((c) => c.code === preferredCode);
  const formatPreferred = (n: number) => moneyFormat(preferredMeta, n);

  const yearTx = await db.financeTransaction.findMany({
    where: {
      userId: me.id,
      status: { not: 'DELETED' as const },
      occurredAt: { gte: yearFrom, lt: yearTo },
      type: { in: ['SALE', 'EXPENSE'] as const },
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

  const monthTx = yearTx.filter((tx) => tx.occurredAt >= from && tx.occurredAt < to);

  let salesCombined = 0;
  let expensesCombined = 0;

  for (const r of monthTx) {
    const total = calcTotal(r);
    if (r.type === 'SALE') salesCombined += total;
    if (r.type === 'EXPENSE') expensesCombined += total;
  }

  const netCombined = salesCombined - expensesCombined;

  const daysInMonth = new Date(selectedMonth.getFullYear(), selectedMonth.getMonth() + 1, 0).getDate();
  const dayRows = Array.from({ length: daysInMonth }, (_, i) => {
    const d = new Date(selectedMonth.getFullYear(), selectedMonth.getMonth(), i + 1);
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

  const monthLabel = selectedMonth.toLocaleDateString('es-CO', { month: 'long', year: 'numeric' });
  const selectedMonthValue = monthInputValue(selectedMonth);
  const previousMonth = monthInputValue(addMonths(selectedMonth, -1));
  const nextMonth = monthInputValue(addMonths(selectedMonth, 1));
  const currentMonth = monthInputValue(new Date());
  const annualRows = Array.from({ length: 12 }, (_, index) => {
    const monthDate = new Date(selectedMonth.getFullYear(), index, 1);
    return {
      key: monthInputValue(monthDate),
      label: monthDate.toLocaleDateString('es-CO', { month: 'short' }).replace('.', ''),
      sales: 0,
      expenses: 0,
      balance: 0,
      active: index === selectedMonth.getMonth(),
    };
  });

  for (const tx of yearTx) {
    const monthIndex = new Date(tx.occurredAt).getMonth();
    const total = calcTotal(tx);
    if (tx.type === 'SALE') annualRows[monthIndex].sales += total;
    if (tx.type === 'EXPENSE') annualRows[monthIndex].expenses += total;
  }

  for (const row of annualRows) {
    row.balance = row.sales - row.expenses;
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-0.5">
          <h1 className="text-xl font-semibold leading-none tracking-tight">Contabilidad Verzay</h1>
          <p className="text-sm text-muted-foreground">Ingresos, gastos, recibos y resultado mensual.</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button asChild variant="outline" size="icon" className="h-9 w-9" title="Mes anterior">
            <Link href={`/dashboard/finance?month=${previousMonth}`}>
              <ChevronLeft className="h-4 w-4" />
            </Link>
          </Button>

          <form action="/dashboard/finance" className="flex items-center gap-2">
            <input
              type="month"
              name="month"
              defaultValue={selectedMonthValue}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm shadow-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="Mes contable"
            />
            <Button type="submit" variant="outline" className="h-9 px-3">
              Filtrar
            </Button>
          </form>

          <Button asChild variant="outline" size="icon" className="h-9 w-9" title="Mes siguiente">
            <Link href={`/dashboard/finance?month=${nextMonth}`}>
              <ChevronRight className="h-4 w-4" />
            </Link>
          </Button>

          <Badge variant="secondary" className="h-8 px-3 text-xs">
            <span className="inline-flex items-center gap-1">
              <CalendarDays className="h-4 w-4" />
              {monthLabel}
            </span>
          </Badge>

          {selectedMonthValue !== currentMonth && (
            <Button asChild variant="ghost" className="h-9 px-3 text-sm">
              <Link href="/dashboard/finance">Mes actual</Link>
            </Button>
          )}

          <Button asChild variant="outline" className="h-9">
            <Link href="/dashboard/finance/settings" className="inline-flex items-center gap-2">
              <Settings className="h-4 w-4" />
              Configuración
            </Link>
          </Button>
        </div>
      </div>

      {/* Totales clickeables */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {/* Ventas */}
        <Link href={`/dashboard/finance/sales?month=${selectedMonthValue}`} className="block">
          <Card className="border-border transition hover:bg-muted/40">
            <CardContent className="flex items-center gap-3 px-3 py-3">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 bg-muted/40">
                <TrendingUp className="h-3.5 w-3.5 text-muted-foreground" />
              </div>
              <span className="min-w-0 flex-1 truncate text-xs font-medium text-muted-foreground">Ventas del mes</span>
              <div className="shrink-0 flex items-center gap-1.5">
                <Badge variant="outline" className="h-5 px-1.5 text-[10px]">{preferredCode}</Badge>
                <span className="text-lg font-semibold tracking-tight">{formatPreferred(salesCombined)}</span>
              </div>
            </CardContent>
          </Card>
        </Link>

        {/* Gastos */}
        <Link href={`/dashboard/finance/expenses?month=${selectedMonthValue}`} className="block">
          <Card className="border-border transition hover:bg-muted/40">
            <CardContent className="flex items-center gap-3 px-3 py-3">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 bg-muted/40">
                <TrendingDown className="h-3.5 w-3.5 text-muted-foreground" />
              </div>
              <span className="min-w-0 flex-1 truncate text-xs font-medium text-muted-foreground">Gastos del mes</span>
              <div className="shrink-0 flex items-center gap-1.5">
                <Badge variant="outline" className="h-5 px-1.5 text-[10px]">{preferredCode}</Badge>
                <span className="text-lg font-semibold tracking-tight">{formatPreferred(expensesCombined)}</span>
              </div>
            </CardContent>
          </Card>
        </Link>

        {/* Neto */}
        <Link href="/dashboard/finance/accounts" className="block">
          <Card className="border-border transition hover:bg-muted/40">
            <CardContent className="flex items-center gap-3 px-3 py-3">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 bg-muted/40">
                <Wallet className="h-3.5 w-3.5 text-muted-foreground" />
              </div>
              <span className="min-w-0 flex-1 truncate text-xs font-medium text-muted-foreground">Estado de cuentas</span>
              <div className="shrink-0 flex items-center gap-1.5">
                <Badge variant="outline" className="h-5 px-1.5 text-[10px]">{preferredCode}</Badge>
                <span className="text-lg font-semibold tracking-tight">{formatPreferred(netCombined)}</span>
              </div>
            </CardContent>
          </Card>
        </Link>

        {/* Transacciones */}
        <Link href={`/dashboard/finance/accounts?month=${selectedMonthValue}`} className="block">
          <Card className="border-border transition hover:bg-muted/40">
            <CardContent className="flex items-center gap-3 px-3 py-3">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 bg-muted/40">
                <ReceiptText className="h-3.5 w-3.5 text-muted-foreground" />
              </div>
              <span className="min-w-0 flex-1 truncate text-xs font-medium text-muted-foreground">Transacciones</span>
              <span className="text-lg font-semibold tracking-tight">{monthTx.length}</span>
            </CardContent>
          </Card>
        </Link>
      </div>

      <Card className="border-border">
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-0.5">
              <CardTitle className="text-sm">Resumen anual por mes</CardTitle>
              <p className="text-xs text-muted-foreground">{selectedMonth.getFullYear()}</p>
            </div>
            <Badge variant="outline" className="h-7 px-2 text-[11px]">
              Ingresos - gastos = balance
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            {annualRows.map((row) => (
              <Link
                key={row.key}
                href={`/dashboard/finance?month=${row.key}`}
                title={`Ingresos: ${formatPreferred(row.sales)} | Gastos: ${formatPreferred(row.expenses)}`}
                className={`overflow-hidden rounded-md border transition hover:bg-muted/40 ${
                  row.active ? 'border-primary bg-primary/5' : 'border-border'
                }`}
              >
                <div className="bg-foreground px-3 py-1.5 text-center text-xs font-semibold uppercase text-background">
                  {row.label}
                </div>
                <div className="px-3 py-2 text-center">
                  <span className={`text-sm font-semibold ${row.balance < 0 ? 'text-destructive' : ''}`}>
                    {formatPreferred(row.balance)}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </CardContent>
      </Card>

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
          <FinanceMonthChart
            currencyCode={preferredCode}
            data={dayRows.map((r) => ({ day: r.day, sales: r.sales, expenses: r.expenses }))}
          />
        </CardContent>
      </Card>
    </div>
  );
}
