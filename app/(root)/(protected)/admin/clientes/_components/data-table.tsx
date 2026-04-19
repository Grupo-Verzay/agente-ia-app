'use client'

import { useState } from 'react'

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
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ChevronDown, Ellipsis, Plus, PlusCircle } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { ClientInterface } from '@/lib/types'

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[]
  data: TData[]
  currentUserRol: string
  openCreateDialogUser: () => void
  setStatusFilter: (status: StatusKey | null) => void
}

export function DataTable<TData, TValue>({ columns, data, currentUserRol, openCreateDialogUser, setStatusFilter }: DataTableProps<TData, TValue>) {
  const [sorting, setSorting] = useState<SortingState>([])
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({})
  const [rowSelection, setRowSelection] = useState({})
  const [pagination, setPagination] = useState({
    pageIndex: 0,
    pageSize: 8,
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
    onColumnVisibilityChange: setColumnVisibility,
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
        <div className="flex justify-between items-center gap-2">
          <div className="flex flex-row flex-1 gap-2">

            <div className="flex flex-col sm:flex-row items-centerem gap-2 flex-1">
              <ColumnFilterInput table={table} />

              {/* button-create-client */}
              {(currentUserRol === 'admin' || currentUserRol === 'super_admin') &&

                <Button onClick={openCreateDialogUser} className="m-0 flex items-center gap-2">
                  {/* Icono + para móviles */}
                  <Plus className="h-4 w-4 md:hidden" />

                  {/* Texto para pantallas mayores a md */}
                  <span className="hidden md:inline">Nuevo</span>
                </Button>
              }
            </div>

            <div className="flex flex-1 items-center">
              <ClientStatusPanel
                users={data as ClientInterface[]}
                onFilterChange={setStatusFilter}
              />

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="ml-auto">
                    {/* Icono para móviles */}
                    <Ellipsis className="h-4 w-4 md:hidden" />

                    {/* Texto para pantallas medianas en adelante */}
                    <span className="hidden md:inline">Columnas</span>

                    {/* Icono Chevron solo para pantallas grandes */}
                    <ChevronDown className="ml-2 h-4 w-4 hidden md:inline" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {table
                    .getAllColumns()
                    .filter((column) => column.getCanHide())
                    .map((column) => {
                      return (
                        <DropdownMenuCheckboxItem
                          key={column.id}
                          className="capitalize"
                          checked={column.getIsVisible()}
                          onCheckedChange={(value) => column.toggleVisibility(!!value)}
                        >
                          {column.id}
                        </DropdownMenuCheckboxItem>
                      )
                    })}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>
      </div>


      {/* Scroll interno para el content */}
      <div className="flex-1 overflow-y-auto">
        <div className="grid grid-cols-1 gap-4">
          <Card className="border-border">
            <Table className="w-full border-border table-auto">
              <TableHeader className='sticky top-0'>
                {table.getHeaderGroups().map((headerGroup) => (
                  <TableRow key={headerGroup.id}
                    className="border-border"
                  >
                    {headerGroup.headers.map((header) => {
                      return (
                        <TableHead key={header.id} className="w-[150px] text-center">
                          {header.isPlaceholder
                            ? null
                            : flexRender(
                              header.column.columnDef.header,
                              header.getContext()
                            )}
                        </TableHead>
                      )
                    })}
                  </TableRow>
                ))}
              </TableHeader>
              <TableBody>
                {table.getRowModel().rows?.length ? (
                  table.getRowModel().rows.map((row) => (
                    <TableRow key={row.id}
                      className="border-border"
                    >
                      {row.getVisibleCells().map((cell) => (
                        <TableCell key={cell.id} className="text-center align-middle truncate overflow-hidden whitespace-nowrap">
                          {/* <TableCell key={cell.id}> */}
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : (
                  <TableRow
                    className="border-border"
                  >
                    <TableCell colSpan={columns.length} className="h-24 text-center">
                      No hay resultados.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>

            <div className="flex items-center justify-end gap-2 p-4">
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
          </Card>
        </div>
      </div>
    </div>
  )
}
