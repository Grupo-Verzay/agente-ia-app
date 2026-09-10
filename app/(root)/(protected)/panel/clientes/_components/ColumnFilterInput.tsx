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

const NOMBRES_DE_CAMPO: Record<FilterFields, string> = {
    company: 'empresa',
    name: 'nombre',
    email: 'correo',
    reseller: 'marca',
}

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
        <div className="flex min-w-0 flex-1 flex-row gap-2 sm:flex-none sm:shrink-0">
            {/* Select. En el teléfono no cabe junto al buscador y al botón de
                nuevo, así que ahí se busca por empresa —lo que se busca casi
                siempre— y el selector aparece a partir de tablet. */}
            <Select
                value={selectedColumn}
                onValueChange={(val: FilterFields) => {
                    setSelectedColumn(val)
                    setValue('')
                    handleFilter('', val)
                }}
            >
                <SelectTrigger className="hidden w-[120px] sm:flex">
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
                placeholder={`Buscar por ${NOMBRES_DE_CAMPO[selectedColumn]}...`}
                value={value}
                onChange={(e) => {
                    const val = e.target.value
                    setValue(val)
                    handleFilter(val, selectedColumn)
                }}
                className="min-w-0 flex-1 sm:w-72 sm:flex-none sm:shrink-0"
            />
        </div>
    )
}
