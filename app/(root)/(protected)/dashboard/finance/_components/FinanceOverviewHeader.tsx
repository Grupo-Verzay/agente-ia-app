import { FinanceModuleShortcuts } from './FinanceModuleShortcuts';

/**
 * La cabecera de Finanzas: los accesos a cada módulo y nada más.
 *
 * # Por qué se fueron las cuatro tarjetas
 *
 * Iban aquí Ingresos, Gastos, Balance y Transacciones, a todo lo ancho y
 * pegadas arriba en todas las pantallas de Finanzas. Eran **cuatro cifras
 * sueltas que no se podían usar**: no filtran nada, y los sitios a los que
 * llevaban ya están en la fila de accesos de abajo —Ventas, Compras, Cuentas—,
 * así que lo único que hacían era ocupar la fila que le falta a la tabla.
 *
 * Es la misma regla que ya vació las veintidós pantallas de lista: **si la
 * métrica filtra la lista de abajo es una pastilla en la barra; si no filtra
 * nada, se borra.** Estas no filtraban nada.
 *
 * Y los números no se pierden: el balance de cada mes está en el resumen anual
 * de `/dashboard/finance`, que además responde al selector de cuentas.
 *
 * # Ya no es un componente de cliente
 *
 * Solo lo era por el `fetch` a `/api/finance/overview` que alimentaba esas
 * tarjetas. Sin ellas no queda estado que llevar: el mes lo lee
 * `FinanceModuleShortcuts` de la URL por su cuenta, como ya hacía cuando no se
 * le pasaba la prop.
 */
export function FinanceOverviewHeader() {
  return (
    <div className="sticky top-0 z-50 border-b bg-background px-1 py-1 shadow-sm">
      <FinanceModuleShortcuts />
    </div>
  );
}
