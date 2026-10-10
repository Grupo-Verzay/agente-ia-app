import { NextResponse } from "next/server";
import { traeLaClaveInterna } from "@/lib/clave-interna.server";
import { alEscribirElCliente } from "@/lib/ciclo-de-la-cita.server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Lo que escribió un contacto que tiene cita. Lo reenvía el backend al
 * recibir el mensaje (`CicloDeLaCitaService.alRecibirTexto`), con la clave
 * interna, ANTES de que lo conteste el agente.
 *
 * `{ manejado: true }` quiere decir que el mensaje era la respuesta al
 * recordatorio («Sí»/«No») y ya se contestó: el agente no lo vuelve a contestar.
 */
export async function POST(request: Request) {
    if (!traeLaClaveInterna(request)) {
        return NextResponse.json({ manejado: false, motivo: "No autorizado." }, { status: 401 });
    }
    const cuerpo = (await request.json().catch(() => null)) as { sessionId?: unknown; texto?: unknown } | null;
    const sessionId = Number(cuerpo?.sessionId);
    const texto = typeof cuerpo?.texto === "string" ? cuerpo.texto.slice(0, 2000) : "";
    if (!Number.isInteger(sessionId) || sessionId <= 0 || !texto.trim()) {
        return NextResponse.json({ manejado: false, que: "nada" });
    }
    try {
        return NextResponse.json(await alEscribirElCliente({ sessionId, texto }));
    } catch (error) {
        console.error("[ciclo-de-la-cita] fallo al leer el mensaje del cliente", { sessionId, error: error instanceof Error ? error.message : String(error) });
        return NextResponse.json({ manejado: false, que: "nada" }, { status: 500 });
    }
}
