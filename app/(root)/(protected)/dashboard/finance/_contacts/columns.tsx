'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Pencil, Trash2, Link2 } from 'lucide-react';
import {
  CONTACT_LINK_KEY,
  readContactValue,
  type FinanceFieldDef,
} from '@/lib/finance-contact-fields';

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
  customFields?: Record<string, string> | null;
  sessionId?: number | null;
  session?: ContactSession | null;
  [key: string]: unknown;
};

const LONG_TEXT_KEYS = new Set(['address', 'notes']);

export function buildContactsColumns({
  fields,
  onEdit,
  onDelete,
  busy,
}: {
  fields: FinanceFieldDef[];
  onEdit: (row: FinanceContactRow) => void;
  onDelete: (id: string) => void;
  busy?: boolean;
}): ColumnDef<FinanceContactRow>[] {
  const cols: ColumnDef<FinanceContactRow>[] = [];

  for (const f of fields) {
    if (f.hidden) continue;

    if (f.key === CONTACT_LINK_KEY) {
      cols.push({
        id: f.key,
        header: f.label,
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
      });
      continue;
    }

    const isLong = LONG_TEXT_KEYS.has(f.key);
    cols.push({
      id: f.key,
      accessorFn: (row) => readContactValue(row as Record<string, unknown>, f.key),
      header: f.label,
      cell: ({ getValue }) => {
        const v = (getValue() as string) || '';
        if (!v) return <span className="text-muted-foreground">—</span>;
        if (isLong) {
          return (
            <span className="block max-w-[240px] truncate" title={v}>
              {v}
            </span>
          );
        }
        return <span className={f.key === 'code' || f.key === 'name' ? 'whitespace-nowrap font-medium' : ''}>{v}</span>;
      },
    });
  }

  cols.push({
    id: 'acciones',
    header: '',
    enableHiding: false,
    enableSorting: false,
    cell: ({ row }) => (
      <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
        <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => onEdit(row.original)} disabled={busy}>
          <Pencil className="h-4 w-4" />
        </Button>
        <Button size="icon" variant="destructive" className="h-8 w-8" onClick={() => onDelete(row.original.id)} disabled={busy}>
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    ),
  });

  return cols;
}
