'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import { TablaDeFinanzas } from '../../_components/TablaDeFinanzas';
import { FiltroDePeriodo } from '../../_components/FiltroDePeriodo';
import { AccionesDeLaFila, ConfirmarBorrado } from '../../_components/AccionesDeLaFila';
import { filtrarPorPeriodo, laFechaDeUnoNuevo, elDiaDeHoy, unPeriodo, type Periodo } from '@/lib/periodo-de-finanzas';
import { comoImporte, elConceptoDelGasto, elProveedorDelGasto, formatoDeDinero } from '@/lib/tabla-de-finanzas';
import { CABECERA_DEL_DETALLE, CUERPO_DEL_DETALLE, DIALOGO_DEL_DETALLE, REJILLA_DEL_DETALLE } from '@/lib/detalle-de-finanzas';
import { buildExpenseColumns, type ExpenseRow } from './columns';
import { SelectorDeProveedor, type ProveedorElegido } from './SelectorDeProveedor';
import {
  elProveedorDeLaReferencia,
  elProveedorQueSeManda,
  laDireccionSinCrear,
  esUnaCompra,
  losTextosDelFormulario,
  porQueNoSeGuarda,
  type FormularioDeGasto,
  type ProveedorDeLaLista,
} from '@/lib/compras-de-finanzas';
import { SelectorDeCuentas } from '@/components/shared/SelectorDeCuentas';
import { columnaDeCuenta } from '@/components/shared/ColumnaDeCuenta';
import {
  esDeOtraCuenta,
  estaConsolidando,
  lasCuentasElegidas,
  nombresPorCuenta,
  type CuentaDeFinanzas,
} from '@/lib/finanzas-de-la-familia';

import {
  createExpense,
  updateExpense,
  deleteExpense,
  deleteAllExpenses,
  addExpenseAttachments,
  deleteExpenseAttachment,
} from '@/actions/finance-expenses-actions';

import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

import { TooltipProvider } from '@/components/ui/tooltip';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { SafeImage } from '@/components/custom/SafeImage';

import {
  CalendarDays,
  Layers,
  Paperclip,
  X,
  ExternalLink,
  FileText,
  Receipt,
  Trash2,
  Truck,
} from 'lucide-react';
import { BotonDeCrear } from '@/components/shared/BarraDeAcciones';
import { AccionesMasivas } from '@/components/shared/AccionesMasivas';
import { eliminarGastosAction } from '@/actions/borrado-en-bloque-actions';

type FinAccount  = { id: string; name: string; isDefault: boolean };
type FinCategory = { id: string; name: string };
type FinCurrency = { code: string; symbol?: string | null; name?: string | null; decimals?: number | null };

type Props = {
  userId: string;
  accounts: FinAccount[];
  categories: FinCategory[];
  currencies: FinCurrency[];
  expenses: ExpenseRow[];
  primaryCurrencyCode: string;
  initialMonth?: string;
  /** El formulario que se abre al entrar (`?create=`): un gasto o una COMPRA. */
  formularioAlEntrar?: FormularioDeGasto | null;
  /** La lista de Proveedores de la cuenta, de la que sale el de una compra. */
  proveedores?: ProveedorDeLaLista[];
  /** Las cuentas de la familia entre las que se puede elegir. Vacía: sin selector. */
  cuentasDisponibles?: CuentaDeFinanzas[];
  /** Las que están puestas ahora mismo, ya resueltas en el servidor. */
  cuentasElegidas?: string[];
};

type FormState = {
  occurredAt: string;
  amount: string;
  currencyCode: string; // fijo (solo lectura)
  accountId: string;
  categoryId: string | null;
  title: string;
  description: string;
};

type DraftAttachment = {
  id?: string;
  url: string;
  fileName?: string | null;
  mimeType?: string | null;
  sizeBytes?: number | null;
  isNew?: boolean;
};

const toISODate = (d: Date | string) => {
  // Date-only en UTC (coincide con el guardado y el display), para no correr
  // la fecha un día por la zona horaria.
  const date = typeof d === 'string' ? new Date(d) : d;
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(date.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};


function guessIsImage(mimeType?: string | null, url?: string) {
  if (mimeType?.startsWith('image/')) return true;
  if (!url) return false;
  return /\.(png|jpg|jpeg|webp|gif)$/i.test(url);
}

function guessIsPdf(mimeType?: string | null, url?: string) {
  if (mimeType === 'application/pdf') return true;
  if (!url) return false;
  return /\.pdf$/i.test(url);
}


function MiniField({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <label className="text-xs text-muted-foreground">{label}</label>
        {hint ? <p className="text-[11px] text-muted-foreground/80">{hint}</p> : null}
      </div>
      {children}
    </div>
  );
}

function EmptyBox({ text }: { text: string }) {
  return (
    <div className="rounded-xl border bg-background p-4">
      <p className="text-sm text-muted-foreground">{text}</p>
    </div>
  );
}

export default function MainExpenses({
  userId,
  accounts,
  categories,
  currencies,
  expenses,
  primaryCurrencyCode,
  initialMonth,
  formularioAlEntrar = null,
  proveedores = [],
  cuentasDisponibles = [],
  cuentasElegidas = [],
}: Props) {
  const router = useRouter();

  const borrarLosMarcados = async (ids: string[]) => {
    const resumen = await eliminarGastosAction(ids, userId);
    if (!resumen.success) toast.error(resumen.message);
    return { fallaron: resumen.fallaron };
  };
  const [isPending, startTransition] = useTransition();

  const [rows, setRows] = useState<ExpenseRow[]>(expenses ?? []);
  useEffect(() => setRows(expenses ?? []), [expenses]);

  const [detailOpen, setDetailOpen] = useState(false);
  const [detailRow, setDetailRow] = useState<ExpenseRow | null>(null);

  const openDetail = (row: ExpenseRow) => {
    setDetailRow(row);
    setDetailOpen(true);
  };
  const closeDetail = () => {
    setDetailOpen(false);
    setDetailRow(null);
  };

  // Por defecto se ven TODOS los gastos; el periodo se elige en la barra, con
  // el mismo botón que Ventas y Cuentas (`FiltroDePeriodo`).
  const [periodo, setPeriodo] = useState<Periodo>(() => unPeriodo('todo', initialMonth));
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ExpenseRow | null>(null);
  const didAutoOpenCreate = useRef(false);

  // Una COMPRA es un gasto con proveedor (`lib/compras-de-finanzas.ts`): el
  // mismo formulario, con el proveedor de la lista delante. «Nuevo» de esta
  // pantalla abre un gasto, como siempre; el acceso «Compras» abre una compra.
  const [modo, setModo] = useState<FormularioDeGasto>('gasto');
  const [proveedor, setProveedor] = useState<ProveedorElegido>({ id: null, nombre: '' });
  const [listaDeProveedores, setListaDeProveedores] = useState<ProveedorDeLaLista[]>(proveedores);
  useEffect(() => setListaDeProveedores(proveedores), [proveedores]);
  const textos = losTextosDelFormulario(modo, Boolean(editing));

  const [attachments, setAttachments] = useState<DraftAttachment[]>([]);
  const [uploading, setUploading] = useState(false);

  const defaultAccountId = useMemo(
    () => accounts.find((a) => a.isDefault)?.id || accounts[0]?.id || '',
    [accounts]
  );

  // moneda fija: la del user (si existe en catálogo), sino primera, sino USD
  const defaultCurrency = useMemo(() => {
    return (
      currencies.find((c) => c.code === primaryCurrencyCode)?.code ||
      currencies[0]?.code ||
      'USD'
    );
  }, [currencies, primaryCurrencyCode]);

  const [form, setForm] = useState<FormState>({
    occurredAt: elDiaDeHoy(),
    amount: '',
    currencyCode: defaultCurrency,
    accountId: defaultAccountId,
    categoryId: null,
    title: '',
    description: '',
  });

  useEffect(() => {
    // si cambió la moneda del user / load props
    setForm((p) => ({
      ...p,
      currencyCode: defaultCurrency, // forzar a la preferida (como Sales)
    }));
  }, [defaultCurrency]);

  const resetForm = () => {
    setForm({
      occurredAt: laFechaDeUnoNuevo(periodo),
      amount: '',
      currencyCode: defaultCurrency,
      accountId: defaultAccountId,
      categoryId: null,
      title: '',
      description: '',
    });
  };

  const openCreate = (cual: FormularioDeGasto = 'gasto') => {
    setEditing(null);
    setModo(cual);
    setProveedor({ id: null, nombre: '' });
    resetForm();
    setAttachments([]);
    setOpen(true);
  };

  useEffect(() => {
    // Sin `?create=` se vuelve a poder abrir: así «Compras» abre otra compra
    // cada vez que se pulsa, y no solo la primera.
    if (!formularioAlEntrar) {
      didAutoOpenCreate.current = false;
      return;
    }
    if (didAutoOpenCreate.current) return;
    didAutoOpenCreate.current = true;
    // El `?create=` se quita de la dirección en cuanto se usa: con él puesto,
    // pulsar «Compras» otra vez llevaría a la MISMA dirección y no abriría
    // nada. Y una recarga no vuelve a abrir el formulario.
    const sinCrear = laDireccionSinCrear(window.location.pathname, window.location.search);
    if (sinCrear) router.replace(sinCrear, { scroll: false });
    setEditing(null);
    setModo(formularioAlEntrar);
    setProveedor({ id: null, nombre: '' });
    setForm({
      occurredAt: laFechaDeUnoNuevo(periodo),
      amount: '',
      currencyCode: defaultCurrency,
      accountId: defaultAccountId,
      categoryId: null,
      title: '',
      description: '',
    });
    setAttachments([]);
    setOpen(true);
  }, [formularioAlEntrar, defaultAccountId, defaultCurrency, periodo]);

  const openEdit = (row: ExpenseRow) => {
    setEditing(row);
    // Un gasto con proveedor se abre como la compra que es: si no, editarlo
    // escondería el proveedor y no habría forma de cambiarlo.
    setModo(esUnaCompra(row) ? 'compra' : 'gasto');
    setProveedor({ id: elProveedorDeLaReferencia(row.reference), nombre: row.counterparty ?? '' });

    // mantiene moneda del registro (solo lectura), si no hay, usa defaultCurrency
    setForm({
      occurredAt: toISODate(row.occurredAt),
      amount: String(row.amount ?? ''),
      currencyCode: row.currencyCode || defaultCurrency,
      accountId: row.accountId,
      categoryId: row.categoryId ?? null,
      title: row.title ?? '',
      description: row.description ?? '',
    });

    const rawAttachments = Array.isArray(row.attachments) ? (row.attachments as DraftAttachment[]) : [];
    setAttachments(
      rawAttachments.map((a) => ({
        id: a.id,
        url: a.url,
        fileName: a.fileName ?? null,
        mimeType: a.mimeType ?? null,
        sizeBytes: a.sizeBytes ?? null,
        isNew: false,
      }))
    );

    setOpen(true);
  };

  async function uploadReceipt(file: File) {
    const fd = new FormData();
    fd.append('file', file);

    const res = await fetch('/api/upload-invoice', { method: 'POST', body: fd });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || 'Error subiendo archivo');

    return {
      url: data.url as string,
      fileName: (data.fileName as string) ?? file.name,
      mimeType: (data.mimeType as string) ?? file.type,
      sizeBytes: (data.sizeBytes as number) ?? file.size,
    };
  }

  async function handleFiles(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    try {
      for (const f of Array.from(files)) {
        const up = await uploadReceipt(f);
        setAttachments((prev) => [...prev, { ...up, isNew: true }]);
      }
      toast.success('Soporte(s) subido(s)');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al subir soporte');
    } finally {
      setUploading(false);
    }
  }

  const onSave = () => {
    const motivo = porQueNoSeGuarda(modo, form, { id: proveedor.id, nombreActual: proveedor.nombre });
    if (motivo) return toast.error(motivo);

    startTransition(() => {
      void (async () => {
        const payload = {
          userId,
          occurredAt: form.occurredAt,
          amount: form.amount,
          currencyCode: form.currencyCode, // fijo (solo lectura)
          accountId: form.accountId,
          categoryId: form.categoryId,
          title: form.title?.trim() || null,
          description: form.description?.trim() || null,
          // Solo el ID: el nombre lo pone el servidor, que comprueba que el
          // proveedor sea de la lista de esta cuenta. Al editar, solo si cambió.
          proveedorId: elProveedorQueSeManda(modo, proveedor.id, editing?.reference),
        };

        // Separado en dos ramas a proposito: solo `createExpense` devuelve el
        // id del gasto -al editar ya se tiene-, y mezclando las dos llamadas
        // en una sola linea no habia forma de saber cual de las dos habia sido.
        let txId: string | undefined;
        if (editing) {
          const res = await updateExpense(editing.id, userId, payload);
          if (!res.success) return toast.error(res.message);
          txId = editing.id;
        } else {
          const res = await createExpense(payload);
          if (!res.success) return toast.error(res.message);
          txId = res.data?.id;
        }

        const newOnes = attachments.filter((a) => a.isNew);
        if (txId && newOnes.length) {
          const attachRes = await addExpenseAttachments({
            userId,
            transactionId: txId,
            attachments: newOnes.map((a) => ({
              url: a.url,
              fileName: a.fileName ?? null,
              mimeType: a.mimeType ?? null,
              sizeBytes: a.sizeBytes ?? null,
            })),
          });
          if (!attachRes.success) return toast.error(attachRes.message);
        }

        toast.success(editing ? textos.actualizado : textos.creado);
        setOpen(false);
        setEditing(null);
        setAttachments([]);

        router.refresh();
      })();
    });
  };

  // Devuelve si se borró: la confirmación se queda abierta si el servidor dice
  // que no, y solo se cierra cuando de verdad se fue.
  const onDelete = async (row: ExpenseRow): Promise<boolean> => {
    const res = await deleteExpense(row.id, userId);
    if (!res.success) {
      toast.error(res.message);
      return false;
    }
    setRows((prev) => prev.filter((r) => r.id !== row.id));
    toast.success('Gasto eliminado');
    if (detailRow?.id === row.id) closeDetail();
    router.refresh();
    return true;
  };

  const [borrandoTodos, setBorrandoTodos] = useState(false);
  const onDeleteAll = async (): Promise<boolean> => {
    const res = await deleteAllExpenses(userId);
    if (!res.success) {
      toast.error(res.message);
      return false;
    }
    setRows([]);
    toast.success(res.message);
    router.refresh();
    return true;
  };

  const consolidando = estaConsolidando(cuentasElegidas);

  const nombresDeCuenta = useMemo(
    () => nombresPorCuenta(lasCuentasElegidas(cuentasDisponibles, cuentasElegidas)),
    [cuentasDisponibles, cuentasElegidas],
  );

  // Consolidar es para MIRAR, no para editar: las acciones de escritura de
  // Finanzas acotan por la cuenta con la que se llaman, así que el lápiz sobre
  // una fila ajena contestaría «no encontrada». Se ve, y para tocarla se entra
  // a esa cuenta.
  const filaAjena = useCallback(
    (fila: ExpenseRow) => consolidando && esDeOtraCuenta(fila.userId, userId),
    [consolidando, userId],
  );

  const columns = useMemo(
    () => {
      const propias = buildExpenseColumns({
        monedas: currencies,
        onEdit: openEdit,
        onDelete,
        busy: isPending,
        esDeOtraCuenta: filaAjena,
      });
      return consolidando
        ? [columnaDeCuenta<ExpenseRow>((f) => f.userId, nombresDeCuenta), ...propias]
        : propias;
    },
    [isPending, consolidando, nombresDeCuenta, filaAjena, currencies] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const selectorDeCuentas =
    cuentasDisponibles.length > 0 ? (
      <SelectorDeCuentas disponibles={cuentasDisponibles} elegidas={cuentasElegidas} />
    ) : null;

  const filas = useMemo(() => filtrarPorPeriodo(rows, periodo, (r) => r.occurredAt), [rows, periodo]);

  const detailAccountName = useMemo(() => {
    if (!detailRow?.accountId) return '';
    return accounts.find((a) => a.id === detailRow.accountId)?.name || '';
  }, [detailRow, accounts]);

  const detailCategoryName = useMemo(() => {
    if (!detailRow?.categoryId) return 'Sin categoría';
    return categories.find((c) => c.id === detailRow.categoryId)?.name || 'Sin categoría';
  }, [detailRow, categories]);


  const detailAttachments = useMemo(
    () => detailRow?.attachments ?? [],
    [detailRow]
  );

  return (
    <TooltipProvider>
      <div className="flex flex-col flex-1 min-h-0 overflow-hidden gap-3">
        <Card className="border-border flex-1 min-h-0 flex flex-col">
          <CardHeader className="py-3 flex-1 min-h-0 flex flex-col">
            <TablaDeFinanzas
              columns={columns}
              data={filas}
              searchKey="concepto"
              searchPlaceholder="Buscar un gasto..."
              onRowClick={openDetail}
              queEs="gasto"
              vacio={periodo.modo === 'todo' ? 'Todavía no hay gastos.' : 'No hay gastos en este periodo.'}
              filaEditable={(fila) => !filaAjena(fila)}
              filtros={
                <>
                  <FiltroDePeriodo periodo={periodo} alCambiar={setPeriodo} queSon="Todos" />
                  {selectorDeCuentas}
                </>
              }
              crear={<BotonDeCrear onClick={() => openCreate('gasto')} disabled={isPending}>Nuevo</BotonDeCrear>}
              acciones={(seleccionados, limpiar) => (
                <AccionesMasivas
                  seleccionados={seleccionados}
                  queSon="gastos"
                  onEliminar={borrarLosMarcados}
                  onTerminar={() => {
                    limpiar();
                    router.refresh();
                  }}
                  extras={
                    // Borrar todos acota por la cuenta propia: debajo de una
                    // lista consolidada prometería lo que no hace.
                    consolidando || rows.length === 0
                      ? []
                      : [
                          {
                            clave: 'todos',
                            etiqueta: 'Eliminar todos los gastos',
                            icono: <Trash2 className="h-4 w-4" />,
                            destructiva: true,
                            sinSeleccion: true,
                            onSelect: () => setBorrandoTodos(true),
                          },
                        ]
                  }
                />
              )}
            />
          </CardHeader>
        </Card>

        <ConfirmarBorrado
          abierto={borrandoTodos}
          alCambiar={setBorrandoTodos}
          queEs={`los ${rows.length} gastos`}
          detalle="Se borran todos los gastos de esta cuenta, no solo los que se ven."
          onConfirmar={onDeleteAll}
        />

        {/* Detalle: la misma forma que el de una venta (lib/detalle-de-finanzas.ts).
            Iba a 820 px con el total metido en la tarjeta del concepto, y los
            botones pegados al borde: la X de cerrar quedaba encima de Eliminar. */}
        <Dialog open={detailOpen} onOpenChange={(v) => (v ? setDetailOpen(true) : closeDetail())}>
          <DialogContent className={DIALOGO_DEL_DETALLE} data-detalle-de-finanzas>
            <div className={CABECERA_DEL_DETALLE} data-cabecera-del-detalle>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <DialogTitle className="text-base sm:text-lg font-semibold truncate">
                    {esUnaCompra(detailRow ?? {}) ? 'Detalle de la compra' : 'Detalle del gasto'}
                  </DialogTitle>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Visualiza el resumen, el proveedor y los soportes.
                  </p>
                </div>

                {detailRow ? (
                  <AccionesDeLaFila
                    queEs={esUnaCompra(detailRow) ? 'la compra' : 'el gasto'}
                    nombre={elConceptoDelGasto(detailRow)}
                    ajena={filaAjena(detailRow)}
                    ocupado={isPending}
                    tamano="detalle"
                    onEditar={() => {
                      closeDetail();
                      openEdit(detailRow);
                    }}
                    onEliminar={() => onDelete(detailRow)}
                  />
                ) : null}
              </div>
            </div>

            {detailRow ? (
              <div className={CUERPO_DEL_DETALLE}>
                <div className={REJILLA_DEL_DETALLE}>
                  <div className="space-y-4">
                    <div className="rounded-2xl border bg-muted/10 p-4">
                      <div className="min-w-0">
                        <p className="truncate text-base font-semibold">{elConceptoDelGasto(detailRow) || 'Sin concepto'}</p>

                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <Badge variant="secondary" className="h-6 rounded-lg text-[11px]">
                            {toISODate(detailRow.occurredAt)}
                          </Badge>
                          <Badge variant="outline" className="h-6 rounded-lg text-[11px]">
                            {detailAccountName || '—'}
                          </Badge>
                          <Badge variant="outline" className="h-6 rounded-lg text-[11px]">
                            {detailCategoryName}
                          </Badge>
                          {elProveedorDelGasto(detailRow) ? (
                            <Badge variant="outline" className="h-6 rounded-lg text-[11px]">
                              <span className="inline-flex items-center gap-1">
                                <Truck className="h-3.5 w-3.5" />
                                <span className="truncate max-w-[170px]">{elProveedorDelGasto(detailRow)}</span>
                              </span>
                            </Badge>
                          ) : null}
                        </div>
                      </div>

                      <Separator className="my-3" />

                      {detailRow.description ? (
                        <div className="rounded-xl border bg-background p-3">
                          <p className="whitespace-pre-wrap text-sm leading-relaxed">{detailRow.description}</p>
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground">Sin descripción</p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium">Soportes</p>
                        <p className="text-xs text-muted-foreground">
                          {detailAttachments.length ? `${detailAttachments.length} archivo(s)` : '0 archivos'}
                        </p>
                      </div>

                      {detailAttachments.length ? (
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                          {detailAttachments.map((a) => {
                            const isImg = guessIsImage(a.mimeType, a.url);
                            const isPdf = guessIsPdf(a.mimeType, a.url);

                            return (
                              <a
                                key={a.id ?? a.url}
                                href={a.url}
                                target="_blank"
                                rel="noreferrer"
                                className="group flex items-center gap-3 rounded-2xl border bg-background p-3 transition-colors hover:bg-muted/30"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <div className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-xl border bg-muted/10">
                                  {isImg ? (
                                    <SafeImage
                                      src={a.url}
                                      alt={a.fileName || 'soporte'}
                                      width={44}
                                      height={44}
                                      className="h-11 w-11 object-cover"
                                    />
                                  ) : isPdf ? (
                                    <FileText className="h-5 w-5 text-muted-foreground" />
                                  ) : (
                                    <Receipt className="h-5 w-5 text-muted-foreground" />
                                  )}
                                </div>

                                <div className="min-w-0 flex-1">
                                  <p className="truncate text-sm font-medium">{a.fileName || 'Archivo'}</p>
                                  <p className="text-[11px] text-muted-foreground">
                                    Abrir <ExternalLink className="ml-1 inline h-3 w-3" />
                                  </p>
                                </div>
                              </a>
                            );
                          })}
                        </div>
                      ) : (
                        <EmptyBox text="Sin soportes" />
                      )}
                    </div>
                  </div>

                  <div className="space-y-3 lg:sticky lg:top-4">
                    <div className="rounded-2xl border bg-background p-4" data-total-del-detalle>
                      <p className="text-xs text-muted-foreground">Total</p>

                      <div className="mt-1 flex items-end justify-between gap-3">
                        <p className="text-2xl font-bold leading-none tabular-nums">
                          {formatoDeDinero(currencies, detailRow.currencyCode || defaultCurrency, comoImporte(detailRow.amount))}
                        </p>
                        <Badge variant="outline" className="h-7 rounded-xl text-[11px]">
                          {detailRow.currencyCode}
                        </Badge>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}
          </DialogContent>
        </Dialog>

        {/* Modal Create/Edit (MISMO DISEÑO QUE SALES: left form + right resumen sticky) */}
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent
            className="flex flex-col overflow-hidden rounded-2xl sm:max-w-[1000px]"
            data-formulario-de-gasto={modo}
          >
            <DialogHeader className="shrink-0 space-y-1">
              <div className="flex items-center justify-between gap-2">
                {/* El título sale de `losTextosDelFormulario`: «Nuevo gasto» o «Nueva compra». */}
                <DialogTitle className="text-base">{textos.titulo}</DialogTitle>
                <Badge variant="secondary" className="h-6 text-[11px]">
                  {editing ? 'Edición' : 'Registro'}
                </Badge>
              </div>
            </DialogHeader>

            <div className="min-h-0 flex-1 overflow-y-auto pr-1">
            {(() => {
              const previewAccountName = accounts.find((a) => a.id === form.accountId)?.name || '—';
              const previewCategoryName = form.categoryId
                ? categories.find((c) => c.id === form.categoryId)?.name || 'Sin categoría'
                : 'Sin categoría';

              const totalText = formatoDeDinero(currencies, form.currencyCode, comoImporte(form.amount));
              const proveedorDelResumen =
                (proveedor.id ? listaDeProveedores.find((p) => p.id === proveedor.id)?.name : undefined) ??
                proveedor.nombre.trim();

              return (
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_360px]">
                  {/* LEFT */}
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      {modo === 'compra' ? (
                        <div className="sm:col-span-2">
                          <SelectorDeProveedor
                            userId={userId}
                            proveedores={listaDeProveedores}
                            valor={proveedor}
                            alCambiar={setProveedor}
                            alCrear={(p) => setListaDeProveedores((prev) => [p, ...prev.filter((x) => x.id !== p.id)])}
                            ocupado={isPending}
                          />
                        </div>
                      ) : null}

                      <MiniField label="Concepto">
                        <Input
                          value={form.title}
                          onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
                          className="h-9 text-sm"
                          placeholder={textos.placeholderDelConcepto}
                        />
                      </MiniField>

                      <MiniField label="Monto">
                        <Input
                          type="number"
                          inputMode="decimal"
                          value={form.amount}
                          onChange={(e) => setForm((p) => ({ ...p, amount: e.target.value }))}
                          className="h-9 text-sm"
                          placeholder="0.00"
                        />
                      </MiniField>

                      <MiniField label="Cuenta">
                        <Select value={form.accountId} onValueChange={(v) => setForm((p) => ({ ...p, accountId: v }))}>
                          <SelectTrigger className="h-9 text-sm">
                            <SelectValue placeholder="Selecciona" />
                          </SelectTrigger>
                          <SelectContent>
                            {accounts.map((a) => (
                              <SelectItem key={a.id} value={a.id} className="text-sm">
                                {a.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </MiniField>

                      <MiniField label="Categoría" hint="Opcional">
                        <Select
                          value={form.categoryId || '__none__'}
                          onValueChange={(v) => setForm((p) => ({ ...p, categoryId: v === '__none__' ? null : v }))}
                        >
                          <SelectTrigger className="h-9 text-sm">
                            <SelectValue placeholder="Opcional" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__" className="text-sm">
                              Sin categoría
                            </SelectItem>
                            {categories.map((c) => (
                              <SelectItem key={c.id} value={c.id} className="text-sm">
                                {c.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </MiniField>

                      <div className="sm:col-span-2">
                        <MiniField label="Descripción" hint="Opcional">
                          <Textarea
                            value={form.description}
                            onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                            className="min-h-[76px] h-[76px] resize-y text-sm"
                            placeholder="Notas, referencia, observación..."
                          />
                        </MiniField>
                      </div>
                    </div>

                    <div className="flex justify-between gap-2 pt-1">
                      <Button variant="outline" size="sm" onClick={() => setOpen(false)} disabled={isPending} className="h-9">
                        Cancelar
                      </Button>
                      <Button variant="save" onClick={onSave} size="sm" disabled={isPending || uploading} className="h-9">
                        {textos.guardar}
                      </Button>
                    </div>
                  </div>

                  {/* RIGHT (sticky) */}
                  <div className="space-y-3 lg:sticky lg:top-4">
                    <div className="rounded-xl border bg-background p-3">
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <CalendarDays className="h-4 w-4 text-muted-foreground" />
                            <p className="text-xs text-muted-foreground">Fecha</p>
                          </div>
                          <Input
                            type="date"
                            value={form.occurredAt}
                            onChange={(e) => setForm((p) => ({ ...p, occurredAt: e.target.value }))}
                            className="h-9 text-sm"
                          />
                        </div>

                        {/* Moneda SOLO lectura como Sales */}
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <Layers className="h-4 w-4 text-muted-foreground" />
                            <p className="text-xs text-muted-foreground">Moneda</p>
                          </div>
                          <Input value={form.currencyCode} disabled className="h-9 text-sm opacity-100" />
                        </div>
                      </div>
                    </div>

                    <div className="rounded-xl border bg-background p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-[11px] text-muted-foreground">Concepto</p>
                          <p className="truncate text-sm font-medium">{form.title?.trim() ? form.title.trim() : '—'}</p>

                          <div className="mt-2 flex flex-wrap gap-2">
                            {modo === 'compra' ? (
                              <Badge variant="outline" className="h-6 whitespace-nowrap text-[11px]">
                                <span className="inline-flex items-center gap-1">
                                  <Truck className="h-3.5 w-3.5" />
                                  <span className="truncate max-w-[170px]">{proveedorDelResumen || 'Sin proveedor'}</span>
                                </span>
                              </Badge>
                            ) : null}
                            <Badge variant="outline" className="h-6 whitespace-nowrap text-[11px]">
                              {previewAccountName}
                            </Badge>
                            <Badge variant="outline" className="h-6 whitespace-nowrap text-[11px]">
                              {previewCategoryName}
                            </Badge>
                          </div>
                        </div>

                        <div className="shrink-0 text-right">
                          <p className="text-[11px] text-muted-foreground">Total</p>
                          <p className="text-lg font-bold leading-tight tabular-nums">{totalText}</p>
                        </div>
                      </div>

                      {form.description?.trim() ? (
                        <>
                          <Separator className="my-3" />
                          <p className="text-xs text-muted-foreground whitespace-pre-wrap">{form.description.trim()}</p>
                        </>
                      ) : null}
                    </div>

                    <div className="rounded-xl border bg-background p-3">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium">Soportes</p>

                        <Button
                          type="button"
                          variant="outline"
                          className="h-9 px-3 text-sm"
                          disabled={uploading || isPending}
                          onClick={() => document.getElementById('expense-receipts')?.click()}
                        >
                          <Paperclip className="mr-2 h-4 w-4" />
                          Adjuntar
                        </Button>

                        <input
                          id="expense-receipts"
                          type="file"
                          multiple
                          className="hidden"
                          onChange={(e) => handleFiles(e.target.files)}
                          accept="image/*,application/pdf"
                        />
                      </div>

                      <p className="mt-1 text-[11px] text-muted-foreground">Tip: usa capturas o PDF. Se guardan al crear/editar.</p>

                      <Separator className="my-3" />

                      {attachments.length ? (
                        <div className="grid grid-cols-1 gap-2">
                          {attachments.map((a, idx) => (
                            <div key={a.id ?? `${a.url}-${idx}`} className="flex items-center gap-3 rounded-xl border p-3 hover:bg-muted/30">
                              <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-lg border bg-muted/10">
                                {guessIsImage(a.mimeType, a.url) ? (
                                  <SafeImage
                                    src={a.url}
                                    alt={a.fileName || 'soporte'}
                                    width={40}
                                    height={40}
                                    className="h-10 w-10 object-cover"
                                  />
                                ) : guessIsPdf(a.mimeType, a.url) ? (
                                  <FileText className="h-5 w-5 text-muted-foreground" />
                                ) : (
                                  <Receipt className="h-5 w-5 text-muted-foreground" />
                                )}
                              </div>

                              <div className="min-w-0 flex-1">
                                <a
                                  href={a.url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="block truncate text-sm font-medium text-primary underline underline-offset-2"
                                >
                                  {a.fileName || 'Archivo'}
                                </a>
                                <p className="text-[11px] text-muted-foreground">{a.isNew ? 'Nuevo (sin guardar)' : 'Guardado'}</p>
                              </div>

                              <Button
                                type="button"
                                variant="ghost"
                                className="h-8 w-8 p-0"
                                disabled={isPending}
                                onClick={() => {
                                  startTransition(() => {
                                    void (async () => {
                                      if (a.id) {
                                        const res = await deleteExpenseAttachment({ userId, attachmentId: a.id });
                                        if (!res.success) return toast.error(res.message);
                                      }
                                      setAttachments((prev) => prev.filter((_, i) => i !== idx));
                                      toast.success('Soporte eliminado');
                                      router.refresh();
                                    })();
                                  });
                                }}
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <EmptyBox text={uploading ? 'Subiendo...' : 'Sin soportes'} />
                      )}
                    </div>
                  </div>
                </div>
              );
            })()}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  );
}
