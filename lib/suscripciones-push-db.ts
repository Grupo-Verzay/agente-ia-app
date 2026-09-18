import "server-only";

import { db } from "@/lib/db";

/**
 * Dónde vive cada navegador al que se le puede empujar un aviso.
 *
 * Una suscripción de Web Push es lo que el navegador devuelve al aceptar el
 * permiso: una dirección única (`endpoint`) del servicio de empuje de ese
 * navegador —FCM en Chrome, Mozilla en Firefox, Apple en Safari— y dos llaves
 * con las que se cifra lo que se le manda. **Es del DISPOSITIVO, no de la
 * persona**: la misma persona en el portátil y en el móvil son dos filas, y por
 * eso la llave primaria es el `endpoint` y no el `personaId`.
 *
 * Tabla de la App con `CREATE TABLE IF NOT EXISTS` y **sin clave foránea**,
 * como el resto. `User` es del BACKEND y añadirle columnas desde aquí es lo que
 * reventó el #360.
 *
 * **Y se limpia sola.** Una suscripción caduca —se reinstala el navegador, se
 * revoca el permiso, pasa el tiempo— y entonces el servicio de empuje contesta
 * `404` o `410`: esa fila se borra en ese momento (`olvidarLaSuscripcion`, que
 * llama el propio envío). Sin eso se acumulan para siempre y cada mensaje
 * intenta empujar a direcciones muertas.
 */

export type SuscripcionPush = {
    endpoint: string;
    p256dh: string;
    auth: string;
};

let tablaLista: Promise<void> | null = null;

function asegurarLaTabla(): Promise<void> {
    tablaLista ??= (async () => {
        await db.$executeRaw`
            CREATE TABLE IF NOT EXISTS "push_subscriptions" (
                "endpoint" TEXT PRIMARY KEY,
                "personaId" TEXT NOT NULL,
                "p256dh" TEXT NOT NULL,
                "auth" TEXT NOT NULL,
                "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
                "usadoEn" TIMESTAMP(3)
            )
        `;
        // Se busca SIEMPRE por persona —«a quién le empujo esto»—, nunca por
        // endpoint salvo para borrar por su clave primaria.
        await db.$executeRaw`
            CREATE INDEX IF NOT EXISTS "push_subscriptions_persona_idx"
                ON "push_subscriptions" ("personaId")
        `;
    })().catch((error) => {
        tablaLista = null;
        throw error;
    });
    return tablaLista;
}

/** Igual que en el resto de tablas de la App: el `42P01` va en `meta.code`. */
function esTablaQueFalta(error: unknown): boolean {
    const e = error as { code?: string; meta?: { code?: string }; message?: string };
    return (
        e?.meta?.code === "42P01" ||
        e?.code === "42P01" ||
        Boolean(e?.message?.includes("42P01"))
    );
}

async function conLaTabla<T>(hacer: () => Promise<T>): Promise<T> {
    await asegurarLaTabla();
    try {
        return await hacer();
    } catch (error) {
        if (!esTablaQueFalta(error)) throw error;
        // El recuerdo de «ya la creé» es del PROCESO, no de la base.
        tablaLista = null;
        await asegurarLaTabla();
        return hacer();
    }
}

/**
 * Guarda —o refresca— la suscripción de un navegador.
 *
 * `ON CONFLICT` sobre el `endpoint` porque el navegador devuelve **el mismo**
 * mientras no caduque: volver a activar los avisos en el mismo sitio no crea
 * una segunda fila, la actualiza. Y `personaId` se pisa a propósito: si otra
 * persona entra en ese mismo navegador y activa los avisos, ese dispositivo
 * pasa a ser suyo — lo contrario sería empujarle a alguien los mensajes de
 * quien usó el ordenador antes.
 */
export async function guardarLaSuscripcion(input: {
    personaId: string;
    endpoint: string;
    p256dh: string;
    auth: string;
}): Promise<void> {
    if (!input.personaId || !input.endpoint || !input.p256dh || !input.auth) return;
    await conLaTabla(async () => {
        await db.$executeRaw`
            INSERT INTO "push_subscriptions" ("endpoint", "personaId", "p256dh", "auth", "creadoEn")
            VALUES (${input.endpoint}, ${input.personaId}, ${input.p256dh}, ${input.auth}, CURRENT_TIMESTAMP)
            ON CONFLICT ("endpoint") DO UPDATE
               SET "personaId" = EXCLUDED."personaId",
                   "p256dh" = EXCLUDED."p256dh",
                   "auth" = EXCLUDED."auth"
        `;
    });
}

/**
 * Da de baja un dispositivo.
 *
 * Va acotado **a la persona además del endpoint**: el endpoint llega del
 * navegador, y sin esa condición cualquiera con sesión daría de baja el
 * dispositivo de otro pasando su dirección a mano.
 */
export async function darDeBajaLaSuscripcion(input: {
    personaId: string;
    endpoint: string;
}): Promise<void> {
    if (!input.personaId || !input.endpoint) return;
    await conLaTabla(async () => {
        await db.$executeRaw`
            DELETE FROM "push_subscriptions"
            WHERE "endpoint" = ${input.endpoint} AND "personaId" = ${input.personaId}
        `;
    });
}

/**
 * Todos los dispositivos de una persona. Vacío si no activó los avisos en
 * ninguno, que es lo normal y no es un fallo.
 */
export async function losDispositivosDe(personaId: string): Promise<SuscripcionPush[]> {
    if (!personaId) return [];
    return conLaTabla(async () => {
        return db.$queryRaw<SuscripcionPush[]>`
            SELECT "endpoint", "p256dh", "auth"
            FROM "push_subscriptions"
            WHERE "personaId" = ${personaId}
        `;
    });
}

/** Los dispositivos de VARIAS personas en una consulta, no una por persona. */
export async function losDispositivosDeVarias(
    personaIds: string[],
): Promise<(SuscripcionPush & { personaId: string })[]> {
    const gente = Array.from(new Set(personaIds.filter(Boolean)));
    if (!gente.length) return [];
    return conLaTabla(async () => {
        return db.$queryRaw<(SuscripcionPush & { personaId: string })[]>`
            SELECT "endpoint", "personaId", "p256dh", "auth"
            FROM "push_subscriptions"
            WHERE "personaId" = ANY(${gente})
        `;
    });
}

/**
 * Borra una suscripción que el servicio de empuje ya no reconoce.
 *
 * Se llama con un `404` o un `410`, que es lo que contesta cuando caducó.
 * **Por el endpoint solo**, sin persona: aquí no llega nada de fuera — lo dice
 * el servicio de empuje sobre una fila que acabamos de leer de la base.
 */
export async function olvidarLaSuscripcion(endpoint: string): Promise<void> {
    if (!endpoint) return;
    await conLaTabla(async () => {
        await db.$executeRaw`
            DELETE FROM "push_subscriptions" WHERE "endpoint" = ${endpoint}
        `;
    });
}

/** Marca que se le empujó algo. Solo informativo, para poder ver qué está vivo. */
export async function seUso(endpoints: string[]): Promise<void> {
    const lista = Array.from(new Set(endpoints.filter(Boolean)));
    if (!lista.length) return;
    await conLaTabla(async () => {
        await db.$executeRaw`
            UPDATE "push_subscriptions"
               SET "usadoEn" = CURRENT_TIMESTAMP
             WHERE "endpoint" = ANY(${lista})
        `;
    });
}
