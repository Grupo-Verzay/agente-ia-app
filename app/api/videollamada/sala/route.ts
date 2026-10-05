import { NextResponse } from "next/server";

import { abrirLaVideollamada, esLaFirmaDeLaCita } from "@/lib/videollamada-ia.server";

export const dynamic = "force-dynamic";

/**
 * Reconectar: la sala la llama cuando se le cae la conexión. Vuelve a abrir la
 * videollamada de ESA cita con la misma regla que el enlace —reutiliza la
 * conversación de Tavus si sigue viva, o crea otra con lo ya hablado—, así que
 * el avatar continúa en vez de empezar de cero. Pública con la firma de la cita.
 */
export async function POST(req: Request) {
    const url = new URL(req.url);
    const citaId = String(url.searchParams.get("c") ?? "");
    if (!citaId || !esLaFirmaDeLaCita(citaId, url.searchParams.get("f"))) {
        return NextResponse.json({ ok: false, estado: "firma" }, { status: 401 });
    }
    const r = await abrirLaVideollamada(citaId);
    if (r.estado !== "ir") return NextResponse.json({ ok: false, estado: r.estado });
    return NextResponse.json({ ok: true, url: r.url, reentrada: r.reentrada });
}
