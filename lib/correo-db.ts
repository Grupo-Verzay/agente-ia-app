import "server-only";

import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { abrir, sellar } from "@/lib/correo-cifrado.server";
import { comoProveedor, type ProveedorDeCorreo } from "@/lib/correo";

/**
 * Dónde vive un buzón conectado: `correo_cuentas`, tabla de la App con
 * `CREATE TABLE IF NOT EXISTS` y sin clave foránea, como `nota_rapida`. Ni una
 * columna en `User` (es del backend, el #360).
 *
 * # El correo NO es Chats, y por eso no se guarda ningún mensaje
 *
 * Esta tabla guarda **la conexión y nada más**. Los correos se leen del
 * proveedor al abrir la bandeja y no se escriben en ninguna parte: ni en
 * `chat_messages`, ni en `chat_conversations`, ni en `Session`. Eso no es una
 * simplificación: es lo que hace imposible que un correo cree una ficha de
 * lead, entre en el reparto automático de asesores o salga en la bandeja de
 * otra persona — todo eso cuelga de esas tablas, y aquí no se toca ninguna.
 * Lo comprueba el banco (`correo-db.test.mjs`) contando filas antes y después.
 *
 * # De la PERSONA, no de la cuenta
 *
 * `personaId` es quien está sentado delante (`laPersonaQueActua`), también
 * dentro de otra cuenta con «Ingresar». **Toda consulta de aquí lleva
 * `personaId` en el `WHERE`**: no hay ninguna función que devuelva un buzón por
 * su id a secas. Ni el dueño de la cuenta, ni un administrador, ni el súper
 * administrador ven el correo de otra persona: es su correo, no un canal de la
 * empresa. `cuentaId` se guarda solo para saber desde qué cuenta se conectó.
 */

let tablaLista: Promise<void> | null = null;

async function ddl(ejecutar: () => Promise<unknown>): Promise<void> {
    try {
        await ejecutar();
    } catch (error) {
        const e = error as { code?: unknown; meta?: { code?: unknown }; message?: unknown };
        const codigo = String(e?.meta?.code ?? e?.code ?? "");
        const texto = String(e?.message ?? "");
        const yaEstaba = ["23505", "42P07", "42710"].some((c) => codigo === c || texto.includes(c));
        if (!yaEstaba) throw error;
    }
}

function asegurarLaTabla(): Promise<void> {
    tablaLista ??= (async () => {
        await ddl(() => db.$executeRaw`
            CREATE TABLE IF NOT EXISTS "correo_cuentas" (
                "id" TEXT PRIMARY KEY,
                "personaId" TEXT NOT NULL,
                "cuentaId" TEXT,
                "proveedor" TEXT NOT NULL,
                "direccion" TEXT NOT NULL,
                "nombre" TEXT,
                "credenciales" TEXT NOT NULL,
                "estado" TEXT NOT NULL DEFAULT 'conectada',
                "ultimoError" TEXT,
                "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
                "actualizadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
        `);
        // Un buzón por persona, proveedor y dirección: volver a conectar el
        // mismo correo lo ACTUALIZA en vez de duplicarlo.
        await ddl(() => db.$executeRaw`
            CREATE UNIQUE INDEX IF NOT EXISTS "correo_cuentas_persona_buzon_key"
            ON "correo_cuentas" ("personaId", "proveedor", "direccion")
        `);
    })().catch((error) => {
        tablaLista = null;
        throw error;
    });
    return tablaLista;
}

function esTablaQueFalta(error: unknown): boolean {
    const e = error as { code?: string; meta?: { code?: string }; message?: string };
    return e?.meta?.code === "42P01" || e?.code === "42P01" || Boolean(e?.message?.includes("42P01"));
}

async function conLaTabla<T>(hacer: () => Promise<T>): Promise<T> {
    await asegurarLaTabla();
    try {
        return await hacer();
    } catch (error) {
        if (!esTablaQueFalta(error)) throw error;
        tablaLista = null;
        await asegurarLaTabla();
        return hacer();
    }
}

export type EstadoDelBuzon = "conectada" | "reconectar";

/** Lo que baja al navegador: sin credenciales, nunca. */
export interface BuzonVisible {
    id: string;
    proveedor: ProveedorDeCorreo;
    direccion: string;
    nombre: string | null;
    estado: EstadoDelBuzon;
    ultimoError: string | null;
}

export interface CredencialesOAuth {
    tipo: "oauth";
    accessToken: string;
    refreshToken: string;
    /** Milisegundos. */
    expiraEn: number;
}

export interface CredencialesImap {
    tipo: "imap";
    usuario: string;
    contrasena: string;
    imapHost: string;
    imapPuerto: number;
    imapSeguro: boolean;
    smtpHost: string;
    smtpPuerto: number;
    smtpSeguro: boolean;
}

export type Credenciales = CredencialesOAuth | CredencialesImap;

export interface Buzon extends BuzonVisible {
    personaId: string;
    /** `null` si no se pudieron descifrar (cambió `AUTH_SECRET`): hay que reconectar. */
    credenciales: Credenciales | null;
}

type Fila = {
    id: string;
    personaId: string;
    proveedor: string;
    direccion: string;
    nombre: string | null;
    credenciales: string;
    estado: string;
    ultimoError: string | null;
};

function comoVisible(f: Fila): BuzonVisible | null {
    const proveedor = comoProveedor(f.proveedor);
    if (!proveedor) return null;
    return {
        id: f.id,
        proveedor,
        direccion: f.direccion,
        nombre: f.nombre,
        estado: f.estado === "reconectar" ? "reconectar" : "conectada",
        ultimoError: f.ultimoError,
    };
}

export async function losBuzonesDe(personaId: string): Promise<BuzonVisible[]> {
    if (!personaId) return [];
    return conLaTabla(async () => {
        const filas = await db.$queryRaw<Fila[]>`
            SELECT "id", "personaId", "proveedor", "direccion", "nombre", '' AS "credenciales", "estado", "ultimoError"
            FROM "correo_cuentas"
            WHERE "personaId" = ${personaId}
            ORDER BY "creadoEn" ASC
        `;
        return filas.map(comoVisible).filter((b): b is BuzonVisible => b !== null);
    });
}

/**
 * Un buzón, **de esta persona**. Con el id de otra persona devuelve `null`,
 * igual que con un id que no existe: decir «no es tuyo» ya contaría que existe.
 */
export async function elBuzonDe(personaId: string, buzonId: string): Promise<Buzon | null> {
    if (!personaId || !buzonId || typeof buzonId !== "string") return null;
    return conLaTabla(async () => {
        const filas = await db.$queryRaw<Fila[]>`
            SELECT "id", "personaId", "proveedor", "direccion", "nombre", "credenciales", "estado", "ultimoError"
            FROM "correo_cuentas"
            WHERE "id" = ${buzonId} AND "personaId" = ${personaId}
            LIMIT 1
        `;
        const f = filas[0];
        if (!f) return null;
        const visible = comoVisible(f);
        if (!visible) return null;
        const credenciales = abrir<Credenciales>(f.credenciales);
        return {
            ...visible,
            personaId: f.personaId,
            credenciales,
            estado: credenciales ? visible.estado : "reconectar",
        };
    });
}

/** Conectar —o volver a conectar— un buzón. Devuelve su id. */
export async function guardarElBuzon(datos: {
    personaId: string;
    cuentaId: string | null;
    proveedor: ProveedorDeCorreo;
    direccion: string;
    nombre: string | null;
    credenciales: Credenciales;
}): Promise<string> {
    if (!datos.personaId) throw new Error("Sin persona no hay buzón.");
    const direccion = datos.direccion.trim().toLowerCase();
    const sellado = sellar(datos.credenciales);
    return conLaTabla(async () => {
        const filas = await db.$queryRaw<{ id: string }[]>`
            INSERT INTO "correo_cuentas"
                ("id", "personaId", "cuentaId", "proveedor", "direccion", "nombre", "credenciales", "estado", "ultimoError")
            VALUES (${randomUUID()}, ${datos.personaId}, ${datos.cuentaId}, ${datos.proveedor}, ${direccion},
                    ${datos.nombre}, ${sellado}, 'conectada', NULL)
            ON CONFLICT ("personaId", "proveedor", "direccion") DO UPDATE
               SET "credenciales" = EXCLUDED."credenciales",
                   "nombre" = COALESCE(EXCLUDED."nombre", "correo_cuentas"."nombre"),
                   "estado" = 'conectada',
                   "ultimoError" = NULL,
                   "actualizadoEn" = CURRENT_TIMESTAMP
            RETURNING "id"
        `;
        return filas[0].id;
    });
}

export async function actualizarLasCredenciales(personaId: string, buzonId: string, credenciales: Credenciales): Promise<void> {
    const sellado = sellar(credenciales);
    await conLaTabla(() => db.$executeRaw`
        UPDATE "correo_cuentas"
           SET "credenciales" = ${sellado}, "actualizadoEn" = CURRENT_TIMESTAMP
         WHERE "id" = ${buzonId} AND "personaId" = ${personaId}
    `);
}

/**
 * El proveedor dijo que la autorización ya no vale (la persona la revocó, o
 * cambió la contraseña). No se borra el buzón —se enseña con su motivo y un
 * botón de volver a conectar— porque desaparecer sin decir nada se lee como
 * que la plataforma lo perdió.
 */
export async function marcarParaReconectar(personaId: string, buzonId: string, motivo: string): Promise<void> {
    await conLaTabla(() => db.$executeRaw`
        UPDATE "correo_cuentas"
           SET "estado" = 'reconectar', "ultimoError" = ${motivo.slice(0, 500)}, "actualizadoEn" = CURRENT_TIMESTAMP
         WHERE "id" = ${buzonId} AND "personaId" = ${personaId}
    `);
}

export async function quitarElBuzon(personaId: string, buzonId: string): Promise<boolean> {
    const tocadas = await conLaTabla(() => db.$executeRaw`
        DELETE FROM "correo_cuentas" WHERE "id" = ${buzonId} AND "personaId" = ${personaId}
    `);
    return Number(tocadas) > 0;
}
