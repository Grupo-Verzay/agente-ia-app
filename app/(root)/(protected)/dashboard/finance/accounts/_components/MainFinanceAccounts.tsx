'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import type { ColumnDef } from '@tanstack/react-table';
import { ArrowDownRight, ArrowUpRight, Coins, Wallet } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { BotonDeCrear } from '@/components/shared/BarraDeAcciones';
import { AccionesMasivas } from '@/components/shared/AccionesMasivas';
import { GrupoDeOpciones } from '@/components/shared/GrupoDeOpciones';

import { TablaDeFinanzas } from '../../_components/TablaDeFinanzas';
import { FiltroDePeriodo } from '../../_components/FiltroDePeriodo';
import { columnaDeConcepto, columnaDeFecha, columnaDeTotal } from '../../_components/ColumnasDeMovimientos';
import { buildAccountsColumns, type AccountRow } from './columns';

import { createFinanceAccount, deleteFinanceAccount, updateFinanceAccount } from '@/actions/finance-accounts-actions';
import { eliminarCuentasDeFinanzasAction } from '@/actions/borrado-en-bloque-actions';
import { elRotuloDelPeriodo, filtrarPorPeriodo, unPeriodo, type Periodo } from '@/lib/periodo-de-finanzas';
import { comoImporte, elTotalDeLaVenta, formatoDeDinero } from '@/lib/tabla-de-finanzas';

type FinCurrency = { code: string; symbol?: string | null; decimals?: number | null };
type TxSaleRow = { id: string; accountId: string; occurredAt: string | Date; currencyCode?: string | null; title?: string | null; amount?: string | number | null; extra?: string | number | null; discount?: string | number | null };
type TxExpenseRow = { id: string; accountId: string; occurredAt: string | Date; currencyCode?: string | null; title?: string | null; amount?: string | number | null };

type LedgerRow = {
  id: string;
  kind: 'SALE' | 'EXPENSE';
  occurredAt: string | Date;
  title: string;
  amount: number;
  currencyCode: string;
};

type VistaDelDetalle = 'todos' | 'ventas' | 'gastos';

const VISTAS_DEL_DETALLE: { label: string; value: VistaDelDetalle }[] = [
  { label: 'Todos', value: 'todos' },
  { label: 'Ventas', value: 'ventas' },
  { label: 'Gastos', value: 'gastos' },
];

type Props = {
  userId: string;
  initialAccounts: AccountRow[];
  currencies: FinCurrency[];
  sales: TxSaleRow[];
  expenses: TxExpenseRow[];
  /** La moneda de la cuenta (Configuración): con la que nace una cuenta nueva. */
  primaryCurrencyCode?: string;
};

type FormState = {
  name: string;
  type: 'PERSONAL' | 'COMPANY';
  currencyCode: string;
  isDefault: boolean;
};

/**
 * Cuentas de Finanzas: la lista, sus totales por periodo y los movimientos de
 * cada una.
 *
 * Era la pantalla que más se había separado de Ventas y Gastos: una fila propia
 * de tres botones, dos campos de fecha y un «Aplicar» que no aplicaba nada —los
 * campos ya filtraban al escribir—; los botones de la fila un número más
 * grandes; la papelera borrando sin preguntar; y en los movimientos de una
 * cuenta, tres tablas iguales, una por pestaña. Ahora es la tabla común
 * (`TablaDeFinanzas`) con el MISMO filtro de periodo que Ventas y Gastos.
 *
 * Y un fallo que no se veía: el mes se comparaba contra medianoche LOCAL, así
 * que la venta del día 1 caía fuera de su mes y la del día 1 del siguiente
 * dentro. El saldo del mes de cada cuenta estaba corrido un día. El periodo
 * vive en `lib/periodo-de-finanzas.ts` y compara días, no instantes.
 */
export default function MainFinanceAccounts({
  userId,
  initialAccounts,
  currencies,
  sales,
  expenses,
  primaryCurrencyCode,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [rows, setRows] = useState<AccountRow[]>(initialAccounts ?? []);
  useEffect(() => setRows(initialAccounts ?? []), [initialAccounts]);

  // La moneda de la cuenta, la de Configuración. Antes nacían en USD aunque la
  // cuenta trabajara en pesos: la primera venta salía en otra moneda.
  const defaultCurrencyCode = useMemo(() => {
    if (primaryCurrencyCode && currencies?.some((c) => c.code === primaryCurrencyCode)) return primaryCurrencyCode;
    return currencies?.[0]?.code || primaryCurrencyCode || 'COP';
  }, [currencies, primaryCurrencyCode]);

  // Los saldos se miran del mes en curso: es lo que se pregunta al abrir
  // Cuentas. El periodo se cambia en la barra, con el botón de Ventas y Gastos.
  const [periodo, setPeriodo] = useState<Periodo>(() => unPeriodo('mes'));

  const filteredSales = useMemo(() => filtrarPorPeriodo(sales ?? [], periodo, (s) => s.occurredAt), [sales, periodo]);
  const filteredExpenses = useMemo(() => filtrarPorPeriodo(expenses ?? [], periodo, (e) => e.occurredAt), [expenses, periodo]);

  // -------------------------
  // Movimientos de una cuenta
  // -------------------------
  const [ledgerOpen, setLedgerOpen] = useState(false);
  const [ledgerAccount, setLedgerAccount] = useState<AccountRow | null>(null);
  const [vista, setVista] = useState<VistaDelDetalle>('todos');

  const openLedger = (accountRow: AccountRow) => {
    setLedgerAccount(accountRow);
    setVista('todos');
    setLedgerOpen(true);
  };

  const closeLedger = () => {
    setLedgerOpen(false);
    setLedgerAccount(null);
  };

  // -------------------------
  // Crear / editar
  // -------------------------
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<AccountRow | null>(null);

  const formVacio = (): FormState => ({ name: '', type: 'PERSONAL', currencyCode: defaultCurrencyCode, isDefault: false });
  const [form, setForm] = useState<FormState>(formVacio);

  useEffect(() => {
    setForm((p) => ({ ...p, currencyCode: p.currencyCode || defaultCurrencyCode }));
  }, [defaultCurrencyCode]);

  const openCreate = () => {
    setEditing(null);
    setForm(formVacio());
    setOpen(true);
  };

  const openEdit = (row: AccountRow) => {
    setEditing(row);
    setForm({
      name: row.name ?? '',
      type: (row.type ?? 'PERSONAL') as 'PERSONAL' | 'COMPANY',
      currencyCode: row.currencyCode ?? defaultCurrencyCode,
      isDefault: !!row.isDefault,
    });
    setOpen(true);
  };

  const onSave = () => {
    if (!form.name.trim()) return toast.error('Escribe el nombre de la cuenta');
    if (!form.currencyCode) return toast.error('Elige una moneda');

    startTransition(() => {
      void (async () => {
        const payload = {
          userId,
          name: form.name.trim(),
          type: form.type,
          currencyCode: form.currencyCode,
          isDefault: form.isDefault,
        };

        const res = editing ? await updateFinanceAccount(editing.id, userId, payload) : await createFinanceAccount(payload);

        if (!res?.success) return toast.error(res?.message || 'No se pudo guardar');

        toast.success(editing ? 'Cuenta actualizada' : 'Cuenta creada');
        setOpen(false);
        setEditing(null);
        router.refresh();
      })();
    });
  };

  // Devuelve si se borró: con `false`, la confirmación se queda abierta y dice
  // por qué —una cuenta con movimientos no se borra—.
  const onDelete = async (row: AccountRow): Promise<boolean> => {
    const res = await deleteFinanceAccount(row.id, userId);
    if (!res?.success) {
      toast.error(res?.message || 'No se pudo eliminar');
      return false;
    }
    setRows((prev) => prev.filter((r) => r.id !== row.id));
    toast.success('Cuenta eliminada');
    router.refresh();
    return true;
  };

  const borrarLosMarcados = async (ids: string[]) => {
    const resumen = await eliminarCuentasDeFinanzasAction(ids, userId);
    if (!resumen.success) toast.error(resumen.message);
    return { fallaron: resumen.fallaron };
  };

  const onSetDefault = (row: AccountRow) => {
    startTransition(() => {
      void (async () => {
        const res = await updateFinanceAccount(row.id, userId, { isDefault: true });
        if (!res?.success) return toast.error(res?.message || 'No se pudo actualizar');

        toast.success(`«${row.name}» es ahora la cuenta predeterminada`);
        router.refresh();
      })();
    });
  };

  // -----------------------------------------
  // Totales por cuenta en el periodo
  // -----------------------------------------
  const summaryByAccount = useMemo(() => {
    const map = new Map<string, { currencyCode: string; sales: number; expenses: number }>();
    for (const acc of rows) map.set(acc.id, { currencyCode: acc.currencyCode || defaultCurrencyCode, sales: 0, expenses: 0 });
    for (const s of filteredSales) {
      const cur = s.accountId ? map.get(s.accountId) : undefined;
      if (cur) cur.sales += elTotalDeLaVenta(s);
    }
    for (const e of filteredExpenses) {
      const cur = e.accountId ? map.get(e.accountId) : undefined;
      if (cur) cur.expenses += comoImporte(e.amount);
    }
    return map;
  }, [rows, filteredSales, filteredExpenses, defaultCurrencyCode]);

  const getAccountSummary = (accountId: string) => {
    const s = summaryByAccount.get(accountId);
    if (!s) return { salesText: '—', expensesText: '—', balanceText: '—' };
    return {
      salesText: formatoDeDinero(currencies, s.currencyCode, s.sales),
      expensesText: formatoDeDinero(currencies, s.currencyCode, s.expenses),
      balanceText: formatoDeDinero(currencies, s.currencyCode, s.sales - s.expenses),
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
    [isPending, rows, summaryByAccount, currencies],
  );

  // -----------------------------------------
  // Los movimientos de la cuenta abierta
  // -----------------------------------------
  const ledgerCurrencyCode = ledgerAccount?.currencyCode || defaultCurrencyCode;

  const ledgerAll = useMemo<LedgerRow[]>(() => {
    if (!ledgerAccount?.id) return [];
    const accountId = ledgerAccount.id;
    const ventas = filteredSales
      .filter((s) => s.accountId === accountId)
      .map((s) => ({
        id: `S-${s.id}`,
        kind: 'SALE' as const,
        occurredAt: s.occurredAt,
        title: s.title || 'Venta',
        amount: elTotalDeLaVenta(s),
        currencyCode: s.currencyCode || ledgerCurrencyCode,
      }));
    const gastos = filteredExpenses
      .filter((e) => e.accountId === accountId)
      .map((e) => ({
        id: `E-${e.id}`,
        kind: 'EXPENSE' as const,
        occurredAt: e.occurredAt,
        title: e.title || 'Gasto',
        amount: comoImporte(e.amount),
        currencyCode: e.currencyCode || ledgerCurrencyCode,
      }));
    return [...ventas, ...gastos].sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime());
  }, [ledgerAccount, filteredSales, filteredExpenses, ledgerCurrencyCode]);

  const ledgerRows = useMemo(() => {
    if (vista === 'ventas') return ledgerAll.filter((r) => r.kind === 'SALE');
    if (vista === 'gastos') return ledgerAll.filter((r) => r.kind === 'EXPENSE');
    return ledgerAll;
  }, [ledgerAll, vista]);

  const ledgerTotals = useMemo(() => {
    const ventas = ledgerAll.filter((r) => r.kind === 'SALE').reduce((acc, r) => acc + r.amount, 0);
    const gastos = ledgerAll.filter((r) => r.kind === 'EXPENSE').reduce((acc, r) => acc + r.amount, 0);
    return { ventas, gastos, saldo: ventas - gastos };
  }, [ledgerAll]);

  // Concepto · Tipo · Total · Fecha: las mismas columnas —y en el mismo orden—
  // que Ventas y Gastos, con «Tipo» donde ellas llevan la categoría.
  const ledgerColumns = useMemo<ColumnDef<LedgerRow>[]>(
    () => [
      columnaDeConcepto<LedgerRow>((r) => r.title),
      {
        id: 'tipo',
        accessorFn: (r) => (r.kind === 'SALE' ? 'Venta' : 'Gasto'),
        header: 'Tipo',
        cell: ({ row }) => (
          <span className="inline-flex items-center gap-1.5 text-muted-foreground">
            {row.original.kind === 'SALE' ? (
              <>
                <ArrowUpRight className="h-4 w-4" /> Venta
              </>
            ) : (
              <>
                <ArrowDownRight className="h-4 w-4" /> Gasto
              </>
            )}
          </span>
        ),
      },
      columnaDeTotal<LedgerRow>(currencies, (r) => r.amount),
      columnaDeFecha<LedgerRow>(),
    ],
    [currencies],
  );

  const dinero = (valor: number) => formatoDeDinero(currencies, ledgerCurrencyCode, valor);
  const enElPeriodo = periodo.modo === 'todo' ? 'desde siempre' : `en ${elRotuloDelPeriodo(periodo)}`;

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden gap-3">
      <Card className="border-border flex-1 min-h-0 flex flex-col">
        <CardHeader className="py-3 flex-1 min-h-0 flex flex-col">
          <TablaDeFinanzas
            columns={columns}
            data={rows}
            searchKey="name"
            searchPlaceholder="Buscar una cuenta..."
            onRowClick={openLedger}
            queEs="cuenta"
            vacio="Todavía no hay cuentas."
            filtros={<FiltroDePeriodo periodo={periodo} alCambiar={setPeriodo} queSon="Todo" />}
            crear={<BotonDeCrear onClick={openCreate} disabled={isPending}>Nuevo</BotonDeCrear>}
            acciones={(seleccionados, limpiar) => (
              <AccionesMasivas
                seleccionados={seleccionados}
                queSon="cuentas"
                onEliminar={borrarLosMarcados}
                onTerminar={() => {
                  limpiar();
                  router.refresh();
                }}
              />
            )}
          />
        </CardHeader>
      </Card>

      {/* Los movimientos de una cuenta */}
      <Dialog open={ledgerOpen} onOpenChange={(v) => (v ? setLedgerOpen(true) : closeLedger())}>
        <DialogContent className="sm:max-w-[980px] rounded-2xl">
          <DialogHeader className="space-y-1">
            <DialogTitle className="text-base">Movimientos de «{ledgerAccount?.name || '—'}»</DialogTitle>
            <DialogDescription className="text-xs" data-totales-de-la-cuenta>
              Ventas {dinero(ledgerTotals.ventas)} · Gastos {dinero(ledgerTotals.gastos)} · Saldo{' '}
              <b className="text-foreground">{dinero(ledgerTotals.saldo)}</b> {enElPeriodo}.
            </DialogDescription>
          </DialogHeader>

          <div className="flex min-h-[420px] flex-col">
            <TablaDeFinanzas
              columns={ledgerColumns}
              data={ledgerRows}
              searchKey="concepto"
              searchPlaceholder="Buscar un movimiento..."
              queEs="movimiento"
              vacio={periodo.modo === 'todo' ? 'Esta cuenta no tiene movimientos.' : 'Esta cuenta no tiene movimientos en este periodo.'}
              filtros={<GrupoDeOpciones grupo="movimientos" opciones={VISTAS_DEL_DETALLE} valor={vista} alCambiar={setVista} />}
            />
          </div>
        </DialogContent>
      </Dialog>

      {/* Crear / editar */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[680px] rounded-2xl">
          <DialogHeader className="space-y-1">
            <DialogTitle className="text-base">{editing ? 'Editar cuenta' : 'Nueva cuenta'}</DialogTitle>
            <DialogDescription className="text-xs">Define el nombre, el tipo y la moneda de la cuenta.</DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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

            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Tipo</p>
              <Select value={form.type} onValueChange={(v) => setForm((p) => ({ ...p, type: v as 'PERSONAL' | 'COMPANY' }))}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="Selecciona" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PERSONAL" className="text-sm">Personal</SelectItem>
                  <SelectItem value="COMPANY" className="text-sm">Empresa</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1 sm:col-span-2">
              <div className="flex items-center gap-2">
                <Coins className="h-4 w-4 text-muted-foreground" />
                <p className="text-xs text-muted-foreground">Moneda de la cuenta</p>
              </div>
              <Select value={form.currencyCode} onValueChange={(v) => setForm((p) => ({ ...p, currencyCode: v }))}>
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
              <p className="text-[11px] text-muted-foreground">Es la moneda con la que nacen las ventas y gastos de esta cuenta.</p>
            </div>

            <div className="flex items-center justify-between gap-3 rounded-xl border bg-muted/10 px-3 py-2 sm:col-span-2">
              <div className="min-w-0">
                <p className="text-sm font-medium">Cuenta predeterminada</p>
                <p className="text-xs text-muted-foreground">Se elige sola al crear una venta o un gasto.</p>
              </div>
              <Switch
                checked={form.isDefault}
                onCheckedChange={(v) => setForm((p) => ({ ...p, isDefault: v }))}
                disabled={isPending}
                aria-label="Cuenta predeterminada"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setOpen(false)} disabled={isPending} className="h-9">
              Cancelar
            </Button>
            <Button variant="save" onClick={onSave} size="sm" disabled={isPending} className="h-9">
              {editing ? 'Guardar cambios' : 'Guardar cuenta'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
