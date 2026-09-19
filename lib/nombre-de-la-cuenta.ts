/**
 * Cómo se llama una cuenta en una lista. **Puro**, para que lo puedan usar el
 * servidor y un componente de cliente.
 *
 * `User.company` nace con **«Empresa Demo»** por defecto y casi nadie lo
 * cambia, así que un selector que la pinte a secas saca **la misma etiqueta
 * para todas**: en producción, el diálogo de permisos de Documentación ofrecía
 * tres filas «Empresa Demo» y no había forma de saber cuál era cuál.
 *
 * El orden es el que ya usaban a mano la barra lateral, el título de la
 * pestaña, Analíticas y Mis estadísticas —seis sitios con la misma condición
 * escrita a mano—:
 *
 * 1. La **empresa**, si de verdad se rellenó. Para una cuenta cliente es el
 *    nombre bueno: «Acme SAS» dice más que «Juan Pérez».
 * 2. El **nombre** de la cuenta, que es lo que tienen puesto las de la casa
 *    («Verzay | Atencion»).
 * 3. El **correo**, que siempre está.
 *
 * Y el correo va aparte, como detalle: dos cuentas se pueden llamar igual y ahí
 * es donde se distinguen.
 */

/** Lo que `User.company` trae cuando nadie lo ha tocado. */
export const EMPRESA_POR_DEFECTO = "Empresa Demo";

export function nombreDeLaCuenta(cuenta: {
    company?: string | null;
    name?: string | null;
    email?: string | null;
}): string {
    const empresa = (cuenta?.company ?? "").trim();
    if (empresa && empresa !== EMPRESA_POR_DEFECTO) return empresa;

    const nombre = (cuenta?.name ?? "").trim();
    if (nombre) return nombre;

    return (cuenta?.email ?? "").trim();
}
