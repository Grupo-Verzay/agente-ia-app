'use client';

import { ColumnDef } from '@tanstack/react-table';

import { Badge } from '@/components/ui/badge';
import { AccionesDeLaFila } from '../../_components/AccionesDeLaFila';
import {
    columnaDeCategoria,
    columnaDeConcepto,
    columnaDeCuentaDeFinanzas,
    columnaDeFecha,
    columnaDeSoportes,
    columnaDeTotal,
} from '../../_components/ColumnasDeMovimientos';
import { comoImporte, type MonedaDeFinanzas } from '@/lib/tabla-de-finanzas';

export type ExpenseRow = {
    id: string;
    /** De qué cuenta es la fila. Solo se mira al consolidar. */
    userId?: string | null;
    occurredAt: string | Date;
    amount: string | number | null;
    currencyCode: string;
    title?: string | null;
    description?: string | null;
    counterparty?: string | null;

    accountId: string;
    categoryId?: string | null;

    account?: { name: string } | null;
    category?: { name: string } | null;
    attachments?: { id?: string; url: string; fileName?: string | null; mimeType?: string | null; sizeBytes?: number | null }[];
};

//  regla simple para “Fijo/Variable” (ajústala a tu negocio)
function expenseKind(categoryName?: string | null) {
    const fixed = new Set(['Nomina', 'Nómina', 'Salarios', 'Servidores', 'API', 'Herramientas']);
    if (!categoryName) return 'Variable';
    return fixed.has(categoryName) ? 'Fijo' : 'Variable';
}

export function buildExpenseColumns(opts: {
    monedas: readonly MonedaDeFinanzas[];
    onEdit: (row: ExpenseRow) => void;
    onDelete: (row: ExpenseRow) => Promise<boolean>;
    busy?: boolean;
    /**
     * Una fila de otra cuenta se ve y no se toca. Las acciones de escritura de
     * Finanzas acotan por la cuenta con la que se llaman, así que el menú sobre
     * una fila ajena contestaría «no encontrado»: menú abierto, puerta cerrada.
     * Para editarla se entra a esa cuenta.
     */
    esDeOtraCuenta?: (row: ExpenseRow) => boolean;
}): ColumnDef<ExpenseRow>[] {
    // Las mismas columnas que Ventas y en el mismo orden (`ColumnasDeMovimientos`);
    // «Tipo» es la única propia: Fijo/Variable solo tiene sentido en un gasto.
    return [
        columnaDeConcepto<ExpenseRow>((f) => f.counterparty || f.title),
        columnaDeCategoria<ExpenseRow>(),
        {
            id: 'tipo',
            accessorFn: (f) => expenseKind(f.category?.name ?? null),
            header: 'Tipo',
            cell: ({ row }) => (
                <Badge variant="secondary" className="h-6 rounded-md px-2 text-[11px] font-medium">
                    {expenseKind(row.original.category?.name ?? null)}
                </Badge>
            ),
        },
        columnaDeTotal<ExpenseRow>(opts.monedas, (f) => comoImporte(f.amount)),
        columnaDeFecha<ExpenseRow>(),
        columnaDeCuentaDeFinanzas<ExpenseRow>(),
        columnaDeSoportes<ExpenseRow>(),
        {
            id: 'actions',
            enableHiding: false,
            enableSorting: false,
            header: '',
            cell: ({ row }) => (
                <AccionesDeLaFila
                    queEs="el gasto"
                    nombre={row.original.counterparty || row.original.title}
                    ajena={opts.esDeOtraCuenta?.(row.original)}
                    ocupado={opts.busy}
                    onEditar={() => opts.onEdit(row.original)}
                    onEliminar={() => opts.onDelete(row.original)}
                />
            ),
        },
    ];
}
