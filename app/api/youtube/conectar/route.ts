import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { laPersonaQueActua } from "@/lib/chat-de-equipo";
import { db } from "@/lib/db";
import { elOrigenDeLaApp } from "@/lib/origen-de-la-app";
import { COOKIE_DEL_VIAJE_DE_YOUTUBE, RUTA_DE_LA_COOKIE, laPaginaDeYoutube } from "@/lib/pagina-de-youtube";
import { esSuperAdminDeVerdad } from "@/lib/super-admin-de-verdad";
import {
    RUTA_DE_CONECTAR,
    VIGENCIA_DEL_VIAJE_MS,
    elEnlaceDeAutorizacion,
    firmarElEstado,
    laVuelta,
    leerLaConexion,
    unNonce,
} from "@/lib/youtube-acceso.mjs";

export const dynamic = "force-dynamic";

/**
 * Empieza la autorización del canal de YouTube de la casa: manda el navegador a
 * la pantalla de permisos de Google.
 *
 * La puerta es el **súper administrador de verdad** (`esSuperAdminDeVerdad`):
 * el canal es de la casa, no de una cuenta, y lo que se autoriza aquí deja
 * subir videos en su nombre. Con «Ingresar» puesto el rol propio no cuenta, así
 * que dentro de la cuenta de un cliente esto no se abre.
 *
 * La persona que va en el `state` sale de la sesión, nunca de la URL.
 */
export async function GET(req: Request) {
    const origen = await elOrigenDeLaApp();

    const user = await currentUser();
    if (!user?.id) {
        return NextResponse.redirect(`${origen}/login?callbackUrl=${encodeURIComponent(RUTA_DE_CONECTAR)}`);
    }
    if (!esSuperAdminDeVerdad(user as any)) {
        return laPaginaDeYoutube({
            titulo: "No autorizado",
            parrafos: ["Solo el súper administrador de la plataforma puede conectar el canal de YouTube de la casa."],
            tono: "mal",
            estado: 403,
        });
    }

    let conexion: Awaited<ReturnType<typeof leerLaConexion>>;
    try {
        conexion = await leerLaConexion(db);
    } catch (e) {
        console.error("[youtube] no se pudo leer la conexión del canal", e);
        return laPaginaDeYoutube({
            titulo: "No se pudo leer la conexión",
            parrafos: ["La base no contestó. Vuelve a intentarlo en un momento."],
            tono: "mal",
            estado: 500,
        });
    }
    const cliente = conexion?.cliente ?? null;
    if (!cliente) {
        return laPaginaDeYoutube({
            titulo: "Faltan las credenciales de Google",
            parrafos: [
                conexion?.sinDescifrar
                    ? "Las credenciales guardadas no se pueden abrir (cambió la llave de la plataforma). Hay que volver a guardarlas."
                    : "Todavía no hay credenciales de Google guardadas para el canal. Primero se guarda el archivo JSON del cliente de OAuth.",
            ],
            tono: "aviso",
            estado: 409,
        });
    }
    if (cliente.tipo !== "web") {
        return laPaginaDeYoutube({
            titulo: "Estas credenciales se autorizan con un enlace",
            parrafos: [
                "El cliente de OAuth guardado es de tipo «Escritorio»: Google no deja volver a la plataforma con él.",
                "La autorización se hace con el enlace que te da el agente; al terminar, se le pega la dirección en la que queda el navegador.",
            ],
            tono: "aviso",
        });
    }

    const vuelta = laVuelta(cliente, origen);
    const url = new URL(req.url);
    if (!cliente.redirectUris.includes(vuelta) && !url.searchParams.has("seguir")) {
        // El JSON descargado no trae esta dirección. Puede que se registrara después
        // de descargarlo, así que se ofrece seguir; si no está, Google contestará
        // «redirect_uri_mismatch» y se sabrá dónde tocar.
        return laPaginaDeYoutube({
            titulo: "Falta registrar la dirección de vuelta",
            parrafos: [
                "En Google Cloud › APIs y servicios › Credenciales, abre el cliente de OAuth y, en «URI de redireccionamiento autorizados», agrega exactamente:",
                vuelta,
                "Guarda, espera un par de minutos y pulsa Continuar.",
            ],
            enlace: { texto: "Continuar", href: `${origen}${RUTA_DE_CONECTAR}?seguir=1` },
            tono: "aviso",
        });
    }

    const persona = laPersonaQueActua(user as any);
    const nonce = unNonce();
    const estado = firmarElEstado({ personaId: persona.id, nonce, via: "navegador", exp: Date.now() + VIGENCIA_DEL_VIAJE_MS });

    const res = NextResponse.redirect(elEnlaceDeAutorizacion({ cliente, vuelta, estado }));
    res.cookies.set(COOKIE_DEL_VIAJE_DE_YOUTUBE, nonce, {
        httpOnly: true,
        secure: origen.startsWith("https://"),
        // `lax`: la vuelta de Google es una navegación de nivel superior, y con
        // `strict` la cookie no viajaría en ella.
        sameSite: "lax",
        path: RUTA_DE_LA_COOKIE,
        maxAge: Math.floor(VIGENCIA_DEL_VIAJE_MS / 1000),
    });
    return res;
}
