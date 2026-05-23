'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Trash2, Plus, PackageSearch } from 'lucide-react';
import { createCotizacion, updateCotizacion } from '@/actions/cotizaciones-actions';
import { toast } from 'sonner';
import type { listCotizaciones, CotizacionItemInput } from '@/actions/cotizaciones-actions';
import type { listProducts } from '@/actions/products-actions';

type Cotizacion = Awaited<ReturnType<typeof listCotizaciones>>[number];
type Product = Awaited<ReturnType<typeof listProducts>>['items'][number];

interface Props {
  userId: string;
  products: Product[];
  cotizacion?: Cotizacion | null;
  onClose: () => void;
}

const EMPTY_ITEM: CotizacionItemInput = { productId: null, title: '', unitPrice: 0, quantity: 1 };

export function CotizacionForm({ userId, products, cotizacion, onClose }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [clientName, setClientName] = useState(cotizacion?.clientName ?? '');
  const [clientPhone, setClientPhone] = useState(cotizacion?.clientPhone ?? '');
  const [status, setStatus] = useState<string>(cotizacion?.status ?? 'borrador');
  const [notes, setNotes] = useState(cotizacion?.notes ?? '');
  const [items, setItems] = useState<CotizacionItemInput[]>(
    cotizacion?.items.length
      ? cotizacion.items.map((i) => ({ productId: i.productId ?? null, title: i.title, unitPrice: i.unitPrice, quantity: i.quantity }))
      : [{ ...EMPTY_ITEM }]
  );

  const total = items.reduce((s, i) => s + i.unitPrice * i.quantity, 0);

  function addItem() {
    setItems((prev) => [...prev, { ...EMPTY_ITEM }]);
  }

  function removeItem(idx: number) {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  }

  function updateItem(idx: number, patch: Partial<CotizacionItemInput>) {
    setItems((prev) => prev.map((item, i) => i === idx ? { ...item, ...patch } : item));
  }

  function selectProduct(idx: number, productId: string) {
    if (productId === '__manual__') {
      updateItem(idx, { productId: null });
      return;
    }
    const p = products.find((p) => p.id === productId);
    if (!p) return;
    updateItem(idx, { productId: p.id, title: p.title, unitPrice: Number(p.price) });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!clientName.trim()) return toast.error('El nombre del cliente es obligatorio.');
    if (items.length === 0) return toast.error('Agrega al menos un ítem.');
    if (items.some((i) => !i.title.trim())) return toast.error('Todos los ítems deben tener descripción.');

    startTransition(async () => {
      try {
        if (cotizacion) {
          await updateCotizacion(cotizacion.id, userId, { clientName, clientPhone, status: status as any, notes, items });
          toast.success('Cotización actualizada.');
        } else {
          await createCotizacion({ userId, clientName, clientPhone, status: status as any, notes, items });
          toast.success('Cotización creada.');
        }
        router.refresh();
        onClose();
      } catch (e: any) {
        toast.error(e.message ?? 'Error al guardar.');
      }
    });
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-lg">
            {cotizacion ? 'Editar cotización' : 'Nueva cotización'}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5">

          {/* Cliente */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Cliente <span className="text-destructive">*</span></Label>
              <Input
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                placeholder="Nombre del cliente"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Teléfono <span className="text-muted-foreground font-normal text-xs">(opcional)</span></Label>
              <Input
                value={clientPhone}
                onChange={(e) => setClientPhone(e.target.value)}
                placeholder="+57 300 000 0000"
              />
            </div>
          </div>

          {/* Estado */}
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Estado</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="borrador">Borrador</SelectItem>
                <SelectItem value="enviada">Enviada</SelectItem>
                <SelectItem value="cancelada">Cancelada</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Items */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Productos / Servicios</Label>

            <div className="rounded-lg border overflow-hidden">
              {/* Cabecera de tabla */}
              <div className="grid grid-cols-12 gap-0 bg-muted/60 px-3 py-2 text-xs font-medium text-muted-foreground border-b">
                <div className="col-span-5">Descripción</div>
                <div className="col-span-3 text-right pr-2">Precio unit.</div>
                <div className="col-span-2 text-right pr-2">Cant.</div>
                <div className="col-span-2 text-right">Subtotal</div>
              </div>

              {/* Filas de ítems */}
              <div className="divide-y">
                {items.map((item, idx) => (
                  <div key={idx} className="px-3 py-2.5 space-y-2">
                    {/* Selector de producto del catálogo */}
                    {products.length > 0 && (
                      <div className="flex items-center gap-2">
                        <PackageSearch className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <Select
                          value={item.productId ?? '__manual__'}
                          onValueChange={(v) => selectProduct(idx, v)}
                        >
                          <SelectTrigger className="h-7 text-xs border-dashed flex-1">
                            <SelectValue placeholder="Seleccionar del catálogo..." />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__manual__">
                              <span className="text-muted-foreground">— Entrada manual —</span>
                            </SelectItem>
                            {products.map((p) => (
                              <SelectItem key={p.id} value={p.id}>
                                <span>{p.title}</span>
                                <span className="ml-2 text-muted-foreground text-xs">
                                  ${Number(p.price).toLocaleString('es-CO')} · stock: {p.stock}
                                </span>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}

                    {/* Fila de datos */}
                    <div className="grid grid-cols-12 gap-2 items-center">
                      <div className="col-span-5">
                        <Input
                          className="h-8 text-sm"
                          placeholder="Descripción del ítem *"
                          value={item.title}
                          onChange={(e) => updateItem(idx, { title: e.target.value })}
                        />
                      </div>
                      <div className="col-span-3">
                        <Input
                          type="number" min={0} step="0.01"
                          className="h-8 text-sm text-right"
                          value={item.unitPrice}
                          onChange={(e) => updateItem(idx, { unitPrice: Number(e.target.value) })}
                        />
                      </div>
                      <div className="col-span-2">
                        <Input
                          type="number" min={1}
                          className="h-8 text-sm text-right"
                          value={item.quantity}
                          onChange={(e) => updateItem(idx, { quantity: Math.max(1, Number(e.target.value)) })}
                        />
                      </div>
                      <div className="col-span-1 text-right text-sm font-medium tabular-nums">
                        ${(item.unitPrice * item.quantity).toLocaleString('es-CO')}
                      </div>
                      <div className="col-span-1 flex justify-end">
                        <Button
                          type="button" variant="ghost" size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          onClick={() => removeItem(idx)}
                          disabled={items.length === 1}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Footer: agregar ítem + total */}
              <div className="border-t bg-muted/30 px-3 py-2.5 flex items-center justify-between">
                <Button type="button" variant="ghost" size="sm" onClick={addItem} className="h-7 text-xs gap-1 text-muted-foreground hover:text-foreground">
                  <Plus className="h-3.5 w-3.5" />
                  Agregar ítem
                </Button>
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <span className="text-muted-foreground font-normal">Total:</span>
                  <span className="text-base">${total.toLocaleString('es-CO')}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Notas */}
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">
              Notas <span className="text-muted-foreground font-normal text-xs">(opcional)</span>
            </Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Condiciones, observaciones, forma de pago..."
              rows={2}
              className="resize-none"
            />
          </div>

          {/* Acciones */}
          <div className="flex justify-between gap-2 pt-1 border-t">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? 'Guardando...' : cotizacion ? 'Guardar cambios' : 'Crear cotización'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
