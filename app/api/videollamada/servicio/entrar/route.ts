import { NextResponse } from "next/server";

import { DURACION_DE_LA_SESION_S, esElTokenDeServicio, lasCookiesDeVerzy } from "@/lib/token-de-servicio-de-verzy.server";

export const dynamic = "force-dynamic";

/**
 * Cambia el TOKEN DE SERVICIO de Verzy por una sesión de «Verzay Ventas». Solo
 * lo llama el navegador sin cabeza del propio servidor
 * (`lib/pantalla-de-verzy.server.ts`); sin el token contesta 401 y no dice
 * nada más. El token no aparece en ninguna respuesta.
 */
export async function POST(req: Request) {
    if (!(await esElTokenDeServicio(req.headers.get("x-verzy-servicio")))) {
        return NextResponse.json({ ok: false }, { status: 401 });
    }
    try {
        const sesion = await lasCookiesDeVerzy();
        if (!sesion) return NextResponse.json({ ok: false, motivo: "sin cuenta de Verzay Ventas" }, { status: 503 });
        const res = NextResponse.json({ ok: true });
        const segura = new URL(req.url).protocol === "https:";
        for (const c of sesion.cookies) {
            if (c.nombre.startsWith("__Secure-") && !segura) continue;
            res.cookies.set(c.nombre, c.valor, {
                httpOnly: true, sameSite: "lax", path: "/", maxAge: DURACION_DE_LA_SESION_S, secure: c.nombre.startsWith("__Secure-"),
            });
        }
        return res;
    } catch (error) {
        console.error("[verzy] no se pudo abrir la sesión de servicio", { motivo: error instanceof Error ? error.message : String(error) });
        return NextResponse.json({ ok: false }, { status: 500 });
    }
}
