import Link from 'next/link';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

import { db } from '@/lib/db';
import { auth } from '@/auth';

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
const annualRows = Array.from({ length: 12 }, (_, index) => {
    const monthDate = new Date(selectedMonth.getFullYear(), index, 1);
    return {
      key: monthInputValue(monthDate),
      label: monthDate.toLocaleDateString('es-CO', { month: 'long' }),
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
    <div className="space-y-1">
      <Card className="border-border">
        <CardHeader className="px-2 pb-1 pt-2">
          <div className="flex items-center justify-between gap-3">
            <CardTitle className="text-sm">Resumen anual por mes {selectedMonth.getFullYear()}</CardTitle>
            <Badge variant="outline" className="h-5 shrink-0 px-2 text-[10px]">
              Ingresos - gastos = balance
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="px-2 pb-2 pt-0">
          <div className="grid grid-cols-2 overflow-hidden rounded-md border border-border sm:grid-cols-3 lg:grid-cols-6">
            {annualRows.map((row) => (
              <Link
                key={row.key}
                href={`/dashboard/finance?month=${row.key}`}
                title={`Ingresos: ${formatPreferred(row.sales)} | Gastos: ${formatPreferred(row.expenses)}`}
                className={`min-h-[62px] overflow-hidden border-border transition hover:bg-muted/40 lg:border-r [&:nth-child(-n+6)]:border-b lg:[&:nth-child(6n)]:border-r-0 ${
                  row.active ? 'bg-sky-50 ring-1 ring-inset ring-sky-400' : 'bg-background'
                }`}
              >
                <div className="flex h-7 items-center justify-center bg-slate-950 px-2 text-xs font-semibold uppercase text-white">
                  {row.label}
                </div>
                <div className="flex h-9 items-center justify-center px-2 text-center">
                  <span className={`text-sm font-semibold leading-none ${row.balance < 0 ? 'text-destructive' : ''}`}>
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
        <CardHeader className="px-3 pb-1 pt-2">
          <div className="flex items-center justify-between gap-3">
            <CardTitle className="text-sm">Ventas vs Gastos por dia {monthLabel}</CardTitle>
            <Badge variant="outline" className="h-5 px-2 text-[10px]">
              {daysInMonth} días
            </Badge>
          </div>
        </CardHeader>

        <CardContent className="px-2 pb-2 pt-0">
          <FinanceMonthChart
            currencyCode={preferredCode}
            data={dayRows.map((r) => ({ day: r.day, sales: r.sales, expenses: r.expenses }))}
          />
        </CardContent>
      </Card>
    </div>
  );
}
