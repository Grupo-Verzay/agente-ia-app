import { NextResponse } from "next/server";

import { esLaFirmaDeLaCita } from "@/lib/videollamada-ia.server";
import { pedirLaSesionDelMotor, recibirLoDelMotor, recogerLasConversacionesDelMotor } from "@/lib/motor-de-verzay.server";

export const dynamic = "force-dynamic";

/**
 * El MOTOR PROPIO de la videollamada (proveedor `verzay`). Pública con la firma
 * de la cita, como el resto de `/api/videollamada`: la abre el navegador del
 * cliente, que no tiene sesión.
 *
 * - `{ a: "sesion" }` → la clave de UN uso de OpenAI Realtime (la de la cuenta
 *   nunca sale del servidor), con las instrucciones y las herramientas ya
 *   puestas en el servidor: el navegador no puede cambiarlas.
 * - `{ a: "hablado", conversacionId, frases, tokens, fin? }` → la transcripción
 *   en curso y los tokens gastados (se cobran a la cuenta, con tope por
 *   minuto); con `fin`, se entrega al resumen y al CRM.
 */
export async function POST(req: Request) {
    const url = new URL(req.url);
    const citaId = String(url.searchParams.get("c") ?? "");
    if (!citaId || !esLaFirmaDeLaCita(citaId, url.searchParams.get("f"))) {
        return NextResponse.json({ ok: false, motivo: "firma" }, { status: 401 });
    }
    const cuerpo = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    // De paso, las conversaciones que se quedaron sin colgar (pestaña cerrada).
    void recogerLasConversacionesDelMotor({ siHaceFalta: true });
    try {
        if (cuerpo.a === "sesion") {
            const r = await pedirLaSesionDelMotor(citaId);
            return NextResponse.json(r, { status: r.ok ? 200 : 409 });
        }
        if (cuerpo.a === "hablado") {
            return NextResponse.json(await recibirLoDelMotor(citaId, cuerpo));
        }
        return NextResponse.json({ ok: false, motivo: "accion" }, { status: 400 });
    } catch (error) {
        console.error("[motor] la ruta del motor falló", {
            cita: citaId,
            accion: String(cuerpo.a ?? ""),
            error: error instanceof Error ? error.message : String(error),
        });
        return NextResponse.json({ ok: false, motivo: "error" }, { status: 500 });
    }
}
