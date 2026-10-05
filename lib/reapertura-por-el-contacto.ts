/**
 * Cuándo una conversación ARCHIVADA o RESUELTA vuelve a la bandeja.
 *
 * La regla es una, y es la misma que la de la marca de borrado: **solo un
 * mensaje DEL CONTACTO posterior a la marca la levanta.** Nada más.
 *
 * Los dos fallos que esto cierra, y son el mismo al revés:
 *
 * - **Resuelta que se reabría sola.** La regla vieja la devolvía con cualquier
 *   mensaje posterior a `resolved_at`, también los SALIENTES: un seguimiento
 *   automático, un recordatorio o la IA, tres o cuatro días después, sacaban
 *   conversaciones en las que el cliente no había dicho nada.
 * - **Archivada que no salía nunca.** Nada quitaba `archivedAt` salvo el
 *   botón de desarchivar, así que el cliente escribía y su conversación se
 *   quedaba escondida en el archivo.
 *
 * Y la marca se LEVANTA, no se evalúa al pintar: si se evaluara, el mensaje del
 * contacto la haría visible y la respuesta de la IA, segundos después, la
 * volvería a esconder (el último ya no sería del contacto). Es la lección que
 * ya costó una tarde con la marca de borrado.
 *
 * Puro: lo usan la pantalla (que levanta en memoria al momento) y el banco.
 * El servidor dice lo mismo en SQL (`levantarArchivosYResueltas`).
 */

export type UltimoMensaje = {
    /** En milisegundos o segundos: se normaliza aquí. */
    ts: number;
    /** `true` si lo mandó el negocio (asesor, IA, seguimiento, campaña…). */
    fromMe: boolean | null | undefined;
};

/** Evolution da las horas en segundos o en milisegundos: todo a milisegundos. */
export function aMs(valor: number): number {
    if (!Number.isFinite(valor) || valor <= 0) return 0;
    return valor < 1e12 ? valor * 1000 : valor;
}

/**
 * ¿Se levanta esta marca con este último mensaje?
 *
 * Sin marca no hay nada que levantar. Sin último mensaje, tampoco. Un mensaje
 * propio NUNCA la levanta, por nuevo que sea: eso es lo que reabría solas las
 * resueltas. Y `fromMe` desconocido no cuenta como del contacto: para LEVANTAR
 * hace falta la prueba, al revés que para enseñar.
 */
export function laMarcaSeLevanta(
    marca: string | number | Date | null | undefined,
    ultimo: UltimoMensaje | null | undefined,
): boolean {
    if (marca == null || marca === "") return false;
    const marcaMs = marca instanceof Date ? marca.getTime() : typeof marca === "number" ? aMs(marca) : new Date(marca).getTime();
    if (!Number.isFinite(marcaMs) || marcaMs <= 0) return false;
    if (!ultimo || ultimo.fromMe !== false) return false;
    return aMs(ultimo.ts) > marcaMs;
}
