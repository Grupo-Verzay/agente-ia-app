/**
 * La URL de una hoja de Google, y cómo se reconoce.
 *
 * El elemento «Leer Google Sheets» pide que se pegue la URL de la barra del
 * navegador con la pestaña abierta, porque ahí viaja el `gid` —la pestaña— y la
 * herramienta lo lee de ahí. Cualquier otra cosa pegada en ese campo llega
 * hasta la conversación y falla allí, que es donde peor se ve.
 *
 * Comprobar es solo esto: que sea una URL de `docs.google.com` y que su ruta
 * sea de `spreadsheets`. Ni se pide el `gid` —una hoja de una sola pestaña no
 * lo lleva— ni se toca el resto: el enlace se guarda tal cual se pegó.
 */
export function esUrlDeGoogleSheets(url: string | null | undefined): boolean {
    const texto = (url ?? "").trim();
    if (!texto) return false;

    try {
        const partes = new URL(texto);
        if (partes.protocol !== "https:" && partes.protocol !== "http:") return false;
        if (partes.hostname !== "docs.google.com") return false;
        return partes.pathname.startsWith("/spreadsheets/");
    } catch {
        return false;
    }
}
