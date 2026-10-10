import { NextResponse } from "next/server";
import { traeLaClaveInterna } from "@/lib/clave-interna.server";
import { alDecidirEnLaLlamada } from "@/lib/ciclo-de-la-cita.server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Lo que la persona decidió en la llamada del minuto 5 (la herramienta
 * `responder_espera_de_cita` del asistente de voz). La reenvía el backend con
 * la clave interna. `mensaje` es lo que el asistente le dice a la persona.
 */
export async function POST(request: Request) {
    if (!traeLaClaveInterna(request)) {
        return NextResponse.json({ ok: false, mensaje: "No autorizado." }, { status: 401 });
    }
    const cuerpo = (await request.json().catch(() => null)) as { citaId?: unknown; args?: unknown } | null;
    const citaId = typeof cuerpo?.citaId === "string" ? cuerpo.citaId.trim() : "";
    if (!citaId || citaId.length > 64) return NextResponse.json({ ok: false, mensaje: "Falta la cita." }, { status: 400 });
    try {
        return NextResponse.json(await alDecidirEnLaLlamada({ citaId, args: cuerpo?.args }));
    } catch (error) {
        console.error("[ciclo-de-la-cita] fallo al apuntar la decisión de la llamada", { citaId, error: error instanceof Error ? error.message : String(error) });
        return NextResponse.json({ ok: false, mensaje: "No pude anotarlo, pero le esperamos en la reunión." }, { status: 500 });
    }
}
