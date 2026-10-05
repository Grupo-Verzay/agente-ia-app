import { NextResponse } from "next/server";

import { laOrdenPedida } from "@/lib/pantalla-de-verzy";
import { asegurarLaPantalla, laFotoDeLaPantalla, pedirALaPantalla, prepararLaSesionDeVerzy } from "@/lib/pantalla-de-verzy.server";
import { esLaFirmaDeLaCita } from "@/lib/videollamada-ia.server";

export const dynamic = "force-dynamic";

/**
 * La pantalla REAL de Verzay Ventas que Verzy enseña en la videollamada.
 * PÚBLICA y su puerta es la firma de la cita, como las demás rutas de la sala.
 * Al navegador solo llegan FOTOS de la pantalla y el resultado de cada orden:
 * la sesión de Verzay Ventas y su token se quedan en el servidor.
 *
 * GET  → la última foto (image/jpeg), 204 si todavía no hay. `?preparar=1`
 *        deja la sesión y la pantalla listas antes de que haga falta.
 * POST → una orden: { tipo: "ir", destino } o { tipo: "nota", texto }.
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
