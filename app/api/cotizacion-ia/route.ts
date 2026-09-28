import { NextResponse } from "next/server";
import { prepararLaCotizacion } from "@/lib/cotizacion-ia.server";

/**
 * POST /api/cotizacion-ia — la llama el BACKEND cuando el agente usa su
 * herramienta `Enviar_Cotizacion`.
 *
 * Se autentica SOLO con la clave interna (`CRM_FOLLOW_UP_RUNNER_KEY`), como las
 * demás herramientas del agente: no la abre ningún navegador. Por eso su
 * prefijo está entre los que el middleware deja pasar sin sesión (si no, el
 * `fetch` del backend seguiría la redirección al login y vería un 200 con la
 * página de login dentro).
 *
 * Cuerpo: { userId, remoteJid, nombreCliente?, items: [{ producto, cantidad }],
 *           pideCondicionesEspeciales?, detalleCondiciones? }
 *
 * Contesta la decisión: `lista` (con la URL del PDF), `aclarar`, `escalar`,
 * `vacia`, `apagada` o `error`. Quien la llama decide qué hacer con cada una.
 */
function autorizada(request: Request): boolean {
    const esperada = (process.env.CRM_FOLLOW_UP_RUNNER_KEY ?? "").trim();
    if (!esperada) return false;
    const bearer = request.headers.get("authorization");
    const secreto = bearer?.startsWith("Bearer ")
        ? bearer.slice(7).trim()
        : (request.headers.get("x-internal-secret") ?? "").trim();
    return secreto === esperada;
}

export async function POST(request: Request) {
    if (!autorizada(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    let body: Record<string, unknown>;
    try {
        body = (await request.json()) as Record<string, unknown>;
    } catch {
        return NextResponse.json({ error: "Cuerpo inválido" }, { status: 400 });
    }
    const cuentaId = typeof body.userId === "string" ? body.userId.trim() : "";
    const remoteJid = typeof body.remoteJid === "string" ? body.remoteJid.trim() : "";
    if (!cuentaId || !remoteJid) {
        return NextResponse.json({ error: "Faltan userId o remoteJid" }, { status: 400 });
    }

    try {
        const respuesta = await prepararLaCotizacion({
            cuentaId,
            remoteJid,
            nombreCliente: typeof body.nombreCliente === "string" ? body.nombreCliente : null,
            items: body.items,
            pideCondicionesEspeciales: body.pideCondicionesEspeciales === true,
            detalleCondiciones: typeof body.detalleCondiciones === "string" ? body.detalleCondiciones : null,
        });
        if (respuesta.estado !== "lista") {
            console.info("[cotizacion-ia] no se genera", { cuentaId, estado: respuesta.estado });
        }
        return NextResponse.json(respuesta);
    } catch (error) {
        console.error("[cotizacion-ia] no se pudo preparar la cotización", { cuentaId, error: String(error) });
        return NextResponse.json({ estado: "error", motivo: "No se pudo generar la cotización." });
    }
}
