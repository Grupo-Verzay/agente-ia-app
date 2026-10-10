import "server-only";

import { spawn } from "child_process";
import { createReadStream, createWriteStream, existsSync } from "fs";
import { mkdtemp, rm, stat } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { pipeline } from "stream/promises";

import { minioClient } from "@/lib/minio";
import { TAMANO_DE_PARTE, llaveDeLaGrabacion, llaveDeLaParte, sePuedeMandarLaParte } from "@/lib/grabacion-de-reunion";
import { juntarLasPartes } from "@/lib/grabacion-de-reunion.server";
import { HORAS_SIN_CERRAR, elTipoDelFichero, lasOrdenesDeLaMezcla, llaveDelTrozo, losSegundosDeLaGrabacion, type CualTrozo } from "@/lib/grabacion-de-videollamada";
import type { ExtensionDeGrabacion } from "@/lib/grabacion-de-reunion";
import {
    cerrarLaGrabacionDeLaSala,
    copiarLaGrabacionAlCrm,
    lasGrabacionesDeLaSalaSinCerrar,
    lasVocesDeLaGrabacion,
    reclamarElCierreDeLaSala,
} from "@/lib/videollamada-ia-db";

function elBucket(): string {
    return process.env.S3_BUCKET_NAME || "verzay-media";
}

/** Guardar un trozo de ~10 s tal cual llega de la sala. */
export async function guardarElTrozo(input: {
    cuentaId: string;
    grabacionId: string;
    cual: CualTrozo;
    pista?: number;
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
    /** Juntar los trozos de esta VOZ (y guardarla como el `audio`). */
    pista?: number;
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
        const llave = llaveDelTrozo({ ...input, cual: input.pista ? "voz" : input.cual, numero: n });
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

/* ── Las voces sueltas: se mezclan aquí, con ffmpeg ─────────────────────── */

/**
 * El `ffmpeg` del servidor: el binario estático de `@ffmpeg-installer` (está
 * en `dependencies`, así que el contenedor lo trae en `node_modules`), o el
 * del sistema. `FFMPEG_PATH` manda si está.
 */
export function elFfmpeg(): string {
    const propio = process.env.FFMPEG_PATH?.trim();
    if (propio) return propio;
    const empaquetado = join(process.cwd(), "node_modules", "@ffmpeg-installer", "linux-x64", "ffmpeg");
    return existsSync(empaquetado) ? empaquetado : "ffmpeg";
}

/** Lo que tarda como mucho una mezcla: copia el video, solo recodifica la voz. */
const TOPE_DE_LA_MEZCLA_MS = 15 * 60 * 1000;

function correrFfmpeg(ordenes: string[]): Promise<void> {
    return new Promise((listo, mal) => {
        const proceso = spawn(elFfmpeg(), ordenes, { stdio: ["ignore", "ignore", "pipe"] });
        let errores = "";
        proceso.stderr?.on("data", (d) => {
            if (errores.length < 4_000) errores += String(d);
        });
        const plazo = setTimeout(() => proceso.kill("SIGKILL"), TOPE_DE_LA_MEZCLA_MS);
        proceso.on("error", (e) => {
            clearTimeout(plazo);
            mal(e);
        });
        proceso.on("close", (codigo) => {
            clearTimeout(plazo);
            if (codigo === 0) listo();
            else mal(new Error(`ffmpeg salió con ${codigo}: ${errores.trim().slice(0, 600)}`));
        });
    });
}

/**
 * Lo que dura un fichero, leído por `ffmpeg` SIN decodificar (`-c copy`: solo
 * recorre los paquetes, va en un instante). `null` si no se pudo leer.
 */
export function laDuracionDelFichero(archivo: string): Promise<number | null> {
    return new Promise((listo) => {
        const proceso = spawn(elFfmpeg(), ["-hide_banner", "-nostats", "-progress", "pipe:1", "-i", archivo, "-map", "0", "-c", "copy", "-f", "null", "-"], {
            stdio: ["ignore", "pipe", "ignore"],
        });
        let salida = "";
        proceso.stdout?.on("data", (d) => {
            salida += String(d);
            if (salida.length > 20_000) salida = salida.slice(-10_000);
        });
        const plazo = setTimeout(() => proceso.kill("SIGKILL"), 60_000);
        proceso.on("error", () => {
            clearTimeout(plazo);
            listo(null);
        });
        proceso.on("close", (codigo) => {
            clearTimeout(plazo);
            const us = Array.from(salida.matchAll(/out_time_(?:us|ms)=(\d+)/g)).pop()?.[1];
            listo(codigo === 0 && us ? Number(us) / 1_000_000 : null);
        });
    });
}

/**
 * Bajar los trozos de una pista a UN fichero del disco, en orden, sin
 * tenerlos en memoria. Un trozo perdido se salta y se dice.
 */
async function bajarLosTrozos(input: {
    cuentaId: string;
    grabacionId: string;
    cual: CualTrozo;
    pista?: number;
    trozos: number;
    formato: ExtensionDeGrabacion;
    archivo: string;
}): Promise<{ llaves: string[]; bytes: number }> {
    const bucket = elBucket();
    const llaves: string[] = [];
    for (let n = 1; n <= input.trozos; n += 1) {
        const llave = llaveDelTrozo({ ...input, numero: n });
        try {
            const flujo = await minioClient.getObject(bucket, llave);
            await pipeline(flujo, createWriteStream(input.archivo, { flags: "a" }));
            llaves.push(llave);
        } catch (error) {
            console.warn("[videollamada] falta un trozo de la grabación; se salta", {
                grabacion: input.grabacionId,
                cual: input.cual,
                pista: input.pista,
                trozo: n,
                error: error instanceof Error ? error.message : String(error),
            });
        }
    }
    const bytes = llaves.length ? (await stat(input.archivo)).size : 0;
    return { llaves, bytes };
}

async function subirElFichero(input: { archivo: string; llave: string; tipo: string }): Promise<string> {
    const { size } = await stat(input.archivo);
    await minioClient.putObject(elBucket(), input.llave, createReadStream(input.archivo), size, { "Content-Type": input.tipo });
    return `${process.env.S3_PUBLIC_URL}/${elBucket()}/${input.llave}`;
}

/**
 * Juntar una grabación de voces sueltas: el video (solo lienzo) y cada voz a
 * un fichero, `ffmpeg` las mezcla con su retraso y pega la mezcla al video, y
 * se suben los dos ficheros. Los trozos se borran DESPUÉS de subir.
 *
 * Si `ffmpeg` falla, no se pierde la llamada: el video se junta solo (mudo) y
 * de audio va la voz más larga.
 */
export async function juntarConLasVoces(fila: {
    id: string;
    citaId: string;
    cuentaId: string;
    formato: ExtensionDeGrabacion;
    trozosVideo: number;
}): Promise<{ audioUrl: string | null; videoUrl: string | null; segundos: number | null }> {
    const voces = (await lasVocesDeLaGrabacion(fila.id)).filter((v) => v.trozos > 0);
    const base = { cuentaId: fila.cuentaId, grabacionId: fila.id, formato: fila.formato };
    const dir = await mkdtemp(join(tmpdir(), "videollamada-"));
    try {
        const video = fila.trozosVideo > 0
            ? { archivo: join(dir, `lienzo.${fila.formato}`), ...(await bajarLosTrozos({ ...base, cual: "video", trozos: fila.trozosVideo, archivo: join(dir, `lienzo.${fila.formato}`) })) }
            : null;
        const bajadas: { archivo: string; desdeMs: number; llaves: string[]; bytes: number; pista: number; trozos: number }[] = [];
        for (const v of voces) {
            const archivo = join(dir, `voz-${v.pista}.${fila.formato}`);
            const b = await bajarLosTrozos({ ...base, cual: "voz", pista: v.pista, trozos: v.trozos, archivo });
            if (b.bytes > 0) bajadas.push({ archivo, desdeMs: v.desdeMs, pista: v.pista, trozos: v.trozos, ...b });
        }
        const conVideo = Boolean(video && video.bytes > 0);
        const todas = [...(video ? video.llaves : []), ...bajadas.flatMap((b) => b.llaves)];
        const borrar = async () => {
            for (const llave of todas) {
                try {
                    await minioClient.removeObject(elBucket(), llave);
                } catch (error) {
                    console.warn("[videollamada] no se pudo borrar un trozo", { llave, error });
                }
            }
        };

        if (!bajadas.length) {
            // Sin ninguna voz: el video solo, como venga.
            if (!conVideo || !video) return { audioUrl: null, videoUrl: null, segundos: null };
            const segundos = await laDuracionDelFichero(video.archivo);
            const videoUrl = await subirElFichero({
                archivo: video.archivo,
                llave: llaveDeLaGrabacion({ cuentaId: fila.cuentaId, grabacionId: fila.id, cual: "video", modulo: "videollamadas", extension: fila.formato }),
                tipo: elTipoDelFichero(fila.formato, "video"),
            });
            await borrar();
            return { audioUrl: null, videoUrl, segundos };
        }

        const salidaAudio = join(dir, `audio.${fila.formato}`);
        const salidaVideo = conVideo ? join(dir, `video.${fila.formato}`) : null;
        try {
            await correrFfmpeg(
                lasOrdenesDeLaMezcla({
                    video: conVideo && video ? video.archivo : null,
                    voces: bajadas.map((b) => ({ archivo: b.archivo, desdeMs: b.desdeMs })),
                    formato: fila.formato,
                    salidaAudio,
                    salidaVideo,
                }),
            );
        } catch (error) {
            console.warn("[videollamada] ffmpeg no pudo mezclar las voces; va el video mudo y la voz más larga", {
                grabacion: fila.id,
                cita: fila.citaId,
                error: error instanceof Error ? error.message : String(error),
            });
            const larga = [...bajadas].sort((a, b) => b.bytes - a.bytes)[0];
            const segundos = await laDuracionDelFichero(conVideo && video ? video.archivo : larga.archivo);
            const audioUrl = await subirElFichero({
                archivo: larga.archivo,
                llave: llaveDeLaGrabacion({ cuentaId: fila.cuentaId, grabacionId: fila.id, cual: "audio", modulo: "videollamadas", extension: fila.formato }),
                tipo: elTipoDelFichero(fila.formato, "audio"),
            });
            const videoUrl = conVideo && video
                ? await subirElFichero({
                      archivo: video.archivo,
                      llave: llaveDeLaGrabacion({ cuentaId: fila.cuentaId, grabacionId: fila.id, cual: "video", modulo: "videollamadas", extension: fila.formato }),
                      tipo: elTipoDelFichero(fila.formato, "video"),
                  })
                : null;
            await borrar();
            return { audioUrl, videoUrl, segundos };
        }

        const audioUrl = await subirElFichero({
            archivo: salidaAudio,
            llave: llaveDeLaGrabacion({ cuentaId: fila.cuentaId, grabacionId: fila.id, cual: "audio", modulo: "videollamadas", extension: fila.formato }),
            tipo: elTipoDelFichero(fila.formato, "audio"),
        });
        const videoUrl = salidaVideo
            ? await subirElFichero({
                  archivo: salidaVideo,
                  llave: llaveDeLaGrabacion({ cuentaId: fila.cuentaId, grabacionId: fila.id, cual: "video", modulo: "videollamadas", extension: fila.formato }),
                  tipo: elTipoDelFichero(fila.formato, "video"),
              })
            : null;
        const segundos = await laDuracionDelFichero(salidaVideo ?? salidaAudio);
        await borrar();
        console.info("[videollamada] voces mezcladas", { grabacion: fila.id, voces: bajadas.length, conVideo, segundos });
        return { audioUrl, videoUrl, segundos };
    } finally {
        await rm(dir, { recursive: true, force: true }).catch(() => {});
    }
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
    // Las salas de ahora suben cada voz suelta (`cual=voz`) y el video sin
    // audio; las de antes, la mezcla (`audio`) y el video con ella.
    let audioUrl: string | null = null;
    let videoUrl: string | null = null;
    let medidos: number | null = null;
    const voces = await lasVocesDeLaGrabacion(fila.id).catch(() => []);
    const conVoces = voces.some((v) => v.trozos > 0);
    if (conVoces) {
        try {
            ({ audioUrl, videoUrl, segundos: medidos } = await juntarConLasVoces(fila));
        } catch (error) {
            console.warn("[videollamada] no se pudo juntar la grabación con sus voces", {
                grabacion: fila.id,
                cita: fila.citaId,
                error: error instanceof Error ? error.message : String(error),
            });
        }
    } else {
        audioUrl = await juntar("audio", fila.trozosAudio);
        videoUrl = await juntar("video", fila.trozosVideo);
    }

    const salio = Boolean(audioUrl || videoUrl);
    // Lo que dura DE VERDAD (no el reloj del navegador): decide cuál va al CRM.
    const segundos = losSegundosDeLaGrabacion({
        delCliente: input.segundos,
        trozos: Math.max(fila.trozosVideo, fila.trozosAudio, ...voces.map((v) => v.trozos)),
        medidos,
    });
    if (segundos < Math.floor(input.segundos) - 15) {
        console.info("[videollamada] la grabación dura menos que su reloj", { grabacion: fila.id, cita: fila.citaId, reloj: input.segundos, segundos });
    }
    await cerrarLaGrabacionDeLaSala({
        id: fila.id,
        estado: salio ? "lista" : "fallida",
        segundos,
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
