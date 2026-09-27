import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { currentUser } from "@/lib/auth";
import { laPersonaQueActua } from "@/lib/chat-de-equipo";
import { comoProveedorConBoton, laDireccionDeVuelta } from "@/lib/correo";
import { leerElEstado } from "@/lib/correo-cifrado.server";
import { guardarElBuzon } from "@/lib/correo-db";
import { cambiarElCodigo, ErrorDeCorreo, laDireccionAutorizada } from "@/lib/correo-proveedores.server";
import { elOrigenDeLaApp } from "@/lib/origen-de-la-app";

export const dynamic = "force-dynamic";

const COOKIE_DEL_VIAJE = "correo_oauth_nonce";

/**
 * La vuelta del consentimiento de Google o Microsoft.
 *
 * Tres comprobaciones, y hacen falta las tres: el `state` va FIRMADO y sin
 * caducar, su nonce coincide con la cookie de ESTE navegador, y la persona que
 * tiene la sesión abierta es la misma que empezó el viaje. Sin la tercera, un
 * enlace de vuelta abierto en otra sesión le colgaría a esa otra persona un
 * buzón ajeno.
 */
export async function GET(req: Request, { params }: { params: { proveedor: string } }) {
    const origen = await elOrigenDeLaApp();
    const volver = (q: string) => {
        const res = NextResponse.redirect(`${origen}/correo?${q}`);
        res.cookies.set(COOKIE_DEL_VIAJE, "", { path: "/api/correo/oauth", maxAge: 0 });
        return res;
    };
    const error = (motivo: string) => volver(`error=${encodeURIComponent(motivo)}`);

    const url = new URL(req.url);
    const proveedor = comoProveedorConBoton(params.proveedor);
    if (!proveedor) return error("Ese proveedor de correo no existe.");
    if (url.searchParams.get("error")) return error("Se canceló la autorización del correo.");

    const estado = leerElEstado(url.searchParams.get("state"));
    const nonce = cookies().get(COOKIE_DEL_VIAJE)?.value;
    if (!estado || !nonce || estado.nonce !== nonce || estado.proveedor !== proveedor) {
        console.warn("[correo] vuelta de autorización rechazada", { proveedor, conEstado: Boolean(estado), conCookie: Boolean(nonce) });
        return error("La autorización caducó o no es de esta sesión. Vuelve a intentarlo.");
    }

    const user = await currentUser();
    const persona = user?.id ? laPersonaQueActua(user as any) : null;
    if (!persona?.id || persona.id !== estado.personaId) {
        return error("La autorización se empezó con otra sesión. Vuelve a intentarlo.");
    }

    const codigo = url.searchParams.get("code");
    if (!codigo) return error("El proveedor no devolvió el permiso.");

    try {
        const credenciales = await cambiarElCodigo(proveedor, codigo, laDireccionDeVuelta(origen, proveedor));
        const quien = await laDireccionAutorizada(proveedor, credenciales.accessToken);
        await guardarElBuzon({
            personaId: persona.id,
            cuentaId: estado.cuentaId || null,
            proveedor,
            direccion: quien.direccion,
            nombre: quien.nombre,
            credenciales,
        });
        return volver(`conectado=${encodeURIComponent(quien.direccion)}`);
    } catch (e) {
        const motivo = e instanceof ErrorDeCorreo ? e.message : "No se pudo conectar el correo.";
        console.error("[correo] no se pudo terminar la autorización", proveedor, e);
        return error(motivo);
    }
}
