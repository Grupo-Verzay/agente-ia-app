import { NextResponse } from "next/server";
import { traeLaClaveInterna } from "@/lib/clave-interna.server";
import { elTicDeLaEspera } from "@/lib/ciclo-de-la-cita.server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Una vuelta del reloj de la espera de las citas (Atendida, la llamada del
 * minuto 5, No asistida). La pide el backend cada minuto
 * (`CicloDeLaCitaSchedulerService`), con la clave interna.
 *
 * Contesta lo que hizo, así que una vuelta que no mueve nada tampoco es muda:
 *
 *     curl -X POST https://<dominio>/api/ciclo-de-citas/tic \
 *       -H "x-internal-secret: $CRM_FOLLOW_UP_RUNNER_KEY"
 */
export async function POST(request: Request) {
    if (!traeLaClaveInterna(request)) {
        return NextResponse.json({ ok: false, motivo: "No autorizado." }, { status: 401 });
    }
    try {
        const resultado = await elTicDeLaEspera();
        if (resultado.fallos > 0) console.warn("[ciclo-de-la-cita] vuelta con fallos", resultado);
        return NextResponse.json({ ok: true, ...resultado });
    } catch (error) {
        console.error("[ciclo-de-la-cita] la vuelta del reloj reventó", { error: error instanceof Error ? error.message : String(error) });
        return NextResponse.json({ ok: false, motivo: "La vuelta del reloj falló." }, { status: 500 });
    }
}
