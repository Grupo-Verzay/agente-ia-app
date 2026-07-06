'use client';

import * as React from 'react';
import {
  ColumnDef,
  ColumnFiltersState,
  RowSelectionState,
  SortingState,
  VisibilityState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Card } from '@/components/ui/card';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Loader2 } from 'lucide-react';

type DataTableProps<TData, TValue> = {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  searchKey?: string;
  searchPlaceholder?: string;
  onRowClick?: (row: TData) => void;
  /** Habilita selección múltiple con checkboxes y acciones de borrado masivo. */
  enableSelection?: boolean;
  getRowId?: (row: TData) => string;
  onDeleteSelected?: (ids: string[]) => void | Promise<void>;
  onDeleteAll?: () => void | Promise<void>;
  deleteBusy?: boolean;
  entityLabel?: string; // singular, ej. "venta"
};

export function DataTable<TData, TValue>({
  columns,
  data,
  searchKey = 'name',
  searchPlaceholder = 'Buscar...',
  onRowClick,
  enableSelection = false,
  getRowId,
  onDeleteSelected,
  onDeleteAll,
  deleteBusy = false,
  entityLabel = 'registro',
}: DataTableProps<TData, TValue>) {
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({});
  const [pagination, setPagination] = React.useState({ pageIndex: 0, pageSize: 20 });
  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({});
  const [confirm, setConfirm] = React.useState<{ open: boolean; all: boolean }>({ open: false, all: false });

  const selectColumn = React.useMemo<ColumnDef<TData, TValue>>(
    () => ({
      id: 'select',
      enableSorting: false,
      enableHiding: false,
      header: ({ table }) => (
        <input
          type="checkbox"
          aria-label="Seleccionar todo"
          className="h-4 w-4 cursor-pointer accent-primary"
          checked={table.getIsAllPageRowsSelected()}
          ref={(el) => {
            if (el) el.indeterminate = table.getIsSomePageRowsSelected() && !table.getIsAllPageRowsSelected();
          }}
          onChange={table.getToggleAllPageRowsSelectedHandler()}
        />
      ),
      cell: ({ row }) => (
        <input
          type="checkbox"
          aria-label="Seleccionar fila"
          className="h-4 w-4 cursor-pointer accent-primary"
          checked={row.getIsSelected()}
          onClick={(e) => e.stopPropagation()}
          onChange={row.getToggleSelectedHandler()}
        />
      ),
    }),
    [],
  );

  const allColumns = React.useMemo(
    () => (enableSelection ? [selectColumn, ...columns] : columns),
    [enableSelection, selectColumn, columns],
  );

  const table = useReactTable({
    data,
    columns: allColumns,
    state: { sorting, columnFilters, columnVisibility, pagination, rowSelection },
    enableRowSelection: enableSelection,
    getRowId,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onPaginationChange: setPagination,
    onRowSelectionChange: setRowSelection,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  const searchColumn = table.getColumn(searchKey);
  const selectedIds = Object.keys(rowSelection).filter((k) => rowSelection[k]);

  const runDelete = async () => {
    if (confirm.all) {
      await onDeleteAll?.();
    } else {
      await onDeleteSelected?.(selectedIds);
    }
    setRowSelection({});
    setConfirm({ open: false, all: false });
  };

  return (
    <div className="flex flex-col h-full gap-2">
      <div className="sticky top-0 z-1">
        <div className="flex items-center justify-between gap-2">
          <Input
            value={(searchColumn?.getFilterValue() as string) ?? ''}
            onChange={(event) => searchColumn?.setFilterValue(event.target.value)}
            placeholder={searchPlaceholder}
            className="h-8 w-72 text-sm"
          />
          <div className="flex items-center gap-2">
            {enableSelection && selectedIds.length > 0 && onDeleteSelected && (
              <Button
                size="sm"
                variant="destructive"
                className="h-8"
                disabled={deleteBusy}
                onClick={() => setConfirm({ open: true, all: false })}
              >
                Eliminar ({selectedIds.length})
              </Button>
            )}
            {enableSelection && data.length > 0 && onDeleteAll && (
              <Button
                size="sm"
                variant="destructive"
                className="h-8"
                disabled={deleteBusy}
                onClick={() => setConfirm({ open: true, all: true })}
              >
                Eliminar todas
              </Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="h-8 px-2 text-sm">
                  Columnas
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {table
                  .getAllColumns()
                  .filter((column) => column.getCanHide())
                  .map((column) => (
                    <DropdownMenuCheckboxItem
                      key={column.id}
                      className="text-sm"
                      checked={column.getIsVisible()}
                      onCheckedChange={(value) => column.toggleVisibility(!!value)}
                    >
                      {column.id}
                    </DropdownMenuCheckboxItem>
                  ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      <Card className="flex-1 min-h-0 flex flex-col border-border overflow-hidden">
        <div className="flex-1 min-h-0 overflow-auto">
          <Table className="w-full border-border table-auto">
            <TableHeader className="sticky top-0 z-10 bg-background">
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id} className="border-border [&>th]:text-sm">
                  {headerGroup.headers.map((header) => (
                    <TableHead key={header.id} className="py-2">
                      {header.isPlaceholder
                        ? null
                        : flexRender(header.column.columnDef.header, header.getContext())}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>

            <TableBody>
              {table.getRowModel().rows?.length ? (
                table.getRowModel().rows.map((row) => (
                  <TableRow
                    key={row.id}
                    data-state={row.getIsSelected() ? 'selected' : undefined}
                    onClick={() => onRowClick?.(row.original)}
                    className={[
                      '[&>td]:py-2 [&>td]:text-sm border-border data-[state=selected]:bg-muted/60',
                      onRowClick ? 'cursor-pointer hover:bg-muted/50' : '',
                    ].join(' ')}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id} className="align-middle border-border">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={allColumns.length}
                    className="h-24 text-center text-sm text-muted-foreground border-border"
                  >
                    Sin resultados.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        <div className="shrink-0 flex items-center justify-between gap-2 px-4 py-3 border-t border-border">
          <div className="text-xs text-muted-foreground">
            Mostrando <b>{table.getRowModel().rows.length}</b> de{' '}
            <b>{table.getFilteredRowModel().rows.length}</b> resultados
          </div>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => table.setPageIndex(0)} disabled={!table.getCanPreviousPage()}>
              <ChevronsLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="px-2 text-xs">
              Página <b>{table.getState().pagination.pageIndex + 1}</b> /{' '}
              <b>{table.getPageCount() || 1}</b>
            </div>
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => table.setPageIndex(table.getPageCount() - 1)} disabled={!table.getCanNextPage()}>
              <ChevronsRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </Card>

      {/* Confirmación de borrado (lote / todas) */}
      <Dialog open={confirm.open} onOpenChange={(o) => !o && setConfirm({ open: false, all: false })}>
        <DialogContent className="w-[min(94vw,420px)]">
          <DialogHeader>
            <DialogTitle>{confirm.all ? `Eliminar todas las ${entityLabel}s` : `Eliminar ${entityLabel}s`}</DialogTitle>
          </DialogHeader>
          <p className="px-1 text-sm text-muted-foreground">
            {confirm.all
              ? `Se eliminarán TODAS las ${entityLabel}s. Esta acción no se puede deshacer.`
              : `Se eliminarán ${selectedIds.length} ${entityLabel}(s). Esta acción no se puede deshacer.`}
          </p>
          <DialogFooter className="flex-row justify-between">
            <Button variant="outline" onClick={() => setConfirm({ open: false, all: false })} disabled={deleteBusy}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={() => void runDelete()} disabled={deleteBusy}>
              {deleteBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Eliminar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
