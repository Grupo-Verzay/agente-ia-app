'use client';

import { ColumnDef } from '@tanstack/react-table';
import { ArrowUpDown, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import type { ExternalClientData } from '@/types/external-client-data';

// ─── Interfaces (ISP) ─────────────────────────────────────────────────────────

export interface ExternalClientDataRowActions {
  onEdit: (record: ExternalClientData) => void;
  onDelete: (record: ExternalClientData) => void;
}

// ─── Column builder (OCP — extends without modification) ──────────────────────

export function buildExternalClientDataColumns(
  actions: ExternalClientDataRowActions,
): ColumnDef<ExternalClientData>[] {
  return [
    {
      accessorKey: 'remoteJid',
      header: ({ column }) => (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          className="-ml-3"
        >
          WhatsApp / Remote JID
          <ArrowUpDown className="ml-2 h-3.5 w-3.5" />
        </Button>
      ),
      cell: ({ row }) => (
        <span className="font-mono text-xs">{row.getValue('remoteJid')}</span>
      ),
    },
    {
      accessorKey: 'data',
      header: 'Datos',
      enableSorting: false,
      cell: ({ row }) => {
        const data = row.getValue('data') as Record<string, unknown>;
        const keys = Object.keys(data);
        if (!keys.length)
          return <span className="text-xs text-muted-foreground">—</span>;
        return (
          <div className="flex flex-wrap gap-1 max-w-xs">
            {keys.slice(0, 3).map((k) => (
              <Badge key={k} variant="outline" className="text-xs font-normal">
                {k}
              </Badge>
            ))}
            {keys.length > 3 && (
              <Badge variant="secondary" className="text-xs">
                +{keys.length - 3}
              </Badge>
            )}
          </div>
        );
      },
    },
    {
      accessorKey: 'source',
      header: 'Fuente',
      cell: ({ row }) => {
        const source = (row.getValue('source') as string | null) ?? 'manual';
        const variant =
          source === 'google_sheets'
            ? 'default'
            : source === 'api'
              ? 'secondary'
              : 'outline';
        return (
          <Badge variant={variant} className="text-xs capitalize">
            {source}
          </Badge>
        );
      },
    },
    {
      accessorKey: 'updatedAt',
      header: ({ column }) => (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          className="-ml-3"
        >
          Actualizado
          <ArrowUpDown className="ml-2 h-3.5 w-3.5" />
        </Button>
      ),
      cell: ({ row }) => {
        const date = new Date(row.getValue('updatedAt'));
        return (
          <span className="text-xs text-muted-foreground whitespace-nowrap">
            {date.toLocaleDateString('es-VE')}{' '}
            {date.toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' })}
          </span>
        );
      },
    },
    {
      id: 'actions',
      enableHiding: false,
      cell: ({ row }) => {
        const record = row.original;
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="h-8 w-8 p-0">
                <span className="sr-only">Abrir menú</span>
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => actions.onEdit(record)}>
                <Pencil className="mr-2 h-4 w-4" />
                Editar
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => actions.onDelete(record)}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Eliminar
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    },
  ];
}
