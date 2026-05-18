"use client"

import { useState } from "react"
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
} from "@tanstack/react-table"
import { ChevronDown, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Ellipsis } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
    DropdownMenu,
    DropdownMenuCheckboxItem,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"
import { Card } from "@/components/ui/card"


interface DataTableProps<TData, TValue> {
    columns: ColumnDef<TData, TValue>[];
    data: TData[];
    onCreateClick?: () => void;
};

const dictionaryFields = {
    id: 'ID',
    url: 'Url',
    key: 'Api key',
    createdAt: 'Fecha de creación',
    updatedAt: 'Última actualización'
};

export const DataGrid = <TData, TValue>({
    columns,
    data,
    onCreateClick,
}: DataTableProps<TData, TValue>) => {
    const [sorting, setSorting] = useState<SortingState>([
        { id: "url", desc: false }
    ])
    const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])
    const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({
        id: false, // Oculta la columna id
        updatedAt: false // Oculta la columna updatedAt
    })
    const [rowSelection, setRowSelection] = useState({})
    const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 20 })

    const table = useReactTable({
        data,
        columns,
        onSortingChange: setSorting,
        onColumnFiltersChange: setColumnFilters,
        getCoreRowModel: getCoreRowModel(),
        getPaginationRowModel: getPaginationRowModel(),
        getSortedRowModel: getSortedRowModel(),
        getFilteredRowModel: getFilteredRowModel(),
        onColumnVisibilityChange: setColumnVisibility,
        onRowSelectionChange: setRowSelection,
        onPaginationChange: setPagination,
        state: {
            sorting,
            pagination,
            columnFilters,
            columnVisibility,
            rowSelection,
        },
    })

    return (
        <div className="flex flex-col h-full gap-2">
            {/* Toolbar fuera de la card — sobre fondo gris */}
            <div className="sticky top-0 z-1">
                <div className="flex items-center gap-2">
                    <Input
                        placeholder="Evo conexión..."
                        value={(table.getColumn("url")?.getFilterValue() as string) ?? ""}
                        onChange={(event) =>
                            table.getColumn("url")?.setFilterValue(event.target.value)
                        }
                        className="w-72 shrink-0"
                    />
                    {onCreateClick && (
                        <Button onClick={onCreateClick} className="bg-blue-600 hover:bg-blue-700 text-white">
                            + Nuevo
                        </Button>
                    )}
                    <div className="ml-auto flex items-center gap-1">
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
                                    .map((column) => {
                                        const label = dictionaryFields[column.id as keyof typeof dictionaryFields] || column.id;
                                        return (
                                            <DropdownMenuCheckboxItem
                                                key={column.id}
                                                className="capitalize"
                                                checked={column.getIsVisible()}
                                                onCheckedChange={(value) =>
                                                    column.toggleVisibility(!!value)
                                                }
                                            >
                                                {label}
                                            </DropdownMenuCheckboxItem>
                                        )
                                    })}
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
                                    const a = document.createElement('a'); a.href = url; a.download = 'conexiones.csv'; a.click();
                                    URL.revokeObjectURL(url);
                                }}>
                                    Exportar CSV
                                </DropdownMenuItem>
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
                                <TableRow className="border-border" key={headerGroup.id}>
                                    {headerGroup.headers.map((header) => (
                                        <TableHead key={header.id}>
                                            {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                                        </TableHead>
                                    ))}
                                </TableRow>
                            ))}
                        </TableHeader>
                        <TableBody>
                            {table.getRowModel().rows?.length ? (
                                table.getRowModel().rows.map((row) => (
                                    <TableRow className="border-border" key={row.id} data-state={row.getIsSelected() && "selected"}>
                                        {row.getVisibleCells().map((cell) => (
                                            <TableCell key={cell.id}>
                                                {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                            </TableCell>
                                        ))}
                                    </TableRow>
                                ))
                            ) : (
                                <TableRow>
                                    <TableCell colSpan={columns.length} className="h-24 text-center border-border">
                                        No results.
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </div>
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