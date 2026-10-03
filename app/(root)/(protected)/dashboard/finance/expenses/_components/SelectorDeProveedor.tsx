'use client';

/**
 * El PROVEEDOR de una compra, elegido de la lista de Proveedores de Finanzas.
 *
 * Es el gemelo del «Contacto» del formulario de una venta: un combobox con
 * buscador. Lo que cambia es la lista: una compra se le hace a un proveedor de
 * la cuenta (`FinanceContact` de tipo SUPPLIER), no a un contacto de los chats.
 *
 * Tres cosas que hay que mantener:
 *
 * 1. **Lo que se guarda es el id, nunca el nombre que escribe el navegador.**
 *    El servidor (`createExpense`/`updateExpense`) busca ese id en la lista de
 *    la cuenta y pone él el nombre; un id de otra cuenta se rechaza.
 * 2. **Se puede crear uno nuevo sin salir del formulario**, cuando lo tecleado
 *    no casa con ninguno (`sePuedeCrearElProveedor`). Se crea por la MISMA
 *    acción que la pantalla de Proveedores (`createFinanceContact`), así que
 *    nace con su código P-n y aparece allí.
 * 3. **Va en su propio componente, con su rótulo**: el banco de la guía cuenta
 *    los `MiniField` del formulario de un gasto, y el proveedor no es un campo
 *    de un gasto.
 */

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Check, ChevronsUpDown, Plus, Truck } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { cn } from '@/lib/utils';
import { createFinanceContact } from '@/actions/finance-contacts-actions';
import {
  losProveedoresQueCasan,
  sePuedeCrearElProveedor,
  type ProveedorDeLaLista,
} from '@/lib/compras-de-finanzas';

export type ProveedorElegido = { id: string | null; nombre: string };

export function SelectorDeProveedor({
  userId,
  proveedores,
  valor,
  alCambiar,
  alCrear,
  ocupado = false,
}: {
  userId: string;
  proveedores: readonly ProveedorDeLaLista[];
  valor: ProveedorElegido;
  alCambiar: (p: ProveedorElegido) => void;
  /** Un proveedor recién creado aquí, para sumarlo a la lista del formulario. */
  alCrear: (p: ProveedorDeLaLista) => void;
  ocupado?: boolean;
}) {
  const [abierto, setAbierto] = useState(false);
  const [buscado, setBuscado] = useState('');
  const [creando, setCreando] = useState(false);

  const casan = useMemo(() => losProveedoresQueCasan(buscado, proveedores), [buscado, proveedores]);
  const sePuedeCrear = sePuedeCrearElProveedor(buscado, proveedores);

  const elegido = valor.id ? proveedores.find((p) => p.id === valor.id) : undefined;
  const rotulo = elegido?.name ?? (valor.nombre.trim() || '');

  const elegir = (p: ProveedorDeLaLista) => {
    alCambiar({ id: p.id, nombre: p.name });
    setAbierto(false);
    setBuscado('');
  };

  const crear = async () => {
    const nombre = buscado.trim();
    if (!nombre || creando) return;
    setCreando(true);
    try {
      const res = await createFinanceContact('SUPPLIER', { userId, values: { name: nombre } });
      const creado = res.data as { id?: string; name?: string; code?: string | null; phone?: string | null } | undefined;
      if (!res.success || !creado?.id) {
        toast.error(res.message || 'No se pudo crear el proveedor');
        return;
      }
      const nuevo: ProveedorDeLaLista = {
        id: creado.id,
        name: creado.name ?? nombre,
        code: creado.code ?? null,
        phone: creado.phone ?? null,
      };
      alCrear(nuevo);
      elegir(nuevo);
      toast.success(`Proveedor «${nuevo.name}» creado`);
    } catch (e) {
      // Una acción que revienta no puede dejar el botón en «Creando…».
      console.warn('[finanzas] no se pudo crear el proveedor desde la compra', e);
      toast.error('No se pudo crear el proveedor');
    } finally {
      setCreando(false);
    }
  };

  return (
    <div className="space-y-1" data-campo-proveedor>
      <div className="flex items-center gap-2">
        <label className="text-xs text-muted-foreground">Proveedor</label>
        <p className="text-[11px] text-muted-foreground/80">De tu lista de Proveedores</p>
      </div>

      <Popover
        open={abierto}
        onOpenChange={(v) => {
          setAbierto(v);
          if (!v) setBuscado('');
        }}
      >
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={abierto}
            className="h-9 w-full justify-between text-sm"
            disabled={ocupado}
          >
            <span className={cn('flex min-w-0 items-center gap-2', !rotulo && 'text-muted-foreground')}>
              <Truck className="h-4 w-4 shrink-0 opacity-60" />
              <span className="truncate">{rotulo || 'Selecciona un proveedor'}</span>
            </span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>

        <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
          {/* El filtro es el nuestro (`losProveedoresQueCasan`), no el de cmdk:
              así lo que se ve y la decisión de ofrecer «crear» no discrepan. */}
          <Command shouldFilter={false}>
            <CommandInput placeholder="Buscar por nombre o código..." value={buscado} onValueChange={setBuscado} />
            <CommandList>
              {casan.length === 0 && !sePuedeCrear ? (
                <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                  {proveedores.length === 0
                    ? 'Aún no tienes proveedores. Escribe un nombre para crear el primero.'
                    : 'Sin resultados.'}
                </p>
              ) : null}

              {casan.length > 0 ? (
                <CommandGroup>
                  {casan.map((p) => (
                    <CommandItem key={p.id} value={p.id} onSelect={() => elegir(p)}>
                      <Check className={cn('mr-2 h-4 w-4', valor.id === p.id ? 'opacity-100' : 'opacity-0')} />
                      <span className="flex-1 truncate">{p.name}</span>
                      {p.code ? <span className="ml-2 text-xs text-muted-foreground tabular-nums">{p.code}</span> : null}
                    </CommandItem>
                  ))}
                </CommandGroup>
              ) : null}

              {sePuedeCrear ? (
                <CommandGroup>
                  <CommandItem value="__crear__" onSelect={() => void crear()} disabled={creando} data-crear-proveedor>
                    <Plus className="mr-2 h-4 w-4" />
                    <span className="truncate">
                      {creando ? 'Creando…' : `Crear «${buscado.trim()}» como proveedor`}
                    </span>
                  </CommandItem>
                </CommandGroup>
              ) : null}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
