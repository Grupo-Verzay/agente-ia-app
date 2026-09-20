'use client'

import { useCallback, useEffect, useState } from 'react'
import { Input } from '@/components/ui/input'
import {
    DropdownMenuLabel,
    DropdownMenuRadioGroup,
    DropdownMenuRadioItem,
    DropdownMenuSub,
    DropdownMenuSubContent,
    DropdownMenuSubTrigger,
} from '@/components/ui/dropdown-menu'
import { Search } from 'lucide-react'
import { Table } from '@tanstack/react-table'

/**
 * El buscador de Clientes: la caja va en la barra, el CAMPO en el `⋯`.
 *
 * # Qué pasaba
 *
 * El buscador venía con un desplegable de campo pegado —empresa, nombre, correo,
 * marca— ocupando 120 px fijos de la única fila que escasea, para un ajuste que
 * casi nadie toca: se busca por nombre y ya. Y encima ese desplegable estaba
 * `hidden sm:flex`, o sea que en un teléfono **no existía** y la pantalla
 * buscaba por empresa sin decirlo.
 *
 * Ahora la caja se queda sola y el campo vive dentro del `⋯`, que es donde la
 * regla de la barra manda lo que gasta ancho y no se usa a diario. El campo
 * elegido **se lee en el `placeholder`**: sin eso, mover el campo a un menú
 * escondido sería un buscador que a veces no encuentra lo que tienes delante y
 * no dice por qué.
 *
 * # Por qué son tres piezas y no un componente
 *
 * La caja va en `buscador` y el campo en `acciones`, que son dos huecos
 * distintos de `BarraDeAcciones`. Así que el estado es de quien pinta la barra
 * (`useFiltroDeColumna`) y las dos piezas lo reciben: con el estado dentro de
 * uno de los dos, el otro no podría leerlo.
 */
export type CampoDeBusqueda = 'email' | 'name' | 'company' | 'reseller'

export const NOMBRES_DE_CAMPO: Record<CampoDeBusqueda, string> = {
    company: 'empresa',
    name: 'nombre',
    email: 'correo',
    reseller: 'marca',
}

/** El de por defecto. Es por lo que se busca casi siempre. */
export const CAMPO_POR_DEFECTO: CampoDeBusqueda = 'name'

export function useFiltroDeColumna<TData>(
    table: Table<TData>,
    initialValue?: string,
    initialColumn?: CampoDeBusqueda,
) {
    const [campo, setCampo] = useState<CampoDeBusqueda>(initialColumn ?? CAMPO_POR_DEFECTO)
    const [valor, setValor] = useState<string>(initialValue ?? '')

    const filtrar = useCallback(
        (texto: string, columna: CampoDeBusqueda) => {
            // Solo una columna filtra a la vez: sin limpiar las demás, cambiar de
            // campo dejaría el filtro anterior puesto y la lista saldría vacía
            // sin que nada en pantalla lo explicara.
            table.getAllColumns().forEach((col) => {
                if (col.id !== columna) col.setFilterValue(undefined)
            })
            table.getColumn(columna)?.setFilterValue(texto)
        },
        [table],
    )

    useEffect(() => {
        if (initialValue) filtrar(initialValue, initialColumn ?? CAMPO_POR_DEFECTO)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    const escribir = (texto: string) => {
        setValor(texto)
        filtrar(texto, campo)
    }

    const elegirCampo = (siguiente: CampoDeBusqueda) => {
        setCampo(siguiente)
        // Lo escrito se conserva: cambiar de campo casi siempre es «esto que ya
        // tecleé, búscalo por lo otro». Vaciarlo obligaba a escribirlo dos veces.
        filtrar(valor, siguiente)
    }

    return { campo, elegirCampo, valor, escribir }
}

/** La caja. Va en el hueco `buscador` de la barra, fija a la izquierda. */
export function BuscadorDeColumna({
    campo,
    valor,
    onEscribir,
}: {
    campo: CampoDeBusqueda
    valor: string
    onEscribir: (texto: string) => void
}) {
    return (
        <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
                placeholder={`Buscar por ${NOMBRES_DE_CAMPO[campo]}...`}
                value={valor}
                onChange={(evento) => onEscribir(evento.target.value)}
                className="h-10 w-56 shrink-0 pl-8 sm:w-72"
            />
        </div>
    )
}

/** El campo, como submenú del `⋯`. */
export function CampoDeBusquedaMenu({
    campo,
    onCambiar,
}: {
    campo: CampoDeBusqueda
    onCambiar: (siguiente: CampoDeBusqueda) => void
}) {
    return (
        <DropdownMenuSub>
            <DropdownMenuSubTrigger>
                <Search className="h-4 w-4" />
                Buscar por
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
                <DropdownMenuLabel>Campo del buscador</DropdownMenuLabel>
                <DropdownMenuRadioGroup
                    value={campo}
                    onValueChange={(valor) => onCambiar(valor as CampoDeBusqueda)}
                >
                    {(Object.keys(NOMBRES_DE_CAMPO) as CampoDeBusqueda[]).map((clave) => (
                        <DropdownMenuRadioItem key={clave} value={clave} className="capitalize">
                            {NOMBRES_DE_CAMPO[clave]}
                        </DropdownMenuRadioItem>
                    ))}
                </DropdownMenuRadioGroup>
            </DropdownMenuSubContent>
        </DropdownMenuSub>
    )
}
