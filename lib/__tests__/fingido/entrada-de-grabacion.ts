/**
 * La entrada que se empaqueta para el banco del módulo de grabación.
 *
 * Se reexporta la función REAL (`laCuentaPuedeGrabar`) y el cliente `db`, para
 * que el banco siembre y pregunte con el mismo módulo que corre en producción.
 * No hay `currentUser()` de por medio: `laCuentaPuedeGrabar` recibe la cuenta,
 * así que aquí no hace falta fingir la sesión.
 */
export { laCuentaPuedeGrabar, RUTA_DE_GRABACIONES } from "@/lib/grabacion-de-reunion.server";
export { db } from "@/lib/db";
