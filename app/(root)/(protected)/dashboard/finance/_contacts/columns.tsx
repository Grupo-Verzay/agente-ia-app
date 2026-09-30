'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { Badge } from '@/components/ui/badge';
import { Link2 } from 'lucide-react';
import { AccionesDeLaFila } from '../_components/AccionesDeLaFila';
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
  /** De qué cuenta es la fila. Solo se mira al consolidar. */
  userId?: string | null;
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
  queEs,
  onEdit,
  onDelete,
  busy,
  esDeOtraCuenta,
}: {
  fields: FinanceFieldDef[];
  /** Qué es una fila, con su artículo: «el cliente», «el proveedor». */
  queEs: string;
  onEdit: (row: FinanceContactRow) => void;
  onDelete: (row: FinanceContactRow) => Promise<boolean>;
  busy?: boolean;
  /**
   * Una fila de otra cuenta se ve y no se toca. Las acciones de escritura de
   * Finanzas acotan por la cuenta con la que se llaman, así que el lápiz y la
   * papelera sobre una fila ajena contestarían «no encontrada»: menú abierto,
   * puerta cerrada. Para editarla se entra a esa cuenta.
   */
  esDeOtraCuenta?: (row: FinanceContactRow) => boolean;
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
      <AccionesDeLaFila
        queEs={queEs}
        nombre={row.original.name}
        ajena={esDeOtraCuenta?.(row.original)}
        ocupado={busy}
        onEditar={() => onEdit(row.original)}
        onEliminar={() => onDelete(row.original)}
      />
    ),
  });

  return cols;
}
