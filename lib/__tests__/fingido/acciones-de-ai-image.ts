/**
 * Las acciones de la pantalla de AI imágenes, fingidas para el banco de
 * navegador.
 *
 * Las mudas genéricas no valen aquí: `generateAdImage` tiene que devolver una
 * imagen DE VERDAD —una dirección `data:` que el `<img>` pueda pintar— o no
 * habría vista previa junto a la que medir el texto, que es justo lo que este
 * banco viene a comprobar.
 *
 * Y `generarCopyDelAnuncio` contesta un texto DISTINTO por red y por vuelta:
 * distinto por red, para poder afirmar que el copy sigue al formato de la
 * previa; distinto por vuelta, para que «volver a generar» se note.
 */

/** Un PNG de un píxel: suficiente para que el `<img>` de la previa pinte algo. */
const UN_PIXEL =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

let vuelta = 0;

export async function generateAdImage(): Promise<string> {
    return UN_PIXEL;
}

export async function generarCopyDelAnuncio(
    _imagen: string,
    formato: string,
): Promise<{ ok: boolean; copy?: string; red?: string; motivo?: string }> {
    vuelta += 1;
    const red = formato === "9:16" ? "whatsapp" : formato === "16:9" ? "facebook" : "instagram";
    return { ok: true, red, copy: `COPY-${red}-v${vuelta}` };
}

export async function saveUserGoogleApiKey() {
    return { success: true, message: "ok" };
}

export async function getUserVisualStyles() {
    return [];
}

export async function saveUserVisualStyle() {
    return { success: true };
}

export async function deleteUserVisualStyle() {
    return { success: true };
}
