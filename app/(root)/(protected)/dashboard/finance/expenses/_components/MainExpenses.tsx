'use client';

import { useCallback, useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import { DataTable } from './data-table';
import { buildExpenseColumns } from './columns';

import {
  createExpense,
  updateExpense,
  deleteExpense,
  addExpenseAttachments,
  deleteExpenseAttachment,
} from '@/actions/finance-expenses-actions';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
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
  Plus,
  Pencil,
  Trash2,
} from 'lucide-react';

type Props = {
  userId: string;
  accounts: any[];
  categories: any[];
  currencies: any[];
  expenses: any[];
  primaryCurrencyCode: string; // moneda del user (desde settings)
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
  const date = typeof d === 'string' ? new Date(d) : d;
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

function isSameMonth(date: Date, base: Date) {
  return date.getFullYear() === base.getFullYear() && date.getMonth() === base.getMonth();
}

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

function toAmountNumber(v: any): number {
  if (v === null || v === undefined) return 0;
  const n = Number(String(v));
  return Number.isFinite(n) ? n : 0;
}

function sumByCurrency(list: any[]) {
  return list.reduce<Record<string, number>>((acc, r) => {
    const code = r.currencyCode || '—';
    const total = toAmountNumber(r.amount);
    acc[code] = (acc[code] || 0) + total;
    return acc;
  }, {});
}

function moneyFormat(currencies: any[], code: string, value: number) {
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
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [rows, setRows] = useState<any[]>(expenses ?? []);
  useEffect(() => setRows(expenses ?? []), [expenses]);

  const [detailOpen, setDetailOpen] = useState(false);
  const [detailRow, setDetailRow] = useState<any | null>(null);

  const openDetail = (row: any) => {
    setDetailRow(row);
    setDetailOpen(true);
  };
  const closeDetail = () => {
    setDetailOpen(false);
    setDetailRow(null);
  };

  const [tab, setTab] = useState<'month' | 'total'>('month');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);

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
    occurredAt: toISODate(new Date()),
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
      occurredAt: toISODate(new Date()),
      amount: '',
      currencyCode: defaultCurrency,
      accountId: defaultAccountId,
      categoryId: null,
      title: '',
      description: '',
    });
  };

  const openCreate = () => {
    setEditing(null);
    resetForm();
    setAttachments([]);
    setOpen(true);
  };

  const openEdit = (row: any) => {
    setEditing(row);

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

    setAttachments(
      (row.attachments || []).map((a: any) => ({
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
    } catch (e: any) {
      toast.error(e?.message || 'Error al subir soporte');
    } finally {
      setUploading(false);
    }
  }

  const onSave = () => {
    if (!form.accountId) return toast.error('Selecciona una cuenta');
    if (!form.title?.trim()) return toast.error('Ingresa el concepto');
    if (!form.amount) return toast.error('Ingresa un monto');

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
        };

        const res = editing
          ? await updateExpense(editing.id, userId, payload as any)
          : await createExpense(payload as any);

        if (!res.success) return toast.error(res.message);

        const txId = editing ? editing.id : (res as any).data?.id;

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

        toast.success(editing ? 'Gasto actualizado' : 'Gasto creado');
        setOpen(false);
        setEditing(null);
        setAttachments([]);

        router.refresh();
      })();
    });
  };

  const onDelete = (id: string) => {
    startTransition(() => {
      void (async () => {
        const res = await deleteExpense(id, userId);
        if (!res.success) return toast.error(res.message);

        setRows((prev) => prev.filter((r) => r.id !== id));
        toast.success('Gasto eliminado');
        if (detailRow?.id === id) closeDetail();

        router.refresh();
      })();
    });
  };

  const columns = useMemo(
    () =>
      buildExpenseColumns({
        onEdit: openEdit,
        onDelete,
        busy: isPending,
      }),
    [isPending] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const monthRows = useMemo(() => {
    const now = new Date();
    return rows.filter((r) => isSameMonth(new Date(r.occurredAt), now));
  }, [rows]);

  const totalsMonth = useMemo(() => sumByCurrency(monthRows), [monthRows]);
  const totalsAll = useMemo(() => sumByCurrency(rows), [rows]);

  const orderedEntries = useCallback((totals: Record<string, number>) => {
    const entries = Object.entries(totals);
    if (!entries.length) return [];
    const safe = currencies.find((c) => c.code === primaryCurrencyCode)?.code || defaultCurrency;
    return [
      ...entries.filter(([code]) => code === safe),
      ...entries.filter(([code]) => code !== safe),
    ];
  }, [currencies, primaryCurrencyCode, defaultCurrency]);

  const monthTotalText = useMemo(() => {
    const entries = orderedEntries(totalsMonth);
    if (!entries.length) return '—';
    return entries.map(([code, v]) => moneyFormat(currencies, code, v)).join(' • ');
  }, [totalsMonth, currencies, orderedEntries]);

  const grandTotalText = useMemo(() => {
    const entries = orderedEntries(totalsAll);
    if (!entries.length) return '—';
    return entries.map(([code, v]) => moneyFormat(currencies, code, v)).join(' • ');
  }, [totalsAll, currencies, orderedEntries]);

  const detailAccountName = useMemo(() => {
    if (!detailRow?.accountId) return '';
    return accounts.find((a) => a.id === detailRow.accountId)?.name || '';
  }, [detailRow, accounts]);

  const detailCategoryName = useMemo(() => {
    if (!detailRow?.categoryId) return 'Sin categoría';
    return categories.find((c) => c.id === detailRow.categoryId)?.name || 'Sin categoría';
  }, [detailRow, categories]);

  const detailCurrency = useMemo(() => {
    if (!detailRow?.currencyCode) return null;
    return currencies.find((c) => c.code === detailRow.currencyCode) || null;
  }, [detailRow, currencies]);

  return (
    <TooltipProvider>
      <div className="space-y-3">
        <Card className="border-border">
          <CardHeader className="py-3">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-sm">Gastos</CardTitle>

              {/* mismo estilo de Sales */}
              <Button size="sm" onClick={openCreate} disabled={isPending} className="h-9">
                <Plus className="mr-2 h-4 w-4" />
                Nuevo gasto
              </Button>
            </div>

            {/* resumen como Sales */}
            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div className="flex items-center justify-between rounded-xl border bg-muted/10 px-3 py-2 hover:bg-muted/20">
                <div className="flex items-center gap-2">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg border bg-background">
                    <CalendarDays className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="leading-tight">
                    <p className="text-[11px] text-muted-foreground">Total mes</p>
                    <p className="text-sm font-medium">Resumen</p>
                  </div>
                </div>
                <div className="text-right leading-tight">
                  <p className="text-[11px] text-muted-foreground">Monto</p>
                  <p className="text-sm font-semibold">{monthTotalText}</p>
                </div>
              </div>

              <div className="flex items-center justify-between rounded-xl border bg-muted/10 px-3 py-2 hover:bg-muted/20">
                <div className="flex items-center gap-2">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg border bg-background">
                    <Layers className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="leading-tight">
                    <p className="text-[11px] text-muted-foreground">Total</p>
                    <p className="text-sm font-medium">Acumulado</p>
                  </div>
                </div>
                <div className="text-right leading-tight">
                  <p className="text-[11px] text-muted-foreground">Monto</p>
                  <p className="text-sm font-semibold">{grandTotalText}</p>
                </div>
              </div>
            </div>

            <Tabs value={tab} onValueChange={(v) => setTab(v as any)} className="mt-2">
              <TabsList className="h-9 w-full justify-start gap-6 rounded-none bg-transparent p-0">
                <TabsTrigger
                  value="month"
                  className="rounded-none border-b-2 border-transparent px-0 text-sm data-[state=active]:border-primary data-[state=active]:text-primary"
                >
                  <span className="inline-flex items-center gap-2">
                    <CalendarDays className="h-4 w-4" />
                    Mes
                  </span>
                </TabsTrigger>

                <TabsTrigger
                  value="total"
                  className="rounded-none border-b-2 border-transparent px-0 text-sm data-[state=active]:border-primary data-[state=active]:text-primary"
                >
                  <span className="inline-flex items-center gap-2">
                    <Layers className="h-4 w-4" />
                    Total
                  </span>
                </TabsTrigger>
              </TabsList>

              <TabsContent value="month" className="mt-2">
                <DataTable
                  columns={columns as any}
                  data={monthRows}
                  searchKey="name"
                  searchPlaceholder="Buscar..."
                  onRowClick={openDetail}
                />
              </TabsContent>

              <TabsContent value="total" className="mt-2">
                <DataTable
                  columns={columns as any}
                  data={rows}
                  searchKey="name"
                  searchPlaceholder="Buscar..."
                  onRowClick={openDetail}
                />
              </TabsContent>
            </Tabs>
          </CardHeader>

          <CardContent className="pt-0" />
        </Card>

        {/* Modal Detalle (más parecido a Sales: botones icon) */}
        <Dialog open={detailOpen} onOpenChange={(v) => (v ? setDetailOpen(true) : closeDetail())}>
          <DialogContent className="sm:max-w-[820px] rounded-2xl">
            <DialogHeader className="space-y-1">
              <div className="flex items-center justify-between gap-2">
                <DialogTitle className="text-base">Detalle de gasto</DialogTitle>
                <div className="flex items-center gap-2">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        size="icon"
                        variant="outline"
                        className="h-9 w-9"
                        onClick={() => {
                          if (!detailRow) return;
                          closeDetail();
                          openEdit(detailRow);
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Editar</TooltipContent>
                  </Tooltip>

                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        size="icon"
                        variant="destructive"
                        className="h-9 w-9"
                        onClick={() => {
                          if (!detailRow) return;
                          onDelete(detailRow.id);
                        }}
                        disabled={isPending}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Eliminar</TooltipContent>
                  </Tooltip>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">Visualiza el resumen y soportes.</p>
            </DialogHeader>

            {detailRow ? (
              <div className="space-y-4">
                <div className="rounded-xl border bg-muted/10 p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="truncate text-base font-semibold">{detailRow.title || 'Sin concepto'}</p>

                      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <Badge variant="secondary" className="h-6 text-[11px]">
                          {toISODate(detailRow.occurredAt)}
                        </Badge>
                        <Badge variant="outline" className="h-6 text-[11px]">
                          {detailAccountName || '—'}
                        </Badge>
                        <Badge variant="outline" className="h-6 text-[11px]">
                          {detailCategoryName}
                        </Badge>
                      </div>
                    </div>

                    <div className="shrink-0 text-right">
                      <p className="text-[11px] text-muted-foreground">Monto</p>
                      <p className="text-lg font-bold leading-tight">
                        {moneyFormat(currencies, detailRow.currencyCode || defaultCurrency, toAmountNumber(detailRow.amount))}
                      </p>
                      <p className="text-xs text-muted-foreground">{detailRow.currencyCode}</p>
                    </div>
                  </div>

                  <Separator className="my-3" />

                  {detailRow.description ? (
                    <div className="rounded-lg border bg-background p-3">
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
                      {detailRow.attachments?.length ? `${detailRow.attachments.length} archivo(s)` : '0 archivos'}
                    </p>
                  </div>

                  {detailRow.attachments?.length ? (
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {detailRow.attachments.map((a: any) => {
                        const isImg = guessIsImage(a.mimeType, a.url);
                        const isPdf = guessIsPdf(a.mimeType, a.url);

                        return (
                          <a
                            key={a.id ?? a.url}
                            href={a.url}
                            target="_blank"
                            rel="noreferrer"
                            className="group flex items-center gap-3 rounded-xl border bg-background p-3 hover:bg-muted/30"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-lg border bg-muted/10">
                              {isImg ? (
                                <SafeImage
                                  src={a.url}
                                  alt={a.fileName || 'soporte'}
                                  width={40}
                                  height={40}
                                  className="h-10 w-10 object-cover"
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
            ) : null}
          </DialogContent>
        </Dialog>

        {/* Modal Create/Edit (MISMO DISEÑO QUE SALES: left form + right resumen sticky) */}
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="sm:max-w-[1000px] rounded-2xl">
            <DialogHeader className="space-y-1">
              <div className="flex items-center justify-between gap-2">
                <DialogTitle className="text-base">{editing ? 'Editar gasto' : 'Nuevo gasto'}</DialogTitle>
                <Badge variant="secondary" className="h-6 text-[11px]">
                  {editing ? 'Edición' : 'Registro'}
                </Badge>
              </div>
            </DialogHeader>

            {(() => {
              const previewAccountName = accounts.find((a) => a.id === form.accountId)?.name || '—';
              const previewCategoryName = form.categoryId
                ? categories.find((c) => c.id === form.categoryId)?.name || 'Sin categoría'
                : 'Sin categoría';

              const amountN = toAmountNumber(form.amount);
              const totalText = moneyFormat(currencies, form.currencyCode, amountN);

              return (
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_360px]">
                  {/* LEFT */}
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <MiniField label="Concepto">
                        <Input
                          value={form.title}
                          onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
                          className="h-9 text-sm"
                          placeholder="Ej: Nómina / Publicidad / Servidor"
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

                    <div className="flex justify-end gap-2 pt-1">
                      <Button variant="outline" size="sm" onClick={() => setOpen(false)} disabled={isPending} className="h-9">
                        Cancelar
                      </Button>
                      <Button onClick={onSave} size="sm" disabled={isPending || uploading} className="h-9">
                        {editing ? 'Guardar cambios' : 'Guardar gasto'}
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
                            <Badge variant="outline" className="h-6 text-[11px]">
                              {previewAccountName}
                            </Badge>
                            <Badge variant="outline" className="h-6 text-[11px]">
                              {previewCategoryName}
                            </Badge>
                          </div>
                        </div>

                        <div className="shrink-0 text-right">
                          <p className="text-[11px] text-muted-foreground">Total</p>
                          <p className="text-lg font-bold leading-tight">{totalText}</p>
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
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  );
}
