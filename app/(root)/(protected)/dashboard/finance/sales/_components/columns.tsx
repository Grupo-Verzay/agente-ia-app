'use client';

import type { ColumnDef } from '@tanstack/react-table';
import type { VentaSerializada } from '@/actions/finance-sales-actions';

import { AccionesDeLaFila } from '../../_components/AccionesDeLaFila';
import {
  columnaDeCategoria,
  columnaDeConcepto,
  columnaDeCuentaDeFinanzas,
  columnaDeFecha,
  columnaDeSoportes,
  columnaDeTotal,
} from '../../_components/ColumnasDeMovimientos';
import { elTotalDeLaVenta, type MonedaDeFinanzas } from '@/lib/tabla-de-finanzas';

/**
 * Una fila de la tabla de ventas es, literalmente, lo que devuelve
 * `getAllSales`. Antes era un tipo suelto con `[key: string]: unknown`, asi
 * que cualquier columna que no estuviera en la lista corta salia como
 * `unknown` y no se podia ni pintar: de ahi salian ocho errores en la
 * pantalla de ventas.
 */
export type SaleTxRow = VentaSerializada;

type BuildColsArgs = {
  monedas: readonly MonedaDeFinanzas[];
  onEdit: (row: SaleTxRow) => void;
  onDelete: (row: SaleTxRow) => Promise<boolean>;
  busy?: boolean;
  /**
   * Una fila de otra cuenta se ve y no se toca. Las acciones de escritura de
   * Finanzas acotan por la cuenta con la que se llaman, así que el lápiz y la
   * papelera sobre una fila ajena contestarían «no encontrada»: menú abierto,
   * puerta cerrada. Para editarla se entra a esa cuenta.
   */
  esDeOtraCuenta?: (row: SaleTxRow) => boolean;
};

/** Las columnas de Ventas: las mismas que Gastos, en el mismo orden (`ColumnasDeMovimientos`). */
export function buildSalesColumns({ monedas, onEdit, onDelete, busy, esDeOtraCuenta }: BuildColsArgs): ColumnDef<SaleTxRow>[] {
  return [
    columnaDeConcepto<SaleTxRow>((f) => f.title),
    columnaDeCategoria<SaleTxRow>(),
    columnaDeTotal<SaleTxRow>(monedas, (f) => elTotalDeLaVenta(f)),
    columnaDeFecha<SaleTxRow>(),
    columnaDeCuentaDeFinanzas<SaleTxRow>(),
    columnaDeSoportes<SaleTxRow>(),
    {
      id: 'actions',
      header: '',
      enableHiding: false,
      enableSorting: false,
      cell: ({ row }) => (
        <AccionesDeLaFila
          queEs="la venta"
          nombre={row.original.title}
          ajena={esDeOtraCuenta?.(row.original)}
          ocupado={busy}
          onEditar={() => onEdit(row.original)}
          onEliminar={() => onDelete(row.original)}
        />
      ),
    },
  ];
}
