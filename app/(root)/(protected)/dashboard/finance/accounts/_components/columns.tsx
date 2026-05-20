'use client';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Pencil, Trash2, Star } from 'lucide-react';

export type AccountRow = { id: string; name: string; isDefault: boolean; currencyCode?: string | null; type?: 'PERSONAL' | 'COMPANY' | null };
type CellCtx = { row: { original: AccountRow } };

export function buildAccountsColumns({
  onEdit,
  onDelete,
  onSetDefault,
  busy,
  getAccountSummary,
}: {
  onEdit: (row: AccountRow) => void;
  onDelete: (id: string) => void;
  onSetDefault: (row: AccountRow) => void;
  busy: boolean;
  getAccountSummary: (accountId: string) => {
    salesText: string;
    expensesText: string;
    balanceText: string;
  };
}) {
  return [
    // Columna: Cuenta (solo nombre)
    {
      accessorKey: 'name',
      header: 'Cuenta',
      cell: ({ row }: CellCtx) => {
        const r = row.original;

        return (
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="truncate font-medium">{r.name}</p>

              {r.isDefault ? (
                <Badge variant="secondary" className="h-6 text-[11px]">
                  Default
                </Badge>
              ) : null}
            </div>
          </div>
        );
      },
    },

    // Columna: Saldo
    {
      id: 'balance',
      header: 'Saldo',
      cell: ({ row }: CellCtx) => {
        const r = row.original;
        const summary = getAccountSummary?.(r.id);
        const balanceText = summary?.balanceText ?? '—';

        return (
          <div className="text-right">
            <p className="text-sm font-semibold">{balanceText}</p>
          </div>
        );
      },
    },

    // Columna: Acciones
    {
      id: 'actions',
      header: '',
      cell: ({ row }: CellCtx) => {
        const r = row.original;

        return (
          <TooltipProvider>
            <div className="flex justify-end gap-2">
              {!r.isDefault ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="icon"
                      variant="outline"
                      className="h-9 w-9"
                      disabled={busy}
                      onClick={(e) => {
                        e.stopPropagation();
                        onSetDefault(r);
                      }}
                    >
                      <Star className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Marcar como default</TooltipContent>
                </Tooltip>
              ) : null}

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="icon"
                    variant="outline"
                    className="h-9 w-9"
                    disabled={busy}
                    onClick={(e) => {
                      e.stopPropagation();
                      onEdit(r);
                    }}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Editar</TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="icon"
                    variant="destructive"
                    className="h-9 w-9"
                    disabled={busy}
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(r.id);
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Eliminar</TooltipContent>
              </Tooltip>
            </div>
          </TooltipProvider>
        );
      },
    },
  ];
}
