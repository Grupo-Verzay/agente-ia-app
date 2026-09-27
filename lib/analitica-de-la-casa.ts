import "server-only";

import {
    mandaEnLaCasa,
    mandaEnLaCasaDeVerdad,
    type PersonaDeLaCasa,
} from "@/lib/mando-de-la-casa";

/**
 * Quién ve la Analítica de la CASA: la de la plataforma entera, con sus tres
 * tarjetas internas.
 *
 * # Lo que pasaba
 *
 * `/panel/analytics` decidía con `isAdminLike(cuentaQueManda(...).role)` — o
 * sea, una cuenta administradora entraba y veía las estadísticas de
 * plataforma—, pero las tres tarjetas marcadas «interno» —Renovación mensual,
 * Actividad de instancias y Rendimiento de Chats— llevaban **su propia**
 * condición, `isSuperAdmin(cuenta.role)`, escrita tres veces en tres acciones.
 *
 * Resultado: la misma pantalla, abierta por dos cuentas de la casa, salía
 * distinta, y a la administradora le faltaban tres recuadros **sin un solo
 * aviso que lo explicara**. Es exactamente el síntoma que ya costó una sesión
 * con el bloque de vigilancia: «dos pantallas iguales lado a lado y en una
 * falta un recuadro».
 *
 * # La regla
 *
 * > Una cuenta **administradora** es de la casa, no un cliente: ve la
 * > Analítica completa, las mismas tarjetas que el súper administrador. Lo que
 * > separa a la casa de un cliente es el rol de la CUENTA por la que se actúa,
 * > no la marca «interno» de cada tarjeta.
 *
 * Y sigue cerrada para `user`, `affiliate` y `reseller`: esos ven su cartera
 * (`getAnalyticsDeMiCartera` / `getResellerAnalytics`), que es otra pantalla.
 *
 * # Una sola fórmula, y por eso vive aquí
 *
 * La usan **la página y las cuatro acciones** que la alimentan. Con la
 * condición escrita en cada una —que es como estaba— la pantalla y sus datos
 * pueden discrepar, y entonces la pantalla se pinta entera y sale a trozos: ni
 * «Acceso Denegado» ni error, solo huecos. Si se añade otra tarjeta interna a
 * Analíticas, **va por aquí** y no volviendo a preguntar por el rol.
 *
 * # Lo que NO cambia
 *
 * El **WhatsApp** de la vigilancia sigue saliendo solo hacia la cuenta de
 * superadministrador: eso lo decide `elSuperAdministrador`
 * (`actions/vigilancia-actions.ts`) y es otra pregunta —a quién se le avisa—,
 * no esta —quién puede mirar—.
 */
export async function puedeVerLaAnaliticaDeLaCasa(
    persona: PersonaDeLaCasa | null | undefined,
): Promise<boolean> {
    // Es la misma pregunta que la configuración de la plataforma, y vive en un
    // solo sitio (`lib/mando-de-la-casa.ts`).
    return mandaEnLaCasaDeVerdad(persona);
}

export { mandaEnLaCasa };
