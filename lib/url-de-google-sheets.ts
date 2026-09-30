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

/**
 * La dirección del CSV de una hoja de Google, a partir de la que se pegó.
 *
 * Se rearma SIEMPRE contra `docs.google.com` con el id de la hoja: lo que llega
 * del navegador no decide a qué servidor va a pedir la App.
 *
 * El `gid` —la pestaña— sale de `?gid=` o de `#gid=`, y solo si son dígitos.
 * Sin él no se manda: Google exporta la PRIMERA pestaña. Antes se mandaba
 * `&gid=` vacío cuando la URL no lo traía (`"".trim() ?? "0"` nunca cae en el
 * `"0"`: una cadena vacía no es nula), y un `#heading=…` se colaba entero.
 */
export function laUrlDelCsv(url: string | null | undefined): string | null {
    const texto = (url ?? "").trim();
    if (!texto) return null;
    try {
        const partes = new URL(texto);
        const id = /\/spreadsheets\/d\/([^/?#]+)/.exec(partes.pathname)?.[1];
        if (!id) return null;
        const gid = [partes.searchParams.get("gid") ?? "", /(?:^|[#&])gid=(\d+)/.exec(partes.hash)?.[1] ?? ""].find((g) =>
            /^\d+$/.test(g),
        );
        const csv = `https://docs.google.com/spreadsheets/d/${encodeURIComponent(decodeURIComponent(id))}/export?format=csv`;
        return gid ? `${csv}&gid=${gid}` : csv;
    } catch {
        return null;
    }
}
