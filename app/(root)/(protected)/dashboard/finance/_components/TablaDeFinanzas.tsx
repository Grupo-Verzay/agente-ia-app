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
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { BarraDeAcciones } from '@/components/shared/BarraDeAcciones';
import { CasillaDeFila } from '@/components/shared/AccionesMasivas';
import { laEtiquetaDeLaColumna } from '@/lib/tabla-de-finanzas';

/**
 * La tabla de TODAS las listas de Finanzas: Ventas, Gastos, Clientes,
 * Proveedores, Cuentas y los movimientos de una cuenta.
 *
 * Eran tres copias —una en Ventas, que usaban también Cuentas y sus
 * movimientos; otra en Gastos y otra en Clientes y Proveedores— y se habían
 * separado en lo que se ve: Ventas pintaba sus casillas con un `<input>` suelto
 * y las demás con la de la casa, Ventas confirmaba el borrado en bloque DOS
 * veces —la del `⋯` y la suya— y avisaba «eliminadas» antes de borrar, y las
 * tres enseñaban en «Columnas» el id interno de cada columna. Con una sola
 * tabla, lo que se afina se afina en las seis pantallas a la vez.
 *
 * La barra es `BarraDeAcciones` con sus huecos de siempre: el buscador fijo, lo
 * que acota la lista en `filtros` (el periodo, las cuentas de la familia), lo
 * que se hace sobre la lista entera en `secundarias` («Columnas», y en
 * Contactos «Campos»), el azul en `crear` y el `⋯` en `acciones`.
 */
type Props<TData, TValue> = {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  searchKey?: string;
  searchPlaceholder?: string;
  /**
   * Texto con el que nace el buscador, si se llegó buscando desde fuera: el
   * buscador del resumen de Finanzas lleva a Ventas con `?q=`, y sin esto se
   * aterrizaría en la lista entera, que es no haber buscado.
   */
  initialSearch?: string;
  onRowClick?: (row: TData) => void;
  /** Lo que acota la lista: el periodo, las cuentas de la familia. */
  filtros?: React.ReactNode;
  /** Lo que se hace sobre la lista entera sin acotarla, antes de «Columnas». */
  secundarias?: React.ReactNode;
  /** El botón azul de crear. */
  crear?: React.ReactNode;
  /** El `⋯` de la esquina. Se le pasan los ids marcados y cómo limpiarlos. */
  acciones?: (seleccionados: string[], limpiar: () => void) => React.ReactNode;
  /**
   * Qué filas se pueden marcar. Con la lista consolidada, las de otra cuenta se
   * ven y no se marcan: las acciones de borrado acotan por la cuenta con la que
   * se llaman, así que una fila ajena contestaría «no encontrada».
   */
  filaEditable?: (row: TData) => boolean;
  /** Cómo se llama una fila, en singular, para la casilla: «venta», «gasto»… */
  queEs?: string;
  /** Qué dice la tabla vacía. */
  vacio?: string;
};

export function TablaDeFinanzas<TData, TValue>({
  columns,
  data,
  searchKey = 'name',
  searchPlaceholder = 'Buscar...',
  initialSearch,
  onRowClick,
  filtros,
  secundarias,
  crear,
  acciones,
  filaEditable,
  queEs = 'fila',
  vacio = 'Sin resultados.',
}: Props<TData, TValue>) {
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>(
    initialSearch ? [{ id: searchKey, value: initialSearch }] : [],
  );
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({});
  const [pagination, setPagination] = React.useState({ pageIndex: 0, pageSize: 20 });
  const [rowSelection, setRowSelection] = React.useState({});

  // La casilla solo cuando hay `⋯` que la use: una columna de casillas en una
  // tabla sin acciones masivas es marcar filas para nada.
  const conCasilla = React.useMemo(() => {
    if (!acciones) return columns;
    const casilla = {
      id: 'seleccion',
      enableHiding: false,
      enableSorting: false,
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
            etiqueta={`Seleccionar ${queEs}`}
          />
        ) : null,
    } as ColumnDef<TData, TValue>;
    return [casilla, ...columns];
  }, [acciones, columns, queEs]);

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

  // Lo marcado que ya no está en la lista —se borró, o lo escondió el periodo—
  // no cuenta: el `⋯` diría «eliminar 5» sobre filas que no se tienen delante.
  const seleccionados = table
    .getSelectedRowModel()
    .rows.map((fila) => String((fila.original as { id?: unknown })?.id ?? ''))
    .filter(Boolean);

  return (
    <div className="flex h-full flex-col gap-2" data-tabla-de-finanzas>
      <div className="sticky top-0 z-1">
        <BarraDeAcciones
          crear={crear}
          acciones={acciones?.(seleccionados, () => table.resetRowSelection())}
          buscador={
            <Input
              value={(searchColumn?.getFilterValue() as string) ?? ''}
              onChange={(event) => searchColumn?.setFilterValue(event.target.value)}
              placeholder={searchPlaceholder}
              className="h-10 w-56 shrink-0 text-sm sm:w-72"
            />
          }
          filtros={filtros}
          secundarias={
            <>
              {secundarias}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="h-10 shrink-0 px-3 text-sm" data-boton="columnas">
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
                        {laEtiquetaDeLaColumna(column)}
                      </DropdownMenuCheckboxItem>
                    ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          }
        />
      </div>

      <Card className="flex min-h-0 flex-1 flex-col overflow-hidden border-border">
        <div className="min-h-0 flex-1 overflow-auto">
          <Table className="w-full table-auto border-border">
            <TableHeader className="sticky top-0 z-10 bg-background">
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id} className="border-border [&>th]:text-sm">
                  {headerGroup.headers.map((header) => (
                    <TableHead key={header.id} className="py-2">
                      {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
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
                      'border-border data-[state=selected]:bg-muted/60 [&>td]:py-2 [&>td]:text-sm',
                      onRowClick ? 'cursor-pointer hover:bg-muted/50' : '',
                    ].join(' ')}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id} className="border-border align-middle">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={conCasilla.length} className="h-24 border-border text-center text-sm text-muted-foreground">
                    {vacio}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        <div className="flex shrink-0 items-center justify-between gap-2 border-t border-border px-4 py-3" data-pie-de-la-tabla>
          <div className="text-xs text-muted-foreground">
            Mostrando <b>{table.getRowModel().rows.length}</b> de <b>{table.getFilteredRowModel().rows.length}</b> resultados
          </div>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" className="h-8 w-8" aria-label="Primera página" onClick={() => table.setPageIndex(0)} disabled={!table.getCanPreviousPage()}>
              <ChevronsLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon" className="h-8 w-8" aria-label="Página anterior" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="px-2 text-xs">
              Página <b>{table.getState().pagination.pageIndex + 1}</b> / <b>{table.getPageCount() || 1}</b>
            </div>
            <Button variant="outline" size="icon" className="h-8 w-8" aria-label="Página siguiente" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon" className="h-8 w-8" aria-label="Última página" onClick={() => table.setPageIndex(table.getPageCount() - 1)} disabled={!table.getCanNextPage()}>
              <ChevronsRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
