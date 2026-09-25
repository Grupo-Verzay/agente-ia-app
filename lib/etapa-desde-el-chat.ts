/**
 * «Se cambió una etapa desde el chat»: la marca que evita que el tablero se
 * abra con la foto de antes.
 *
 * El tablero lee `embudo_posiciones` en CADA carga, así que el dato ya está
 * cambiado ahí en cuanto la acción escribe. Lo único que puede taparlo es el
 * **caché del enrutador**: Next 14 guarda una página dinámica 30 s en el
 * navegador, así que ir a Chats, mover la etapa y volver a Embudos dentro de
 * ese rato pinta lo de antes.
 *
 * **No se cierra con `revalidatePath`, y ese es el motivo de que esto exista.**
 * Desde una acción de servidor, revalidar obliga a re-renderizar la ruta
 * ACTUAL: llamado desde el chat, eso es la pantalla de Chats entera —la más
 * cara de la App— en cada cambio de etapa; llamado desde el tablero, la
 * consulta de 500 tarjetas en cada arrastre. Justo el coste que este
 * repositorio evita.
 *
 * Así que la marca la deja el navegador que hizo el cambio y la recoge el
 * tablero al montarse, **en la misma pestaña**, que es el camino de verdad
 * (Chats → Embudos). Cuando no hay marca no se pide nada: el caso normal
 * —abrir el tablero sin haber tocado nada— no paga ni una consulta.
 *
 * Vive en `sessionStorage` y **cada acceso va en su `try`**: en una ventana
 * privada tocar el almacenamiento lanza, y por eso no puede caerse ni el chat
 * ni el tablero. Sin almacenamiento se vuelve a lo de siempre —el tablero se
 * refresca al navegar— que es el lado seguro: se ve de menos por unos
 * segundos, nunca una etapa que no es.
 */

export const LLAVE_DEL_CAMBIO = "embudos:etapa-cambiada";

/** Deja la marca. La pone quien acaba de mover una etapa fuera del tablero. */
export function anotarCambioDeEtapa(): void {
    try {
        window.sessionStorage.setItem(LLAVE_DEL_CAMBIO, "1");
    } catch {
        // Sin almacenamiento el tablero se refresca al navegar, como siempre.
    }
}

/**
 * ¿Hubo un cambio desde el chat? Se lee **una sola vez**: la marca se borra al
 * leerla. Dejándola puesta, el tablero volvería a pedir sus datos en cada
 * montaje de la pestaña por un cambio que ya recogió.
 */
export function huboCambioDeEtapa(): boolean {
    try {
        if (window.sessionStorage.getItem(LLAVE_DEL_CAMBIO) === null) return false;
        window.sessionStorage.removeItem(LLAVE_DEL_CAMBIO);
        return true;
    } catch {
        return false;
    }
}
