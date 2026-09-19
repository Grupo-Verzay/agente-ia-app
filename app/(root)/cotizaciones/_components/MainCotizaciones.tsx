'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import { CotizacionList } from './CotizacionList';
import { CotizacionForm } from './CotizacionForm';
import type { listCotizaciones } from '@/actions/cotizaciones-actions';
import type { listProducts } from '@/actions/products-actions';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { BarraDeAcciones, BotonDeCrear } from '@/components/shared/BarraDeAcciones';
import { AccionesMasivas, useSeleccionMultiple } from '@/components/shared/AccionesMasivas';
import { eliminarCotizacionesAction } from '@/actions/borrado-en-bloque-actions';

type Cotizacion = Awaited<ReturnType<typeof listCotizaciones>>[number];
type Product = Awaited<ReturnType<typeof listProducts>>['items'][number];

interface Props {
  userId: string;
  cotizaciones: Cotizacion[];
  products: Product[];
}

export function MainCotizaciones({ userId, cotizaciones, products }: Props) {
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Cotizacion | null>(null);

  function openNew() {
    setEditing(null);
    setShowForm(true);
  }

  function openEdit(c: Cotizacion) {
    setEditing(c);
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditing(null);
  }

  const router = useRouter();
  const seleccion = useSeleccionMultiple(cotizaciones.map((c) => c.id));

  const borrarLasMarcadas = async (ids: string[]) => {
    const resumen = await eliminarCotizacionesAction(ids);
    if (!resumen.success) toast.error(resumen.message);
    return { fallaron: resumen.fallaron };
  };

  return (
    <div className="p-4 space-y-4">
      <BarraDeAcciones
        filtros={<h1 className="shrink-0 text-xl font-semibold">Cotizaciones</h1>}
        crear={<BotonDeCrear onClick={openNew}>Nueva cotización</BotonDeCrear>}
        acciones={
          <AccionesMasivas
            seleccionados={seleccion.seleccionados}
            queSon="cotizaciones"
            onEliminar={borrarLasMarcadas}
            onTerminar={() => { seleccion.limpiar(); router.refresh(); }}
          />
        }
      />

      <CotizacionList
        cotizaciones={cotizaciones}
        onEdit={openEdit}
        seleccionados={seleccion.seleccionados}
        alternarSeleccion={seleccion.alternar}
      />

      {showForm && (
        <CotizacionForm
          userId={userId}
          products={products}
          cotizacion={editing}
          onClose={closeForm}
        />
      )}
    </div>
  );
}
