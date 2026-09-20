'use client';

import * as React from 'react';
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

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Card } from '@/components/ui/card';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { BarraDeAcciones } from '@/components/shared/BarraDeAcciones';
import { CasillaDeFila } from '@/components/shared/AccionesMasivas';

type DataTableProps<TData, TValue> = {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  searchKey?: string;
  searchPlaceholder?: string;
  onRowClick?: (row: TData) => void;
  /** El botón de crear. Va a la derecha, justo antes del `⋯`. */
  toolbarRight?: React.ReactNode;
  /** El `⋯` de la esquina. Se le pasan los ids marcados. */
  acciones?: (seleccionados: string[], limpiar: () => void) => React.ReactNode;
  /**
   * Mandos que acotan la lista y van en el carril de la barra, al lado del
   * buscador: hoy, el selector de cuentas de la familia.
   */
  filtrosExtra?: React.ReactNode;
  /**
   * Qué filas se pueden tocar. Con la lista consolidada, las de otra cuenta se
   * ven y no se marcan: las acciones de borrado acotan por la cuenta con la que
   * se llaman, así que una fila ajena contestaría «no encontrada».
   */
  filaEditable?: (row: TData) => boolean;
};

export function DataTable<TData, TValue>({
  columns,
  data,
  searchKey = 'name',
  searchPlaceholder = 'Buscar...',
  onRowClick,
  toolbarRight,
  acciones,
  filtrosExtra,
  filaEditable,
}: DataTableProps<TData, TValue>) {
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({});
  const [pagination, setPagination] = React.useState({ pageIndex: 0, pageSize: 20 });
  const [rowSelection, setRowSelection] = React.useState({});

  // La casilla se antepone AQUÍ y no en cada `columns.ts`: son dos pantallas
  // que comparten esta tabla, y con la columna escrita en cada una el día que
  // se afine se afina en una. Solo cuando hay `⋯` que la use: una columna de
  // casillas en una tabla sin acciones masivas es marcar filas para nada.
  const conCasilla = React.useMemo(() => {
    if (!acciones) return columns;
    const casilla = {
      id: 'seleccion',
      enableHiding: false,
      header: ({ table }: any) => (
        <CasillaDeFila
          marcada={table.getIsAllPageRowsSelected()}
          onCambiar={() => table.toggleAllPageRowsSelected(!table.getIsAllPageRowsSelected())}
          etiqueta="Seleccionar todo lo que se ve"
        />
      ),
      cell: ({ row }: any) =>
        // Sin casilla, no una casilla en gris: una apagada invita a preguntar
        // por qué no se puede, y la respuesta —«es de otra cuenta»— ya la dice
        // su insignia.
        row.getCanSelect() ? (
          <CasillaDeFila
            marcada={row.getIsSelected()}
            onCambiar={() => row.toggleSelected(!row.getIsSelected())}
            etiqueta="Seleccionar fila"
          />
        ) : null,
    } as ColumnDef<TData, TValue>;
    return [casilla, ...columns];
  }, [acciones, columns]);

  const table = useReactTable({
    data,
    columns: conCasilla,
    state: { sorting, columnFilters, columnVisibility, pagination, rowSelection },
    enableRowSelection: filaEditable ? (row) => filaEditable(row.original) : true,
    onRowSelectionChange: setRowSelection,
    getRowId: (fila: any) => String(fila?.id ?? ''),
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  const searchColumn = table.getColumn(searchKey);

  const seleccionados = table
    .getSelectedRowModel()
    .rows.map((fila) => String((fila.original as { id?: unknown })?.id ?? ''))
    .filter(Boolean);

  return (
    <div className="flex flex-col h-full gap-2">
      <div className="sticky top-0 z-1">
        <BarraDeAcciones
          crear={toolbarRight}
          acciones={acciones?.(seleccionados, () => table.resetRowSelection())}
          buscador={
            <Input
              value={(searchColumn?.getFilterValue() as string) ?? ''}
              onChange={(event) => searchColumn?.setFilterValue(event.target.value)}
              placeholder={searchPlaceholder}
              className="h-10 w-56 shrink-0 text-sm sm:w-72"
            />
          }
          filtros={filtrosExtra}
          secundarias={
            /* «Columnas» no acota la lista: iba suelto en medio del carril,
               entre los filtros y el azul. Va pegado al azul. */
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="h-10 shrink-0 px-2 text-sm">
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
          }
        />
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
                    onClick={() => onRowClick?.(row.original)}
                    className={[
                      '[&>td]:py-2 [&>td]:text-sm border-border',
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
                    colSpan={columns.length}
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
    </div>
  );
}
