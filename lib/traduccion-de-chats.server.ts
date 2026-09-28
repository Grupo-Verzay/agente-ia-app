import "server-only";

import { Prisma } from "@prisma/client";

import { db } from "@/lib/db";
import { laIaDeLaCuenta } from "@/lib/cliente-de-ia.server";
import { createAiClient } from "@/app/(root)/ai-chat/helpers/createAiClient";
import { usarLaIaCobrando } from "@/lib/cobro-de-ia.server";
import { losTokensDelUso } from "@/lib/cobro-de-ia";
import {
    MENSAJES_PARA_DECIDIR,
    elIdiomaDeLaConversacion,
    type Idioma,
} from "@/lib/idioma-del-cliente";
import {
    laInstruccionDeTraducir,
    laTraduccionDelRaw,
    limpiarLaTraduccion,
    paraTraducir,
    type Traduccion,
} from "@/lib/traduccion-de-chats";

/**
 * La base y la IA de la traducción de Chats. Lo que se decide —qué se traduce,
 * cómo se guarda, qué se enseña— vive en `lib/traduccion-de-chats.ts`, puro.
 *
 * # Lo paga la cuenta DUEÑA de la línea, y nunca en silencio
 *
 * Cada traducción es un uso de IA, así que pasa por `usarLaIaCobrando`: mira el
 * saldo ANTES, llama con la IA de la cuenta dueña de la conversación —la misma
 * que atiende sus chats— y descuenta los tokens que dijo el proveedor. Sin
 * créditos no se traduce y se devuelve el aviso con el nombre de la cuenta.
 */

/** Los tipos que son TEXTO: lo que sirve para decidir el idioma. */
const TIPOS_DE_TEXTO = ["conversation", "extendedTextMessage"];

/**
 * Los primeros mensajes del cliente en esta conversación, en el orden en que
 * llegaron. Por las TRES identidades, en tres ramas con su propio `LIMIT` (un
 * `OR` sobre las tres columnas no entra por ningún índice y recorre la tabla
 * más grande de la plataforma).
 */
export async function losPrimerosMensajesDelCliente(input: {
    userIds: string[];
    instanceName: string;
    candidatos: string[];
}): Promise<string[]> {
    if (!input.userIds.length || !input.candidatos.length) return [];
    const tope = MENSAJES_PARA_DECIDIR * 2;
    const rama = (columna: string) => Prisma.sql`
        (SELECT "id", "content", "messageTimestamp"
         FROM "chat_messages"
         WHERE "userId" IN (${Prisma.join(input.userIds)})
           AND "instanceName" = ${input.instanceName}
           AND ${Prisma.raw(`"${columna}"`)} IN (${Prisma.join(input.candidatos)})
           AND "fromMe" = FALSE
           AND "messageType" IN (${Prisma.join(TIPOS_DE_TEXTO)})
           AND COALESCE("content", '') <> ''
         ORDER BY "messageTimestamp" ASC
         LIMIT ${tope})`;
    const filas = await db.$queryRaw<Array<{ id: bigint; content: string | null; messageTimestamp: Date }>>`
        ${rama("remoteJid")} UNION ALL ${rama("remoteJidAlt")} UNION ALL ${rama("senderPn")}
    `;
    const vistos = new Set<string>();
    return filas
        .filter((f) => {
            const k = String(f.id);
            if (vistos.has(k)) return false;
            vistos.add(k);
            return true;
        })
        .sort((a, b) => new Date(a.messageTimestamp).getTime() - new Date(b.messageTimestamp).getTime())
        .map((f) => String(f.content ?? ""));
}

/** El idioma de la conversación, leído de sus primeros mensajes. Nunca lanza. */
export async function elIdiomaDeLaConversacionGuardada(input: {
    userIds: string[];
    instanceName: string;
    candidatos: string[];
}): Promise<Idioma | null> {
    try {
        return elIdiomaDeLaConversacion(await losPrimerosMensajesDelCliente(input));
    } catch (error) {
        console.warn("[traduccion] no se pudo leer el idioma de la conversación", {
            instanceName: input.instanceName,
            error: error instanceof Error ? error.message : String(error),
        });
        return null;
    }
}

/**
 * ¿La conversación la lleva una persona? Mira la ficha de ESA línea: la IA
 * pausada (`status = false`) o esperando a un asesor (`escalated_at`). La
 * columna del sello la crea el backend y la App no la declara, así que se lee
 * aparte y a prueba de que no exista.
 */
export async function elEstadoDeLaConversacion(input: {
    userId: string;
    instanceName: string;
    candidatos: string[];
}): Promise<{ iaActiva: boolean | null; enEspera: boolean }> {
    if (!input.candidatos.length) return { iaActiva: null, enEspera: false };
    const linea = await db.instancia.findFirst({
        where: { instanceName: input.instanceName },
        select: { instanceId: true },
    });
    const sesiones = await db.session.findMany({
        where: {
            userId: input.userId,
            ...(linea?.instanceId ? { instanceId: linea.instanceId } : {}),
            OR: [{ remoteJid: { in: input.candidatos } }, { remoteJidAlt: { in: input.candidatos } }],
        },
        select: { id: true, status: true },
        take: 5,
    });
    if (!sesiones.length) return { iaActiva: null, enEspera: false };
    const iaActiva = sesiones.every((s) => s.status !== false);
    let enEspera = false;
    try {
        const filas = await db.$queryRaw<Array<{ n: bigint }>>`
            SELECT COUNT(*)::bigint AS "n" FROM "Session"
            WHERE "id" IN (${Prisma.join(sesiones.map((s) => s.id))}) AND "escalated_at" IS NOT NULL
        `;
        enEspera = Number(filas[0]?.n ?? 0) > 0;
    } catch {
        // Sin la columna (App desplegada antes que el backend) no hay sello.
    }
    return { iaActiva, enEspera };
}

export type MensajeParaTraducir = {
    fila: bigint;
    messageId: string;
    fromMe: boolean;
    texto: string;
    traduccion: Traduccion | null;
};

/**
 * Los mensajes de ESTA conversación con esos ids. `messageId` no es único en la
 * plataforma —lo pone WhatsApp—, así que jamás se busca solo por él: sin acotar
 * por cuenta, línea e identidades, mandar un id a mano leería el de otro.
 */
export async function losMensajesDeLaConversacion(input: {
    userIds: string[];
    instanceName: string;
    candidatos: string[];
    messageIds: string[];
    soloDelCliente?: boolean;
}): Promise<MensajeParaTraducir[]> {
    const ids = Array.from(new Set(input.messageIds.filter((x) => typeof x === "string" && x.trim())));
    if (!input.userIds.length || !input.candidatos.length || !ids.length) return [];
    const filas = await db.$queryRaw<
        Array<{ id: bigint; messageId: string; fromMe: boolean; content: string | null; raw: unknown }>
    >`
        SELECT "id", "messageId", "fromMe", "content", "raw"
        FROM "chat_messages"
        WHERE "userId" IN (${Prisma.join(input.userIds)})
          AND "instanceName" = ${input.instanceName}
          AND "messageId" IN (${Prisma.join(ids)})
          AND ("remoteJid" IN (${Prisma.join(input.candidatos)})
               OR "remoteJidAlt" IN (${Prisma.join(input.candidatos)})
               OR "senderPn" IN (${Prisma.join(input.candidatos)}))
          ${input.soloDelCliente ? Prisma.sql`AND "fromMe" = FALSE` : Prisma.empty}
    `;
    const vistos = new Set<string>();
    const salida: MensajeParaTraducir[] = [];
    for (const f of filas) {
        const k = `${f.messageId}:${f.fromMe}`;
        if (vistos.has(k)) continue;
        vistos.add(k);
        salida.push({
            fila: f.id,
            messageId: f.messageId,
            fromMe: f.fromMe,
            texto: String(f.content ?? ""),
            traduccion: laTraduccionDelRaw(f.raw),
        });
    }
    return salida;
}

/**
 * Guardar la traducción dentro de `raw`, **solo si no la tenía**. Es el mismo
 * candado que la transcripción: dos pestañas a la vez escriben una sola vez.
 * Devuelve si esta llamada fue la que escribió.
 */
export async function guardarLaTraduccion(fila: bigint, traduccion: Traduccion): Promise<boolean> {
    const tocadas = await db.$executeRaw`
        UPDATE "chat_messages"
        SET "raw" = COALESCE("raw", '{}'::jsonb) || jsonb_build_object('traduccion', ${JSON.stringify(traduccion)}::jsonb),
            "updatedAt" = NOW()
        WHERE "id" = ${fila}
          AND ("raw" -> 'traduccion') IS NULL
    `;
    return tocadas > 0;
}

export type Traductor = (args: { cuenta: string; texto: string; destino: Idioma }) => Promise<{
    texto: string;
    tokens?: number | null;
}>;

/** El traductor de verdad: la IA de la cuenta con la instrucción de siempre. */
export const traducirConLaIa: Traductor = async ({ cuenta, texto, destino }) => {
    const ia = await laIaDeLaCuenta(cuenta);
    if (!ia.success || !ia.data) throw new SinIaParaTraducir(ia.message);
    const { provider, model, apiKey } = ia.data;
    const sistema = laInstruccionDeTraducir(destino);
    const r = await createAiClient(provider).complete({
        apiKey,
        model,
        system: sistema,
        messages: [{ role: "user", content: texto }],
    });
    return {
        texto: limpiarLaTraduccion(r.content),
        tokens: losTokensDelUso({ tokens: r.tokens, entrada: sistema + texto, salida: r.content }),
    };
};

export class SinIaParaTraducir extends Error {}

export type ResultadoDeTraducir =
    | { ok: true; texto: string }
    | { ok: false; motivo: "sin_creditos" | "sin_bolsa" | "sin_ia" | "fallo"; aviso: string };

/**
 * Traduce UN texto con la IA de la cuenta y lo cobra a esa cuenta. Nunca lanza:
 * quien llama decide qué hacer sin traducción, y el motivo se dice.
 */
export async function traducirCobrando(
    cuenta: string,
    texto: string,
    destino: Idioma,
    traductor: Traductor = traducirConLaIa,
): Promise<ResultadoDeTraducir> {
    try {
        const uso = await usarLaIaCobrando(cuenta, "traduccion de chats", async () => {
            const r = await traductor({ cuenta, texto: paraTraducir(texto), destino });
            return { valor: r.texto, tokens: r.tokens ?? null, entrada: texto, salida: r.texto };
        });
        if (!uso.ok) return { ok: false, motivo: uso.motivo, aviso: uso.aviso };
        if (!uso.valor) {
            return { ok: false, motivo: "fallo", aviso: "La IA no devolvió la traducción." };
        }
        return { ok: true, texto: uso.valor };
    } catch (error) {
        if (error instanceof SinIaParaTraducir) {
            return {
                ok: false,
                motivo: "sin_ia",
                aviso: "La cuenta no tiene una IA configurada con la que traducir.",
            };
        }
        console.warn("[traduccion] la IA no tradujo", {
            cuenta,
            error: error instanceof Error ? error.message : String(error),
        });
        return { ok: false, motivo: "fallo", aviso: "No se pudo traducir en este momento." };
    }
}
