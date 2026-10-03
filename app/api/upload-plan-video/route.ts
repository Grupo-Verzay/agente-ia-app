import { NextResponse } from "next/server";
import { Readable } from "stream";
import { randomUUID } from "crypto";
import { minioClient } from "@/lib/minio";
import { quienMandaEnLaCasa } from "@/lib/puerta-de-la-casa";
import { elVideoDeLaCabecera } from "@/lib/adjuntos-del-equipo";
import { laExtensionDelVideo, porQueNoSeSubeElVideo, TOPE_DEL_VIDEO_SUBIDO } from "@/lib/video-subido";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Sube el video de un plan —o el de la landing general— al bucket y devuelve
 * su dirección. Lo que se hace con ella lo decide quien guarda el detalle del
 * plan o la configuración de la landing: esto solo deja el archivo.
 *
 * Tres cosas que hay que mantener:
 *
 * 1. **Es de la CASA** (`quienMandaEnLaCasa`), la misma puerta que guardar el
 *    detalle de un plan y la landing: sin ella cualquiera con sesión llenaría
 *    el bucket con videos de 150 MB.
 * 2. **El cuerpo es el archivo crudo, y se pasa al bucket SIN guardarlo
 *    entero en memoria.** Con `formData()` un video de 150 MB se cargaría
 *    completo en el proceso —que es uno y atiende Chats— antes de empezar a
 *    escribirlo. Se leen los primeros bytes para saber qué es y el resto
 *    sigue fluyendo. Y eso solo es cierto porque **esta ruta va FUERA del
 *    middleware** (su `matcher`): Next 14 guarda entero el cuerpo de toda
 *    petición por la que pasa el middleware, dos veces. Por eso la puerta del
 *    punto 1 no es opcional: aquí no hay middleware que mande al login.
 * 3. **Lo que decide qué es son esos bytes** (`elVideoDeLaCabecera`), y con
 *    ellos se pone el `Content-Type` y la extensión de la dirección. El
 *    tamaño declarado se vigila mientras fluye: no se escribe ni un byte de
 *    más del que se dijo, ni del tope.
 */
export async function POST(req: Request) {
    const quien = await quienMandaEnLaCasa("upload-plan-video");
    if (!quien) {
        return NextResponse.json({ error: "No autorizado." }, { status: 403 });
    }

    const tamano = Number(req.headers.get("content-length"));
    let nombre = "";
    try {
        nombre = decodeURIComponent(req.headers.get("x-nombre-del-archivo") ?? "");
    } catch {
        nombre = "";
    }
    const motivo = porQueNoSeSubeElVideo({ tamano, tipo: req.headers.get("content-type"), nombre });
    if (motivo) {
        const status = Number.isFinite(tamano) && tamano > TOPE_DEL_VIDEO_SUBIDO ? 413 : 400;
        return NextResponse.json({ error: motivo }, { status });
    }
    if (!req.body) {
        return NextResponse.json({ error: "No llegó ningún archivo." }, { status: 400 });
    }

    // Los primeros bytes, para saber qué contenedor es de verdad.
    const lector = req.body.getReader();
    const primeros: Uint8Array[] = [];
    let leidos = 0;
    while (leidos < 16) {
        const { done, value } = await lector.read();
        if (done) break;
        if (value?.length) {
            primeros.push(value);
            leidos += value.length;
        }
    }
    const cabecera = new Uint8Array(leidos);
    let desde = 0;
    for (const trozo of primeros) {
        cabecera.set(trozo, desde);
        desde += trozo.length;
    }
    const contenedor = elVideoDeLaCabecera(cabecera);
    const extension = laExtensionDelVideo(contenedor);
    if (!contenedor || !extension) {
        await lector.cancel().catch(() => undefined);
        return NextResponse.json({ error: "Ese archivo no es un video MP4, WebM o MOV." }, { status: 400 });
    }

    const limite = Math.min(tamano, TOPE_DEL_VIDEO_SUBIDO);
    let total = leidos;
    const flujo = new ReadableStream<Uint8Array>({
        start(control) {
            if (total > limite) {
                control.error(new Error("El archivo trae más bytes de los que dijo."));
                return;
            }
            for (const trozo of primeros) control.enqueue(trozo);
        },
        async pull(control) {
            const { done, value } = await lector.read();
            if (done) {
                control.close();
                return;
            }
            total += value?.length ?? 0;
            if (total > limite) {
                await lector.cancel().catch(() => undefined);
                control.error(new Error("El archivo trae más bytes de los que dijo."));
                return;
            }
            if (value?.length) control.enqueue(value);
        },
        cancel(razon) {
            return lector.cancel(razon);
        },
    });

    const bucket = process.env.S3_BUCKET_NAME || "verzay-media";
    const ruta = `plan-videos/${randomUUID()}.${extension}`;
    try {
        await minioClient.putObject(bucket, ruta, Readable.fromWeb(flujo as never), tamano, {
            "Content-Type": contenedor,
        });
    } catch (error) {
        console.error("[upload-plan-video] no se pudo subir el video", {
            quien: quien.id,
            tamano,
            subidos: total,
            error,
        });
        return NextResponse.json({ error: "No se pudo subir el video. Vuelve a intentarlo." }, { status: 500 });
    }

    const url = `${process.env.S3_PUBLIC_URL}/${bucket}/${ruta}`;
    return NextResponse.json({ url });
}
