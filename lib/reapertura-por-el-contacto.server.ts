import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { ensureResolvedAtColumn } from "@/lib/session-resolved";

/**
 * Archivada o resuelta: vuelve a la bandeja cuando el CONTACTO escribe.
 *
 * Es la red de seguridad de la regla de `lib/reapertura-por-el-contacto.ts`,
 * igual que el barrido de las marcas de borrado: el camino vivo es la pantalla,
 * que levanta en memoria y avisa con `reabrirPorElContactoAction`; esto recoge
 * lo que entró con la App cerrada o lo vio otra pestaña.
 *
 * Dos `UPDATE`, cada uno con TRES `EXISTS` (uno por columna de identidad, para
 * que cada uno vaya por su índice: un `OR` en un solo `JOIN` recorre
 * `chat_messages` entera). Solo cuentan mensajes del contacto
 * (`fromMe = FALSE`) posteriores a la marca: un saliente —un seguimiento, un
 * recordatorio, la IA— no devuelve nada, que es lo que reabría solas las
 * resueltas a los tres o cuatro días.
 *
 * Una resuelta se cruza por la línea exacta (`Session.instanceId` es el
 * `instanceName` del mensaje); un archivo sin línea (las marcas antiguas, con
 * `instanceName = ''`) vale para todas, como en el borrado.
 */
const BARRER_REAPERTURAS_CADA_MS = 5 * 60 * 1000;
const ultimoBarridoDeReaperturas = new Map<string, number>();

export async function levantarArchivosYResueltas(
  userIds: string[],
  opciones: { forzar?: boolean } = {},
): Promise<void> {
  if (!userIds.length) return;
  const ahora = Date.now();
  const llave = userIds.slice().sort().join("|");
  // `forzar` es para el banco: el reloj de cinco minutos no deja repetir.
  if (!opciones.forzar && ahora - (ultimoBarridoDeReaperturas.get(llave) ?? 0) < BARRER_REAPERTURAS_CADA_MS) return;
  ultimoBarridoDeReaperturas.set(llave, ahora);

  try {
    const desarchivadas = await db.$queryRaw<
      Array<{ instanceName: string; remoteJid: string }>
    >`
      WITH levantar AS (
        SELECT p."id"
        FROM "ChatConversationPreference" p
        WHERE p."userId" IN (${Prisma.join(userIds)})
          AND p."archivedAt" IS NOT NULL
          AND (
            EXISTS (
              SELECT 1 FROM "chat_messages" m
              WHERE m."userId" = p."userId" AND m."remoteJid" = p."remoteJid"
                AND m."fromMe" = FALSE AND m."messageTimestamp" > p."archivedAt"
                AND (p."instanceName" = '' OR m."instanceName" = p."instanceName")
            )
            OR EXISTS (
              SELECT 1 FROM "chat_messages" m
              WHERE m."userId" = p."userId" AND m."remoteJidAlt" = p."remoteJid"
                AND m."fromMe" = FALSE AND m."messageTimestamp" > p."archivedAt"
                AND (p."instanceName" = '' OR m."instanceName" = p."instanceName")
            )
            OR EXISTS (
              SELECT 1 FROM "chat_messages" m
              WHERE m."userId" = p."userId" AND m."senderPn" = p."remoteJid"
                AND m."fromMe" = FALSE AND m."messageTimestamp" > p."archivedAt"
                AND (p."instanceName" = '' OR m."instanceName" = p."instanceName")
            )
          )
      )
      UPDATE "ChatConversationPreference" p
      SET "archivedAt" = NULL, "updatedAt" = NOW()
      FROM levantar l
      WHERE p."id" = l."id"
      RETURNING p."instanceName", p."remoteJid"
    `;
    if (desarchivadas.length) {
      console.warn("[chats] conversaciones sacadas del archivo: el contacto escribio despues de archivarlas", {
        cuantas: desarchivadas.length,
        chats: desarchivadas.slice(0, 10).map((r) => `${r.instanceName || "*"}::${r.remoteJid}`),
      });
    }
  } catch (error) {
    console.error("[chats] no se pudieron sacar del archivo las conversaciones con mensajes nuevos", error);
  }

  try {
    await ensureResolvedAtColumn();
    const reabiertas = await db.$queryRaw<Array<{ id: number }>>`
      UPDATE "Session" s
      SET resolved_at = NULL
      WHERE s."userId" IN (${Prisma.join(userIds)})
        AND s.resolved_at IS NOT NULL
        AND (
          EXISTS (
            SELECT 1 FROM "chat_messages" m
            WHERE m."userId" = s."userId" AND m."instanceName" = s."instanceId"
              AND m."remoteJid" = s."remoteJid"
              AND m."fromMe" = FALSE AND m."messageTimestamp" > s.resolved_at
          )
          OR EXISTS (
            SELECT 1 FROM "chat_messages" m
            WHERE m."userId" = s."userId" AND m."instanceName" = s."instanceId"
              AND m."remoteJidAlt" = s."remoteJid"
              AND m."fromMe" = FALSE AND m."messageTimestamp" > s.resolved_at
          )
          OR EXISTS (
            SELECT 1 FROM "chat_messages" m
            WHERE m."userId" = s."userId" AND m."instanceName" = s."instanceId"
              AND m."senderPn" = s."remoteJid"
              AND m."fromMe" = FALSE AND m."messageTimestamp" > s.resolved_at
          )
        )
      RETURNING s.id
    `;
    if (reabiertas.length) {
      console.warn("[chats] conversaciones resueltas reabiertas: el contacto escribio despues de resolverlas", {
        cuantas: reabiertas.length,
        sesiones: reabiertas.slice(0, 10).map((r) => r.id),
      });
    }
  } catch (error) {
    console.error("[chats] no se pudieron reabrir las resueltas con mensajes nuevos del contacto", error);
  }
}
