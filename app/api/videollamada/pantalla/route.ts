import { NextResponse } from "next/server";

import { laOrdenPedida, laCabeceraDeLaParte, TIPO_DEL_FLUJO } from "@/lib/pantalla-de-verzy";
import { abrirElFlujo, asegurarLaPantalla, laFotoDeLaPantalla, pedirALaPantalla, prepararLaSesionDeVerzy } from "@/lib/pantalla-de-verzy.server";
import { esLaFirmaDeLaCita } from "@/lib/videollamada-ia.server";

export const dynamic = "force-dynamic";

/**
 * La pantalla REAL de Verzay Ventas que Verzy enseña en la videollamada.
 * PÚBLICA y su puerta es la firma de la cita, como las demás rutas de la sala.
 * Al navegador llega el VIDEO de la pantalla (MJPEG, en vivo y en movimiento)
 * y el resultado de cada orden: la sesión de Verzay Ventas se queda aquí.
 *
 * GET  `?stream=1` → el flujo en vivo (multipart/x-mixed-replace), mientras
 *        la sala lo mire. Sin él, la última foto (204 si no hay).
 *        `?preparar=1` deja la sesión y la pantalla listas.
 * POST → una orden: { tipo: "ir", lugar } (la URL que eligió el modelo, cargada tal cual tras sanearla), { tipo: "nota", texto } o { tipo: "recorrer" } (mientras Verzy habla).
 */
function laCitaFirmada(req: Request): string | null {
    const url = new URL(req.url);
    const citaId = String(url.searchParams.get("c") ?? "");
    return citaId && esLaFirmaDeLaCita(citaId, url.searchParams.get("f")) ? citaId : null;
}

export async function GET(req: Request) {
    const citaId = laCitaFirmada(req);
    if (!citaId) return NextResponse.json({ ok: false, motivo: "firma inválida" }, { status: 401 });
    try {
        if (new URL(req.url).searchParams.get("preparar") === "1") {
            const lista = await prepararLaSesionDeVerzy();
            if (lista) await asegurarLaPantalla(citaId);
            return NextResponse.json({ ok: lista });
        }
        if (new URL(req.url).searchParams.get("stream") === "1") return elFlujo(req, citaId);
        const f = await laFotoDeLaPantalla(citaId);
        if (!f) return new NextResponse(null, { status: 204, headers: { "Cache-Control": "no-store" } });
        return new NextResponse(new Uint8Array(f.foto), {
            headers: {
                "Content-Type": "image/jpeg",
                "Cache-Control": "no-store",
                "X-Pantalla-En": f.en.toISOString(),
            },
        });
    } catch (error) {
        const motivo = error instanceof Error ? error.message : String(error);
        console.error("[videollamada] falló la pantalla", { cita: citaId, motivo });
        return NextResponse.json({ ok: false, motivo }, { status: 500 });
    }
}

function elFlujo(req: Request, citaId: string): Response {
    const corte = new AbortController();
    req.signal.addEventListener("abort", () => corte.abort(), { once: true });
    const cod = new TextEncoder();
    const fin = cod.encode("\r\n");
    const cuerpo = new ReadableStream<Uint8Array>({
        start(control) {
            abrirElFlujo(citaId, (jpeg) => {
                control.enqueue(cod.encode(laCabeceraDeLaParte(jpeg.length)));
                control.enqueue(new Uint8Array(jpeg));
                control.enqueue(fin);
            }, corte.signal)
                .catch((error) => console.error("[videollamada] se cortó el flujo de la pantalla", { cita: citaId, motivo: error instanceof Error ? error.message : String(error) }))
                .finally(() => { try { control.close(); } catch { /* ya cerrado por quien miraba */ } });
        },
        cancel() { corte.abort(); },
    });
    return new Response(cuerpo, {
        headers: {
            "Content-Type": TIPO_DEL_FLUJO,
            "Cache-Control": "no-store, no-transform",
            "X-Accel-Buffering": "no",
            Connection: "keep-alive",
        },
    });
}

export async function POST(req: Request) {
    const citaId = laCitaFirmada(req);
    if (!citaId) return NextResponse.json({ ok: false, motivo: "firma inválida" }, { status: 401 });
    let cuerpo: unknown = null;
    try {
        cuerpo = await req.json();
    } catch {
        return NextResponse.json({ ok: false, motivo: "sin JSON" }, { status: 400 });
    }
    const orden = laOrdenPedida(cuerpo);
    if (!orden) return NextResponse.json({ ok: false, motivo: "orden no válida" }, { status: 400 });
    return NextResponse.json(await pedirALaPantalla(citaId, orden));
}
