'use client';

import { useState } from 'react';
import {
  ColumnDef,
  ColumnFiltersState,
  SortingState,
  VisibilityState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { ChevronDown, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { ExternalClientData } from '@/types/external-client-data';
import { toast } from 'sonner';
import { BarraDeAcciones, BotonDeCrear } from '@/components/shared/BarraDeAcciones';
import { AccionesMasivas } from '@/components/shared/AccionesMasivas';
import { eliminarDatosExternosAction } from '@/actions/borrado-en-bloque-actions';

// ─── Props (ISP — only what the table needs) ──────────────────────────────────

interface ExternalClientDataTableProps {
  columns: ColumnDef<ExternalClientData>[];
  data: ExternalClientData[];
  total: number;
  onCreateNew: () => void;
  /** La cuenta dueña de estos datos. La acción la vuelve a comprobar. */
  userId?: string;
  /** Se llama al acabar un borrado, para recargar. */
  onBorrado?: () => void;
}

// ─── Component (SRP — only renders the table) ─────────────────────────────────

export function ExternalClientDataTable({
  columns,
  data,
  total,
  onCreateNew,
  userId,
  onBorrado,
}: ExternalClientDataTableProps) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 10 });
  const [rowSelection, setRowSelection] = useState({});

  const table = useReactTable({
    data,
    columns,
    state: { sorting, columnFilters, columnVisibility, pagination, rowSelection },
    onRowSelectionChange: setRowSelection,
    getRowId: (fila) => String(fila.id),
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  const seleccionados = table
    .getSelectedRowModel()
    .rows.map((fila) => String(fila.original.id))
    .filter(Boolean);

  const borrarLosMarcados = async (ids: string[]) => {
    const resumen = await eliminarDatosExternosAction(ids, userId);
    if (!resumen.success) toast.error(resumen.message);
    return { fallaron: resumen.fallaron };
  };

  const pageCount = table.getPageCount();
  const pageIndex = table.getState().pagination.pageIndex;

  return (
    <div className="space-y-3">
      {/* La barra compartida: filtros a la izquierda, el azul de crear y el
          `⋯` pegado al borde. */}
      <BarraDeAcciones
        crear={<BotonDeCrear onClick={onCreateNew}>Nuevo registro</BotonDeCrear>}
        acciones={
          <AccionesMasivas
            seleccionados={seleccionados}
            queSon="registros"
            onEliminar={borrarLosMarcados}
            onTerminar={() => { table.resetRowSelection(); onBorrado?.(); }}
          />
        }
        filtros={
          <>
        <div className="relative w-64 shrink-0">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Buscar por remoteJid..."
            value={(table.getColumn('remoteJid')?.getFilterValue() as string) ?? ''}
            onChange={(e) =>
              table.getColumn('remoteJid')?.setFilterValue(e.target.value)
            }
            className="pl-8 text-xs"
          />
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1 shrink-0">
              <span className="hidden sm:inline">Columnas</span>
              <ChevronDown className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {table
              .getAllColumns()
              .filter((col) => col.getCanHide())
              .map((col) => (
                <DropdownMenuCheckboxItem
                  key={col.id}
                  className="capitalize"
                  checked={col.getIsVisible()}
                  onCheckedChange={(v) => col.toggleVisibility(!!v)}
                >
                  {col.id}
                </DropdownMenuCheckboxItem>
              ))}
          </DropdownMenuContent>
        </DropdownMenu>
          </>
        }
      />

      {/* ── Table ── */}
      <Card>
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id}>
                {hg.headers.map((h) => (
                  <TableHead key={h.id}>
                    {h.isPlaceholder
                      ? null
                      : flexRender(h.column.columnDef.header, h.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>

          <TableBody>
            {table.getRowModel().rows.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-24 text-center text-sm text-muted-foreground"
                >
                  No hay registros para este cliente.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>

        {/* ── Pagination ── */}
        <div className="flex items-center justify-between border-t px-4 py-3">
          <p className="text-xs text-muted-foreground">
            {total} registro(s) · página {pageIndex + 1} de {pageCount || 1}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
            >
              Anterior
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
            >
              Siguiente
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
