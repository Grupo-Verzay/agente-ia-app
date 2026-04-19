'use client';

import * as React from 'react';
import type { ColumnDef } from '@tanstack/react-table';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

import { Pencil, Trash2, Eye } from 'lucide-react';

type BuildColsArgs = {
  onEdit: (row: any) => void;
  onDelete: (id: string) => void;
  busy?: boolean;
};

export function buildSalesColumns({ onEdit, onDelete, busy }: BuildColsArgs): ColumnDef<any>[] {
  return [
    {
      accessorKey: 'title',
      header: 'Concepto',
      cell: ({ row }) => {
        const v = row.original?.title || 'Sin concepto';
        return <p className="truncate text-sm font-medium">{v}</p>;
      },
    },
    {
      accessorKey: 'currencyCode',
      header: 'Moneda',
      cell: ({ row }) => (
        <Badge variant="outline" className="h-6 text-[11px]">
          {row.original?.currencyCode || '—'}
        </Badge>
      ),
    },
    {
      accessorKey: 'occurredAt',
      header: 'Fecha',
      cell: ({ row }) => {
        const d = row.original?.occurredAt ? new Date(row.original.occurredAt) : null;
        const text = d ? d.toISOString().slice(0, 10) : '—';
        return <span className="text-sm">{text}</span>;
      },
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => {
        const original = row.original;

        return (
          <div className="flex justify-end gap-1">
            {/* VER (si lo usas) */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    // Si tu "ver" es abrir detalle, aquí puedes dispararlo.
                    // Pero normalmente el detalle se abre al click de la fila,
                    // entonces este botón podría sobrar.
                  }}
                  disabled={busy}
                >
                  <Eye className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Ver</TooltipContent>
            </Tooltip>

            {/* EDITAR */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  className="h-8 w-8"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation(); // evita abrir el detalle
                    onEdit(original);
                  }}
                  disabled={busy}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Editar</TooltipContent>
            </Tooltip>

            {/* ELIMINAR */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  size="icon"
                  variant="destructive"
                  className="h-8 w-8"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation(); // evita abrir el detalle
                    onDelete(original.id);
                  }}
                  disabled={busy}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Eliminar</TooltipContent>
            </Tooltip>
          </div>
        );
      },
    },
  ];
}
