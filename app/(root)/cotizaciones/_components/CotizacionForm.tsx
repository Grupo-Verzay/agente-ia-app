'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Trash2, Plus } from 'lucide-react';
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
          <DialogTitle>{cotizacion ? 'Editar cotización' : 'Nueva cotización'}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Cliente *</Label>
              <Input value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder="Nombre del cliente" />
            </div>
            <div className="space-y-1">
              <Label>Teléfono</Label>
              <Input value={clientPhone} onChange={(e) => setClientPhone(e.target.value)} placeholder="Opcional" />
            </div>
          </div>

          <div className="space-y-1">
            <Label>Estado</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="borrador">Borrador</SelectItem>
                <SelectItem value="enviada">Enviada</SelectItem>
                <SelectItem value="cancelada">Cancelada</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Items */}
          <div className="space-y-2">
            <Label>Productos / Servicios</Label>
            {items.map((item, idx) => (
              <div key={idx} className="grid grid-cols-12 gap-2 items-end">
                <div className="col-span-5 space-y-1">
                  <Select
                    value={item.productId ?? '__manual__'}
                    onValueChange={(v) => v === '__manual__' ? updateItem(idx, { productId: null }) : selectProduct(idx, v)}
                  >
                    <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Producto (opcional)" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__manual__">— Manual —</SelectItem>
                      {products.map((p) => (
                        <SelectItem key={p.id} value={p.id}>{p.title} (stock: {p.stock})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    className="h-8 text-xs"
                    placeholder="Descripción *"
                    value={item.title}
                    onChange={(e) => updateItem(idx, { title: e.target.value })}
                  />
                </div>
                <div className="col-span-3 space-y-1">
                  <span className="text-xs text-muted-foreground">Precio unit.</span>
                  <Input
                    type="number" min={0} step="0.01" className="h-8 text-xs"
                    value={item.unitPrice}
                    onChange={(e) => updateItem(idx, { unitPrice: Number(e.target.value) })}
                  />
                </div>
                <div className="col-span-2 space-y-1">
                  <span className="text-xs text-muted-foreground">Cant.</span>
                  <Input
                    type="number" min={1} className="h-8 text-xs"
                    value={item.quantity}
                    onChange={(e) => updateItem(idx, { quantity: Math.max(1, Number(e.target.value)) })}
                  />
                </div>
                <div className="col-span-1 flex items-end pb-0.5">
                  <span className="text-xs font-medium whitespace-nowrap">
                    ${(item.unitPrice * item.quantity).toLocaleString('es-CO')}
                  </span>
                </div>
                <div className="col-span-1 flex items-end pb-0.5">
                  <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => removeItem(idx)}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" onClick={addItem} className="mt-1">
              <Plus className="h-3 w-3 mr-1" /> Agregar ítem
            </Button>
          </div>

          <div className="text-right text-sm font-semibold">
            Total: ${total.toLocaleString('es-CO')}
          </div>

          <div className="space-y-1">
            <Label>Notas</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Observaciones opcionales" rows={2} />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? 'Guardando...' : cotizacion ? 'Actualizar' : 'Crear cotización'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
