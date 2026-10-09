import { NextResponse } from "next/server";

import {
    TOPE_DE_BYTES_DE_LA_SALA,
    TOPE_DE_GRABACIONES_POR_CITA,
    TOPE_DE_TROZOS,
    TOPE_DE_VOCES,
    TOPE_DEL_DESDE_MS,
    TOPE_DEL_TROZO,
    elFormatoDeLaGrabacion,
} from "@/lib/grabacion-de-videollamada";
import { cerrarYJuntarLaGrabacionDeLaSala, guardarElTrozo } from "@/lib/grabacion-de-videollamada.server";
import { esLaFirmaDeLaCita } from "@/lib/videollamada-ia.server";
import {
    apuntarElTrozoDeLaSala,
    apuntarElTrozoDeLaVoz,
    cuantasVocesTiene,
    empezarLaGrabacionDeLaSala,
    laGrabacionDeLaSala,
    laVideollamada,
} from "@/lib/videollamada-ia-db";

export const dynamic = "force-dynamic";

/**
 * La grabación de la sala de la videollamada con IA: la sube el navegador del
 * cliente en trozos de ~10 s (ver `lib/grabacion-de-videollamada.ts`).
 *
 * **Pública con la firma de la cita**, como el resto de `/api/videollamada`:
 * la sala no tiene sesión. El middleware deja pasar el prefijo; aquí se
 * comprueba la firma, que la grabación sea DE esta cita, que siga abierta, y
 * los techos (trozos, bytes, grabaciones por cita), porque sin sesión son lo
 * único que impide llenar el bucket.
 *
 * Tres acciones, todas `POST` (`sendBeacon` solo sabe mandar `POST`):
 * - `a=empezar&formato=webm|mp4` → `{ ok, grabacionId }`
 * - `a=trozo&g=&cual=video&numero=` con el binario en el cuerpo; las VOCES
 *   van cada una por su lado: `cual=voz&pista=N&desde=<ms tras el video>`
 *   (`cual=audio`, la mezcla del navegador, es de las salas de antes)
 * - `a=cerrar&g=&segundos=` → junta los trozos y lo lleva al CRM
 */
export async function POST(req: Request) {
    const url = new URL(req.url);
    const citaId = String(url.searchParams.get("c") ?? "");
    if (!citaId || !esLaFirmaDeLaCita(citaId, url.searchParams.get("f"))) {
        return NextResponse.json({ ok: false, motivo: "firma" }, { status: 401 });
    }
    const accion = url.searchParams.get("a");

    if (accion === "empezar") {
        const videollamada = await laVideollamada(citaId);
        if (!videollamada) return NextResponse.json({ ok: false, motivo: "sin_videollamada" }, { status: 404 });
        const grabacionId = await empezarLaGrabacionDeLaSala(
            citaId,
            videollamada.cuentaId,
            elFormatoDeLaGrabacion(url.searchParams.get("formato")),
            TOPE_DE_GRABACIONES_POR_CITA,
        );
        if (!grabacionId) {
            console.warn("[videollamada] la cita llegó a su tope de grabaciones", { cita: citaId });
            return NextResponse.json({ ok: false, motivo: "tope" }, { status: 429 });
        }
        console.info("[videollamada] empieza la grabación de la sala", { cita: citaId, grabacion: grabacionId });
        return NextResponse.json({ ok: true, grabacionId });
    }

    const grabacionId = String(url.searchParams.get("g") ?? "");
    const fila = await laGrabacionDeLaSala(grabacionId);
    if (!fila || fila.citaId !== citaId) {
        return NextResponse.json({ ok: false, motivo: "no_es_de_la_cita" }, { status: 403 });
    }

    if (accion === "cerrar") {
        const segundos = Math.max(0, Math.floor(Number(url.searchParams.get("segundos")) || 0));
        const r = await cerrarYJuntarLaGrabacionDeLaSala({ grabacionId: fila.id, segundos });
        return NextResponse.json({ ok: r.ok, hecho: r.hecho });
    }

    if (accion !== "trozo") return NextResponse.json({ ok: false, motivo: "accion" }, { status: 400 });

    if (fila.estado !== "grabando") {
        return NextResponse.json({ ok: false, motivo: "cerrada" }, { status: 409 });
    }
    const pedido = url.searchParams.get("cual");
    const cual = pedido === "video" ? "video" : pedido === "voz" ? "voz" : "audio";
    const numero = Number(url.searchParams.get("numero") ?? "0");
    if (!Number.isInteger(numero) || numero < 1 || numero > TOPE_DE_TROZOS) {
        return NextResponse.json({ ok: false, motivo: "trozo" }, { status: 400 });
    }
    const pista = Number(url.searchParams.get("pista") ?? "0");
    const desdeMs = Number(url.searchParams.get("desde") ?? "0");
    if (cual === "voz") {
        if (!Number.isInteger(pista) || pista < 1 || pista > TOPE_DE_VOCES) {
            return NextResponse.json({ ok: false, motivo: "pista" }, { status: 400 });
        }
        if (!Number.isInteger(desdeMs) || desdeMs < 0 || desdeMs > TOPE_DEL_DESDE_MS) {
            return NextResponse.json({ ok: false, motivo: "desde" }, { status: 400 });
        }
        // Una voz NUEVA cuenta para el techo de voces.
        const { pistas } = await cuantasVocesTiene(fila.id);
        if (!pistas.includes(pista) && pistas.length >= TOPE_DE_VOCES) {
            return NextResponse.json({ ok: false, motivo: "tope" }, { status: 413 });
        }
    }
    const cuerpo = Buffer.from(await req.arrayBuffer());
    if (!cuerpo.length) return NextResponse.json({ ok: false, motivo: "vacia" }, { status: 400 });
    // Un techo por trozo (vive entero en memoria mientras se sube) y otro por
    // grabación: un `413` hace que la sala pare y cierre con lo que hay.
    if (cuerpo.length > TOPE_DEL_TROZO || fila.bytes + cuerpo.length > TOPE_DE_BYTES_DE_LA_SALA) {
        return NextResponse.json({ ok: false, motivo: "tope" }, { status: 413 });
    }

    try {
        await guardarElTrozo({ cuentaId: fila.cuentaId, grabacionId: fila.id, cual, pista, numero, formato: fila.formato, bytes: cuerpo });
    } catch (error) {
        console.warn("[videollamada] no se pudo guardar un trozo de la grabación", {
            cita: citaId,
            grabacion: fila.id,
            numero,
            error: error instanceof Error ? error.message : String(error),
        });
        return NextResponse.json({ ok: false, motivo: "bucket" }, { status: 502 });
    }
    // DESPUÉS de que el trozo exista: al revés, un fallo dejaría el contador
    // por delante de los trozos de verdad.
    if (cual === "voz") await apuntarElTrozoDeLaVoz({ id: fila.id, pista, desdeMs, numero, bytes: cuerpo.length });
    else await apuntarElTrozoDeLaSala({ id: fila.id, cual, numero, bytes: cuerpo.length });
    return NextResponse.json({ ok: true });
}
