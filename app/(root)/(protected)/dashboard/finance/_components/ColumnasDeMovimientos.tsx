'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { ArrowUpDown, FileText, Paperclip } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { SafeImage } from '@/components/custom/SafeImage';
import { elDiaDe } from '@/lib/periodo-de-finanzas';
import { formatoDeDinero, type MonedaDeFinanzas } from '@/lib/tabla-de-finanzas';

/**
 * Las columnas que comparten Ventas y Gastos, en el MISMO orden:
 *
 *     Concepto · Categoría · [Tipo] · Total · Fecha · Cuenta · Soportes · acciones
 *
 * Ventas enseñaba Concepto, Moneda y Fecha —ni cuánto, ni de qué cuenta, ni sus
 * soportes—; Gastos, siete columnas con otros nombres para lo mismo: «Nombre»
 * para el concepto, «Conceptos» para la categoría, «Total gasto», «Fecha de
 * gasto» y «Archivos». Desde fuera se leían como dos módulos. La única columna
 * propia es «Tipo» (Fijo/Variable), que solo tiene sentido en un gasto.
 */
type Movimiento = {
  occurredAt: string | Date | null;
  currencyCode?: string | null;
  account?: { name?: string | null } | null;
  category?: { name?: string | null } | null;
  attachments?: { url: string; fileName?: string | null; mimeType?: string | null }[] | unknown;
};

function esImagen(mime?: string | null, url?: string) {
  if (mime) return mime.startsWith('image/');
  return /\.(png|jpe?g|webp|gif|avif)$/i.test(url ?? '');
}

export function columnaDeConcepto<T extends Movimiento>(concepto: (f: T) => string | null | undefined): ColumnDef<T> {
  return {
    id: 'concepto',
    accessorFn: (f) => concepto(f) ?? '',
    header: 'Concepto',
    cell: ({ row }) => (
      <span className="block max-w-[260px] truncate font-medium" title={concepto(row.original) ?? ''}>
        {concepto(row.original) || 'Sin concepto'}
      </span>
    ),
  };
}

export function columnaDeCategoria<T extends Movimiento>(): ColumnDef<T> {
  return {
    id: 'categoria',
    accessorFn: (f) => f.category?.name ?? '',
    header: 'Categoría',
    cell: ({ row }) => <span className="truncate text-muted-foreground">{row.original.category?.name || 'Sin categoría'}</span>,
  };
}

export function columnaDeTotal<T extends Movimiento>(
  monedas: readonly MonedaDeFinanzas[],
  total: (f: T) => number,
): ColumnDef<T> {
  return {
    id: 'total',
    accessorFn: (f) => total(f),
    meta: { etiqueta: 'Total' },
    header: ({ column }) => (
      <Button
        variant="ghost"
        className="h-8 px-2 text-sm"
        onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
      >
        Total
        <ArrowUpDown className="ml-1 h-3.5 w-3.5" />
      </Button>
    ),
    cell: ({ row }) => (
      <div className="whitespace-nowrap text-right font-medium tabular-nums">
        {formatoDeDinero(monedas, row.original.currencyCode || 'COP', total(row.original))}
      </div>
    ),
  };
}

export function columnaDeFecha<T extends Movimiento>(): ColumnDef<T> {
  return {
    id: 'fecha',
    accessorFn: (f) => elDiaDe(f.occurredAt) ?? '',
    header: 'Fecha',
    cell: ({ row }) => <span className="whitespace-nowrap text-muted-foreground">{elDiaDe(row.original.occurredAt) ?? '—'}</span>,
  };
}

export function columnaDeCuentaDeFinanzas<T extends Movimiento>(): ColumnDef<T> {
  return {
    id: 'cuenta',
    accessorFn: (f) => f.account?.name ?? '',
    header: 'Cuenta',
    cell: ({ row }) => <span className="truncate">{row.original.account?.name || '—'}</span>,
  };
}

export function columnaDeSoportes<T extends Movimiento>(): ColumnDef<T> {
  return {
    id: 'soportes',
    header: 'Soportes',
    enableSorting: false,
    cell: ({ row }) => {
      const atts = Array.isArray(row.original.attachments)
        ? (row.original.attachments as { url: string; fileName?: string | null; mimeType?: string | null }[])
        : [];
      if (!atts.length) return <span className="text-muted-foreground">—</span>;
      return (
        <div className="flex items-center gap-1" title={`${atts.length} soporte(s)`}>
          {atts.slice(0, 2).map((a, i) =>
            esImagen(a.mimeType, a.url) ? (
              <SafeImage key={i} src={a.url} alt={a.fileName || 'soporte'} width={24} height={24} className="h-6 w-6 rounded-md border object-cover" />
            ) : (
              <span key={i} className="flex h-6 w-6 items-center justify-center rounded-md border bg-muted/30">
                {/pdf/i.test(a.mimeType ?? a.url) ? <FileText className="h-3.5 w-3.5 text-muted-foreground" /> : <Paperclip className="h-3.5 w-3.5 text-muted-foreground" />}
              </span>
            ),
          )}
          {atts.length > 2 ? <span className="ml-1 text-[11px] text-muted-foreground">+{atts.length - 2}</span> : null}
        </div>
      );
    },
  };
}
