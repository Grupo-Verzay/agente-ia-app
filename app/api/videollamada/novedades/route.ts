import { NextResponse } from "next/server";

import { lasNovedadesDelPago } from "@/lib/videollamada-en-vivo.server";
import { esLaFirmaDeLaCita } from "@/lib/videollamada-ia.server";

export const dynamic = "force-dynamic";

/**
 * La sala pregunta aquí cada poco si el prospecto ya creó su cuenta o pagó,
 * para contárselo a Verzy. PÚBLICA con la firma de la cita; solo devuelve el
 * estado y el aviso, nunca datos de la cuenta.
 */
export async function GET(req: Request) {
    const url = new URL(req.url);
    const citaId = String(url.searchParams.get("c") ?? "");
    if (!citaId || !esLaFirmaDeLaCita(citaId, url.searchParams.get("f"))) {
        return NextResponse.json({ ok: false, motivo: "firma inválida" }, { status: 401 });
    }
    try {
        return NextResponse.json({ ok: true, ...(await lasNovedadesDelPago(citaId)) });
    } catch (error) {
        const motivo = error instanceof Error ? error.message : String(error);
        console.warn("[videollamada] no se pudieron leer las novedades del pago", { cita: citaId, motivo });
        return NextResponse.json({ ok: false, motivo }, { status: 500 });
    }
}
