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
import { ChevronDown, Ellipsis } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { ClientInterface } from '@/lib/types'

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[]
  data: TData[]
  currentUserRol: string
  openCreateDialogUser: () => void
  setStatusFilter: (status: StatusKey | null) => void
}

const VISIBILITY_STORAGE_KEY = 'admin-clientes-column-visibility'

export function DataTable<TData, TValue>({ columns, data, currentUserRol, openCreateDialogUser, setStatusFilter }: DataTableProps<TData, TValue>) {
  const [sorting, setSorting] = useState<SortingState>([])
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({})

  useEffect(() => {
    try {
      const saved = localStorage.getItem(VISIBILITY_STORAGE_KEY)
      if (saved) setColumnVisibility(JSON.parse(saved))
    } catch {
      // ignore
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
        <div className="flex justify-between items-center gap-2">
          <div className="flex flex-row flex-1 gap-2">

            <div className="flex flex-col sm:flex-row items-centerem gap-2 flex-1">
              <ColumnFilterInput table={table} />

              {/* button-create-client */}
              {(currentUserRol === 'admin' || currentUserRol === 'super_admin') &&

                <Button onClick={openCreateDialogUser}>
                  Nuevo
                </Button>
              }
            </div>

            <div className="ml-auto flex items-center gap-1">
              <ClientStatusPanel
                users={data as ClientInterface[]}
                onFilterChange={setStatusFilter}
              />

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline">
                    <Ellipsis className="h-4 w-4 md:hidden" />
                    <span className="hidden md:inline">Columnas</span>
                    <ChevronDown className="ml-2 h-4 w-4 hidden md:inline" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {table
                    .getAllColumns()
                    .filter((column) => column.getCanHide())
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

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="icon">
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
                        <TableHead key={header.id} className="text-left px-2">
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
                        <TableCell key={cell.id} className="text-left align-middle truncate overflow-hidden whitespace-nowrap py-2">
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
