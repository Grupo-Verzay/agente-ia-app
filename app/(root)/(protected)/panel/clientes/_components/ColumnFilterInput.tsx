import { useEffect, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table } from '@tanstack/react-table'

interface Props<TData> {
    table: Table<TData>
    initialValue?: string
    initialColumn?: FilterFields
}

type FilterFields = 'email' | 'name' | 'company' | 'reseller'

export function ColumnFilterInput<TData>({ table, initialValue, initialColumn }: Props<TData>) {
    const [selectedColumn, setSelectedColumn] = useState<FilterFields>(initialColumn ?? 'company')
    const [value, setValue] = useState<string>(initialValue ?? '')

    const handleFilter = (val: string, column: string) => {
        table.getAllColumns().forEach((col) => {
            if (col.id !== column) col.setFilterValue(undefined)
        })

        table.getColumn(column)?.setFilterValue(val)
    }

    useEffect(() => {
        if (initialValue) handleFilter(initialValue, initialColumn ?? 'company')
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    return (
        <div className="flex flex-row gap-2 shrink-0">
            {/* Select */}
            <Select
                value={selectedColumn}
                onValueChange={(val: FilterFields) => {
                    setSelectedColumn(val)
                    setValue('')
                    handleFilter('', val)
                }}
            >
                <SelectTrigger className="w-[120px]">
                    <SelectValue placeholder="Filtrar por..." />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="company">Empresa</SelectItem>
                    <SelectItem value="name">Nombre</SelectItem>
                    <SelectItem value="email">Correo</SelectItem>
                    <SelectItem value="reseller">Marca</SelectItem>
                </SelectContent>
            </Select>

            {/* Input */}
            <Input
                placeholder={`Buscar por ${selectedColumn}...`}
                value={value}
                onChange={(e) => {
                    const val = e.target.value
                    setValue(val)
                    handleFilter(val, selectedColumn)
                }}
                className="w-72 shrink-0"
            />
        </div>
    )
}
