'use client';

import {
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
} from 'recharts';

type Row = {
  day: number;
  sales: number;
  expenses: number;
};

function compactNumber(n: number) {
  const abs = Math.abs(n);
  if (abs >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return `${Math.round(n)}`;
}

function makeMoneyFormatter(currencyCode: string) {
  return (value: number) => {
    try {
      return new Intl.NumberFormat('es-CO', {
        style: 'currency',
        currency: currencyCode || 'COP',
        maximumFractionDigits: 2,
      }).format(value);
    } catch {
      return `${value.toFixed(2)} ${currencyCode || 'COP'}`;
    }
  };
}

export function FinanceMonthChart({
  data,
  currencyCode = 'COP',
}: {
  data: Row[];
  currencyCode?: string;
}) {
  const money = makeMoneyFormatter(currencyCode);

  // Colores diferenciados (ventas azul, gastos rojo)
  const SALES_COLOR = 'hsl(var(--primary))';
  const EXPENSES_COLOR = 'hsl(var(--destructive))';

  return (
    <div className="h-[280px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" />

          <XAxis dataKey="day" tickLine={false} axisLine={false} fontSize={12} tickMargin={8} />
          <YAxis
            tickLine={false}
            axisLine={false}
            fontSize={12}
            tickMargin={8}
            width={48}
            tickFormatter={(v) => compactNumber(Number(v))}
          />

          <Tooltip
            formatter={(value: any, name: any) => {
              const n = Number(value ?? 0);
              return [money(n), name];
            }}
            labelFormatter={(label: any) => `Día ${label}`}
          />

          <Legend verticalAlign="top" height={24} wrapperStyle={{ fontSize: 12 }} />

          <Line
            type="monotone"
            dataKey="sales"
            name="Ventas"
            stroke={SALES_COLOR}
            strokeWidth={2}
            dot={false}
          />

          <Line
            type="monotone"
            dataKey="expenses"
            name="Gastos"
            stroke={EXPENSES_COLOR}
            strokeWidth={2}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
