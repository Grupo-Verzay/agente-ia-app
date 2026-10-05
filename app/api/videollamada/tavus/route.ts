import { NextResponse } from "next/server";

import { esLaFirmaDeLaCita } from "@/lib/videollamada-ia.server";
import { procesarElAvisoDeTavus } from "@/lib/videollamada-ia-aviso.server";

export const dynamic = "force-dynamic";

/**
 * El `callback_url` de Tavus. Es PÚBLICA a propósito (la llama Tavus, sin
 * sesión), y su puerta es la firma de la cita: la dirección lleva
 * `?c=<cita>&f=<firma>`, que solo arma este servidor al crear la
 * conversación. Sin firma válida no se toca nada.
 */
export async function POST(req: Request) {
    const url = new URL(req.url);
    const citaId = String(url.searchParams.get("c") ?? "");
    const firma = url.searchParams.get("f");
    if (!citaId || !esLaFirmaDeLaCita(citaId, firma)) {
        console.warn("[videollamada] aviso de Tavus con firma inválida", { cita: citaId || null });
        return NextResponse.json({ ok: false }, { status: 401 });
    }
    let cuerpo: unknown = null;
    try {
        cuerpo = await req.json();
    } catch {
        console.warn("[videollamada] aviso de Tavus sin JSON", { cita: citaId });
        return NextResponse.json({ ok: false }, { status: 400 });
    }
    try {
        const r = await procesarElAvisoDeTavus(citaId, cuerpo);
        return NextResponse.json({ ok: true, ...r });
    } catch (error) {
        console.error("[videollamada] falló el aviso de Tavus", {
            cita: citaId,
            error: error instanceof Error ? error.message : String(error),
        });
        // 200 igual: Tavus reintenta y la transcripción no se duplica, pero un
        // error de nuestra base no tiene por qué repetirse en bucle.
        return NextResponse.json({ ok: false });
    }
}
