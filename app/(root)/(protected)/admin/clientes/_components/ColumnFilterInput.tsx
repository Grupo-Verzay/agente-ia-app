import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table } from '@tanstack/react-table'

interface Props<TData> {
    table: Table<TData>
}

type FilterFields = 'email' | 'name' | 'company' | 'reseller'

export function ColumnFilterInput<TData>({ table }: Props<TData>) {
    const [selectedColumn, setSelectedColumn] = useState<FilterFields>('email')
    const [value, setValue] = useState<string>('')

    const handleFilter = (val: string, column: string) => {
        table.getAllColumns().forEach((col) => {
            if (col.id !== column) col.setFilterValue(undefined)
        })

        table.getColumn(column)?.setFilterValue(val)
    }

    return (
        <div className="flex flex-col sm:flex-row gap-2 w-full">
            {/* Select */}
            <Select
                value={selectedColumn}
                onValueChange={(val: FilterFields) => {
                    setSelectedColumn(val)
                    setValue('')
                    handleFilter('', val)
                }}
            >
                <SelectTrigger className="sm:max-w-[180px]">
                    <SelectValue placeholder="Filtrar por..." />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="email">Correo</SelectItem>
                    <SelectItem value="name">Nombre</SelectItem>
                    <SelectItem value="company">Empresa</SelectItem>
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
                className="flex-1"
            />
        </div>
    )
}
