'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Pencil, Trash2, CheckCircle, Printer } from 'lucide-react';
import { deleteCotizacion, confirmarVenta } from '@/actions/cotizaciones-actions';
import { toast } from 'sonner';
import type { listCotizaciones } from '@/actions/cotizaciones-actions';

type Cotizacion = Awaited<ReturnType<typeof listCotizaciones>>[number];

const STATUS_LABEL: Record<string, string> = {
  borrador: 'Borrador',
  enviada: 'Enviada',
  confirmada: 'Confirmada',
  cancelada: 'Cancelada',
};

const STATUS_VARIANT: Record<string, 'secondary' | 'default' | 'outline' | 'destructive'> = {
  borrador: 'secondary',
  enviada: 'outline',
  confirmada: 'default',
  cancelada: 'destructive',
};

interface Props {
  cotizaciones: Cotizacion[];
  onEdit: (c: Cotizacion) => void;
}

export function CotizacionList({ cotizaciones, onEdit }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleDelete(id: string, userId: string) {
    if (!confirm('¿Eliminar esta cotización?')) return;
    startTransition(async () => {
      await deleteCotizacion(id, userId);
      toast.success('Cotización eliminada.');
      router.refresh();
    });
  }

  function handleConfirmar(id: string, userId: string) {
    if (!confirm('¿Confirmar venta? Se descontará el stock de los productos.')) return;
    startTransition(async () => {
      try {
        await confirmarVenta(id, userId);
        toast.success('Venta confirmada. Stock actualizado.');
        router.refresh();
      } catch (e: any) {
        toast.error(e.message ?? 'Error al confirmar.');
      }
    });
  }

  function handlePrint(c: Cotizacion) {
    const w = window.open('', '_blank');
    if (!w) return;
    const date = new Date(c.createdAt).toLocaleDateString('es-CO');
    const rows = c.items.map((i) =>
      `<tr>
        <td style="padding:6px 8px;border-bottom:1px solid #eee">${i.title}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:center">${i.quantity}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right">$${i.unitPrice.toLocaleString('es-CO')}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right">$${i.subtotal.toLocaleString('es-CO')}</td>
      </tr>`
    ).join('');
    w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8">
      <title>Cotización</title>
      <style>body{font-family:sans-serif;padding:32px;color:#111}table{width:100%;border-collapse:collapse}th{background:#f3f4f6;padding:8px;text-align:left}</style>
    </head><body>
      <h2 style="margin-bottom:4px">Cotización</h2>
      <p style="color:#555;margin:0">Fecha: ${date}</p>
      <p style="margin-top:12px"><strong>Cliente:</strong> ${c.clientName}${c.clientPhone ? ` &nbsp;|&nbsp; Tel: ${c.clientPhone}` : ''}</p>
      ${c.notes ? `<p><strong>Notas:</strong> ${c.notes}</p>` : ''}
      <table style="margin-top:16px">
        <thead><tr><th>Producto</th><th style="text-align:center">Cant.</th><th style="text-align:right">P. Unit.</th><th style="text-align:right">Subtotal</th></tr></thead>
        <tbody>${rows}</tbody>
        <tfoot><tr><td colspan="3" style="padding:8px;text-align:right;font-weight:bold">TOTAL</td>
          <td style="padding:8px;text-align:right;font-weight:bold">$${c.total.toLocaleString('es-CO')}</td></tr></tfoot>
      </table>
    </body></html>`);
    w.document.close();
    w.print();
  }

  if (cotizaciones.length === 0) {
    return (
      <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">
        No hay cotizaciones aún.
      </CardContent></Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-2">
        <div className="w-full overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left py-3 px-3 font-semibold">Cliente</th>
                <th className="text-left py-3 px-3 font-semibold">Estado</th>
                <th className="text-left py-3 px-3 font-semibold">Fecha</th>
                <th className="text-right py-3 px-3 font-semibold">Total</th>
                <th className="text-right py-3 px-3 font-semibold">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {cotizaciones.map((c) => (
                <tr key={c.id} className="border-t hover:bg-muted/40 transition-colors">
                  <td className="py-3 px-3">
                    <div className="font-medium">{c.clientName}</div>
                    {c.clientPhone && <div className="text-xs text-muted-foreground">{c.clientPhone}</div>}
                  </td>
                  <td className="py-3 px-3">
                    <Badge variant={STATUS_VARIANT[c.status] ?? 'secondary'}>
                      {STATUS_LABEL[c.status] ?? c.status}
                    </Badge>
                  </td>
                  <td className="py-3 px-3 text-muted-foreground">
                    {new Date(c.createdAt).toLocaleDateString('es-CO')}
                  </td>
                  <td className="py-3 px-3 text-right font-medium">
                    ${c.total.toLocaleString('es-CO')}
                  </td>
                  <td className="py-3 px-3">
                    <div className="flex gap-1 justify-end">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handlePrint(c)} title="Imprimir">
                        <Printer className="h-4 w-4" />
                      </Button>
                      {c.status !== 'confirmada' && c.status !== 'cancelada' && (
                        <>
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onEdit(c)} title="Editar">
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-green-600 hover:text-green-700" onClick={() => handleConfirmar(c.id, c.userId)} title="Confirmar venta" disabled={isPending}>
                            <CheckCircle className="h-4 w-4" />
                          </Button>
                        </>
                      )}
                      {c.status !== 'confirmada' && (
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => handleDelete(c.id, c.userId)} disabled={isPending} title="Eliminar">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
