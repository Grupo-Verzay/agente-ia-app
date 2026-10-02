/**
 * Lo que la pantalla de Conexión y Ajustes (`/profile`) y su guía pública
 * (`lib/guia-conexion.ts`) tienen que decir IGUAL: los nombres de sus ocho
 * pestañas, en su orden.
 *
 * Puro: lo usan la pantalla, la guía y el banco. Con los nombres escritos en
 * los dos sitios, el día que una pestaña cambie de nombre la guía la seguiría
 * llamando como antes y nadie lo notaría.
 */

/** Las pestañas de Conexión y Ajustes, en su orden. `value` es la llave interna. */
export const PESTANAS_DEL_PERFIL = [
    { value: "conexion", label: "Conexión" },
    { value: "integraciones", label: "Integraciones" },
    { value: "preferencias", label: "Preferencias" },
    { value: "comportamiento", label: "Comportamiento" },
    { value: "herramientas", label: "Herramientas" },
    { value: "cuenta", label: "Cuenta" },
    { value: "seguridad", label: "Seguridad" },
    { value: "apariencia", label: "Apariencia" },
] as const;

export type PestanaDelPerfil = (typeof PESTANAS_DEL_PERFIL)[number]["value"];

/** El monto con su moneda, o «—» si no hay precio. */
export function elMonto(precio: string | number | null | undefined, moneda: string | null | undefined): string {
    if (!precio || Number(precio) === 0) return "—";
    return new Intl.NumberFormat("es", { style: "currency", currency: moneda || "COP", maximumFractionDigits: 0 }).format(Number(precio));
}

/**
 * El monto de la tarjeta «Plan actual»: con su moneda y «/mes». El formato con
 * moneda ya escribe «COP», así que no se le vuelve a pegar: salía
 * «250.000 COP COP/mes».
 */
export function elMontoAlMes(precio: string | number | null | undefined, moneda: string | null | undefined): string {
    const monto = elMonto(precio, moneda);
    return monto === "—" ? monto : `${monto}/mes`;
}

/** El valor con el que nace `User.mapsUrl`: significa «sin enlace». */
export const ENLACE_DE_MAPS_POR_DEFECTO = "https://maps.google.com/?q=0,0";

/** ¿La cuenta tiene su enlace de Google Maps puesto? El de por defecto no cuenta. */
export function tieneEnlaceDeMaps(url: string | null | undefined): boolean {
    return !!url?.trim() && url.trim() !== ENLACE_DE_MAPS_POR_DEFECTO;
}
