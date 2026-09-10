'use client'

import { useEffect, useState } from 'react'

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
} from '@tanstack/react-table'
import { ClientStatusPanel, ColumnFilterInput, StatusKey } from './'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { BadgeCheck, ChevronDown, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Ellipsis, Plus } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { ClientInterface } from '@/lib/types'
import { ETIQUETAS_DE_SERVICIO, type EstadoDelServicio } from '@/lib/clientes-activos'
import { cn } from '@/lib/utils'

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[]
  data: TData[]
  currentUserRol: string
  openCreateDialogUser: () => void
  setStatusFilter: (status: StatusKey | null) => void
  /** Todos / solo los que tienen el servicio al día / solo el resto. */
  servicio: EstadoDelServicio
  setServicio: (estado: EstadoDelServicio) => void
  initialSearch?: string
}

const VISIBILITY_STORAGE_KEY = 'admin-clientes-column-visibility'

// Columnas que existen en la tabla pero no aparecen en el toggle de visibilidad
const COLUMNS_HIDDEN_FROM_TOGGLE = ['role', 'email', 'reseller']
const DEFAULT_HIDDEN: VisibilityState = { role: false, email: false, reseller: false }

export function DataTable<TData, TValue>({ columns, data, currentUserRol, openCreateDialogUser, setStatusFilter, servicio, setServicio, initialSearch }: DataTableProps<TData, TValue>) {
  const [sorting, setSorting] = useState<SortingState>([])
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({})

  useEffect(() => {
    try {
      const saved = localStorage.getItem(VISIBILITY_STORAGE_KEY)
      const parsed = saved ? JSON.parse(saved) : {}
      // Las columnas ocultas del toggle siempre se fuerzan a hidden
      setColumnVisibility({ ...parsed, ...DEFAULT_HIDDEN })
    } catch {
      setColumnVisibility(DEFAULT_HIDDEN)
    }
  }, [])
  const [rowSelection, setRowSelection] = useState({})

  const handleColumnVisibilityChange = (updater: VisibilityState | ((prev: VisibilityState) => VisibilityState)) => {
    setColumnVisibility((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater
      localStorage.setItem(VISIBILITY_STORAGE_KEY, JSON.stringify(next))
      return next
    })
  }
  const [pagination, setPagination] = useState({
    pageIndex: 0,
    pageSize: 20,
  })

  const table = useReactTable({
    data,
    columns,
    state: {
      sorting,
      columnFilters,
      columnVisibility,
      rowSelection,
      pagination,
    },
    onPaginationChange: setPagination,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: handleColumnVisibilityChange,
    onRowSelectionChange: setRowSelection,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  })

  return (
    <div className="flex flex-col h-full gap-2">
      {/* Header fijo */}
      <div className="sticky top-0 z-1">
        {/* La misma barra que Equipo: izquierda fija, zona central que SCROLLEA
            cuando no cabe y derecha fija. Con el menú lateral desplegado los
            botones de la derecha («Columnas», «Acciones») se salían de la
            pantalla y no había forma de llegar a ellos. */}
        <div className="flex items-center gap-2">
          <div className="flex flex-1 min-w-0 items-center gap-2">

            <div className="flex min-w-0 flex-1 flex-row items-center gap-2 sm:flex-none sm:shrink-0">
              <ColumnFilterInput table={table} initialValue={initialSearch} initialColumn={initialSearch ? "email" : undefined} />

              {/* button-create-client. En el teléfono ocupaba una fila entera
                  para decir "+ Nuevo": queda solo el más, junto al buscador. */}
              {(currentUserRol === 'admin' || currentUserRol === 'super_admin' || currentUserRol === 'reseller') &&

                <Button
                  onClick={openCreateDialogUser}
                  title="Nuevo cliente"
                  aria-label="Nuevo cliente"
                  className="h-9 w-9 shrink-0 p-0 bg-blue-600 hover:bg-blue-700 text-white sm:h-10 sm:w-auto sm:px-4"
                >
                  <Plus className="h-4 w-4 sm:hidden" />
                  <span className="hidden sm:inline">+ Nuevo</span>
                </Button>
              }
            </div>

            {/* Zona central: SCROLLEA cuando no cabe (estado, contadores, columnas) */}
            <div className="flex flex-1 min-w-0 items-center gap-1 overflow-x-auto">
              {/* Qué clientes se ven. Va aquí y no dentro de «Columnas»: eso
                  decide qué datos se enseñan de cada fila, no qué filas hay.
                  Cuando no está en «Todos» se pinta en azul, para que no se
                  quede puesto sin que se note. */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      'ml-auto shrink-0',
                      servicio === 'todos' ? undefined : 'border-sky-500 text-sky-600',
                    )}
                    title="Filtrar por estado del servicio"
                  >
                    <BadgeCheck className="h-4 w-4" />
                    <span className="hidden md:inline">
                      {servicio === 'todos' ? 'Estado' : ETIQUETAS_DE_SERVICIO[servicio]}
                    </span>
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuLabel>Estado</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {(Object.keys(ETIQUETAS_DE_SERVICIO) as EstadoDelServicio[]).map((clave) => (
                    <DropdownMenuCheckboxItem
                      key={clave}
                      checked={servicio === clave}
                      onCheckedChange={() => setServicio(clave)}
                    >
                      {ETIQUETAS_DE_SERVICIO[clave]}
                    </DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>

              <ClientStatusPanel
                users={data as ClientInterface[]}
                onFilterChange={setStatusFilter}
              />

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="shrink-0">
                    <Ellipsis className="h-4 w-4 md:hidden" />
                    <span className="hidden md:inline">Columnas</span>
                    <ChevronDown className="ml-2 h-4 w-4 hidden md:inline" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {table
                    .getAllColumns()
                    .filter((column) => column.getCanHide() && !COLUMNS_HIDDEN_FROM_TOGGLE.includes(column.id))
                    .map((column) => (
                      <DropdownMenuCheckboxItem
                        key={column.id}
                        className="capitalize"
                        checked={column.getIsVisible()}
                        onCheckedChange={(value) => column.toggleVisibility(!!value)}
                      >
                        {column.id}
                      </DropdownMenuCheckboxItem>
                    ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            {/* Derecha FIJA: nunca se va de la pantalla ni se desplaza */}
            <div className="flex shrink-0 items-center gap-1">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="icon" className="shrink-0">
                    <Ellipsis className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuLabel>Acciones</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => {
                    const rows = table.getFilteredRowModel().rows;
                    const csv = rows.map(r => Object.values(r.original as object).join(',')).join('\n');
                    const blob = new Blob([csv], { type: 'text/csv' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a'); a.href = url; a.download = 'clientes.csv'; a.click();
                    URL.revokeObjectURL(url);
                  }}>
                    Exportar CSV
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>
      </div>


      {/* Card ocupa el espacio restante: tabla scrollea, paginación fija abajo */}
      <Card className="flex-1 min-h-0 flex flex-col border-border overflow-hidden">
        <div className="flex-1 min-h-0 overflow-auto">
          <Table className="w-full border-border table-auto">
            <TableHeader className="sticky top-0 z-10 bg-background">
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id} className="border-border">
                  {headerGroup.headers.map((header) => (
                    <TableHead key={header.id} className="text-left px-2">
                      {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {table.getRowModel().rows?.length ? (
                table.getRowModel().rows.map((row) => (
                  <TableRow key={row.id} className="border-border">
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id} className="text-left align-middle py-2">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : (
                <TableRow className="border-border">
                  <TableCell colSpan={columns.length} className="h-24 text-center">
                    No hay resultados.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        {/* Paginación siempre visible, fuera del scroll */}
        <div className="shrink-0 flex items-center justify-between gap-2 px-4 py-3 border-t border-border">
          <div className="text-xs text-muted-foreground">
            Mostrando{" "}
            <b>{table.getRowModel().rows.length}</b> de{" "}
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
              Página <b>{table.getState().pagination.pageIndex + 1}</b> /{" "}
              <b>{table.getPageCount()}</b>
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
  )
}
