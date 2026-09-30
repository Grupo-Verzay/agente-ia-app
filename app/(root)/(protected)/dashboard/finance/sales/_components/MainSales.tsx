'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import { TablaDeFinanzas } from '../../_components/TablaDeFinanzas';
import { FiltroDePeriodo } from '../../_components/FiltroDePeriodo';
import { AccionesDeLaFila, ConfirmarBorrado } from '../../_components/AccionesDeLaFila';
import { buildSalesColumns, type SaleTxRow } from './columns';
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
  createSale,
  updateSale,
  deleteSale,
  deleteAllSales,
  addSaleAttachments,
  deleteSaleAttachment,
} from '@/actions/finance-sales-actions';

import { listProducts } from '@/actions/products-actions';
import { searchSessionsByUserId } from '@/actions/session-action';
import { eliminarVentasAction } from '@/actions/borrado-en-bloque-actions';
import { AccionesMasivas } from '@/components/shared/AccionesMasivas';
import { filtrarPorPeriodo, laFechaDeUnoNuevo, elDiaDeHoy, unPeriodo, type Periodo } from '@/lib/periodo-de-finanzas';
import { comoImporte, elNombreDelContacto, elNumeroDelContacto, elTotalDeLaVenta, formatoDeDinero } from '@/lib/tabla-de-finanzas';
import { CABECERA_DEL_DETALLE, CUERPO_DEL_DETALLE, DIALOGO_DEL_DETALLE, REJILLA_DEL_DETALLE } from '@/lib/detalle-de-finanzas';

import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem } from '@/components/ui/command';
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
  ChevronsUpDown,
  Check,
  UserRound,
  Phone,
  Trash2,
} from 'lucide-react';

import { cn } from '@/lib/utils';
import { BotonDeCrear } from '@/components/shared/BarraDeAcciones';

type FinAccount  = { id: string; name: string; isDefault: boolean };
type FinCategory = { id: string; name: string };
type FinCurrency = { code: string; symbol?: string | null; name?: string | null; decimals?: number | null };
type FinProduct  = { id: string; title: string; price?: number | string | null };
type ContactOption = { id: number; pushName?: string | null; remoteJid: string };

type Props = {
  userId: string;
  /** Cuenta del catálogo de productos y contactos (cuenta operativa/effectiveId).
   *  Puede diferir de userId (la cuenta del dinero). Si no se pasa, usa userId. */
  catalogUserId?: string;
  accounts: FinAccount[];
  categories: FinCategory[];
  currencies: FinCurrency[];
  sales: SaleTxRow[];
  products: FinProduct[];
  primaryCurrencyCode: string;
  initialMonth?: string;
  autoOpenCreate?: boolean;
  /** Lo que se tecleó en el buscador del resumen de Finanzas (`?q=`). */
  initialSearch?: string;
  /** Las cuentas de la familia que se pueden elegir. Vacío = no hay selector. */
  cuentasDisponibles?: CuentaDeFinanzas[];
  /** Las que se están mirando. Con más de una, la lista va consolidada. */
  cuentasElegidas?: string[];
};

type FormState = {
  occurredAt: string;
  amount: string;
  extra: string;
  discount: string;

  currencyCode: string; // solo lectura

  accountId: string;
  categoryId: string | null;

  title: string;
  description: string;
  productId: string | null;

  sessionId: number | null;
  contactName: string;
  contactJid: string;
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
  // Date-only en UTC (coincide con el guardado y el display).
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


function MiniField({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
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

export default function MainSales({
  userId,
  catalogUserId,
  accounts,
  categories,
  currencies,
  sales,
  products,
  primaryCurrencyCode,
  initialMonth,
  autoOpenCreate = false,
  initialSearch,
  cuentasDisponibles = [],
  cuentasElegidas = [],
}: Props) {
  // Cuenta para el catálogo de productos y contactos (operativa); el dinero usa userId.
  const catUserId = catalogUserId ?? userId;
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [rows, setRows] = useState<SaleTxRow[]>(sales ?? []);
  useEffect(() => setRows(sales ?? []), [sales]);

  const [detailOpen, setDetailOpen] = useState(false);
  const [detailRow, setDetailRow] = useState<SaleTxRow | null>(null);

  const openDetail = (row: SaleTxRow) => {
    setDetailRow(row);
    setDetailOpen(true);
  };
  const closeDetail = () => {
    setDetailOpen(false);
    setDetailRow(null);
  };

  // Por defecto se ven TODAS las ventas; el periodo se elige en la barra, con
  // el mismo botón que Gastos y Cuentas (`FiltroDePeriodo`).
  const [periodo, setPeriodo] = useState<Periodo>(() => unPeriodo('todo', initialMonth));
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<SaleTxRow | null>(null);
  const didAutoOpenCreate = useRef(false);

  const [attachments, setAttachments] = useState<DraftAttachment[]>([]);
  const [uploading, setUploading] = useState(false);

  const [productOpen, setProductOpen] = useState(false);
  const [productQuery, setProductQuery] = useState('');
  const [productLoading, setProductLoading] = useState(false);
  const [productOptions, setProductOptions] = useState<FinProduct[]>(products ?? []);
  useEffect(() => setProductOptions(products ?? []), [products]);

  useEffect(() => {
    if (!productOpen) return;

    const t = setTimeout(() => {
      void (async () => {
        setProductLoading(true);
        try {
          const res = await listProducts({
            userId: catUserId,
            q: productQuery.trim(),
            page: 1,
            perPage: 30,
            onlyActive: true,
          });
          setProductOptions(res.items || []);
        } catch (e) {
          toast.error(e instanceof Error ? e.message : 'Error buscando productos');
        } finally {
          setProductLoading(false);
        }
      })();
    }, 300);

    return () => clearTimeout(t);
  }, [productOpen, productQuery, catUserId]);

  const [contactOpen, setContactOpen] = useState(false);
  const [contactQuery, setContactQuery] = useState('');
  const [contactLoading, setContactLoading] = useState(false);
  const [contactOptions, setContactOptions] = useState<ContactOption[]>([]);

  useEffect(() => {
    if (!contactOpen) return;

    const t = setTimeout(() => {
      void (async () => {
        setContactLoading(true);
        try {
          const res = await searchSessionsByUserId(catUserId, contactQuery.trim());
          if (!res?.success) return toast.error(res?.message || 'No se pudieron cargar contactos');
          setContactOptions(res.data || []);
        } catch (e) {
          toast.error(e instanceof Error ? e.message : 'Error buscando contactos');
        } finally {
          setContactLoading(false);
        }
      })();
    }, 300);

    return () => clearTimeout(t);
  }, [contactOpen, contactQuery, catUserId]);

  const defaultAccountId = useMemo(
    () => accounts.find((a) => a.isDefault)?.id || accounts[0]?.id || '',
    [accounts]
  );

  // moneda por defecto SIEMPRE la del setting (si existe en catálogo)
  const defaultCurrency = useMemo(() => {
    return (
      currencies.find((c) => c.code === primaryCurrencyCode)?.code ||
      currencies.find((c) => c.code === 'COP')?.code ||
      currencies[0]?.code ||
      'COP'
    );
  }, [currencies, primaryCurrencyCode]);

  const [form, setForm] = useState<FormState>({
    occurredAt: elDiaDeHoy(),
    amount: '',
    extra: '',
    discount: '',
    currencyCode: defaultCurrency,
    accountId: defaultAccountId,
    categoryId: null,
    title: '',
    description: '',
    productId: null,

    sessionId: null,
    contactName: '',
    contactJid: '',
  });

  // si cambias la moneda en settings y recargas la página,
  // al abrir "Nuevo" debe usar la nueva moneda
  useEffect(() => {
    setForm((p) => ({
      ...p,
      currencyCode: p.currencyCode || defaultCurrency,
    }));
  }, [defaultCurrency]);

  const resetForm = () => {
    setForm({
      occurredAt: laFechaDeUnoNuevo(periodo),
      amount: '',
      extra: '',
      discount: '',
      currencyCode: defaultCurrency,
      accountId: defaultAccountId,
      categoryId: null,
      title: '',
      description: '',
      productId: null,

      sessionId: null,
      contactName: '',
      contactJid: '',
    });
  };

  const openCreate = () => {
    setEditing(null);
    resetForm();
    setAttachments([]);
    setProductQuery('');
    setContactQuery('');
    setContactOptions([]);
    setOpen(true);
  };

  useEffect(() => {
    if (!autoOpenCreate || didAutoOpenCreate.current) return;
    didAutoOpenCreate.current = true;
    setEditing(null);
    setForm({
      occurredAt: laFechaDeUnoNuevo(periodo),
      amount: '',
      extra: '',
      discount: '',
      currencyCode: defaultCurrency,
      accountId: defaultAccountId,
      categoryId: null,
      title: '',
      description: '',
      productId: null,
      sessionId: null,
      contactName: '',
      contactJid: '',
    });
    setAttachments([]);
    setProductQuery('');
    setContactQuery('');
    setContactOptions([]);
    setOpen(true);
  }, [autoOpenCreate, defaultAccountId, defaultCurrency, periodo]);

  const openEdit = (row: SaleTxRow) => {
    setEditing(row);

    // La venta no guarda de que producto salio -la tabla de movimientos no
    // tiene esa columna-, asi que se deduce por el concepto. Antes se leia
    // primero `row.productId`, que no existe y siempre venia vacio.
    const inferredProductId = products.find((p) => p.title === row.title)?.id ?? null;
    const inferredContactName = row.counterparty ?? '';
    const inferredContactJid = row.reference ?? '';

    // mantiene moneda del registro (solo lectura)
    setForm({
      occurredAt: toISODate(row.occurredAt as string),
      amount: String(row.amount ?? ''),
      extra: String((row.extra as string | null) ?? ''),
      discount: String((row.discount as string | null) ?? ''),
      currencyCode: row.currencyCode || defaultCurrency,
      accountId: row.accountId as string,
      categoryId: (row.categoryId as string | null) ?? null,
      title: row.title ?? '',
      description: (row.description as string | null) ?? '',
      productId: inferredProductId,

      sessionId: (row.sessionId as number | null) ?? null,
      contactName: inferredContactName,
      contactJid: inferredContactJid,
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
    if (!form.accountId) return toast.error('Selecciona una cuenta');
    if (!form.productId) return toast.error('Selecciona un producto');
    if (!form.amount) return toast.error('Ingresa un monto');

    startTransition(() => {
      void (async () => {
        const payload = {
          userId,
          occurredAt: form.occurredAt,
          amount: form.amount,
          extra: form.extra?.trim() ? form.extra : '0',
          discount: form.discount?.trim() ? form.discount : '0',

          // SIEMPRE la moneda del setting al crear (y se mantiene al editar)
          currencyCode: form.currencyCode,

          accountId: form.accountId,
          categoryId: form.categoryId,
          title: form.title?.trim() || null,
          description: form.description?.trim() || null,
          productId: form.productId,
          sessionId: form.sessionId ?? null,
          counterparty: form.contactName?.trim() || null,
          reference: form.contactJid?.trim() || null,
        };

        // Separado en dos ramas a proposito: solo `createSale` devuelve el id
        // de la venta -al editar ya se tiene-, y mezclando las dos llamadas en
        // una sola linea no habia forma de saber cual de las dos habia sido.
        let txId: string | undefined;
        if (editing) {
          const res = await updateSale(editing.id, userId, payload);
          if (!res.success) return toast.error(res.message);
          txId = editing.id;
        } else {
          const res = await createSale(payload);
          if (!res.success) return toast.error(res.message);
          txId = res.data?.id;
        }

        const newOnes = attachments.filter((a) => a.isNew);
        if (txId && newOnes.length) {
          const attachRes = await addSaleAttachments({
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

        toast.success(editing ? 'Venta actualizada' : 'Venta creada');
        setOpen(false);
        setEditing(null);
        setAttachments([]);

        router.refresh();
      })();
    });
  };

  // Devuelve si se borró: la confirmación se queda abierta si el servidor dice
  // que no, y solo se cierra cuando de verdad se fue.
  const onDelete = async (row: SaleTxRow): Promise<boolean> => {
    const res = await deleteSale(row.id, userId);
    if (!res.success) {
      toast.error(res.message);
      return false;
    }
    setRows((prev) => prev.filter((r) => r.id !== row.id));
    toast.success('Venta eliminada');
    if (detailRow?.id === row.id) closeDetail();
    router.refresh();
    return true;
  };

  // El borrado en bloque pregunta UNA vez —la del `⋯`— y avisa con el número
  // de verdad. Antes preguntaba dos veces y decía «eliminadas» antes de borrar.
  const borrarLosMarcados = async (ids: string[]) => {
    const resumen = await eliminarVentasAction(ids, userId);
    if (!resumen.success) toast.error(resumen.message);
    return { fallaron: resumen.fallaron };
  };

  const [borrandoTodas, setBorrandoTodas] = useState(false);
  const onDeleteAll = async (): Promise<boolean> => {
    const res = await deleteAllSales(userId);
    if (!res.success) {
      toast.error(res.message);
      return false;
    }
    setRows([]);
    toast.success(res.message);
    router.refresh();
    return true;
  };

  /* ── Consolidar varias cuentas de la familia ─────────────────────────────
     Todo esto **solo entra en juego con más de una cuenta elegida**. Con una
     —el caso de siempre, y el único que ve una cuenta hija— `consolidando` es
     falso, no hay columna, no hay fila bloqueada y la pantalla se ve
     exactamente como antes de que el selector existiera. */
  const consolidando = estaConsolidando(cuentasElegidas);

  const nombresDeCuenta = useMemo(
    () => nombresPorCuenta(lasCuentasElegidas(cuentasDisponibles, cuentasElegidas)),
    [cuentasDisponibles, cuentasElegidas],
  );

  const filaAjena = useCallback(
    (fila: SaleTxRow) => consolidando && esDeOtraCuenta(fila.userId, userId),
    [consolidando, userId],
  );

  const columns = useMemo(
    () => {
      const propias = buildSalesColumns({
        monedas: currencies,
        onEdit: openEdit,
        onDelete,
        busy: isPending,
        esDeOtraCuenta: filaAjena,
      });
      // La de la cuenta va la PRIMERA: es lo que agrupa la lectura de una lista
      // consolidada, y al final habría que recorrer la fila para saber de dónde
      // sale cada venta.
      return consolidando
        ? [columnaDeCuenta<SaleTxRow>((f) => f.userId, nombresDeCuenta), ...propias]
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
    () => (Array.isArray(detailRow?.attachments) ? (detailRow?.attachments as DraftAttachment[]) : []),
    [detailRow]
  );

  const detailBase = comoImporte(detailRow?.amount);
  const detailExtra = comoImporte(detailRow?.extra);
  const detailDiscount = comoImporte(detailRow?.discount);
  const detailTotal = detailRow ? elTotalDeLaVenta(detailRow) : 0;
  const dinero = (valor: number) => formatoDeDinero(currencies, detailRow?.currencyCode || defaultCurrency, valor);

  return (
    <TooltipProvider>
      <div className="flex flex-col flex-1 min-h-0 overflow-hidden gap-3">
        <Card className="border-border flex-1 min-h-0 flex flex-col">
          <CardHeader className="py-3 flex-1 min-h-0 flex flex-col">
            <TablaDeFinanzas
              columns={columns}
              data={filas}
              searchKey="concepto"
              searchPlaceholder="Buscar una venta..."
              initialSearch={initialSearch}
              onRowClick={openDetail}
              queEs="venta"
              vacio={periodo.modo === 'todo' ? 'Todavía no hay ventas.' : 'No hay ventas en este periodo.'}
              filaEditable={(fila) => !filaAjena(fila)}
              filtros={
                <>
                  <FiltroDePeriodo periodo={periodo} alCambiar={setPeriodo} queSon="Todas" />
                  {selectorDeCuentas}
                </>
              }
              crear={<BotonDeCrear onClick={openCreate} disabled={isPending}>Nuevo</BotonDeCrear>}
              acciones={(seleccionados, limpiar) => (
                <AccionesMasivas
                  seleccionados={seleccionados}
                  queSon="ventas"
                  onEliminar={borrarLosMarcados}
                  onTerminar={() => {
                    limpiar();
                    router.refresh();
                  }}
                  extras={
                    // Borrar todas acota por la cuenta propia: debajo de una
                    // lista consolidada prometería lo que no hace.
                    consolidando || rows.length === 0
                      ? []
                      : [
                          {
                            clave: 'todas',
                            etiqueta: 'Eliminar todas las ventas',
                            icono: <Trash2 className="h-4 w-4" />,
                            destructiva: true,
                            sinSeleccion: true,
                            onSelect: () => setBorrandoTodas(true),
                          },
                        ]
                  }
                />
              )}
            />
          </CardHeader>
        </Card>

        <ConfirmarBorrado
          abierto={borrandoTodas}
          alCambiar={setBorrandoTodas}
          queEs={`las ${rows.length} ventas`}
          detalle="Se borran todas las ventas de esta cuenta, no solo las que se ven."
          onConfirmar={onDeleteAll}
        />

{/* Detalle: la misma forma que el de un gasto (lib/detalle-de-finanzas.ts).
    La cabecera deja sitio a la X: con los botones pegados al borde, la X
    quedaba encima de Eliminar. */}
<Dialog open={detailOpen} onOpenChange={(v) => (v ? setDetailOpen(true) : closeDetail())}>
  <DialogContent className={DIALOGO_DEL_DETALLE} data-detalle-de-finanzas>
    {/* Header */}
    <div className={CABECERA_DEL_DETALLE} data-cabecera-del-detalle>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <DialogTitle className="text-base sm:text-lg font-semibold truncate">
            Detalle de la venta
          </DialogTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            Visualiza el resumen, contacto y soportes.
          </p>
        </div>

        {detailRow ? (
          <AccionesDeLaFila
            queEs="la venta"
            nombre={detailRow.title}
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
        {/* Layout: info + total */}
        <div className={REJILLA_DEL_DETALLE}>
          {/* LEFT */}
          <div className="space-y-4">
            {/* Hero card */}
            <div className="rounded-2xl border bg-muted/10 p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="truncate text-base font-semibold">
                    {detailRow.title || 'Sin concepto'}
                  </p>

                  {/* chips */}
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

                    {(detailRow.counterparty || detailRow.reference) ? (
                      <Badge variant="outline" className="h-6 rounded-lg text-[11px]">
                        <span className="inline-flex items-center gap-1">
                          <UserRound className="h-3.5 w-3.5" />
                          <span className="truncate max-w-[170px]">
                            {elNombreDelContacto(detailRow.counterparty, detailRow.reference)}
                          </span>

                          {detailRow.reference ? (
                            <>
                              <span className="mx-1 opacity-50">·</span>
                              <Phone className="h-3.5 w-3.5" />
                              <span className="truncate max-w-[180px]">
                                {elNumeroDelContacto(detailRow.reference)}
                              </span>
                            </>
                          ) : null}
                        </span>
                      </Badge>
                    ) : null}
                  </div>
                </div>
              </div>

              <Separator className="my-3" />

              {/* Description */}
              {detailRow.description ? (
                <div className="rounded-xl border bg-background p-3">
                  <p className="whitespace-pre-wrap text-sm leading-relaxed">
                    {detailRow.description}
                  </p>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Sin descripción</p>
              )}
            </div>

            {/* Attachments */}
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
                            <Paperclip className="h-5 w-5 text-muted-foreground" />
                          )}
                        </div>

                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">
                            {a.fileName || 'Archivo'}
                          </p>
                          <p className="text-[11px] text-muted-foreground">
                            Abrir <ExternalLink className="ml-1 inline h-3 w-3" />
                          </p>
                        </div>

                        <div className="opacity-0 transition-opacity group-hover:opacity-100">
                          <Badge variant="secondary" className="h-6 rounded-lg text-[11px]">
                            Ver
                          </Badge>
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

          {/* RIGHT */}
          <div className="space-y-3 lg:sticky lg:top-4">
            <div className="rounded-2xl border bg-background p-4" data-total-del-detalle>
              <p className="text-xs text-muted-foreground">Total</p>

              <div className="mt-1 flex items-end justify-between gap-3">
                <p className="text-2xl font-bold leading-none tabular-nums">{dinero(detailTotal)}</p>
                <Badge variant="outline" className="h-7 rounded-xl text-[11px]">
                  {detailRow.currencyCode}
                </Badge>
              </div>

              {/* Base, extra y descuento: el total es base + extra − descuento.
                  Una fila por importe y la cifra a la derecha, entera: en tres
                  cajitas de 87 px los importes se recortaban con «…», o sea que
                  el detalle no decía cuánto era cada cosa. */}
              {(detailExtra !== 0 || detailDiscount !== 0) ? (
                <>
                  <Separator className="my-3" />
                  <dl className="space-y-1.5 text-sm" data-desglose-del-detalle>
                    <div className="flex items-baseline justify-between gap-3">
                      <dt className="text-muted-foreground">Base</dt>
                      <dd className="whitespace-nowrap font-medium tabular-nums">{dinero(detailBase)}</dd>
                    </div>
                    <div className="flex items-baseline justify-between gap-3">
                      <dt className="text-muted-foreground">Extra</dt>
                      <dd className="whitespace-nowrap font-medium tabular-nums">+ {dinero(detailExtra)}</dd>
                    </div>
                    <div className="flex items-baseline justify-between gap-3">
                      <dt className="text-muted-foreground">Descuento</dt>
                      <dd className="whitespace-nowrap font-medium tabular-nums">− {dinero(detailDiscount)}</dd>
                    </div>
                  </dl>
                </>
              ) : null}
            </div>

          </div>
        </div>
      </div>
    ) : null}
  </DialogContent>
</Dialog>


        {/* Modal Create/Edit */}
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="flex flex-col overflow-hidden rounded-2xl sm:max-w-[1000px]">
            <DialogHeader className="shrink-0 space-y-1">
              <div className="flex items-center justify-between gap-2">
                <DialogTitle className="text-base">{editing ? 'Editar venta' : 'Nueva venta'}</DialogTitle>
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

              const base = comoImporte(form.amount);
              const extra = comoImporte(form.extra);
              const disc = comoImporte(form.discount);
              const total = base + extra - disc;
              const enSuMoneda = (v: number) => formatoDeDinero(currencies, form.currencyCode, v);

              const contactText =
                form.contactName?.trim() || form.contactJid?.trim()
                  ? `${elNombreDelContacto(form.contactName, form.contactJid)}${form.contactJid?.trim() ? ` · ${elNumeroDelContacto(form.contactJid)}` : ''}`
                  : 'Sin contacto';

              return (
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_360px]">
                  {/* LEFT */}
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <MiniField label="Producto">
                        <Popover open={productOpen} onOpenChange={setProductOpen}>
                          <PopoverTrigger asChild>
                            <Button type="button" variant="outline" role="combobox" className="h-9 w-full justify-between text-sm" disabled={isPending}>
                              <span className="truncate">
                                {form.productId
                                  ? productOptions.find((p) => p.id === form.productId)?.title || form.title || 'Producto'
                                  : 'Selecciona un producto'}
                              </span>
                              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                            </Button>
                          </PopoverTrigger>

                          <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                            <Command>
                              <CommandInput placeholder="Buscar producto..." value={productQuery} onValueChange={setProductQuery} />
                              <CommandEmpty>
                                {productLoading
                                  ? 'Buscando...'
                                  : productQuery.trim()
                                    ? 'Sin resultados.'
                                    : 'Aún no hay productos. Créalos en Productos.'}
                              </CommandEmpty>

                              <CommandGroup>
                                {productOptions.map((p) => (
                                  <CommandItem
                                    key={p.id}
                                    value={p.title}
                                    onSelect={() => {
                                      setForm((prev) => ({
                                        ...prev,
                                        productId: p.id,
                                        title: p.title,
                                        amount: String(p.price ?? 0),
                                      }));
                                      setProductOpen(false);
                                    }}
                                  >
                                    <Check className={cn('mr-2 h-4 w-4', form.productId === p.id ? 'opacity-100' : 'opacity-0')} />
                                    <span className="flex-1 truncate">{p.title}</span>
                                    <span className="ml-2 text-xs text-muted-foreground tabular-nums">{enSuMoneda(comoImporte(p.price))}</span>
                                  </CommandItem>
                                ))}
                              </CommandGroup>
                            </Command>
                          </PopoverContent>
                        </Popover>
                      </MiniField>

                      <MiniField label="Contacto" hint="Opcional, de tus chats">
                        <Popover open={contactOpen} onOpenChange={setContactOpen}>
                          <PopoverTrigger asChild>
                            <Button type="button" variant="outline" role="combobox" className="h-9 w-full justify-between text-sm" disabled={isPending}>
                              <span className="truncate">
                                {form.contactName || form.contactJid
                                  ? `${elNombreDelContacto(form.contactName, form.contactJid)}${form.contactJid ? ` · ${elNumeroDelContacto(form.contactJid)}` : ''}`
                                  : 'Selecciona un contacto'}
                              </span>
                              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                            </Button>
                          </PopoverTrigger>

                          <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                            <Command>
                              <CommandInput placeholder="Buscar por nombre o número..." value={contactQuery} onValueChange={setContactQuery} />
                              <CommandEmpty>{contactLoading ? 'Buscando...' : 'Sin resultados.'}</CommandEmpty>

                              <CommandGroup>
                                <CommandItem
                                  value="__clear__"
                                  onSelect={() => {
                                    setForm((prev) => ({ ...prev, sessionId: null, contactName: '', contactJid: '' }));
                                    setContactOpen(false);
                                  }}
                                >
                                  <span className="text-xs text-muted-foreground">Quitar contacto</span>
                                </CommandItem>

                                {contactOptions.map((s) => (
                                  <CommandItem
                                    key={s.id}
                                    value={`${s.pushName ?? ''} ${s.remoteJid ?? ''}`}
                                    onSelect={() => {
                                      setForm((prev) => ({
                                        ...prev,
                                        sessionId: s.id,
                                        contactName: s.pushName ?? '',
                                        contactJid: s.remoteJid ?? '',
                                      }));
                                      setContactOpen(false);
                                    }}
                                  >
                                    <Check className={cn('mr-2 h-4 w-4', form.sessionId === s.id ? 'opacity-100' : 'opacity-0')} />
                                    <div className="min-w-0 flex-1">
                                      <p className="truncate text-sm">{elNombreDelContacto(s.pushName, s.remoteJid)}</p>
                                      <p className="truncate text-[11px] text-muted-foreground">{elNumeroDelContacto(s.remoteJid)}</p>
                                    </div>
                                  </CommandItem>
                                ))}
                              </CommandGroup>
                            </Command>
                          </PopoverContent>
                        </Popover>
                      </MiniField>

                      <MiniField label="Monto (base)">
                        <Input type="number" inputMode="decimal" value={form.amount} onChange={(e) => setForm((p) => ({ ...p, amount: e.target.value }))} className="h-9 text-sm" placeholder="0.00" />
                      </MiniField>

                      <MiniField label="Extra">
                        <Input type="number" inputMode="decimal" value={form.extra} onChange={(e) => setForm((p) => ({ ...p, extra: e.target.value }))} className="h-9 text-sm" placeholder="0.00" />
                      </MiniField>

                      <MiniField label="Descuento">
                        <Input type="number" inputMode="decimal" value={form.discount} onChange={(e) => setForm((p) => ({ ...p, discount: e.target.value }))} className="h-9 text-sm" placeholder="0.00" />
                      </MiniField>

                      <MiniField label="Cuenta">
                        <Select value={form.accountId} onValueChange={(v) => setForm((p) => ({ ...p, accountId: v }))}>
                          <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Selecciona" /></SelectTrigger>
                          <SelectContent>
                            {accounts.map((a) => (
                              <SelectItem key={a.id} value={a.id} className="text-sm">{a.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </MiniField>

                      <MiniField label="Categoría">
                        <Select value={form.categoryId || '__none__'} onValueChange={(v) => setForm((p) => ({ ...p, categoryId: v === '__none__' ? null : v }))}>
                          <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Opcional" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__" className="text-sm">Sin categoría</SelectItem>
                            {categories.map((c) => (
                              <SelectItem key={c.id} value={c.id} className="text-sm">{c.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </MiniField>

                      <div className="sm:col-span-2">
                        <MiniField label="Descripción" hint="Opcional">
                          <Textarea value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} className="min-h-[76px] h-[76px] resize-y text-sm" placeholder="Notas, referencia, observación..." />
                        </MiniField>
                      </div>
                    </div>

                    <div className="flex justify-between gap-2 pt-1">
                      <Button variant="outline" size="sm" onClick={() => setOpen(false)} disabled={isPending} className="h-9">Cancelar</Button>
                      <Button variant="save" onClick={onSave} size="sm" disabled={isPending || uploading} className="h-9">{editing ? 'Guardar cambios' : 'Guardar venta'}</Button>
                    </div>
                  </div>

                  {/* RIGHT */}
                  <div className="space-y-3 lg:sticky lg:top-4">
                    <div className="rounded-xl border bg-background p-3">
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <CalendarDays className="h-4 w-4 text-muted-foreground" />
                            <p className="text-xs text-muted-foreground">Fecha</p>
                          </div>
                          <Input type="date" value={form.occurredAt} onChange={(e) => setForm((p) => ({ ...p, occurredAt: e.target.value }))} className="h-9 text-sm" />
                        </div>

                        {/* Moneda SOLO lectura */}
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
                      {/* El desglose va en su propia línea, debajo: dentro de la
                          columna del total (que no encoge) se comía el ancho del
                          concepto —«Café O…»— y partía la cuenta en dos líneas. */}
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-[11px] text-muted-foreground">Concepto</p>
                          <p className="truncate text-sm font-medium">{form.title?.trim() ? form.title.trim() : '—'}</p>
                        </div>

                        <div className="shrink-0 text-right">
                          <p className="text-[11px] text-muted-foreground">Total</p>
                          <p className="text-lg font-bold leading-tight tabular-nums">{enSuMoneda(total)}</p>
                        </div>
                      </div>
                      <p className="mt-1 text-[11px] text-muted-foreground tabular-nums" data-desglose-de-la-venta>
                        Base {enSuMoneda(base)} · Extra {enSuMoneda(extra)} · Descuento {enSuMoneda(disc)}
                      </p>

                      <div className="mt-2 flex flex-wrap gap-2">
                        <Badge variant="outline" className="h-6 whitespace-nowrap text-[11px]">{previewAccountName}</Badge>
                        <Badge variant="outline" className="h-6 whitespace-nowrap text-[11px]">{previewCategoryName}</Badge>
                        <Badge variant="outline" className="h-6 whitespace-nowrap text-[11px]">
                          <span className="inline-flex items-center gap-1">
                            <UserRound className="h-3.5 w-3.5" />
                            <span className="truncate max-w-[170px]">{contactText}</span>
                          </span>
                        </Badge>
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

                        <Button type="button" variant="outline" className="h-9 px-3 text-sm" disabled={uploading || isPending} onClick={() => document.getElementById('sale-receipts')?.click()}>
                          <Paperclip className="mr-2 h-4 w-4" />
                          Adjuntar
                        </Button>

                        <input id="sale-receipts" type="file" multiple className="hidden" onChange={(e) => handleFiles(e.target.files)} accept="image/*,application/pdf" />
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
                                <a href={a.url} target="_blank" rel="noreferrer" className="block truncate text-sm font-medium text-primary underline underline-offset-2">
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
                                        const res = await deleteSaleAttachment({ userId, attachmentId: a.id });
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
