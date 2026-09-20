'use client';

import { useEffect, useMemo, useState } from 'react';
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
  Package,
  ReceiptText,
  Settings,
  ShoppingCart,
  StickyNote,
  Truck,
  Users,
  Wallet,
} from 'lucide-react';

import { cn } from '@/lib/utils';

type ShortcutId =
  | 'clients'
  | 'products'
  | 'providers'
  | 'proposals'
  | 'sales'
  | 'purchases'
  | 'cash-receipts'
  | 'notes'
  | 'accounts'
  | 'settings';

type Shortcut = {
  id: ShortcutId;
  label: string;
  href: string;
  icon: ReactNode;
};

const STORAGE_KEY = 'finance-module-shortcuts-order:v1';

const DEFAULT_ORDER: ShortcutId[] = [
  'clients',
  'products',
  'providers',
  'proposals',
  'sales',
  'purchases',
  'cash-receipts',
  'notes',
  'accounts',
  'settings',
];

function SortableShortcut({ item }: { item: Shortcut }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div ref={setNodeRef} style={style} className={cn('shrink-0 touch-none', isDragging && 'z-10 opacity-70')}>
      <div
        className={cn(
          'inline-flex h-9 select-none items-center overflow-hidden whitespace-nowrap rounded-md border text-sm font-medium shadow-sm transition hover:opacity-90',
          'border-input bg-background text-foreground hover:bg-muted/40',
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
        <Link href={item.href} className="inline-flex h-full items-center gap-2 px-2.5 pl-1">
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

  const shortcuts = useMemo<Record<ShortcutId, Shortcut>>(
    () => ({
      clients: {
        id: 'clients',
        label: 'Clientes',
        href: `/dashboard/finance/clients?month=${monthValue}`,
        icon: <Users className="h-4 w-4" />,
      },
      products: {
        id: 'products',
        label: 'Productos',
        href: '/products',
        icon: <Package className="h-4 w-4" />,
      },
      providers: {
        id: 'providers',
        label: 'Proveedores',
        href: `/dashboard/finance/providers?month=${monthValue}`,
        icon: <Truck className="h-4 w-4" />,
      },
      proposals: {
        id: 'proposals',
        label: 'Propuestas',
        href: '/cotizaciones',
        icon: <FileText className="h-4 w-4" />,
      },
      sales: {
        id: 'sales',
        label: 'Ventas',
        href: `/dashboard/finance/sales?month=${monthValue}`,
        icon: <DollarSign className="h-4 w-4" />,
      },
      purchases: {
        id: 'purchases',
        label: 'Compras',
        href: `/dashboard/finance/expenses?month=${monthValue}&create=1`,
        icon: <ShoppingCart className="h-4 w-4" />,
      },
      'cash-receipts': {
        id: 'cash-receipts',
        label: 'Recibos de caja',
        href: `/dashboard/finance/sales?month=${monthValue}&create=1`,
        icon: <ReceiptText className="h-4 w-4" />,
      },
      notes: {
        id: 'notes',
        label: 'Notas',
        href: '/notas',
        icon: <StickyNote className="h-4 w-4" />,
      },
      accounts: {
        id: 'accounts',
        label: 'Cuentas',
        href: `/dashboard/finance/accounts?month=${monthValue}`,
        icon: <Wallet className="h-4 w-4" />,
      },
      settings: {
        id: 'settings',
        label: 'Configuracion',
        href: '/dashboard/finance/settings',
        icon: <Settings className="h-4 w-4" />,
      },
    }),
    [monthValue],
  );

  const [order, setOrder] = useState<ShortcutId[]>(DEFAULT_ORDER);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      const saved = raw ? (JSON.parse(raw) as ShortcutId[]) : null;
      if (!Array.isArray(saved)) return;

      const known = new Set(DEFAULT_ORDER);
      const next = [...saved.filter((id) => known.has(id)), ...DEFAULT_ORDER.filter((id) => !saved.includes(id))];
      setOrder(next);
    } catch {
      setOrder(DEFAULT_ORDER);
    }
  }, []);

  const items = order.map((id) => shortcuts[id]).filter(Boolean);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    setOrder((current) => {
      const oldIndex = current.indexOf(active.id as ShortcutId);
      const newIndex = current.indexOf(over.id as ShortcutId);
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
          <div className="flex min-w-0 flex-nowrap items-center gap-1.5 overflow-x-auto pb-1">
            {items.map((item) => (
              <SortableShortcut key={item.id} item={item} />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}
