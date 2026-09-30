/**
 * La fila de ACCESOS de Finanzas —la que va arriba en todas sus pantallas—:
 * qué hay, adónde lleva cada uno y cuál es la pantalla que se tiene delante.
 *
 * Está aquí, puro, y no escrito dentro del componente por dos motivos:
 *
 * 1. La guía pública (`lib/guia-finanzas.ts`) nombra estos accesos, y su banco
 *    los compara con esta lista: un acceso nuevo sin su sitio en la guía la
 *    pone en rojo.
 * 2. **Cuál está marcado** se decide con la RUTA, y hay dos accesos que
 *    comparten la de otro —«Compras» abre Gastos con el formulario de un gasto
 *    nuevo, y «Recibos de caja» Ventas con el de una venta—. Esos dos son un
 *    atajo para CREAR, no una pantalla: nunca se marcan, o al entrar a Gastos
 *    saldrían dos accesos encendidos a la vez.
 *
 * # Por qué hay «Resumen»
 *
 * La fila llevaba a las seis pantallas de Finanzas y no a la de partida: desde
 * Ventas, para volver al resumen había que subir a la pestaña «Finanzas» del
 * Panel. Todas las demás pantallas del módulo tenían su acceso y esta no.
 */

export type IdDeAcceso =
    | "summary"
    | "clients"
    | "products"
    | "providers"
    | "proposals"
    | "sales"
    | "expenses"
    | "purchases"
    | "cash-receipts"
    | "notes"
    | "accounts"
    | "settings";

export type AccesoDeFinanzas = {
    id: IdDeAcceso;
    etiqueta: string;
    ruta: string;
    /** Lleva el mes que se está mirando (`?month=`), para no perderlo al cambiar de pantalla. */
    conMes: boolean;
    /** Abre el formulario de algo nuevo (`&create=1`): es un atajo para crear, no una pantalla. */
    crea: boolean;
};

export const RUTA_DE_FINANZAS = "/dashboard/finance";

/** En el orden de partida. Cada persona los reordena arrastrando (`elOrdenDeLosAccesos`). */
export const ACCESOS_DE_FINANZAS: readonly AccesoDeFinanzas[] = [
    { id: "summary", etiqueta: "Resumen", ruta: RUTA_DE_FINANZAS, conMes: true, crea: false },
    { id: "clients", etiqueta: "Clientes", ruta: `${RUTA_DE_FINANZAS}/clients`, conMes: true, crea: false },
    { id: "products", etiqueta: "Productos", ruta: "/products", conMes: false, crea: false },
    { id: "providers", etiqueta: "Proveedores", ruta: `${RUTA_DE_FINANZAS}/providers`, conMes: true, crea: false },
    { id: "proposals", etiqueta: "Propuestas", ruta: "/cotizaciones", conMes: false, crea: false },
    { id: "sales", etiqueta: "Ventas", ruta: `${RUTA_DE_FINANZAS}/sales`, conMes: true, crea: false },
    { id: "expenses", etiqueta: "Gastos", ruta: `${RUTA_DE_FINANZAS}/expenses`, conMes: true, crea: false },
    { id: "purchases", etiqueta: "Compras", ruta: `${RUTA_DE_FINANZAS}/expenses`, conMes: true, crea: true },
    { id: "cash-receipts", etiqueta: "Recibos de caja", ruta: `${RUTA_DE_FINANZAS}/sales`, conMes: true, crea: true },
    { id: "notes", etiqueta: "Notas", ruta: "/notas", conMes: false, crea: false },
    { id: "accounts", etiqueta: "Cuentas", ruta: `${RUTA_DE_FINANZAS}/accounts`, conMes: true, crea: false },
    { id: "settings", etiqueta: "Configuración", ruta: `${RUTA_DE_FINANZAS}/settings`, conMes: false, crea: false },
];

export const ORDEN_DE_LOS_ACCESOS: readonly IdDeAcceso[] = ACCESOS_DE_FINANZAS.map((a) => a.id);

/** Adónde lleva un acceso, con el mes que se está mirando si le hace falta. */
export function elEnlaceDelAcceso(acceso: AccesoDeFinanzas, mes: string): string {
    const partes: string[] = [];
    if (acceso.conMes && mes) partes.push(`month=${mes}`);
    if (acceso.crea) partes.push("create=1");
    return partes.length ? `${acceso.ruta}?${partes.join("&")}` : acceso.ruta;
}

/**
 * El acceso de la pantalla que se tiene delante, o `null` si no es ninguna de
 * las de la fila. Se compara la ruta ENTERA —sin la barra final—: con un
 * «empieza por», el Resumen (`/dashboard/finance`) se encendería en todas.
 */
export function elAccesoActivo(ruta: string | null | undefined): IdDeAcceso | null {
    if (!ruta) return null;
    const limpia = ruta.split(/[?#]/)[0].replace(/\/+$/, "") || "/";
    return ACCESOS_DE_FINANZAS.find((a) => !a.crea && a.ruta === limpia)?.id ?? null;
}
