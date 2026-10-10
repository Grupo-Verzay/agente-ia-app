import { NextResponse } from "next/server";

import { comoPedidoDeAtencion } from "@/lib/atencion-de-la-videollamada";
import { atenderDesdeLaVideollamada } from "@/lib/atencion-de-la-videollamada.server";
import { esLaFirmaDeLaCita } from "@/lib/videollamada-ia.server";

export const dynamic = "force-dynamic";

/**
 * La sala avisa aquí de lo que pasa en la conversación: el cliente pidió un
 * humano, se nota incómodo, dijo que no (la cita a Descartado), quedó en hablar
 * con un asesor o se acabó el tiempo (el seguimiento pasa a WhatsApp). PÚBLICA
 * (la llama el navegador del prospecto, sin sesión) y su puerta es la firma de
 * la cita (`?c=&f=`). A quién se avisa y por qué línea lo pone el servidor
 * desde la cita; cada cosa, una vez por conversación.
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
    const pedido = comoPedidoDeAtencion(cuerpo);
    if (!pedido) return NextResponse.json({ ok: false, motivo: "pedido no válido" }, { status: 400 });
    try {
        return NextResponse.json(await atenderDesdeLaVideollamada(citaId, pedido));
    } catch (error) {
        const motivo = error instanceof Error ? error.message : String(error);
        console.error("[videollamada] falló el pedido de atención", { cita: citaId, tipo: pedido.tipo, motivo });
        return NextResponse.json({ ok: false, motivo }, { status: 500 });
    }
}
