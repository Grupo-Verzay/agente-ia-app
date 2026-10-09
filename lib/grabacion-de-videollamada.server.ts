import "server-only";

import { minioClient } from "@/lib/minio";
import { TAMANO_DE_PARTE, llaveDeLaParte, sePuedeMandarLaParte } from "@/lib/grabacion-de-reunion";
import { juntarLasPartes } from "@/lib/grabacion-de-reunion.server";
import { HORAS_SIN_CERRAR, elTipoDelFichero, llaveDelTrozo } from "@/lib/grabacion-de-videollamada";
import type { ExtensionDeGrabacion } from "@/lib/grabacion-de-reunion";
import {
    cerrarLaGrabacionDeLaSala,
    copiarLaGrabacionAlCrm,
    lasGrabacionesDeLaSalaSinCerrar,
    reclamarElCierreDeLaSala,
} from "@/lib/videollamada-ia-db";

function elBucket(): string {
    return process.env.S3_BUCKET_NAME || "verzay-media";
}

/** Guardar un trozo de ~10 s tal cual llega de la sala. */
export async function guardarElTrozo(input: {
    cuentaId: string;
    grabacionId: string;
    cual: "audio" | "video";
    numero: number;
    formato: ExtensionDeGrabacion;
    bytes: Buffer;
}): Promise<void> {
    await minioClient.putObject(elBucket(), llaveDelTrozo(input), input.bytes, input.bytes.length, {
        "Content-Type": elTipoDelFichero(input.formato, input.cual),
    });
}

async function leerEntero(bucket: string, llave: string): Promise<Buffer> {
    const flujo = await minioClient.getObject(bucket, llave);
    const pedazos: Buffer[] = [];
    for await (const p of flujo) pedazos.push(Buffer.isBuffer(p) ? p : Buffer.from(p));
    return Buffer.concat(pedazos);
}

/**
 * Juntar los trozos de una pista en un solo fichero.
 *
 * Dos pasos, porque `composeObject` pide al menos 5 MiB por parte y un trozo
 * son diez segundos: primero los trozos se pegan EN ORDEN en partes de 8 MiB
 * (con la memoria acotada a una parte), y luego las partes se juntan con
 * `juntarLasPartes`, el mismo de Reuniones. Un trozo que falta se salta y se
 * dice: el webm sale con un salto, que es mejor que no tener nada.
 *
 * `null` si no había ni un trozo.
 */
export async function juntarLosTrozos(input: {
    cuentaId: string;
    grabacionId: string;
    cual: "audio" | "video";
    trozos: number;
    formato: ExtensionDeGrabacion;
}): Promise<string | null> {
    if (input.trozos <= 0) return null;
    const bucket = elBucket();
    let partes = 0;
    let pila: Buffer[] = [];
    let bytes = 0;
    const soltar = async (esLaUltima: boolean) => {
        if (!sePuedeMandarLaParte({ bytes, esLaUltima })) return;
        partes += 1;
        const cuerpo = Buffer.concat(pila);
        await minioClient.putObject(
            bucket,
            llaveDeLaParte({
                cuentaId: input.cuentaId,
                grabacionId: input.grabacionId,
                cual: input.cual,
                numero: partes,
                modulo: "videollamadas",
                extension: input.formato,
            }),
            cuerpo,
            cuerpo.length,
            { "Content-Type": elTipoDelFichero(input.formato, input.cual) },
        );
        pila = [];
        bytes = 0;
    };
    const llaves: string[] = [];
    for (let n = 1; n <= input.trozos; n += 1) {
        const llave = llaveDelTrozo({ ...input, numero: n });
        try {
            const trozo = await leerEntero(bucket, llave);
            llaves.push(llave);
            pila.push(trozo);
            bytes += trozo.length;
        } catch (error) {
            console.warn("[videollamada] falta un trozo de la grabación; se salta", {
                grabacion: input.grabacionId,
                cual: input.cual,
                trozo: n,
                error: error instanceof Error ? error.message : String(error),
            });
            continue;
        }
        if (bytes >= TAMANO_DE_PARTE) await soltar(false);
    }
    await soltar(true);
    if (partes === 0) return null;

    const url = await juntarLasPartes({
        cuentaId: input.cuentaId,
        grabacionId: input.grabacionId,
        cual: input.cual,
        partes,
        modulo: "videollamadas",
        extension: input.formato,
    });
    // Los trozos se van DESPUÉS de que el fichero exista.
    for (const llave of llaves) {
        try {
            await minioClient.removeObject(bucket, llave);
        } catch (error) {
            console.warn("[videollamada] no se pudo borrar un trozo", { llave, error });
        }
    }
    return url;
}

/**
 * Cerrar la grabación de la sala de una videollamada: juntar sus trozos en el
 * bucket y llevarla a la fila del CRM.
 *
 * Un solo sitio para los tres caminos que cierran: la sala al colgar, el aviso
 * de que la pestaña se va (`sendBeacon`) y el barrido diario de las huérfanas.
 * Solo UNO de ellos junta (`reclamarElCierreDeLaSala`), y **cierra pase lo que
 * pase**: si juntar falla, la fila queda `fallida` y se dice.
 */
export async function cerrarYJuntarLaGrabacionDeLaSala(input: {
    grabacionId: string;
    segundos: number;
}): Promise<{ ok: boolean; hecho: "lista" | "fallida" | "ya_cerrada" }> {
    const fila = await reclamarElCierreDeLaSala(input.grabacionId);
    if (!fila) return { ok: false, hecho: "ya_cerrada" };

    // Cada pista por su lado: si el video no se puede juntar, el audio vale solo.
    const juntar = async (cual: "audio" | "video", trozos: number): Promise<string | null> => {
        try {
            return await juntarLosTrozos({ cuentaId: fila.cuentaId, grabacionId: fila.id, cual, trozos, formato: fila.formato });
        } catch (error) {
            console.warn("[videollamada] no se pudieron juntar los trozos de la grabación", {
                grabacion: fila.id,
                cita: fila.citaId,
                cual,
                error: error instanceof Error ? error.message : String(error),
            });
            return null;
        }
    };
    const audioUrl = await juntar("audio", fila.trozosAudio);
    const videoUrl = await juntar("video", fila.trozosVideo);

    const salio = Boolean(audioUrl || videoUrl);
    await cerrarLaGrabacionDeLaSala({
        id: fila.id,
        estado: salio ? "lista" : "fallida",
        segundos: Math.max(0, Math.floor(input.segundos)),
        audioUrl,
        videoUrl,
    });
    if (!salio) {
        console.warn("[videollamada] la grabación se cerró sin fichero", { grabacion: fila.id, cita: fila.citaId });
        return { ok: false, hecho: "fallida" };
    }

    try {
        const enElCrm = await copiarLaGrabacionAlCrm(fila.citaId);
        // Sin fila todavía no es un fallo: la transcripción de Tavus llega
        // después, crea la fila y copia esta grabación ella misma.
        console.info("[videollamada] grabación lista", { grabacion: fila.id, cita: fila.citaId, enElCrm });
    } catch (error) {
        console.warn("[videollamada] la grabación no llegó a la fila del CRM", {
            cita: fila.citaId,
            error: error instanceof Error ? error.message : String(error),
        });
    }
    return { ok: true, hecho: "lista" };
}

/**
 * El barrido diario: las grabaciones que se quedaron en `grabando` porque la
 * pestaña del cliente murió sin avisar. Se JUNTA lo que subió, no se tira.
 */
export async function recogerLasGrabacionesDeLaSala(): Promise<{ recogidas: number; fallos: number }> {
    let recogidas = 0;
    let fallos = 0;
    const huerfanas = await lasGrabacionesDeLaSalaSinCerrar(HORAS_SIN_CERRAR, 20);
    for (const g of huerfanas) {
        try {
            const r = await cerrarYJuntarLaGrabacionDeLaSala({ grabacionId: g.id, segundos: g.segundos });
            if (r.ok) recogidas += 1;
        } catch (error) {
            fallos += 1;
            console.warn("[videollamada] no se pudo recoger una grabación huérfana", { grabacion: g.id, error });
        }
    }
    return { recogidas, fallos };
}
