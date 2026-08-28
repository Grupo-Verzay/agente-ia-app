import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { construirEnlaceWompi } from "@/actions/billing/wompi-checkout-actions";

/**
 * Enlace corto de pago: /p/K7M2QX.
 *
 * Es lo que le llega al cliente en el aviso de cobro. Se queda corto a
 * proposito -en WhatsApp el enlace crudo de Wompi son 371 caracteres y da
 * desconfianza- y ademas calcula el precio AL ABRIRSE: si al cliente se le
 * cambia el precio, el aviso que ya salio sigue cobrando lo correcto.
 *
 * No lleva sesion: quien lo abre viene del chat, sin haber entrado a la App.
 */

/** Se manda a la App con un motivo, para poder decirle algo al cliente. */
function aLaApp(motivo: string) {
    const base = process.env.NEXT_PUBLIC_APP_URL?.trim()?.replace(/\/+$/, "") ?? "";
    return NextResponse.redirect(`${base}/profile?pago=${motivo}`, { status: 302 });
}

export async function GET(
    _request: Request,
    { params }: { params: { code: string } },
) {
    const codigo = (params.code ?? "").trim().toUpperCase();
    if (!codigo) return aLaApp("codigo-invalido");

    const facturacion = await db.userBilling.findUnique({
        where: { payCode: codigo },
        select: { userId: true, user: { select: { email: true, plan: true } } },
    });

    if (!facturacion) {
        console.warn(`[pago] Código desconocido: ${codigo}.`);
        return aLaApp("codigo-invalido");
    }

    const enlace = await construirEnlaceWompi(
        facturacion.userId,
        facturacion.user?.email ?? null,
        facturacion.user?.plan ?? null,
    );

    if (!enlace.success || !enlace.url) {
        // Sin precio configurado, o sin las llaves de Wompi. Mandarlo a un
        // checkout roto seria peor que mandarlo a la App, donde ve su estado y
        // tiene el boton de escribir por WhatsApp.
        console.error(`[pago] ${codigo} (${facturacion.userId}): ${enlace.message}`);
        return aLaApp("no-disponible");
    }

    return NextResponse.redirect(enlace.url, { status: 302 });
}
