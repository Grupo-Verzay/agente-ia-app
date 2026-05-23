'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import { CotizacionList } from './CotizacionList';
import { CotizacionForm } from './CotizacionForm';
import type { listCotizaciones } from '@/actions/cotizaciones-actions';
import type { listProducts } from '@/actions/products-actions';

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

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Cotizaciones</h1>
        <Button size="sm" onClick={openNew}>
          <Plus className="h-4 w-4 mr-1" />
          Nueva cotización
        </Button>
      </div>

      <CotizacionList
        cotizaciones={cotizaciones}
        onEdit={openEdit}
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
