/**
 * La cuenta REAL «Verzay Ventas» que Verzy enseña durante la videollamada
 * (navegada en vivo por `lib/pantalla-de-verzy.server.ts`) y el orden del
 * inicio de la llamada. Puro: lo usan el servidor, la sala y el banco.
 */

/** El nombre de la cuenta a la que entra Verzy, si no viene `VERZY_CUENTA_ID`. */
export const NOMBRE_DE_LA_CUENTA_DE_VERZY = "Verzay Ventas";

const sinTildes = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "");

/** Compara nombres de cuenta sin mayúsculas, tildes, barras ni espacios de más. */
export function laLlaveDelNombreDeCuenta(nombre: string | null | undefined): string {
    return sinTildes(String(nombre ?? "")).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/** ¿Esta cuenta es la de Verzy? «Verzay | Ventas», «Verzay Ventas», «verzay-ventas». */
export function esLaCuentaDeVerzy(nombre: string | null | undefined): boolean {
    return laLlaveDelNombreDeCuenta(nombre) === laLlaveDelNombreDeCuenta(NOMBRE_DE_LA_CUENTA_DE_VERZY);
}

/* ── El orden del inicio de la llamada ─────────────────────────────────── */

/** Lo PRIMERO que dice Verzy, sin esperar: y lo mismo si el cliente habla antes. */
export const SALUDO_INICIAL = "Hola, muy buenas, ¿me escuchas?";

/** La segunda pregunta, cuando el cliente confirma que escucha. */
export const SEGUNDA_PREGUNTA = "¿Qué te gustaría resolver hoy en esta reunión?";
