'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { InsigniaDeCuenta } from '@/components/shared/InsigniaDeCuenta';

/**
 * La columna «Cuenta», que solo existe cuando se está consolidando.
 *
 * Sin ella una lista consolidada es un revoltijo: veinte ventas de tres
 * empresas seguidas, ordenadas por fecha y sin decir de quién es cada una. Y
 * está escrita **una vez** porque la usan las cuatro listas —Ventas, Gastos,
 * Clientes y Proveedores—: copiada en cada una, el día que se afine el ancho o
 * el recorte se afina en una y las otras tres se quedan atrás.
 *
 * Va la PRIMERA de la tabla a propósito: es lo que agrupa la lectura, así que
 * puesta al final habría que recorrer la fila entera para saber de dónde sale.
 */
export function columnaDeCuenta<T>(
    duenoDeLaFila: (fila: T) => string | null | undefined,
    nombres: Record<string, string>,
): ColumnDef<T> {
    return {
        id: 'cuenta',
        header: 'Cuenta',
        enableSorting: false,
        // `accessorFn` y no solo `cell`: sin él el buscador de la tabla no mira
        // esta columna, y buscar por el nombre de una cuenta es justo lo que se
        // hace en una lista consolidada.
        accessorFn: (fila) => nombres[String(duenoDeLaFila(fila) ?? '')] ?? '',
        cell: ({ getValue }) => <InsigniaDeCuenta nombre={getValue() as string} />,
    };
}
