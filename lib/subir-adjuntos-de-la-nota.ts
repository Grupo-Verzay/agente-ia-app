/**
 * Subir al bucket lo que se adjuntó a una nota interna, ANTES de guardar la nota.
 *
 * La caja de escribir guarda lo adjuntado como data URL (es lo que necesita el
 * envío al cliente). Una nota no puede llevar megas dentro de la petición de la
 * acción, así que los archivos suben primero por `/api/upload` —la misma ruta
 * que los adjuntos de una tarea, del chat del equipo y del recordatorio— y la
 * acción recibe solo sus direcciones. Esa ruta ya comprueba sesión y que la
 * carpeta sea de una cuenta sobre la que se manda; la acción vuelve a
 * comprobarlo (`comoSeGuardanLosAdjuntosDeLaNota`).
 *
 * Si algo falla a medias, **lo ya subido se borra** del bucket: la nota no se
 * guarda y un archivo sin nota es espacio que nadie sabe de dónde salió. Y se
 * dice qué falló: un botón de guardar que no hace nada se pulsa cinco veces.
 */

import {
    CARPETA_DE_LAS_NOTAS,
    TOPE_DE_BYTES_DE_LA_NOTA,
    type AdjuntoPedidoDeLaNota,
} from "@/lib/adjuntos-de-la-nota";
import { comoSeLeeElTamano } from "@/lib/adjuntos-del-equipo";

/** Lo que guarda la caja de escribir de cada adjunto (`ComposeMedia`). */
export type AdjuntoDeLaCaja = {
    dataUrl: string;
    mimeType: string;
    fileName: string;
};

export type ResultadoDeLaSubida =
    | { ok: true; adjuntos: AdjuntoPedidoDeLaNota[] }
    | { ok: false; message: string };

type Pedir = typeof fetch;

/** Lo que pesa un data URL en base64, sin decodificarlo. */
export function losBytesDeUnDataUrl(dataUrl: string): number {
    const coma = dataUrl.indexOf(",");
    if (coma < 0) return 0;
    const base64 = dataUrl.slice(coma + 1);
    const relleno = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
    return Math.max(0, Math.floor((base64.length * 3) / 4) - relleno);
}

/** Un data URL como archivo, para mandarlo por `FormData`. */
export function dataUrlAArchivo(dataUrl: string, nombre: string, mime: string): File {
    const coma = dataUrl.indexOf(",");
    const crudo = atob(coma >= 0 ? dataUrl.slice(coma + 1) : dataUrl);
    const bytes = new Uint8Array(crudo.length);
    for (let i = 0; i < crudo.length; i += 1) bytes[i] = crudo.charCodeAt(i);
    // El tipo va SIN códecs: `audio/webm;codecs=opus` no es lo que guarda el bucket.
    const tipo = (mime || "application/octet-stream").split(";")[0].trim() || "application/octet-stream";
    return new File([bytes], nombre || "archivo", { type: tipo });
}

/** Borra del bucket lo que se subió y al final no se usó. Nunca lanza. */
export async function soltarLosSubidos(urls: readonly string[], pedir: Pedir = fetch): Promise<void> {
    await Promise.all(
        urls.map(async (url) => {
            try {
                const res = await pedir("/api/upload/borrar", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ url }),
                });
                if (!res.ok) console.warn("[notas internas] no se pudo soltar un archivo subido", { url, estado: res.status });
            } catch (error) {
                console.warn("[notas internas] falló al soltar un archivo subido", { url, error });
            }
        }),
    );
}

export async function subirLosAdjuntosDeLaNota(
    adjuntos: readonly AdjuntoDeLaCaja[],
    cuentaId: string,
    pedir: Pedir = fetch,
): Promise<ResultadoDeLaSubida> {
    if (adjuntos.length === 0) return { ok: true, adjuntos: [] };
    if (!cuentaId) return { ok: false, message: "No se pudo adjuntar: falta la cuenta." };

    for (const a of adjuntos) {
        const bytes = losBytesDeUnDataUrl(a.dataUrl);
        if (bytes > TOPE_DE_BYTES_DE_LA_NOTA) {
            return {
                ok: false,
                message: `«${a.fileName}» pesa ${comoSeLeeElTamano(bytes)} y el máximo es ${comoSeLeeElTamano(TOPE_DE_BYTES_DE_LA_NOTA)}.`,
            };
        }
    }

    const subidos: AdjuntoPedidoDeLaNota[] = [];
    for (const a of adjuntos) {
        try {
            const archivo = dataUrlAArchivo(a.dataUrl, a.fileName, a.mimeType);
            const cuerpo = new FormData();
            cuerpo.append("file", archivo);
            cuerpo.append("userID", cuentaId);
            cuerpo.append("workflowID", CARPETA_DE_LAS_NOTAS);
            const res = await pedir("/api/upload", { method: "POST", body: cuerpo });
            const datos = (await res.json().catch(() => null)) as { url?: string; error?: string } | null;
            if (!res.ok || !datos?.url) {
                throw new Error(datos?.error || `No se pudo subir «${a.fileName}».`);
            }
            subidos.push({ url: datos.url, nombre: a.fileName, mime: archivo.type || null, tamano: archivo.size });
        } catch (error) {
            await soltarLosSubidos(subidos.map((s) => s.url ?? ""), pedir);
            return {
                ok: false,
                message: error instanceof Error ? error.message : `No se pudo subir «${a.fileName}».`,
            };
        }
    }
    return { ok: true, adjuntos: subidos };
}
