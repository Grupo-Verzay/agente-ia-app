import { NextResponse } from "next/server";

import { currentUser } from "@/lib/auth";
import { quienFirma } from "@/lib/chat-de-equipo";
import {
    TAMANO_DE_PARTE,
    TOPE_DE_PARTES,
    TOPE_POR_CUENTA,
    comoVaElCupo,
} from "@/lib/grabacion-de-reunion";
import { guardarLaParte, laCuentaPuedeGrabar } from "@/lib/grabacion-de-reunion.server";
import {
    apuntarLaParte,
    laGrabacion,
    loQueOcupanLasGrabaciones,
} from "@/lib/salas-de-video-db";

/**
 * Una parte de una grabación de reunión.
 *
 * # Por qué una ruta y no una acción de servidor
 *
 * Porque lo que sube son **ocho megas de binario**. Una acción de servidor
 * serializa sus argumentos, así que una parte tendría que ir en base64 —un
 * tercio más de peso— y pasar por el serializador de React en las dos puntas.
 * Aquí el cuerpo es el fichero y nada más.
 *
 * # Y por qué las partes no van con una URL prefirmada
 *
 * Está contado en `lib/grabacion-de-reunion.server.ts`: una prefirmada apunta a
 * `S3_ENDPOINT`, que es como el **servidor** ve el bucket, y no hay garantía de
 * que sea como lo ve el navegador de quien graba. Si no coincidieran, la subida
 * fallaría solo en producción y solo al grabar — o sea donde nadie está
 * mirando. El camino de `/api/upload` es el que se sabe que funciona.
 *
 * # Las cuatro puertas, y ninguna sobra
 *
 * 1. **Sesión.** Esta ruta escribe en el bucket; el middleware no basta y se
 *    pudo saltar (H02 de la auditoría).
 * 2. **La grabación es de la cuenta de quien sube**, y está `grabando`. Sin
 *    esto, con un id a mano se le meterían partes a la grabación de otra
 *    cuenta — o a una ya cerrada, que es peor: se sumarían bytes a un fichero
 *    que ya se juntó y el cupo contaría lo que no existe.
 * 3. **El módulo.** Se vende aparte, y esconder el botón no cierra la
 *    petición directa.
 * 4. **El cupo.** Se mira en CADA parte y no solo al empezar: el tope es de la
 *    cuenta, y entre el principio y el final de una reunión de una hora puede
 *    entrar otra grabación por otro lado. Al llenarse se contesta `413` y la
 *    pestaña **para y guarda lo que lleve** — que es lo contrario de tirarlo.
 */
export async function POST(req: Request) {
    const user = await currentUser();
    if (!user?.id) return NextResponse.json({ error: "No autorizado." }, { status: 401 });
    const firma = quienFirma(user);
    if (!firma) return NextResponse.json({ error: "No autorizado." }, { status: 401 });

    const url = new URL(req.url);
    const grabacionId = (url.searchParams.get("grabacion") ?? "").trim();

    // La pestaña se va: cerrar lo que haya.
    //
    // Llega por `sendBeacon`, que es lo único que el navegador deja salir
    // mientras se descarga una página — un `fetch` normal lo cancela él mismo.
    // Es **best-effort a propósito**: lo que estuviera sin subir se pierde y no
    // hay forma de evitarlo. Lo que esto sí evita es que la fila se quede en
    // `grabando` para siempre y con ella la sala, que entonces no podría volver
    // a grabarse nunca.
    if (url.searchParams.get("cerrar") === "1") {
        const fila = await laGrabacion(grabacionId);
        if (!fila || fila.cuentaId !== firma.cuentaId) {
            return NextResponse.json({ error: "Esa grabación no es tuya." }, { status: 403 });
        }
        const segundos = Math.max(0, Math.floor(Number(url.searchParams.get("segundos")) || 0));
        const { recogerLaGrabacion } = await import("@/lib/grabaciones-runner.server");
        const ok = await recogerLaGrabacion({ grabacionId: fila.id, segundos });
        return NextResponse.json({ ok });
    }

    const cual = url.searchParams.get("cual") === "video" ? "video" : "audio";
    const numero = Number(url.searchParams.get("numero") ?? "0");

    if (!grabacionId || !Number.isInteger(numero) || numero < 1 || numero > TOPE_DE_PARTES) {
        return NextResponse.json({ error: "Parte no válida." }, { status: 400 });
    }

    const fila = await laGrabacion(grabacionId);
    if (!fila || fila.cuentaId !== firma.cuentaId) {
        return NextResponse.json({ error: "Esa grabación no es tuya." }, { status: 403 });
    }
    if (fila.estado !== "grabando") {
        return NextResponse.json({ error: "Esa grabación ya se cerró." }, { status: 409 });
    }
    if (!(await laCuentaPuedeGrabar(fila.cuentaId))) {
        return NextResponse.json({ error: "Esta cuenta no graba reuniones." }, { status: 403 });
    }

    const cuerpo = Buffer.from(await req.arrayBuffer());
    if (!cuerpo.length) {
        return NextResponse.json({ error: "La parte viene vacía." }, { status: 400 });
    }
    // Un techo por parte, con holgura sobre lo que el navegador manda: el
    // cuerpo entero vive en memoria de este proceso mientras se sube, así que
    // sin tope una petición a mano ahogaría el contenedor que atiende Chats.
    if (cuerpo.length > TAMANO_DE_PARTE * 3) {
        return NextResponse.json({ error: "La parte es demasiado grande." }, { status: 413 });
    }

    const cupo = comoVaElCupo(await loQueOcupanLasGrabaciones(fila.cuentaId));
    if (cupo.lleno) {
        return NextResponse.json(
            { error: "Se acabó el espacio de grabación de esta cuenta.", cupo: TOPE_POR_CUENTA },
            { status: 413 },
        );
    }

    try {
        await guardarLaParte({
            cuentaId: fila.cuentaId,
            grabacionId: fila.id,
            cual,
            numero,
            bytes: cuerpo,
        });
    } catch (error) {
        console.warn("[reuniones] no se pudo guardar una parte", { grabacionId, numero, error });
        return NextResponse.json({ error: "No se pudo guardar la parte." }, { status: 502 });
    }

    // Se apunta DESPUÉS de que el fichero exista. Al revés, un fallo de subida
    // dejaría el contador por delante de las partes de verdad y `juntarLasPartes`
    // pediría una que no está — que hace fallar la unión al final, con la
    // grabación ya hecha.
    await apuntarLaParte({ grabacionId: fila.id, cual, bytes: cuerpo.length });

    return NextResponse.json({ ok: true, cerca: cupo.cerca });
}
