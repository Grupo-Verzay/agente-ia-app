import { NextResponse } from "next/server";

import { laOrdenDeAgendar, NOMBRE_DEL_AGENDAR } from "@/lib/pantalla-del-avatar";
import { agendarDesdeLaVideollamada } from "@/lib/videollamada-en-vivo.server";
import { esLaFirmaDeLaCita } from "@/lib/videollamada-ia.server";

export const dynamic = "force-dynamic";

/**
 * La sala avisa aquí cuando Verzy confirma el siguiente paso (una cita, un
 * recordatorio o una llamada). PÚBLICA y su puerta es la firma de la cita,
 * como `/api/videollamada/whatsapp`. Del navegador solo llega el tipo, la
 * fecha y la nota, validados con la misma regla de la sala; la cuenta, el
 * número y la línea salen de la cita.
 */
export async function POST(req: Request) {
    const url = new URL(req.url);
    const citaId = String(url.searchParams.get("c") ?? "");
    if (!citaId || !esLaFirmaDeLaCita(citaId, url.searchParams.get("f"))) {
        return NextResponse.json({ ok: false, motivo: "firma inválida" }, { status: 401 });
    }
    let cuerpo: unknown = null;
    try {
        cuerpo = await req.json();
    } catch {
        return NextResponse.json({ ok: false, motivo: "sin JSON" }, { status: 400 });
    }
    const orden = laOrdenDeAgendar({
        event_type: "conversation.tool_call",
        properties: { name: NOMBRE_DEL_AGENDAR, arguments: cuerpo },
    });
    if (!orden) return NextResponse.json({ ok: false, motivo: "orden no válida" }, { status: 400 });
    try {
        return NextResponse.json(await agendarDesdeLaVideollamada(citaId, orden));
    } catch (error) {
        const motivo = error instanceof Error ? error.message : String(error);
        console.error("[videollamada] falló agendar", { cita: citaId, motivo });
        return NextResponse.json({ ok: false, motivo }, { status: 500 });
    }
}
