import "server-only";

import { db } from "@/lib/db";
import { minioClient } from "@/lib/minio";
import {
    COMO_SE_PIDE_EL_RESUMEN,
    TOPE_DE_OPENAI,
    llaveDeLaGrabacion,
    llaveDeLaParte,
    loQueSeLeManda,
} from "@/lib/grabacion-de-reunion";

/**
 * Lo que la grabación de una reunión necesita del servidor: el bucket, la
 * puerta del módulo y el resumen.
 *
 * `import "server-only"` y no `'use server'` **a propósito**: aquí no hay nada
 * que el navegador deba poder llamar. Un fichero de acciones publica todo lo
 * que exporta como un POST, y esto compone ficheros en el bucket y habla con
 * OpenAI — es exactamente la clase de función que este documento saca de las
 * acciones.
 */

/** La ruta que decide si una cuenta tiene grabación. */
export const RUTA_DE_GRABACIONES = "/reuniones/grabaciones";

/**
 * Si la CUENTA tiene el módulo de grabación.
 *
 * Se pregunta por la cuenta y **no por la persona**: es un módulo que se vende
 * y se activa en Panel › Módulos, igual que los demás, así que lo que decide es
 * lo que se le repartió a la cuenta (`_UserModules`), no el rol de quien está
 * sentado delante. Un agente de una cuenta con grabación graba; el dueño de una
 * cuenta sin ella, no.
 *
 * Y **Reuniones no pasa por aquí**: la ruta `/reuniones` se asigna a mano y no
 * cuesta aparte. Lo único que este módulo abre es grabar y transcribir.
 *
 * Mira también los apartados (`ModuleItem`), porque un módulo puede llevar la
 * ruta dentro en vez de en su cabecera — que es como se monta la mitad de los
 * módulos de esta plataforma. Sin esa mitad, una cuenta con el apartado
 * asignado vería el botón apagado y nadie sabría por qué.
 */
export async function laCuentaPuedeGrabar(cuentaId: string): Promise<boolean> {
    try {
        const filas = await db.userModule.findMany({
            where: {
                B: cuentaId,
                Module: {
                    OR: [
                        { route: RUTA_DE_GRABACIONES },
                        { moduleItems: { some: { url: RUTA_DE_GRABACIONES } } },
                    ],
                },
            },
            select: { A: true },
            take: 1,
        });
        return filas.length > 0;
    } catch (error) {
        // El lado seguro es **no** dejar grabar: equivocarse hacia el sí es
        // darle gratis a una cuenta un módulo que se vende. Y no es mudo,
        // porque «el botón no sale» es de lo más difícil de diagnosticar.
        console.warn("[reuniones] no se pudo leer el modulo de grabacion", {
            cuentaId,
            error,
        });
        return false;
    }
}

// ── El bucket ───────────────────────────────────────────────────────────────

function elBucket(): string {
    return process.env.S3_BUCKET_NAME || "verzay-media";
}

function laDireccion(llave: string): string {
    return `${process.env.S3_PUBLIC_URL}/${elBucket()}/${llave}`;
}

/**
 * Guardar una parte tal cual llega.
 *
 * Va por **nuestra ruta** y no con una URL prefirmada, que es lo que parecería
 * más barato. El motivo es que una prefirmada apunta a `S3_ENDPOINT`, que es
 * como el servidor ve el bucket y no necesariamente como lo ve el navegador de
 * quien graba: si no coincidieran, la subida fallaría **solo en producción y
 * solo al grabar**, o sea donde nadie está mirando. El camino de `/api/upload`
 * es el que se sabe que funciona, y una parte son ocho megas.
 */
export async function guardarLaParte(input: {
    cuentaId: string;
    grabacionId: string;
    cual: "audio" | "video";
    numero: number;
    bytes: Buffer;
}): Promise<void> {
    const llave = llaveDeLaParte({
        cuentaId: input.cuentaId,
        grabacionId: input.grabacionId,
        cual: input.cual,
        numero: input.numero,
    });
    await minioClient.putObject(elBucket(), llave, input.bytes, input.bytes.length, {
        "Content-Type": "video/webm",
    });
}

/**
 * Juntar las partes en un solo fichero y borrarlas.
 *
 * `composeObject` es un multipart de S3 hecho en el servidor: los bytes **no
 * vuelven a pasar por aquí**, que es lo que hace viable juntar un giga sin
 * ahogar el proceso.
 *
 * Y el orden es el de las llaves, que van con el número rellenado a cinco
 * cifras justamente por esto: un listado de S3 ordena como texto, así que sin
 * el relleno la parte 10 iría antes que la 2 y el webm saldría con los trozos
 * cambiados de sitio — que no da ningún error, solo se ve mal.
 *
 * Devuelve `null` cuando no había ni una parte: una grabación de la que no se
 * subió nada no es un fichero vacío, es una grabación que no existe.
 */
export async function juntarLasPartes(input: {
    cuentaId: string;
    grabacionId: string;
    cual: "audio" | "video";
    partes: number;
}): Promise<string | null> {
    if (input.partes <= 0) return null;

    const { CopyDestinationOptions, CopySourceOptions } = await import("minio");
    const bucket = elBucket();
    const destino = llaveDeLaGrabacion({
        cuentaId: input.cuentaId,
        grabacionId: input.grabacionId,
        cual: input.cual,
    });
    const llaves = Array.from({ length: input.partes }, (_, i) =>
        llaveDeLaParte({
            cuentaId: input.cuentaId,
            grabacionId: input.grabacionId,
            cual: input.cual,
            numero: i + 1,
        }),
    );

    await minioClient.composeObject(
        new CopyDestinationOptions({ Bucket: bucket, Object: destino }),
        llaves.map((Object_) => new CopySourceOptions({ Bucket: bucket, Object: Object_ })),
    );

    // Las partes se van **después** de que el destino exista. Al revés, un
    // fallo a mitad dejaría la grabación sin partes y sin fichero, o sea
    // perdida del todo; así, lo peor que queda es basura que el barrido de
    // caducadas no toca pero que ocupa lo mismo que ya ocupaba.
    for (const llave of llaves) {
        try {
            await minioClient.removeObject(bucket, llave);
        } catch (error) {
            console.warn("[reuniones] no se pudo borrar una parte", { llave, error });
        }
    }
    return laDireccion(destino);
}

/** Bajarse el audio para transcribirlo. `null` cuando no se pudo. */
export async function bajarLaGrabacion(
    url: string | null,
): Promise<{ bytes: Buffer; nombre: string } | null> {
    const limpia = (url ?? "").trim();
    if (!limpia) return null;
    const raiz = (process.env.S3_PUBLIC_URL ?? "").trim();
    // La dirección tiene que ser de NUESTRO bucket. Sin esto, una fila tocada a
    // mano haría que el servidor se descargara lo que le dijeran, que es una
    // petición saliendo de dentro de la red con el destino elegido fuera.
    if (!raiz || !limpia.startsWith(`${raiz}/`)) {
        console.warn("[reuniones] la direccion de la grabacion no es nuestra");
        return null;
    }
    try {
        const res = await fetch(limpia);
        if (!res.ok) return null;
        const bytes = Buffer.from(await res.arrayBuffer());
        if (!bytes.length || bytes.length > TOPE_DE_OPENAI) return null;
        return { bytes, nombre: "reunion.webm" };
    } catch (error) {
        console.warn("[reuniones] no se pudo bajar la grabacion", error);
        return null;
    }
}

/** Borrar del bucket lo que deja una grabación caducada. */
export async function borrarLosFicherosDe(input: {
    audioUrl: string | null;
    videoUrl: string | null;
}): Promise<void> {
    const raiz = `${(process.env.S3_PUBLIC_URL ?? "").trim()}/${elBucket()}/`;
    for (const url of [input.audioUrl, input.videoUrl]) {
        const limpia = (url ?? "").trim();
        if (!limpia || !limpia.startsWith(raiz)) continue;
        try {
            await minioClient.removeObject(elBucket(), limpia.slice(raiz.length));
        } catch (error) {
            console.warn("[reuniones] no se pudo borrar un fichero caducado", { error });
        }
    }
}

// ── El resumen ──────────────────────────────────────────────────────────────

/**
 * Los puntos tratados, a partir de la transcripción.
 *
 * **Nunca lanza y devuelve `null` cuando no se pudo.** Quien llama ya tiene el
 * texto y lo va a guardar: un `throw` aquí tiraría una transcripción que ya
 * está pagada, que es el peor final posible. Una grabación con texto y sin
 * resumen es media entrega; una sin nada es cero.
 *
 * Y **no se cobra aparte**: ver la nota de `COMO_SE_PIDE_EL_RESUMEN`.
 */
export async function elResumenDeLaReunion(input: {
    texto: string;
    clave: string;
}): Promise<string | null> {
    const texto = loQueSeLeManda(input.texto);
    if (!texto) return null;
    try {
        const OpenAI = (await import("openai")).default;
        const openai = new OpenAI({ apiKey: input.clave });
        const res = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                { role: "system", content: COMO_SE_PIDE_EL_RESUMEN },
                { role: "user", content: texto },
            ],
            temperature: 0.2,
        });
        return (res.choices[0]?.message?.content ?? "").trim() || null;
    } catch (error) {
        console.warn("[reuniones] no se pudo resumir la reunion", {
            error: error instanceof Error ? error.message : String(error),
        });
        return null;
    }
}

/**
 * Cerrar una grabación: juntar sus partes y dejarla lista.
 *
 * **Un solo sitio para los tres caminos que cierran una grabación**: el botón
 * de parar, el aviso de que la pestaña se va, y el barrido que recoge las que
 * se quedaron colgadas. Con la unión escrita en cada uno, el día que se afine
 * —el orden de las partes, qué se hace si falla— se afina en uno y los otros
 * dos se quedan atrás. Aquí eso no se ve como un error: se ve como que «a veces
 * la grabación no aparece».
 *
 * Y **cierra pase lo que pase**. Si juntar falla, la fila se cierra igual como
 * fallida: dejarla en `grabando` sería dejar la sala sin poder volver a grabar
 * nunca, porque empezar exige que no haya ninguna en curso.
 */
export async function cerrarYJuntarLaGrabacion(input: {
    grabacionId: string;
    segundos: number;
}): Promise<{ ok: boolean; audioUrl: string | null; videoUrl: string | null }> {
    const { laGrabacion, cerrarLaGrabacion } = await import("@/lib/salas-de-video-db");
    const fila = await laGrabacion(input.grabacionId);
    if (!fila || fila.estado !== "grabando") {
        return { ok: Boolean(fila), audioUrl: fila?.audioUrl ?? null, videoUrl: fila?.videoUrl ?? null };
    }

    let audioUrl: string | null = null;
    let videoUrl: string | null = null;
    try {
        audioUrl = await juntarLasPartes({
            cuentaId: fila.cuentaId,
            grabacionId: fila.id,
            cual: "audio",
            partes: fila.partesAudio,
        });
        if (fila.modo === "video") {
            videoUrl = await juntarLasPartes({
                cuentaId: fila.cuentaId,
                grabacionId: fila.id,
                cual: "video",
                partes: fila.partesVideo,
            });
        }
    } catch (error) {
        console.warn("[reuniones] no se pudieron juntar las partes", {
            grabacion: fila.id,
            error,
        });
    }

    const salio = Boolean(audioUrl || videoUrl);
    await cerrarLaGrabacion({
        grabacionId: fila.id,
        salaId: fila.salaId,
        estado: salio ? "lista" : "fallida",
        segundos: input.segundos,
        audioUrl,
        videoUrl,
    });
    return { ok: salio, audioUrl, videoUrl };
}
