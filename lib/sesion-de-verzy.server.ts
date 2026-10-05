import "server-only";

import { encode } from "next-auth/jwt";

import { db } from "@/lib/db";
import { laCuentaDeVerzy } from "@/lib/videollamada-crm.server";

/**
 * La SESIÓN de «Verzay Ventas» que usa el navegador sin cabeza del servidor
 * (`lib/pantalla-de-verzy.server.ts`). Se fabrica EN PROCESO —una cookie de
 * Auth.js firmada con `AUTH_SECRET` para la fila de la cuenta, como la que
 * deja un login normal— y se mete en el contexto con `addCookies`. No hay
 * ruta HTTP que la entregue ni token que guardar: una ruta así sería una
 * puerta para sacar una sesión de la cuenta, y el servidor no la necesita.
 */

/** Los dos nombres de la cookie de sesión de Auth.js: en http y en https. */
export const COOKIES_DE_SESION = ["authjs.session-token", "__Secure-authjs.session-token"] as const;
export const DURACION_DE_LA_SESION_S = 12 * 60 * 60;

/**
 * Las cookies de sesión de «Verzay Ventas», UNA por nombre. Auth.js elige la
 * suya por el protocolo de `NEXTAUTH_URL` (https en producción → `__Secure-`),
 * no por el de la petición, así que van las dos; la sal de cada una es su nombre.
 */
export async function lasCookiesDeVerzy(): Promise<{ cuentaId: string; cookies: { nombre: string; valor: string }[] } | null> {
    const secreto = process.env.AUTH_SECRET;
    if (!secreto) {
        console.error("[verzy] falta AUTH_SECRET: no se puede abrir la sesión de Verzay Ventas");
        return null;
    }
    const cuenta = await laCuentaDeVerzy();
    if (!cuenta) return null;
    const fila = await db.user.findUnique({
        where: { id: cuenta.id },
        select: { id: true, role: true, plan: true, tokenVersion: true, name: true, email: true },
    });
    if (!fila) return null;
    const token = {
        sub: fila.id, id: fila.id, role: fila.role, plan: fila.plan,
        tokenVersion: fila.tokenVersion ?? 0, name: fila.name, email: fila.email,
    };
    const cookies = await Promise.all(COOKIES_DE_SESION.map(async (nombre) => ({
        nombre,
        valor: await encode({ token, secret: secreto, salt: nombre, maxAge: DURACION_DE_LA_SESION_S }),
    })));
    return { cuentaId: fila.id, cookies };
}
