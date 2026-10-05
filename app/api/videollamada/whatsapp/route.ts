import { NextResponse } from "next/server";

import { laOrdenDeEnvio, NOMBRE_DEL_ENVIO } from "@/lib/pantalla-del-avatar";
import { esLaFirmaDeLaCita } from "@/lib/videollamada-ia.server";
import { enviarDesdeLaVideollamada } from "@/lib/whatsapp-de-la-videollamada.server";

export const dynamic = "force-dynamic";

/**
 * La sala avisa aquí cuando el avatar pide mandar un enlace por WhatsApp.
 * PÚBLICA (la llama el navegador del prospecto, sin sesión) y su puerta es la
 * firma de la cita (`?c=&f=`), la misma del aviso de Tavus. El número y la
 * línea los pone el servidor desde la cita: del navegador solo llega QUÉ se
 * manda (la web, un plan, el pago), validado con la misma regla de la sala.
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
    const orden = laOrdenDeEnvio({
        event_type: "conversation.tool_call",
        properties: { name: NOMBRE_DEL_ENVIO, arguments: cuerpo },
    });
    if (!orden) return NextResponse.json({ ok: false, motivo: "orden no válida" }, { status: 400 });
    try {
        return NextResponse.json(await enviarDesdeLaVideollamada(citaId, orden));
    } catch (error) {
        const motivo = error instanceof Error ? error.message : String(error);
        console.error("[videollamada] falló el envío por WhatsApp", { cita: citaId, motivo });
        return NextResponse.json({ ok: false, motivo }, { status: 500 });
    }
}
