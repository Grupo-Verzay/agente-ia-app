import { NextResponse } from "next/server";

import { esLaFirmaDeLaCita } from "@/lib/videollamada-ia.server";
import { losServidoresIce } from "@/lib/llamada-de-voz";
import { dejarUnaSenal, latirEnLaSala, recogerLasSenales, salirDeLaSala } from "@/lib/motor-de-verzay-db";
import { comoLatidoDeLaSala, VIVOS_EN_LA_SALA_S } from "@/lib/sala-propia";

export const dynamic = "force-dynamic";

/**
 * La señalización de la SALA PROPIA (proveedor `verzay`): con Tavus, Daily
 * junta a las personas de la sala; con el motor propio se conectan entre ellas
 * por WebRTC y se encuentran aquí. Una vuelta por latido: «sigo aquí», las
 * ofertas y respuestas que mando, y lo que me espera. Pública con la firma de
 * la cita, como el resto de `/api/videollamada`.
 */
export async function POST(req: Request) {
    const url = new URL(req.url);
    const citaId = String(url.searchParams.get("c") ?? "");
    if (!citaId || !esLaFirmaDeLaCita(citaId, url.searchParams.get("f"))) {
        return NextResponse.json({ ok: false, motivo: "firma" }, { status: 401 });
    }
    const latido = comoLatidoDeLaSala(await req.json().catch(() => null));
    if (!latido) return NextResponse.json({ ok: false, motivo: "latido" }, { status: 400 });
    try {
        if (latido.salir) {
            await salirDeLaSala(citaId, latido.participanteId);
            return NextResponse.json({ ok: true, presentes: [], senales: [] });
        }
        for (const s of latido.senales) await dejarUnaSenal(citaId, latido.participanteId, s.para, s.tipo, s.cuerpo);
        const presentes = await latirEnLaSala(citaId, latido, VIVOS_EN_LA_SALA_S);
        const senales = await recogerLasSenales(citaId, latido.participanteId);
        return NextResponse.json({
            ok: true,
            presentes,
            senales: senales.map((s) => ({ de: s.de, tipo: s.tipo, cuerpo: s.cuerpo })),
            ice: losServidoresIce({ TURN_URL: process.env.TURN_URL, TURN_USER: process.env.TURN_USER, TURN_PASSWORD: process.env.TURN_PASSWORD }),
        });
    } catch (error) {
        console.error("[sala-propia] la señalización falló", {
            cita: citaId,
            error: error instanceof Error ? error.message : String(error),
        });
        return NextResponse.json({ ok: false, motivo: "error" }, { status: 500 });
    }
}
