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
import {
  BuscadorDeColumna,
  CampoDeBusquedaMenu,
  ClientStatusPanel,
  StatusKey,
  useFiltroDeColumna,
} from './'
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
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from '@/components/ui/dropdown-menu'
import { BadgeCheck, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Columns3, Download } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { ClientInterface } from '@/lib/types'
import { ETIQUETAS_DE_SERVICIO, type EstadoDelServicio } from '@/lib/clientes-activos'
import { useRouter } from 'next/navigation'
import { BarraDeAcciones, BotonDeCrear } from '@/components/shared/BarraDeAcciones'
import { AccionesMasivas } from '@/components/shared/AccionesMasivas'
import { elRolGestionaClientes } from '@/lib/rol-que-gestiona-clientes'
import { eliminarClientesAction } from '@/actions/userClientDataActions'

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[]
  data: TData[]
  currentUserRol: string
  openCreateDialogUser: () => void
  statusFilter: StatusKey | null
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

export function DataTable<TData, TValue>({ columns, data, currentUserRol, openCreateDialogUser, statusFilter, setStatusFilter, servicio, setServicio, initialSearch }: DataTableProps<TData, TValue>) {
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

  const router = useRouter()
  const puedeGestionar = elRolGestionaClientes(currentUserRol)

  // El buscador: la caja va en la barra y el CAMPO en el `⋯`, así que el estado
  // vive aquí, que es quien pinta los dos huecos.
  const busqueda = useFiltroDeColumna(table, initialSearch, initialSearch ? 'email' : undefined)

  // De las filas marcadas solo interesa el id, y solo las que están DELANTE:
  // `getSelectedRowModel` ya devuelve las del modelo filtrado, así que un filtro
  // puesto no puede llevarse por delante lo que quien mira no tiene enfrente.
  const seleccionados = table
    .getSelectedRowModel()
    .rows.map((fila) => (fila.original as { id?: string }).id)
    .filter((id): id is string => typeof id === 'string')

  const borrarLosMarcados = async (ids: string[]) => {
    const resumen = await eliminarClientesAction(ids)
    return { fallaron: resumen.fallaron }
  }

  return (
    <div className="flex flex-col h-full gap-2">
      {/* Header fijo */}
      <div className="sticky top-0 z-1">
        {/* La barra, en CUATRO cosas y ninguna más: buscador, pastillas, el
            azul y el `⋯`.
            Lo que se fue al `⋯` —el campo del buscador, el estado del servicio
            y «Columnas»— son tres mandos que casi nadie toca y que entre los
            tres se llevaban unos 300 px de la única fila que escasea. Es la
            regla que la barra ya tenía escrita: lo que gasta ancho y no se usa
            a diario va dentro del `⋯`.
            Y el buscador va en su propio hueco, fuera del carril: así la flecha
            desplaza **solo las pastillas**, y la caja no se va de sitio al
            mirar la última. */}
        <BarraDeAcciones
          buscador={
            <BuscadorDeColumna
              campo={busqueda.campo}
              valor={busqueda.valor}
              onEscribir={busqueda.escribir}
            />
          }
          filtros={
            <ClientStatusPanel
              users={data as ClientInterface[]}
              onFilterChange={setStatusFilter}
              filtro={statusFilter}
              servicio={servicio}
              onServicioChange={setServicio}
            />
          }
          crear={
            puedeGestionar ? (
              <BotonDeCrear onClick={openCreateDialogUser}>Nuevo</BotonDeCrear>
            ) : null
          }
          acciones={
            <AccionesMasivas
              seleccionados={seleccionados}
              queSon="clientes"
              puedeEliminar={puedeGestionar}
              onEliminar={borrarLosMarcados}
              onTerminar={() => {
                table.resetRowSelection()
                router.refresh()
              }}
              menu={
                <>
                  <CampoDeBusquedaMenu campo={busqueda.campo} onCambiar={busqueda.elegirCampo} />

                  {/* Qué clientes se ven. La pantalla nace en «Activos» y ese
                      sigue siendo el estado por defecto; aquí solo está la
                      forma de ver todos o los inactivos.
                      Va aparte de «Columnas» a propósito: aquello decide qué
                      datos se enseñan de cada fila, esto QUÉ FILAS hay. */}
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger>
                      <BadgeCheck className="h-4 w-4" />
                      Estado
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent>
                      <DropdownMenuLabel>Estado del servicio</DropdownMenuLabel>
                      <DropdownMenuRadioGroup
                        value={servicio}
                        onValueChange={(valor) => setServicio(valor as EstadoDelServicio)}
                      >
                        {(Object.keys(ETIQUETAS_DE_SERVICIO) as EstadoDelServicio[]).map((clave) => (
                          <DropdownMenuRadioItem key={clave} value={clave}>
                            {ETIQUETAS_DE_SERVICIO[clave]}
                          </DropdownMenuRadioItem>
                        ))}
                      </DropdownMenuRadioGroup>
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>

                  {/* En submenú y no suelto: esta lista crece con las columnas
                      de la tabla, y una lista que crece dentro del menú de
                      arriba empuja fuera de la pantalla lo que va al final. */}
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger>
                      <Columns3 className="h-4 w-4" />
                      Columnas
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent className="max-h-[min(70vh,var(--radix-dropdown-menu-content-available-height))] overflow-y-auto">
                      {table
                        .getAllColumns()
                        .filter((column) => column.getCanHide() && !COLUMNS_HIDDEN_FROM_TOGGLE.includes(column.id))
                        .map((column) => (
                          <DropdownMenuCheckboxItem
                            key={column.id}
                            className="capitalize"
                            checked={column.getIsVisible()}
                            // Sin esto el menú se cierra al marcar una, y
                            // enseñar tres columnas son tres viajes al `⋯`.
                            onSelect={(evento) => evento.preventDefault()}
                            onCheckedChange={(value) => column.toggleVisibility(!!value)}
                          >
                            {column.id}
                          </DropdownMenuCheckboxItem>
                        ))}
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                </>
              }
              extras={[
                {
                  clave: 'csv',
                  etiqueta: 'Exportar CSV',
                  icono: <Download className="h-4 w-4" />,
                  // Exportar es de lo que se ve, no de lo marcado: sale siempre.
                  sinSeleccion: true,
                  onSelect: () => {
                    const rows = table.getFilteredRowModel().rows;
                    const csv = rows.map(r => Object.values(r.original as object).join(',')).join('\n');
                    const blob = new Blob([csv], { type: 'text/csv' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a'); a.href = url; a.download = 'clientes.csv'; a.click();
                    URL.revokeObjectURL(url);
                  },
                },
              ]}
            />
          }
        />
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
