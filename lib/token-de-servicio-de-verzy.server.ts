import "server-only";

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { encode } from "next-auth/jwt";

import { db } from "@/lib/db";
import { abrir, sellar } from "@/lib/correo-cifrado.server";
import { laCuentaDeVerzy } from "@/lib/videollamada-crm.server";

/**
 * El TOKEN DE SERVICIO de Verzy: la llave con la que el servidor de la
 * videollamada abre —y mantiene abierta— una sesión de verdad de la cuenta
 * «Verzay Ventas». **Nunca sale del servidor**: no viaja a la sala, ni al
 * prospecto, ni a ninguna respuesta. Lo usa el navegador sin cabeza del propio
 * servidor (`lib/pantalla-de-verzy.server.ts`) para entrar por
 * `/api/videollamada/servicio/entrar`.
 *
 * De dónde sale, por orden:
 *  1. `VERZY_TOKEN_DE_SERVICIO` en el entorno (el stack), si alguien lo pone.
 *  2. Si no, lo GENERA el propio servidor la primera vez (32 bytes al azar) y
 *     lo guarda SELLADO en `verzy_token_de_servicio` (tabla de la App), con la
 *     misma llave que las credenciales del correo. Las dos réplicas leen el
 *     mismo: el `ON CONFLICT DO NOTHING` decide cuál vale.
 *
 * Lo que la sesión es: una cookie de Auth.js firmada con `AUTH_SECRET` para la
 * fila de la cuenta, como la que deja un login normal. No hay contraseña de
 * nadie de por medio.
 */

const CLAVE = "verzy";
let tablaLista: Promise<void> | null = null;
let recordado: string | null = null;

async function ddl(ejecutar: () => Promise<unknown>): Promise<void> {
    try {
        await ejecutar();
    } catch (error) {
        const e = error as { code?: unknown; meta?: { code?: unknown }; message?: unknown };
        const codigo = String(e?.meta?.code ?? e?.code ?? "");
        const texto = String(e?.message ?? "");
        if (!["23505", "42P07", "42710"].some((c) => codigo === c || texto.includes(c))) throw error;
    }
}

function asegurarLaTabla(): Promise<void> {
    tablaLista ??= ddl(() => db.$executeRaw`
        CREATE TABLE IF NOT EXISTS "verzy_token_de_servicio" (
            "clave" TEXT PRIMARY KEY,
            "sellado" TEXT NOT NULL,
            "huella" TEXT NOT NULL,
            "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
    `).catch((error) => {
        tablaLista = null;
        throw error;
    });
    return tablaLista;
}

export function laHuella(token: string): string {
    return createHash("sha256").update(token).digest("hex");
}

/** El token en claro. SOLO para el servidor. */
export async function elTokenDeServicio(): Promise<string> {
    const delEntorno = String(process.env.VERZY_TOKEN_DE_SERVICIO ?? "").trim();
    if (delEntorno.length >= 32) return delEntorno;
    if (delEntorno) console.warn("[verzy] VERZY_TOKEN_DE_SERVICIO es demasiado corto (mínimo 32); se usa el generado");
    if (recordado) return recordado;
    await asegurarLaTabla();
    const nuevo = randomBytes(32).toString("base64url");
    await db.$executeRaw`
        INSERT INTO "verzy_token_de_servicio" ("clave", "sellado", "huella")
        VALUES (${CLAVE}, ${sellar(nuevo)}, ${laHuella(nuevo)})
        ON CONFLICT ("clave") DO NOTHING
    `;
    const filas = await db.$queryRaw<{ sellado: string }[]>`
        SELECT "sellado" FROM "verzy_token_de_servicio" WHERE "clave" = ${CLAVE}
    `;
    const token = abrir<string>(filas[0]?.sellado);
    if (!token) throw new Error("No se pudo abrir el token de servicio de Verzy (¿cambió AUTH_SECRET?)");
    recordado = token;
    return token;
}

/** ¿Es este el token de servicio? Comparación de tiempo constante sobre la huella. */
export async function esElTokenDeServicio(pedido: string | null | undefined): Promise<boolean> {
    const t = String(pedido ?? "").trim();
    if (t.length < 32) return false;
    const bueno = Buffer.from(laHuella(await elTokenDeServicio()), "hex");
    const dado = Buffer.from(laHuella(t), "hex");
    return bueno.length === dado.length && timingSafeEqual(bueno, dado);
}

/** Los dos nombres de la cookie de sesión de Auth.js: en http y en https. */
export const COOKIES_DE_SESION = ["authjs.session-token", "__Secure-authjs.session-token"] as const;
export const DURACION_DE_LA_SESION_S = 12 * 60 * 60;

/**
 * Las cookies de sesión de «Verzay Ventas», firmadas con `AUTH_SECRET`. Una por
 * nombre: Auth.js elige el suyo según la petición sea http o https, y la sal
 * de cada una es su nombre.
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
