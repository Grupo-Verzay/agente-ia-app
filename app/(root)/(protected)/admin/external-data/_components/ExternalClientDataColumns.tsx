'use client';

import { ColumnDef } from '@tanstack/react-table';
import { ArrowUpDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { ExternalClientData } from '@/types/external-client-data';
import { CasillaDeFila } from '@/components/shared/AccionesMasivas';
import { EditarYEliminar } from '@/components/shared/EditarYEliminar';
import { laClaveQueSeLee, laEtiquetaDeLaColumna, laFuente } from '@/lib/pantalla-de-mis-datos';

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
    // La casilla va PRIMERO, para que el `⋯` de la barra tenga qué borrar.
    {
      id: 'seleccion',
      enableHiding: false,
      header: ({ table }) => (
        <CasillaDeFila
          marcada={table.getIsAllPageRowsSelected()}
          onCambiar={() => table.toggleAllPageRowsSelected(!table.getIsAllPageRowsSelected())}
          etiqueta="Seleccionar todo lo que se ve"
        />
      ),
      cell: ({ row }) => (
        <CasillaDeFila
          marcada={row.getIsSelected()}
          onCambiar={() => row.toggleSelected(!row.getIsSelected())}
          etiqueta="Seleccionar registro"
        />
      ),
    },
    {
      accessorKey: 'remoteJid',
      header: ({ column }) => (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          className="-ml-3"
        >
          {laEtiquetaDeLaColumna('remoteJid')}
          <ArrowUpDown className="ml-2 h-3.5 w-3.5" />
        </Button>
      ),
      // El número, no la forma de WhatsApp (`laClaveQueSeLee`); la clave entera
      // sigue en el globo.
      cell: ({ row }) => (
        <span className="font-mono text-xs" title={row.getValue('remoteJid')}>
          {laClaveQueSeLee(row.getValue('remoteJid'))}
        </span>
      ),
    },
    {
      accessorKey: 'data',
      header: laEtiquetaDeLaColumna('data'),
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
      header: laEtiquetaDeLaColumna('source'),
      cell: ({ row }) => {
        const source = (row.getValue('source') as string | null) ?? 'manual';
        const variant =
          source === 'google_sheets'
            ? 'default'
            : source === 'api'
              ? 'secondary'
              : 'outline';
        return (
          <Badge variant={variant} className="text-xs">
            {laFuente(source)}
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
          {laEtiquetaDeLaColumna('updatedAt')}
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
        // El lápiz y la papelera a la vista, como en la lista de bloques de la
        // base de conocimiento: iban escondidos detrás de un «⋯».
        return <EditarYEliminar onEditar={() => actions.onEdit(record)} onEliminar={() => actions.onDelete(record)} />;
      },
    },
  ];
}
