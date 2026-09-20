import Link from 'next/link';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

import { db } from '@/lib/db';
import { getFinanceUser } from '@/lib/finance-user';
import { resolverLasCuentasDeFinanzas } from '@/lib/cuentas-de-finanzas';
import { consolidar } from '@/lib/finanzas-de-la-familia';

import { FinanceMonthChart } from './_components/FinanceMonthChart';
import { BarraDeFinanzas } from './_components/BarraDeFinanzas';
import { DesgloseDeCuentas } from './_components/DesgloseDeCuentas';

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
  searchParams?: { month?: string | string[]; cuentas?: string | string[] };
}) {
  // Finanzas es por cuenta del titular logueado (ver lib/finance-user).
  const me = await getFinanceUser();
  if (!me?.id) return null;

  // Quien administra la familia puede consolidar varias cuentas; cualquier otro
  // recibe `[me.id]` y esta pantalla se comporta exactamente como antes.
  const cuentas = await resolverLasCuentasDeFinanzas(me.id, searchParams?.cuentas);
  const elegidas = cuentas.elegidas;
  const consolidando = elegidas.length > 1;

  const selectedMonth = parseMonthParam(searchParams?.month);
  const from = startOfMonth(selectedMonth);
  const to = startOfNextMonth(selectedMonth);
  const yearFrom = new Date(selectedMonth.getFullYear(), 0, 1, 0, 0, 0, 0);
  const yearTo = new Date(selectedMonth.getFullYear() + 1, 0, 1, 0, 0, 0, 0);

  const currencies = await db.financeCurrency.findMany({
    orderBy: { code: 'asc' },
    select: { code: true, symbol: true, decimals: true },
  });

  // Nombre de la cuenta activa: se muestra al vaciar para no hacerlo en la que
  // no es (vaciar sigue siendo SOLO de la cuenta propia, nunca de lo elegido
  // en el selector — ver el pie de la pantalla).
  const account = await db.user.findUnique({
    where: { id: me.id },
    select: { name: true, company: true, email: true },
  });
  const accountLabel = account?.company || account?.name || account?.email || null;

  const yearTx = await db.financeTransaction.findMany({
    where: {
      userId: { in: elegidas },
      status: { not: 'DELETED' as const },
      occurredAt: { gte: yearFrom, lt: yearTo },
      type: { in: ['SALE', 'EXPENSE'] as const },
    },
    select: {
      userId: true,
      type: true,
      occurredAt: true,
      amount: true,
      extra: true,
      discount: true,
    },
    orderBy: { occurredAt: 'asc' },
  });

  const monthTx = yearTx.filter((tx) => tx.occurredAt >= from && tx.occurredAt < to);

  // Lo que aporta cada cuenta en el MES que se está mirando, que es la unidad de
  // esta pantalla: la rejilla de arriba marca ese mes y la gráfica de abajo lo
  // dibuja día a día.
  const aportes = new Map<string, { ingresos: number; gastos: number }>();
  for (const tx of monthTx) {
    const suyo = aportes.get(tx.userId) ?? { ingresos: 0, gastos: 0 };
    const total = calcTotal(tx);
    if (tx.type === 'SALE') suyo.ingresos += total;
    if (tx.type === 'EXPENSE') suyo.gastos += total;
    aportes.set(tx.userId, suyo);
  }

  const cuentasElegidas = cuentas.disponibles.filter((c) => elegidas.includes(c.id));
  const consolidado = consolidando ? consolidar(cuentasElegidas, aportes) : null;

  // Con monedas distintas no hay una cifra común que enseñar: el desglose sale
  // igual —cada fila en la suya, que es cierta— y lo que se suma no se pinta.
  const sePuedeSumar = !consolidado || consolidado.total !== null;

  const preferredCode = consolidado?.moneda || me.preferredCurrencyCode || 'COP';
  const preferredMeta = currencies.find((c) => c.code === preferredCode);
  const formatPreferred = (n: number) => moneyFormat(preferredMeta, n);

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

  // El mes viaja en los enlaces de la rejilla anual; las cuentas elegidas
  // también, o pulsar un mes deshacía la consolidación sin decir nada.
  const cuentasEnElEnlace = consolidando ? `&cuentas=${elegidas.join(',')}` : '';

  return (
    <div className="space-y-1">
      {/* La barra de siempre: buscador fijo a la izquierda, el selector de
          cuentas en el carril, y el azul con el `⋯` pegados al borde derecho.
          Antes el azul estaba arriba entre las pestañas, el selector suelto en
          su propia línea y «Vaciar contabilidad» al final de la página. */}
      <BarraDeFinanzas
        disponibles={cuentas.disponibles}
        elegidas={elegidas}
        puedeElegir={cuentas.puedeElegir}
        monthValue={monthInputValue(selectedMonth)}
        accountLabel={accountLabel}
      />

      {consolidando && (
        <p className="text-xs text-muted-foreground">
          Sumando {elegidas.length} cuentas. El resumen anual y la gráfica responden a esta selección.
        </p>
      )}

      {consolidado && (
        <DesgloseDeCuentas
          consolidado={consolidado}
          monthLabel={monthLabel}
          currencies={currencies}
        />
      )}

      {sePuedeSumar ? (
        <>
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
                    href={`/dashboard/finance?month=${row.key}${cuentasEnElEnlace}`}
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
        </>
      ) : (
        /* Ni la rejilla anual ni la gráfica pueden dibujarse: las dos SUMAN las
           cuentas elegidas, y con monedas distintas esa suma no significa nada.
           El desglose de arriba sí sale, porque cada fila va en su moneda. */
        <Card className="border-amber-300 bg-amber-50/60">
          <CardContent className="px-3 py-3 text-sm text-amber-900">
            El resumen anual y la gráfica no se pueden dibujar con esta selección:{' '}
            {consolidado?.sinTotalPorque} Arriba queda lo que aporta cada cuenta, cada una en la suya.
          </CardContent>
        </Card>
      )}
    </div>
  );
}
