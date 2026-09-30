/**
 * La acción de la pantalla de Google Sheets, **anotando lo que se le pide**.
 *
 * El empaquetador de acciones mudas contesta `{ success: true, data: [] }` a
 * todo, y con eso no se puede afirmar lo que importa de esta pantalla: qué
 * llega al servidor. Un enlace que no sirve no tiene que llegar nunca; uno
 * bueno tiene que llegar LIMPIO; y quitar la hoja es mandar un vacío.
 *
 * Contesta con lo mismo que recibió (la acción de verdad devuelve el enlace
 * que quedó escrito). Es autónoma a propósito —no importa la regla del enlace—:
 * el modo roto la empaqueta con la pantalla de antes, donde esa regla no
 * existía.
 */
type Llamada = { userId: unknown; url: unknown };

export async function saveUserSheetsUrl(userId: unknown, url: unknown) {
    const w = globalThis as unknown as { __guardados?: Llamada[]; __respuesta?: unknown };
    (w.__guardados ??= []).push({ userId, url });
    if (w.__respuesta) return w.__respuesta;
    const texto = typeof url === "string" ? url.trim() : "";
    return { success: true, url: texto || null };
}
