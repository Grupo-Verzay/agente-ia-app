import { cookies } from "next/headers";
import { currentUser } from "@/lib/auth";
import { laPersonaQueActua } from "@/lib/chat-de-equipo";
import { db } from "@/lib/db";
import { elOrigenDeLaApp } from "@/lib/origen-de-la-app";
import { COOKIE_DEL_VIAJE_DE_YOUTUBE, RUTA_DE_LA_COOKIE, laPaginaDeYoutube } from "@/lib/pagina-de-youtube";
import { esSuperAdminDeVerdad } from "@/lib/super-admin-de-verdad";
import {
    ErrorDeYoutube,
    RUTA_DE_CONECTAR,
    anotarElError,
    cambiarElCodigo,
    elCanalAutorizado,
    guardarElAcceso,
    laVuelta,
    leerElEstado,
    leerLaConexion,
} from "@/lib/youtube-acceso.mjs";

export const dynamic = "force-dynamic";

/**
 * La vuelta de Google con el permiso del canal.
 *
 * Cuatro comprobaciones, y hacen falta las cuatro: el `state` va FIRMADO, sin
 * caducar y empezado desde el navegador (no desde el enlace del agente); su
 * nonce coincide con la cookie de ESTE navegador; quien tiene la sesión abierta
 * es la misma persona que lo empezó; y esa persona sigue siendo el súper
 * administrador. Sin la tercera, un enlace de vuelta abierto en otra sesión le
 * colgaría al canal de la casa el permiso de otra cuenta de Google.
 *
 * El permiso permanente se guarda sellado y NUNCA se enseña: la página solo
 * dice qué canal quedó conectado.
 */
export async function GET(req: Request) {
    const origen = await elOrigenDeLaApp();
    const reintentar = { texto: "Volver a intentarlo", href: `${origen}${RUTA_DE_CONECTAR}` };
    const pagina = (p: Parameters<typeof laPaginaDeYoutube>[0]) => {
        const res = laPaginaDeYoutube(p);
        res.cookies.set(COOKIE_DEL_VIAJE_DE_YOUTUBE, "", { path: RUTA_DE_LA_COOKIE, maxAge: 0 });
        return res;
    };

    const url = new URL(req.url);
    if (url.searchParams.get("error")) {
        return pagina({
            titulo: "Se canceló la autorización",
            parrafos: ["Google no dio el permiso: se canceló en la pantalla de Google. No se guardó nada."],
            enlace: reintentar,
            tono: "aviso",
        });
    }

    const estado = leerElEstado(url.searchParams.get("state"));
    const nonce = cookies().get(COOKIE_DEL_VIAJE_DE_YOUTUBE)?.value;
    if (!estado || estado.via !== "navegador" || !nonce || estado.nonce !== nonce) {
        console.warn("[youtube] vuelta de autorización rechazada", { conEstado: Boolean(estado), conCookie: Boolean(nonce) });
        return pagina({
            titulo: "La autorización caducó",
            parrafos: ["La autorización caducó o no se empezó en este navegador. Vuelve a empezarla."],
            enlace: reintentar,
            tono: "mal",
            estado: 400,
        });
    }

    const user = await currentUser();
    const persona = user?.id ? laPersonaQueActua(user as any) : null;
    if (!user || !persona?.id || persona.id !== estado.personaId || !esSuperAdminDeVerdad(user as any)) {
        console.warn("[youtube] vuelta de autorización de otra sesión", { conSesion: Boolean(user) });
        return pagina({
            titulo: "No autorizado",
            parrafos: ["La autorización se empezó con otra sesión, o esta sesión no es la del súper administrador."],
            tono: "mal",
            estado: 403,
        });
    }

    const codigo = url.searchParams.get("code");
    if (!codigo) {
        return pagina({ titulo: "Google no devolvió el permiso", parrafos: ["Vuelve a empezar la autorización."], enlace: reintentar, tono: "mal", estado: 400 });
    }

    try {
        const conexion = await leerLaConexion(db);
        if (!conexion?.cliente) {
            throw new ErrorDeYoutube("sin_cliente", "Ya no hay credenciales de Google guardadas para el canal.");
        }
        const t = await cambiarElCodigo({ cliente: conexion.cliente, codigo, vuelta: laVuelta(conexion.cliente, origen) });
        const canal = await elCanalAutorizado({ accessToken: t.accessToken });
        await guardarElAcceso(db, { refreshToken: t.refreshToken, alcance: t.alcance, canal, conectadoPor: persona.id });
        const parrafos = [`Quedó conectado el canal «${canal.titulo || canal.id}». El permiso se guardó cifrado y sirve para las próximas subidas.`];
        if (!canal.verificado) {
            parrafos.push(
                "Ojo: el canal no está verificado con teléfono, así que YouTube no deja ponerle miniatura personalizada a los videos. Se verifica en youtube.com/verify.",
            );
        }
        parrafos.push("Ya puedes cerrar esta pestaña.");
        return pagina({ titulo: "Canal de YouTube conectado", parrafos, tono: "bien" });
    } catch (e) {
        const motivo = e instanceof ErrorDeYoutube ? e.message : "No se pudo conectar el canal de YouTube.";
        console.error("[youtube] no se pudo terminar la autorización", e);
        try {
            await anotarElError(db, motivo);
        } catch (errorAlAnotar) {
            console.error("[youtube] no se pudo anotar el error de la autorización", errorAlAnotar);
        }
        return pagina({ titulo: "No se pudo conectar el canal", parrafos: [motivo], enlace: reintentar, tono: "mal", estado: 502 });
    }
}
