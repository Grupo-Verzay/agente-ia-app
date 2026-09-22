/**
 * El rango de días de CRM › Llamadas (7 / 30 / 90).
 *
 * Vive aquí y no dentro de la pantalla porque lo pintan DOS sitios: la fila de
 * pestañas del CRM (`CrmDashboard`, que es quien tiene el mando) y la consulta
 * de `CallsCrmClient`, que es quien lo consume. Con la lista escrita en cada
 * uno, el día que se añada un rango se añade en uno y el otro se queda atrás —
 * y eso no se ve como un error: se ve como un botón que no cambia nada.
 */
export const RANGOS_DE_DIAS: { label: string; value: number }[] = [
    { label: "7 días", value: 7 },
    { label: "30 días", value: 30 },
    { label: "90 días", value: 90 },
];

/** El que se abre por defecto. */
export const DIAS_POR_DEFECTO = 30;
