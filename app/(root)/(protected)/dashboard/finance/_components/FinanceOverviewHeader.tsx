'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import type { CSSProperties, ReactNode } from 'react';
import { ReceiptText, TrendingDown, TrendingUp, Wallet } from 'lucide-react';

import { Card, CardContent } from '@/components/ui/card';
import { FinanceModuleShortcuts } from './FinanceModuleShortcuts';

type Overview = {
  currencyCode: string;
  sales: number;
  expenses: number;
  balance: number;
  transactions: number;
};

function currentMonthValue() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function formatMoney(currencyCode: string, value: number) {
  try {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: currencyCode,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `$ ${value.toFixed(2)}`;
  }
}

function FinanceStatCard({
  href,
  title,
  value,
  icon,
  color,
}: {
  href: string;
  title: string;
  value: string | number;
  icon: ReactNode;
  color: string;
}) {
  const withAlpha = (alpha: string) => `${color}${alpha}`;
  const cardStyle: CSSProperties = {
    borderColor: withAlpha('99'),
    backgroundColor: withAlpha('22'),
  };

  return (
    <Link href={href} className="block min-w-0">
      <Card
        className="cursor-pointer select-none border-2 bg-background/60 shadow-sm transition-opacity hover:opacity-90"
        style={cardStyle}
      >
        <CardContent className="flex h-12 items-center gap-2 px-2 py-0">
          <div
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2"
            style={{ color, borderColor: withAlpha('5C'), backgroundColor: withAlpha('16') }}
          >
            {icon}
          </div>
          <span className="min-w-0 flex-1 truncate text-xs font-medium" style={{ color: withAlpha('CC') }}>
            {title}
          </span>
          <div className="min-w-0 shrink truncate text-right text-base font-bold leading-none sm:text-lg" style={{ color }}>
            {value}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

export function FinanceOverviewHeader() {
  const searchParams = useSearchParams();
  const selectedMonthValue = searchParams.get('month') || currentMonthValue();
  const [overview, setOverview] = useState<Overview | null>(null);

  useEffect(() => {
    let cancelled = false;

    void fetch(`/api/finance/overview?month=${encodeURIComponent(selectedMonthValue)}`, { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled) setOverview(data);
      })
      .catch(() => {
        if (!cancelled) setOverview(null);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedMonthValue]);

  const values = useMemo(() => {
    const currencyCode = overview?.currencyCode || 'COP';
    return {
      balance: formatMoney(currencyCode, overview?.balance ?? 0),
      sales: formatMoney(currencyCode, overview?.sales ?? 0),
      expenses: formatMoney(currencyCode, overview?.expenses ?? 0),
      transactions: overview?.transactions ?? 0,
    };
  }, [overview]);

  return (
    <div className="sticky top-0 z-50 space-y-1 border-b bg-background px-1 py-1 shadow-sm">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <FinanceStatCard
          href="/dashboard/finance/accounts"
          title="Balance"
          value={values.balance}
          icon={<Wallet className="h-4 w-4" />}
          color="#3B82F6"
        />
        <FinanceStatCard
          href={`/dashboard/finance/sales?month=${selectedMonthValue}`}
          title="Ingresos"
          value={values.sales}
          icon={<TrendingUp className="h-4 w-4" />}
          color="#22C55E"
        />
        <FinanceStatCard
          href={`/dashboard/finance/expenses?month=${selectedMonthValue}`}
          title="Gastos"
          value={values.expenses}
          icon={<TrendingDown className="h-4 w-4" />}
          color="#EF4444"
        />
        <FinanceStatCard
          href={`/dashboard/finance/accounts?month=${selectedMonthValue}`}
          title="Transacciones"
          value={values.transactions}
          icon={<ReceiptText className="h-4 w-4" />}
          color="#EAB308"
        />
      </div>

      <FinanceModuleShortcuts selectedMonthValue={selectedMonthValue} />
    </div>
  );
}
