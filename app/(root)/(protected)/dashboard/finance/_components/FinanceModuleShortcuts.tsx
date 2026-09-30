'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { arrayMove, rectSortingStrategy, SortableContext, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  DollarSign,
  FileText,
  GripVertical,
  LayoutDashboard,
  Package,
  Receipt,
  ReceiptText,
  Settings,
  ShoppingCart,
  StickyNote,
  Truck,
  Users,
  Wallet,
} from 'lucide-react';

import { cn } from '@/lib/utils';
import { elOrdenDeLosAccesos } from '@/lib/tabla-de-finanzas';
import {
  ACCESOS_DE_FINANZAS,
  ORDEN_DE_LOS_ACCESOS,
  elAccesoActivo,
  elEnlaceDelAcceso,
  type IdDeAcceso,
} from '@/lib/accesos-de-finanzas';
import { BarraDeslizable } from '@/components/shared/BarraDeslizable';

type Shortcut = {
  id: IdDeAcceso;
  label: string;
  href: string;
  icon: ReactNode;
};

const STORAGE_KEY = 'finance-module-shortcuts-order:v1';

/** El icono de cada acceso. Qué hay y adónde lleva vive en `lib/accesos-de-finanzas.ts`. */
const ICONOS: Record<IdDeAcceso, ReactNode> = {
  summary: <LayoutDashboard className="h-4 w-4" />,
  clients: <Users className="h-4 w-4" />,
  products: <Package className="h-4 w-4" />,
  providers: <Truck className="h-4 w-4" />,
  proposals: <FileText className="h-4 w-4" />,
  sales: <DollarSign className="h-4 w-4" />,
  expenses: <Receipt className="h-4 w-4" />,
  purchases: <ShoppingCart className="h-4 w-4" />,
  'cash-receipts': <ReceiptText className="h-4 w-4" />,
  notes: <StickyNote className="h-4 w-4" />,
  accounts: <Wallet className="h-4 w-4" />,
  settings: <Settings className="h-4 w-4" />,
};

function SortableShortcut({
  item,
  activo,
  alMarcar,
}: {
  item: Shortcut;
  activo: boolean;
  alMarcar?: (el: HTMLElement | null) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });
  // Estable: con una función nueva en cada pintado, React la llamaría con
  // `null` y otra vez con el nodo en cada vuelta, y el estado de arriba
  // cambiaría dos veces por pintado.
  const ref = useCallback(
    (el: HTMLDivElement | null) => {
      setNodeRef(el);
      if (activo) alMarcar?.(el);
    },
    [setNodeRef, activo, alMarcar],
  );

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={ref}
      style={style}
      className={cn('shrink-0 touch-none', isDragging && 'z-10 opacity-70')}
    >
      <div
        data-acceso-de-finanzas={item.id}
        data-activo={activo ? '' : undefined}
        className={cn(
          'inline-flex h-9 select-none items-center overflow-hidden whitespace-nowrap rounded-md border text-sm font-medium shadow-sm transition hover:opacity-90',
          activo
            ? 'border-primary bg-primary/10 text-primary'
            : 'border-input bg-background text-foreground hover:bg-muted/40',
        )}
      >
        <button
          type="button"
          aria-label={`Mover ${item.label}`}
          title="Arrastra para ordenar"
          className="flex h-full cursor-grab items-center px-1.5 text-muted-foreground active:cursor-grabbing"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-3.5 w-3.5" />
        </button>
        <Link
          href={item.href}
          aria-current={activo ? 'page' : undefined}
          className="inline-flex h-full items-center gap-2 px-2.5 pl-1"
        >
          {item.icon}
          {item.label}
        </Link>
      </div>
    </div>
  );
}

function currentMonthValue() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export function FinanceModuleShortcuts({
  selectedMonthValue,
  hideOnFinanceRoot = false,
}: {
  selectedMonthValue?: string;
  hideOnFinanceRoot?: boolean;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const monthValue = selectedMonthValue || searchParams.get('month') || currentMonthValue();

  const shortcuts = useMemo(
    () =>
      Object.fromEntries(
        ACCESOS_DE_FINANZAS.map((a) => [
          a.id,
          { id: a.id, label: a.etiqueta, href: elEnlaceDelAcceso(a, monthValue), icon: ICONOS[a.id] },
        ]),
      ) as Record<IdDeAcceso, Shortcut>,
    [monthValue],
  );
  const activo = elAccesoActivo(pathname);
  const [elActivo, setElActivo] = useState<HTMLElement | null>(null);

  const [order, setOrder] = useState<IdDeAcceso[]>([...ORDEN_DE_LOS_ACCESOS]);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      const saved = raw ? (JSON.parse(raw) as unknown[]) : null;
      if (!Array.isArray(saved)) return;

      const next = elOrdenDeLosAccesos(saved, ORDEN_DE_LOS_ACCESOS);
      setOrder(next);
    } catch {
      setOrder([...ORDEN_DE_LOS_ACCESOS]);
    }
  }, []);

  const items = order.map((id) => shortcuts[id]).filter(Boolean);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    setOrder((current) => {
      const oldIndex = current.indexOf(active.id as IdDeAcceso);
      const newIndex = current.indexOf(over.id as IdDeAcceso);
      if (oldIndex < 0 || newIndex < 0) return current;

      const next = arrayMove(current, oldIndex, newIndex);
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  };

  if (hideOnFinanceRoot && pathname === '/dashboard/finance') return null;

  // Arriba van SOLO las pestañas. El botón azul de crear —que estaba aquí, en
  // la esquina de esta misma fila— se fue a la barra de acciones de la pantalla,
  // que es donde vive en las otras treinta y cuatro. Metido entre las pestañas
  // quedaba lejos del contenido sobre el que actúa y encima le robaba a la fila
  // los 36 px que necesita para no cortarse.
  return (
    <div className="bg-background">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={order} strategy={rectSortingStrategy}>
          {/* Con flechas, como las pestañas del Panel. Con `overflow-x-auto` a
              secas —como estaba— los últimos accesos (Cuentas, Configuración)
              quedaban fuera de la pantalla sin ninguna señal de que existieran:
              a 1440 con el menú recogido se veía media fila de asa y nada más. */}
          <BarraDeslizable activo={elActivo} queHay="accesos">
            <div className="flex w-max min-w-full flex-nowrap items-center gap-1.5 pb-1" data-accesos-de-finanzas>
              {items.map((item) => (
                <SortableShortcut
                  key={item.id}
                  item={item}
                  activo={item.id === activo}
                  alMarcar={setElActivo}
                />
              ))}
            </div>
          </BarraDeslizable>
        </SortableContext>
      </DndContext>
    </div>
  );
}
