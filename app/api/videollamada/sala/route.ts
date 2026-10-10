import { NextResponse } from "next/server";

import { abrirLaVideollamada, esLaFirmaDeLaCita, marcarLaEntradaReal, terminarLaConversacion } from "@/lib/videollamada-ia.server";

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

/**
 * La sala se unió a la llamada: se apunta que el cliente ENTRÓ. Va aparte del
 * POST y de la página a propósito: abrir o precargar el enlace no es entrar.
 */
export async function PUT(req: Request) {
    const url = new URL(req.url);
    const citaId = String(url.searchParams.get("c") ?? "");
    if (!citaId || !esLaFirmaDeLaCita(citaId, url.searchParams.get("f"))) {
        return NextResponse.json({ ok: false, estado: "firma" }, { status: 401 });
    }
    try {
        await marcarLaEntradaReal(citaId);
        return NextResponse.json({ ok: true });
    } catch (error) {
        console.error("[videollamada] no se pudo apuntar la entrada", {
            cita: citaId,
            error: error instanceof Error ? error.message : String(error),
        });
        return NextResponse.json({ ok: false }, { status: 500 });
    }
}

/**
 * Se colgó A PROPÓSITO («Salir», la despedida, el límite) y no queda nadie más:
 * se termina la conversación en Tavus para que deje de cobrar al momento
 * (`terminaLaConversacionAlColgar` decide en la sala). Pública con la firma
 * de la cita, como el resto: lo peor que alguien con el enlace puede hacer es
 * colgar su propia llamada.
 */
export async function DELETE(req: Request) {
    const url = new URL(req.url);
    const citaId = String(url.searchParams.get("c") ?? "");
    if (!citaId || !esLaFirmaDeLaCita(citaId, url.searchParams.get("f"))) {
        return NextResponse.json({ ok: false, estado: "firma" }, { status: 401 });
    }
    const r = await terminarLaConversacion(citaId);
    return NextResponse.json(r);
}
