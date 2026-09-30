'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { Star } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { AccionesDeLaFila } from '../../_components/AccionesDeLaFila';

export type AccountRow = { id: string; name: string; isDefault: boolean; currencyCode?: string | null; type?: 'PERSONAL' | 'COMPANY' | null };

/**
 * Las columnas de Cuentas. Los botones de la fila son los de TODAS las listas
 * de Finanzas (`AccionesDeLaFila`): iban un número más grandes que en Ventas y
 * Gastos, y la papelera borraba sin preguntar. La estrella —marcar como
 * predeterminada— es la única acción propia, y solo sale en las que no lo son.
 */
export function buildAccountsColumns({
  onEdit,
  onDelete,
  onSetDefault,
  busy,
  getAccountSummary,
}: {
  onEdit: (row: AccountRow) => void;
  onDelete: (row: AccountRow) => Promise<boolean>;
  onSetDefault: (row: AccountRow) => void;
  busy: boolean;
  getAccountSummary: (accountId: string) => {
    salesText: string;
    expensesText: string;
    balanceText: string;
  };
}): ColumnDef<AccountRow>[] {
  return [
    {
      accessorKey: 'name',
      header: 'Cuenta',
      cell: ({ row }) => (
        <div className="flex min-w-0 items-center gap-2">
          <p className="truncate font-medium">{row.original.name}</p>
          {row.original.isDefault ? (
            <Badge variant="secondary" className="h-6 shrink-0 text-[11px]">
              Predeterminada
            </Badge>
          ) : null}
        </div>
      ),
    },
    {
      id: 'ventas',
      header: 'Ventas',
      cell: ({ row }) => (
        <div className="whitespace-nowrap text-right tabular-nums text-muted-foreground">
          {getAccountSummary(row.original.id).salesText}
        </div>
      ),
    },
    {
      id: 'gastos',
      header: 'Gastos',
      cell: ({ row }) => (
        <div className="whitespace-nowrap text-right tabular-nums text-muted-foreground">
          {getAccountSummary(row.original.id).expensesText}
        </div>
      ),
    },
    {
      id: 'saldo',
      header: 'Saldo',
      cell: ({ row }) => (
        <div className="whitespace-nowrap text-right font-semibold tabular-nums">
          {getAccountSummary(row.original.id).balanceText}
        </div>
      ),
    },
    {
      id: 'actions',
      header: '',
      enableHiding: false,
      enableSorting: false,
      cell: ({ row }) => (
        <AccionesDeLaFila
          queEs="la cuenta"
          nombre={row.original.name}
          ocupado={busy}
          onEditar={() => onEdit(row.original)}
          onEliminar={() => onDelete(row.original)}
          extras={
            row.original.isDefault
              ? []
              : [
                  {
                    clave: 'predeterminada',
                    etiqueta: 'Marcar como predeterminada',
                    icono: <Star className="h-4 w-4" />,
                    onClick: () => onSetDefault(row.original),
                  },
                ]
          }
        />
      ),
    },
  ];
}
