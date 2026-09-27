import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { laPersonaQueActua } from "@/lib/chat-de-equipo";
import { comoProveedorConBoton, hayLlavesDe, laDireccionDeAutorizacion, laDireccionDeVuelta } from "@/lib/correo";
import { firmarElEstado, unNonce } from "@/lib/correo-cifrado.server";
import { elOrigenDeLaApp } from "@/lib/origen-de-la-app";

export const dynamic = "force-dynamic";

/** La cookie que ata la vuelta a ESTE navegador. */
const COOKIE_DEL_VIAJE = "correo_oauth_nonce";

/**
 * El botón «Conectar Gmail / Outlook» navega aquí, y esto lo manda al
 * consentimiento del proveedor. Es una ruta y no una acción porque lo que hace
 * es REDIRIGIR el navegador entero.
 *
 * La puerta es la sesión: sin ella se vuelve al login. Y la persona que se
 * mete en el `state` sale de la sesión, nunca de la URL.
 */
export async function GET(_req: Request, { params }: { params: { proveedor: string } }) {
    const origen = await elOrigenDeLaApp();
    const volver = (error: string) => NextResponse.redirect(`${origen}/correo?error=${encodeURIComponent(error)}`);

    const user = await currentUser();
    if (!user?.id) return NextResponse.redirect(`${origen}/login?callbackUrl=%2Fcorreo`);

    const proveedor = comoProveedorConBoton(params.proveedor);
    if (!proveedor) return volver("Ese proveedor de correo no existe.");
    if (!hayLlavesDe(proveedor, process.env)) {
        return volver(`La conexión con ${proveedor === "gmail" ? "Google" : "Microsoft"} todavía no está configurada en la plataforma.`);
    }

    const persona = laPersonaQueActua(user as any);
    const nonce = unNonce();
    const estado = firmarElEstado({
        personaId: persona.id,
        cuentaId: (user as any).ownerId ?? user.id,
        proveedor,
        nonce,
        exp: Date.now() + 10 * 60_000,
    });
    const clientId = (proveedor === "gmail" ? process.env.GOOGLE_OAUTH_CLIENT_ID : process.env.MICROSOFT_OAUTH_CLIENT_ID)!;
    const destino = laDireccionDeAutorizacion(proveedor, {
        clientId,
        vuelta: laDireccionDeVuelta(origen, proveedor),
        estado,
    });

    const res = NextResponse.redirect(destino);
    res.cookies.set(COOKIE_DEL_VIAJE, nonce, {
        httpOnly: true,
        secure: origen.startsWith("https://"),
        // `lax`: la vuelta del proveedor es una navegación de nivel superior,
        // y con `strict` la cookie no viajaría en ella.
        sameSite: "lax",
        path: "/api/correo/oauth",
        maxAge: 600,
    });
    return res;
}
