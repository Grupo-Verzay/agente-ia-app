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
 * El id de una hoja, sacado de su enlace o dado tal cual.
 *
 * Es la regla que tenían COPIADA, letra por letra, las dos acciones que hablan
 * con Google (`google-sheets-actions` y `booking-form-actions`): el trozo que
 * va detrás de `/spreadsheets/d/`, o un id pelado de 30 caracteres o más. Vive
 * aquí para que no haya dos; y se conserva tal cual, porque cambiarla aquí
 * cambiaría a qué hoja escriben las integraciones que ya están funcionando.
 */
export function elIdDeLaHoja(texto: string | null | undefined): string | null {
    const limpio = (texto ?? "").trim();
    if (!limpio) return null;
    const enLaUrl = limpio.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
    if (enLaUrl) return enLaUrl[1];
    if (/^[a-zA-Z0-9_-]{30,}$/.test(limpio)) return limpio;
    return null;
}

/** Un id de hoja de verdad mide 44; por debajo de esto es un trozo de otra cosa. */
const LARGO_MINIMO_DEL_ID = 20;

export type HojaQueSeGuarda =
    | { ok: true; id: string; pestana: string | null; url: string }
    | { ok: false; motivo: string };

/**
 * Lo que la pantalla de Google Sheets (`/google-sheets`) acepta como «tu hoja»,
 * y cómo se guarda.
 *
 * Antes se guardaba cualquier texto: un enlace de un documento, de Drive o el
 * de «Publicar en la web» quedaban guardados, la pantalla escondía el campo
 * —ya había algo— y no pintaba ninguna hoja —no era una—. Sin el campo a la
 * vista no había forma de corregirlo, y así seguía al recargar: una pantalla
 * en blanco para siempre y sin un solo error.
 *
 * Lo decide esta función y la preguntan los dos lados —la pantalla antes de
 * mandar y la acción antes de escribir—, así que no pueden discrepar. Y se
 * guarda el enlace LIMPIO (`/edit`, con la pestaña si venía), no lo pegado:
 * de ese enlace salen el que se abre, el que se copia y el que se incrusta.
 */
export function laHojaQueSeGuarda(texto: string | null | undefined): HojaQueSeGuarda {
    const limpio = (texto ?? "").trim();
    if (!limpio) return { ok: false, motivo: "Pega el enlace de tu hoja de Google Sheets." };

    if (/^https?:\/\//i.test(limpio) || /^docs\.google\.com\//i.test(limpio)) {
        let partes: URL;
        try {
            partes = new URL(/^https?:\/\//i.test(limpio) ? limpio : `https://${limpio}`);
        } catch {
            return { ok: false, motivo: "Ese texto no es un enlace. Copia el enlace de la barra de direcciones de tu hoja." };
        }
        if (partes.hostname !== "docs.google.com" || !partes.pathname.startsWith("/spreadsheets/")) {
            return { ok: false, motivo: "Ese enlace no es de una hoja de Google Sheets. Abre tu hoja y copia el enlace de la barra de direcciones." };
        }
        if (partes.pathname.startsWith("/spreadsheets/d/e/")) {
            return {
                ok: false,
                motivo: "Ese es el enlace de «Publicar en la web». Copia el enlace de la barra de direcciones de tu hoja.",
            };
        }
    }

    const id = elIdDeLaHoja(limpio);
    if (!id || id.length < LARGO_MINIMO_DEL_ID) {
        return { ok: false, motivo: "Ese enlace no es de una hoja de Google Sheets. Abre tu hoja y copia el enlace de la barra de direcciones." };
    }

    const pestana = limpio.match(/[#?&]gid=(\d+)/)?.[1] ?? null;
    return { ok: true, id, pestana, url: elEnlaceDeLaHoja(id, pestana) };
}

/** El enlace que se abre en otra pestaña y el que se copia. */
export function elEnlaceDeLaHoja(id: string, pestana: string | null = null): string {
    return `https://docs.google.com/spreadsheets/d/${id}/edit${pestana ? `#gid=${pestana}` : ""}`;
}

/**
 * El que se pinta dentro de la plataforma: `rm=minimal` le quita a Google su
 * propia barra de menús, que dentro de otra pantalla se lee como una segunda
 * aplicación encima de la nuestra.
 */
export function elEnlaceIncrustado(id: string, pestana: string | null = null): string {
    return `https://docs.google.com/spreadsheets/d/${id}/edit?rm=minimal${pestana ? `#gid=${pestana}` : ""}`;
}
