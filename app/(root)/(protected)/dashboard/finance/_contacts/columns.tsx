'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Pencil, Trash2, Link2 } from 'lucide-react';

export type ContactSession = {
  id: number;
  pushName?: string | null;
  customName?: string | null;
  remoteJid?: string | null;
};

export type FinanceContactRow = {
  id: string;
  code?: string | null;
  name: string;
  phone?: string | null;
  email?: string | null;
  department?: string | null;
  city?: string | null;
  address?: string | null;
  notes?: string | null;
  customFields?: { label: string; value: string }[] | null;
  sessionId?: number | null;
  session?: ContactSession | null;
};

export function buildContactsColumns({
  codeLabel,
  onEdit,
  onDelete,
  busy,
}: {
  codeLabel: string;
  onEdit: (row: FinanceContactRow) => void;
  onDelete: (id: string) => void;
  busy?: boolean;
}): ColumnDef<FinanceContactRow>[] {
  return [
    {
      accessorKey: 'code',
      header: codeLabel,
      cell: ({ row }) => <span className="font-medium">{row.original.code || '—'}</span>,
    },
    {
      accessorKey: 'name',
      header: 'Nombre',
      cell: ({ row }) => <span className="whitespace-nowrap">{row.original.name}</span>,
    },
    {
      accessorKey: 'phone',
      header: 'Teléfono',
      cell: ({ row }) => <span>{row.original.phone || '—'}</span>,
    },
    {
      accessorKey: 'department',
      header: 'Departamento',
      cell: ({ row }) => <span>{row.original.department || '—'}</span>,
    },
    {
      accessorKey: 'city',
      header: 'Ciudad',
      cell: ({ row }) => <span>{row.original.city || '—'}</span>,
    },
    {
      accessorKey: 'address',
      header: 'Dirección',
      cell: ({ row }) => (
        <span className="block max-w-[240px] truncate" title={row.original.address || ''}>
          {row.original.address || '—'}
        </span>
      ),
    },
    {
      id: 'Contacto',
      header: 'Contacto',
      enableSorting: false,
      cell: ({ row }) =>
        row.original.sessionId ? (
          <Badge variant="secondary" className="h-6 gap-1 text-[11px]">
            <Link2 className="h-3 w-3" />
            {row.original.session?.customName || row.original.session?.pushName || 'Vinculado'}
          </Badge>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        ),
    },
    {
      id: 'acciones',
      header: '',
      enableHiding: false,
      enableSorting: false,
      cell: ({ row }) => (
        <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
          <Button
            size="icon"
            variant="outline"
            className="h-8 w-8"
            onClick={() => onEdit(row.original)}
            disabled={busy}
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            size="icon"
            variant="destructive"
            className="h-8 w-8"
            onClick={() => onDelete(row.original.id)}
            disabled={busy}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ),
    },
  ];
}
