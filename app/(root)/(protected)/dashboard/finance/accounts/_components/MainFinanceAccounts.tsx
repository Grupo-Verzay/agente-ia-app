'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

import { DataTable } from '../../sales/_components/data-table'; // ajusta si cambia ruta
import { buildAccountsColumns } from './columns';

import {
  createFinanceAccount,
  deleteFinanceAccount,
  updateFinanceAccount,
} from '@/actions/finance-accounts-actions';

import {
  Plus,
  Wallet,
  Coins,
  CalendarDays,
  ArrowUpRight,
  ArrowDownRight,
  Layers,
} from 'lucide-react';

type Props = {
  userId: string;
  initialAccounts: any[];
  currencies: any[];

  // para saldo y modal
  sales: any[];
  expenses: any[];
};

type FormState = {
  name: string;
  type: 'PERSONAL' | 'COMPANY';
  currencyCode: string;
  isDefault: boolean;
};

const toISODate = (d: Date | string) => {
  const date = typeof d === 'string' ? new Date(d) : d;
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

function isValidISODate(v: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(v + 'T00:00:00');
  return !Number.isNaN(d.getTime());
}

function inInclusiveRange(occurredAt: any, fromISO: string, toISO: string) {
  if (!occurredAt) return false;

  const t = new Date(occurredAt).getTime();
  const from = new Date(fromISO + 'T00:00:00').getTime();
  const to = new Date(toISO + 'T23:59:59.999').getTime();

  return t >= from && t <= to;
}

function toAmountNumber(v: any): number {
  if (v === null || v === undefined) return 0;
  const n = Number(String(v));
  return Number.isFinite(n) ? n : 0;
}

// ventas total = amount + extra - discount
function calcSaleTotal(row: any) {
  const base = toAmountNumber(row?.amount);
  const extra = toAmountNumber(row?.extra);
  const disc = toAmountNumber(row?.discount);
  return base + extra - disc;
}

function formatMoney(currencies: any[], code: string, value: number) {
  const meta = currencies.find((c) => c.code === code);
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

export default function MainFinanceAccounts({
  userId,
  initialAccounts,
  currencies,
  sales,
  expenses,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [rows, setRows] = useState<any[]>(initialAccounts ?? []);
  useEffect(() => setRows(initialAccounts ?? []), [initialAccounts]);

  const defaultCurrencyCode = useMemo(() => {
    return currencies?.find((c) => c.code === 'USD')?.code || currencies?.[0]?.code || 'USD';
  }, [currencies]);

  // =====================================================
  // Filtro: MES actual (default) + RANGO + TODO
  // =====================================================
  const now = new Date();
  const [rangeMode, setRangeMode] = useState<'month' | 'range' | 'all'>('month');

  const [month, setMonth] = useState(() => {
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    return `${yyyy}-${mm}`;
  });

  const monthStartISO = useMemo(() => `${month}-01`, [month]);
  const monthEndISO = useMemo(() => {
    const [y, m] = month.split('-').map(Number);
    const lastDay = new Date(y, m, 0).getDate();
    return `${month}-${String(lastDay).padStart(2, '0')}`;
  }, [month]);

  const [dateFrom, setDateFrom] = useState<string>(monthStartISO);
  const [dateTo, setDateTo] = useState<string>(monthEndISO);

  useEffect(() => {
    if (rangeMode !== 'month') return;
    setDateFrom(monthStartISO);
    setDateTo(monthEndISO);
  }, [rangeMode, monthStartISO, monthEndISO]);

  const filteredSales = useMemo(() => {
    const allRows = sales || [];
    if (rangeMode === 'all') return allRows;

    if (!isValidISODate(dateFrom) || !isValidISODate(dateTo)) return [];
    return allRows.filter((s: any) => inInclusiveRange(s.occurredAt, dateFrom, dateTo));
  }, [sales, rangeMode, dateFrom, dateTo]);

  const filteredExpenses = useMemo(() => {
    const allRows = expenses || [];
    if (rangeMode === 'all') return allRows;

    if (!isValidISODate(dateFrom) || !isValidISODate(dateTo)) return [];
    return allRows.filter((e: any) => inInclusiveRange(e.occurredAt, dateFrom, dateTo));
  }, [expenses, rangeMode, dateFrom, dateTo]);

  // -------------------------
  // Modal ledger por cuenta
  // -------------------------
  const [ledgerOpen, setLedgerOpen] = useState(false);
  const [ledgerAccount, setLedgerAccount] = useState<any | null>(null);
  const [ledgerTab, setLedgerTab] = useState<'all' | 'sales' | 'expenses'>('all');

  const openLedger = (accountRow: any) => {
    setLedgerAccount(accountRow);
    setLedgerTab('all');
    setLedgerOpen(true);
  };

  const closeLedger = () => {
    setLedgerOpen(false);
    setLedgerAccount(null);
  };

  // -------------------------
  // CRUD modal (crear/editar)
  // -------------------------
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);

  const [form, setForm] = useState<FormState>({
    name: '',
    type: 'PERSONAL',
    currencyCode: defaultCurrencyCode,
    isDefault: false,
  });

  useEffect(() => {
    setForm((p) => ({
      ...p,
      currencyCode: p.currencyCode || defaultCurrencyCode,
    }));
  }, [defaultCurrencyCode]);

  const resetForm = () => {
    setForm({
      name: '',
      type: 'PERSONAL',
      currencyCode: defaultCurrencyCode,
      isDefault: false,
    });
  };

  const openCreate = () => {
    setEditing(null);
    resetForm();
    setOpen(true);
  };

  const openEdit = (row: any) => {
    setEditing(row);
    setForm({
      name: row.name ?? '',
      type: (row.type ?? 'PERSONAL') as any,
      currencyCode: row.currencyCode ?? defaultCurrencyCode,
      isDefault: !!row.isDefault,
    });
    setOpen(true);
  };

  const onSave = () => {
    if (!form.name.trim()) return toast.error('Ingresa un nombre de cuenta');
    if (!form.currencyCode) return toast.error('Selecciona una moneda');

    startTransition(() => {
      void (async () => {
        const payload = {
          userId,
          name: form.name.trim(),
          type: form.type,
          currencyCode: form.currencyCode,
          isDefault: form.isDefault,
        };

        const res = editing
          ? await updateFinanceAccount(editing.id, userId, payload)
          : await createFinanceAccount(payload);

        if (!res?.success) return toast.error(res?.message || 'No se pudo guardar');

        toast.success(editing ? 'Cuenta actualizada' : 'Cuenta creada');
        setOpen(false);
        setEditing(null);
        router.refresh();
      })();
    });
  };

  const onDelete = (id: string) => {
    startTransition(() => {
      void (async () => {
        const res = await deleteFinanceAccount(id, userId);
        if (!res?.success) return toast.error(res?.message || 'No se pudo eliminar');

        setRows((prev) => prev.filter((r) => r.id !== id));
        toast.success('Cuenta eliminada');
        router.refresh();
      })();
    });
  };

  const onSetDefault = (row: any) => {
    startTransition(() => {
      void (async () => {
        const res = await updateFinanceAccount(row.id, userId, { isDefault: true });
        if (!res?.success) return toast.error(res?.message || 'No se pudo actualizar');

        toast.success('Cuenta por defecto actualizada');
        router.refresh();
      })();
    });
  };

  // -----------------------------------------
  // Resumen por cuenta (ventas/gastos/saldo)
  //    usando filteredSales/filteredExpenses
  // -----------------------------------------
  const summaryByAccount = useMemo(() => {
    const map = new Map<
      string,
      {
        currencyCode: string;
        sales: number;
        expenses: number;
        balance: number;
      }
    >();

    for (const acc of rows) {
      map.set(acc.id, {
        currencyCode: acc.currencyCode || defaultCurrencyCode,
        sales: 0,
        expenses: 0,
        balance: 0,
      });
    }

    for (const s of filteredSales || []) {
      const id = s.accountId;
      if (!id || !map.has(id)) continue;
      const cur = map.get(id)!;
      cur.sales += calcSaleTotal(s);
    }

    for (const e of filteredExpenses || []) {
      const id = e.accountId;
      if (!id || !map.has(id)) continue;
      const cur = map.get(id)!;
      cur.expenses += toAmountNumber(e?.amount);
    }

    map.forEach((v) => {
      v.balance = v.sales - v.expenses;
    });

    return map;
  }, [rows, filteredSales, filteredExpenses, defaultCurrencyCode]);

  const getAccountSummary = (accountId: string) => {
    const s = summaryByAccount.get(accountId);
    if (!s) return { salesText: '—', expensesText: '—', balanceText: '—' };

    const code = s.currencyCode || defaultCurrencyCode;
    return {
      salesText: formatMoney(currencies, code, s.sales),
      expensesText: formatMoney(currencies, code, s.expenses),
      balanceText: formatMoney(currencies, code, s.balance),
    };
  };

  const columns = useMemo(
    () =>
      buildAccountsColumns({
        onEdit: openEdit,
        onDelete,
        onSetDefault,
        busy: isPending,
        getAccountSummary,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isPending, rows, filteredSales, filteredExpenses, currencies, dateFrom, dateTo, rangeMode]
  );

  // -----------------------------------------
  // Ledger data (ventas + gastos) por cuenta
  //    usando filteredSales/filteredExpenses
  // -----------------------------------------
  const ledgerRows = useMemo(() => {
    if (!ledgerAccount?.id) return [];

    const accountId = ledgerAccount.id;

    const salesRows =
      (filteredSales || [])
        .filter((s) => s.accountId === accountId)
        .map((s) => ({
          id: `S-${s.id}`,
          kind: 'SALE' as const,
          occurredAt: s.occurredAt,
          title: s.title || 'Venta',
          amount: calcSaleTotal(s),
          currencyCode: s.currencyCode || ledgerAccount.currencyCode,
          raw: s,
        })) || [];

    const expenseRows =
      (filteredExpenses || [])
        .filter((e) => e.accountId === accountId)
        .map((e) => ({
          id: `E-${e.id}`,
          kind: 'EXPENSE' as const,
          occurredAt: e.occurredAt,
          title: e.title || 'Gasto',
          amount: toAmountNumber(e.amount),
          currencyCode: e.currencyCode || ledgerAccount.currencyCode,
          raw: e,
        })) || [];

    const all = [...salesRows, ...expenseRows].sort((a, b) => {
      const da = new Date(a.occurredAt).getTime();
      const db = new Date(b.occurredAt).getTime();
      return db - da;
    });

    if (ledgerTab === 'sales') return all.filter((r) => r.kind === 'SALE');
    if (ledgerTab === 'expenses') return all.filter((r) => r.kind === 'EXPENSE');
    return all;
  }, [ledgerAccount, filteredSales, filteredExpenses, ledgerTab]);

  const ledgerTotals = useMemo(() => {
    if (!ledgerAccount?.id) return { sales: 0, expenses: 0, balance: 0 };

    const id = ledgerAccount.id;

    const s = (filteredSales || [])
      .filter((x) => x.accountId === id)
      .reduce((acc, x) => acc + calcSaleTotal(x), 0);

    const e = (filteredExpenses || [])
      .filter((x) => x.accountId === id)
      .reduce((acc, x) => acc + toAmountNumber(x.amount), 0);

    return { sales: s, expenses: e, balance: s - e };
  }, [ledgerAccount, filteredSales, filteredExpenses]);

  const ledgerCurrencyCode = ledgerAccount?.currencyCode || defaultCurrencyCode;

  const ledgerColumns = useMemo(() => {
    return [
      {
        accessorKey: 'occurredAt',
        header: 'Fecha',
        cell: ({ row }: any) => (
          <span className="text-sm">{toISODate(row.original.occurredAt)}</span>
        ),
      },
      {
        accessorKey: 'kind',
        header: 'Tipo',
        cell: ({ row }: any) => {
          const k = row.original.kind;
          return (
            <span className="inline-flex items-center gap-2 text-sm">
              {k === 'SALE' ? (
                <>
                  <ArrowUpRight className="h-4 w-4 text-muted-foreground" /> Venta
                </>
              ) : (
                <>
                  <ArrowDownRight className="h-4 w-4 text-muted-foreground" /> Gasto
                </>
              )}
            </span>
          );
        },
      },
      {
        accessorKey: 'title',
        header: 'Concepto',
        cell: ({ row }: any) => (
          <span className="truncate text-sm font-medium">{row.original.title}</span>
        ),
      },
      {
        accessorKey: 'amount',
        header: 'Monto',
        cell: ({ row }: any) => {
          const r = row.original;
          return (
            <div className="text-right">
              <p className="text-sm font-semibold">
                {formatMoney(currencies, r.currencyCode || ledgerCurrencyCode, r.amount)}
              </p>
              <p className="text-[11px] text-muted-foreground">{r.currencyCode}</p>
            </div>
          );
        },
      },
    ];
  }, [currencies, ledgerCurrencyCode]);

  const applyRangeValidation = () => {
    if (rangeMode === 'all') return true;

    if (!isValidISODate(dateFrom) || !isValidISODate(dateTo)) {
      toast.error('Fecha inválida. Usa formato YYYY-MM-DD.');
      return false;
    }

    const a = new Date(dateFrom + 'T00:00:00').getTime();
    const b = new Date(dateTo + 'T00:00:00').getTime();
    if (a > b) {
      toast.error('La fecha "Desde" no puede ser mayor que "Hasta".');
      return false;
    }
    return true;
  };

  return (
    <div className="space-y-3">
      <Card className="border-border">
        <CardHeader className="py-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <CardTitle className="text-sm">Cuentas</CardTitle>
              <Badge variant="secondary" className="h-6 text-[11px]">
                {rows.length} cuentas
              </Badge>
            </div>

            <Button size="sm" onClick={openCreate} disabled={isPending} className="h-9">
              <Plus className="mr-2 h-4 w-4" />
              Nueva cuenta
            </Button>
          </div>

          {/* Filtros */}
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant={rangeMode === 'month' ? 'default' : 'outline'}
                onClick={() => setRangeMode('month')}
                className="h-9"
              >
                <CalendarDays className="mr-2 h-4 w-4" />
                Mes actual
              </Button>

              <Button
                size="sm"
                variant={rangeMode === 'range' ? 'default' : 'outline'}
                onClick={() => setRangeMode('range')}
                className="h-9"
              >
                <CalendarDays className="mr-2 h-4 w-4" />
                Rango
              </Button>

              <Button
                size="sm"
                variant={rangeMode === 'all' ? 'default' : 'outline'}
                onClick={() => setRangeMode('all')}
                className="h-9"
              >
                <Layers className="mr-2 h-4 w-4" />
                Todo
              </Button>

              {rangeMode === 'month' ? (
                <Input
                  type="month"
                  value={month}
                  onChange={(e) => setMonth(e.target.value)}
                  className="h-9 w-[170px] text-sm"
                />
              ) : null}

              {rangeMode === 'range' ? (
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    className="h-9 w-[160px] text-sm"
                  />
                  <Input
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    className="h-9 w-[160px] text-sm"
                  />
                  <Button
                    size="sm"
                    variant="secondary"
                    className="h-9"
                    onClick={() => applyRangeValidation()}
                  >
                    Aplicar
                  </Button>
                </div>
              ) : null}
            </div>

            <Badge variant="outline" className="h-8 text-[11px]">
              {rangeMode === 'all'
                ? 'Filtrando: Todo'
                : `Filtrando: ${dateFrom} → ${dateTo}`}
            </Badge>
          </div>
        </CardHeader>

        <CardContent className="pt-0">
          <DataTable
            columns={columns as any}
            data={rows}
            searchKey="name"
            searchPlaceholder="Buscar cuenta..."
            onRowClick={(row: any) => {
              // si están en rango/mes y el rango es inválido, no abrir
              if (!applyRangeValidation()) return;
              openLedger(row);
            }}
          />
        </CardContent>
      </Card>

      {/* MODAL LEDGER (ventas + gastos por cuenta) */}
      <Dialog open={ledgerOpen} onOpenChange={(v) => (v ? setLedgerOpen(true) : closeLedger())}>
        <DialogContent className="sm:max-w-[980px] rounded-2xl">
          <DialogHeader className="space-y-1">
            <DialogTitle className="text-base">
              Movimientos de la cuenta: {ledgerAccount?.name || '—'}
            </DialogTitle>
            <p className="text-xs text-muted-foreground">
              {rangeMode === 'all'
                ? 'Ventas, gastos y saldo (ventas - gastos) de esta cuenta.'
                : `Ventas, gastos y saldo (ventas - gastos) de esta cuenta en el rango ${dateFrom} → ${dateTo}.`}
            </p>
          </DialogHeader>

          {/* Totales arriba */}
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <div className="flex items-center justify-between rounded-xl border bg-muted/10 px-3 py-2">
              <div className="flex items-center gap-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg border bg-background">
                  <ArrowUpRight className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="leading-tight">
                  <p className="text-[11px] text-muted-foreground">Total</p>
                  <p className="text-sm font-medium">Ventas</p>
                </div>
              </div>
              <div className="text-right leading-tight">
                <p className="text-sm font-semibold">
                  {formatMoney(currencies, ledgerCurrencyCode, ledgerTotals.sales)}
                </p>
                <p className="text-[11px] text-muted-foreground">{ledgerCurrencyCode}</p>
              </div>
            </div>

            <div className="flex items-center justify-between rounded-xl border bg-muted/10 px-3 py-2">
              <div className="flex items-center gap-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg border bg-background">
                  <ArrowDownRight className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="leading-tight">
                  <p className="text-[11px] text-muted-foreground">Total</p>
                  <p className="text-sm font-medium">Gastos</p>
                </div>
              </div>
              <div className="text-right leading-tight">
                <p className="text-sm font-semibold">
                  {formatMoney(currencies, ledgerCurrencyCode, ledgerTotals.expenses)}
                </p>
                <p className="text-[11px] text-muted-foreground">{ledgerCurrencyCode}</p>
              </div>
            </div>

            <div className="flex items-center justify-between rounded-xl border bg-muted/10 px-3 py-2">
              <div className="flex items-center gap-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg border bg-background">
                  <Layers className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="leading-tight">
                  <p className="text-[11px] text-muted-foreground">Cuenta</p>
                  <p className="text-sm font-medium">Saldo</p>
                </div>
              </div>
              <div className="text-right leading-tight">
                <p className="text-sm font-semibold">
                  {formatMoney(currencies, ledgerCurrencyCode, ledgerTotals.balance)}
                </p>
                <p className="text-[11px] text-muted-foreground">Ventas - Gastos</p>
              </div>
            </div>
          </div>

          <Separator />

          {/* Tabs */}
          <Tabs value={ledgerTab} onValueChange={(v) => setLedgerTab(v as any)}>
            <TabsList className="h-9 w-full justify-start gap-6 rounded-none bg-transparent p-0">
              <TabsTrigger
                value="all"
                className="rounded-none border-b-2 border-transparent px-0 text-sm data-[state=active]:border-primary data-[state=active]:text-primary"
              >
                <span className="inline-flex items-center gap-2">
                  <CalendarDays className="h-4 w-4" />
                  Todos
                </span>
              </TabsTrigger>

              <TabsTrigger
                value="sales"
                className="rounded-none border-b-2 border-transparent px-0 text-sm data-[state=active]:border-primary data-[state=active]:text-primary"
              >
                <span className="inline-flex items-center gap-2">
                  <ArrowUpRight className="h-4 w-4" />
                  Ventas
                </span>
              </TabsTrigger>

              <TabsTrigger
                value="expenses"
                className="rounded-none border-b-2 border-transparent px-0 text-sm data-[state=active]:border-primary data-[state=active]:text-primary"
              >
                <span className="inline-flex items-center gap-2">
                  <ArrowDownRight className="h-4 w-4" />
                  Gastos
                </span>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="all" className="mt-2">
              <DataTable
                columns={ledgerColumns as any}
                data={ledgerRows}
                searchKey="title"
                searchPlaceholder="Buscar concepto..."
              />
            </TabsContent>

            <TabsContent value="sales" className="mt-2">
              <DataTable
                columns={ledgerColumns as any}
                data={ledgerRows}
                searchKey="title"
                searchPlaceholder="Buscar concepto..."
              />
            </TabsContent>

            <TabsContent value="expenses" className="mt-2">
              <DataTable
                columns={ledgerColumns as any}
                data={ledgerRows}
                searchKey="title"
                searchPlaceholder="Buscar concepto..."
              />
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      {/* MODAL CREATE/EDIT */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[680px] rounded-2xl">
          <DialogHeader className="space-y-1">
            <DialogTitle className="text-base">
              {editing ? 'Editar cuenta' : 'Nueva cuenta'}
            </DialogTitle>
            <p className="text-xs text-muted-foreground">
              Define el nombre, tipo y moneda base de la cuenta.
            </p>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {/* Nombre */}
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Wallet className="h-4 w-4 text-muted-foreground" />
                  <p className="text-xs text-muted-foreground">Nombre</p>
                </div>
                <Input
                  value={form.name}
                  onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                  className="h-9 text-sm"
                  placeholder="Ej: Caja principal"
                />
              </div>

              {/* Tipo */}
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <p className="text-xs text-muted-foreground">Tipo</p>
                </div>
                <Select
                  value={form.type}
                  onValueChange={(v) => setForm((p) => ({ ...p, type: v as any }))}
                >
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder="Selecciona" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PERSONAL" className="text-sm">
                      Personal
                    </SelectItem>
                    <SelectItem value="COMPANY" className="text-sm">
                      Empresa
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Moneda */}
              <div className="space-y-1 sm:col-span-2">
                <div className="flex items-center gap-2">
                  <Coins className="h-4 w-4 text-muted-foreground" />
                  <p className="text-xs text-muted-foreground">Moneda de la cuenta</p>
                </div>

                <Select
                  value={form.currencyCode}
                  onValueChange={(v) => setForm((p) => ({ ...p, currencyCode: v }))}
                >
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder="Selecciona moneda" />
                  </SelectTrigger>
                  <SelectContent>
                    {currencies.map((c) => (
                      <SelectItem key={c.code} value={c.code} className="text-sm">
                        {c.code} {c.symbol ? `· ${c.symbol}` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <p className="text-[11px] text-muted-foreground">
                  Recomendado: la moneda se usa por defecto al crear ventas/gastos con esta cuenta.
                </p>
              </div>

              <Separator className="sm:col-span-2" />

              {/* Default */}
              <div className="flex items-center justify-between rounded-xl border bg-muted/10 px-3 py-2 sm:col-span-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium">Cuenta por defecto</p>
                  <p className="text-xs text-muted-foreground">
                    Se selecciona automáticamente al crear una venta o gasto.
                  </p>
                </div>
                <Switch
                  checked={form.isDefault}
                  onCheckedChange={(v) => setForm((p) => ({ ...p, isDefault: v }))}
                  disabled={isPending}
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setOpen(false)}
                disabled={isPending}
                className="h-9"
              >
                Cancelar
              </Button>
              <Button onClick={onSave} size="sm" disabled={isPending} className="h-9">
                {editing ? 'Guardar cambios' : 'Crear cuenta'}
              </Button>
            </div>

            {editing && !editing.isDefault ? (
              <>
                <Separator />
                <Button
                  type="button"
                  variant="secondary"
                  className="w-full"
                  disabled={isPending}
                  onClick={() => onSetDefault(editing)}
                >
                  Marcar como cuenta por defecto
                </Button>
              </>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
