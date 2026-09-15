import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { currentUser } from '@/lib/auth';
import { isAdminLike } from '@/lib/rbac';
import { getPersistedMessages } from '@/lib/chat-persistence';

/**
 * Qué le pasa a los GRUPOS de una cuenta, leído de la base.
 *
 * Nació porque «no se ven los mensajes del grupo» se estuvo diagnosticando
 * sobre una suposición —la forma del id— en vez de sobre datos. Esto mira lo
 * que hay: cuántas filas tiene cada grupo en `chat_messages`, qué dice su
 * `chat_conversations`, y si tiene ficha (`Session`) o no.
 *
 *   GET …?userId=<cuenta>                    → informe, no toca nada
 *   GET …?userId=<cuenta>&aplicar=si         → además, crea las fichas que falten
 *
 * La segunda pasada es para los grupos que YA existían: su ficha la crea el
 * backend al llegar un mensaje nuevo, y sin esto habría que esperar a que
 * alguien escriba.
 */
export const dynamic = 'force-dynamic';

/** Cuántos mensajes recientes se enseñan de cada grupo. */
const MENSAJES_A_ENSENAR = 12;

type FilaDeGrupo = {
  remoteJid: string;
  instanceName: string;
  pushName: string | null;
  lastMessageId: string | null;
  lastMessageTimestamp: Date | null;
  mensajes: bigint;
  primero: Date | null;
  ultimo: Date | null;
  sessionId: number | null;
};

/**
 * ¿Es admin la PERSONA que está sentada delante? `currentUser()` devuelve la
 * fila de la cuenta en la que se está metido, así que con la cookie de
 * «Ingresar» puesta el `role` es el del cliente. Misma regla que la ruta de
 * duplicados.
 */
async function esAdminDeVerdad(user: { role?: string | null; sessionUserId?: string | null; id: string }): Promise<boolean> {
  if (isAdminLike(user.role)) return true;
  const real = (user.sessionUserId ?? '').trim();
  if (!real || real === user.id) return false;
  const fila = await db.user.findUnique({ where: { id: real }, select: { role: true } }).catch(() => null);
  return isAdminLike(fila?.role);
}

export async function GET(request: Request) {
  const user = await currentUser().catch(() => null);
  if (!user?.id || !(await esAdminDeVerdad(user))) {
    return NextResponse.json({ ok: false, error: 'No autorizado' }, { status: 401 });
  }

  const url = new URL(request.url);
  const userId = (url.searchParams.get('userId') ?? '').trim();
  const linea = (url.searchParams.get('instanceName') ?? '').trim();
  const aplicar = url.searchParams.get('aplicar') === 'si';

  if (!userId) {
    return NextResponse.json(
      { ok: false, error: 'Falta `userId`: esto va siempre acotado a una cuenta.' },
      { status: 400 },
    );
  }

  let grupos: FilaDeGrupo[];
  try {
    grupos = await db.$queryRaw<FilaDeGrupo[]>`
      SELECT c."remoteJid",
             c."instanceName",
             c."pushName",
             c."lastMessageId",
             c."lastMessageTimestamp",
             COUNT(m."id")            AS mensajes,
             MIN(m."messageTimestamp") AS primero,
             MAX(m."messageTimestamp") AS ultimo,
             s."id"                   AS "sessionId"
        FROM "chat_conversations" c
        LEFT JOIN "chat_messages" m
               ON m."userId" = c."userId"
              AND m."instanceName" = c."instanceName"
              AND m."remoteJid" = c."remoteJid"
        LEFT JOIN "Session" s
               ON s."userId" = c."userId"
              AND s."instanceId" = c."instanceName"
              AND s."remoteJid" = c."remoteJid"
       WHERE c."userId" = ${userId}
         AND c."remoteJid" LIKE '%@g.us'
         ${linea ? Prisma.sql`AND c."instanceName" = ${linea}` : Prisma.empty}
       GROUP BY c."remoteJid", c."instanceName", c."pushName",
                c."lastMessageId", c."lastMessageTimestamp", s."id"
       ORDER BY c."lastMessageTimestamp" DESC NULLS LAST
    `;
  } catch (error) {
    // Un fallo mudo aquí se lee como «no hay grupos», que es lo contrario.
    console.error('[grupos] no se pudieron leer', error);
    return NextResponse.json({ ok: false, error: 'No se pudieron leer los grupos.' }, { status: 500 });
  }

  // Y los mensajes de verdad de cada uno: sus ids tal y como están guardados.
  // Es lo que contesta «¿faltan filas o es que no se leen?».
  const detalle = await Promise.all(
    grupos.map(async (g) => {
      const filas = await db.$queryRaw<
        { messageId: string; fromMe: boolean; messageType: string; messageTimestamp: Date; texto: string }[]
      >`
        SELECT "messageId", "fromMe", "messageType", "messageTimestamp",
               LEFT(BTRIM(COALESCE("content", '')), 40) AS texto
          FROM "chat_messages"
         WHERE "userId" = ${userId}
           AND "instanceName" = ${g.instanceName}
           AND "remoteJid" = ${g.remoteJid}
         ORDER BY "messageTimestamp" DESC
         LIMIT ${MENSAJES_A_ENSENAR}
      `.catch(() => []);

      // La llave con la que la conversación deduplica. Si dos mensajes distintos
      // comparten llave, la pantalla enseña UNO: es exactamente el fallo que se
      // buscaba, y aquí se ve sin tener que suponer la forma del id.
      const llave = (mid: string) => mid.replace(/^(true|false)_[^_]+_/, '');
      const llaves = new Map<string, number>();
      for (const f of filas) {
        const k = `${llave(f.messageId)}|${f.fromMe}`;
        llaves.set(k, (llaves.get(k) ?? 0) + 1);
      }
      const colapsan = [...llaves.entries()].filter(([, n]) => n > 1);

      // Y LA PRUEBA QUE IMPORTA: lo mismo que pide la conversación abierta,
      // con la misma función. Si aquí salen menos filas de las que hay en la
      // base, el fallo está en LEER; si salen las mismas, está en pintar o en
      // que nunca se guardaron. Sin esto se diagnostica a ojo.
      const comoLoPideLaPantalla = await getPersistedMessages({
        userIds: [userId],
        remoteJid: g.remoteJid,
        instanceName: g.instanceName,
        take: MENSAJES_A_ENSENAR * 4,
      }).catch(() => []);

      // Y sin acotar a la línea, para separar «no se lee» de «se lee con la
      // línea equivocada», que se ven igual desde fuera.
      const sinLaLinea = await getPersistedMessages({
        userIds: [userId],
        remoteJid: g.remoteJid,
        take: MENSAJES_A_ENSENAR * 4,
      }).catch(() => []);

      return {
        grupo: g.pushName || g.remoteJid,
        remoteJid: g.remoteJid,
        linea: g.instanceName,
        tieneFicha: g.sessionId !== null,
        sessionId: g.sessionId,
        mensajesEnLaBase: Number(g.mensajes),
        primero: g.primero?.toISOString() ?? null,
        ultimo: g.ultimo?.toISOString() ?? null,
        ultimoDeLaFila: { id: g.lastMessageId, cuando: g.lastMessageTimestamp?.toISOString() ?? null },
        // Si esto no está vacío, la conversación enseña menos de lo que hay.
        llavesQueColapsan: colapsan.map(([k, n]) => ({ llave: k, filas: n })),
        loQueDevuelveLaConversacion: {
          conSuLinea: comoLoPideLaPantalla.length,
          sinLinea: sinLaLinea.length,
          ids: comoLoPideLaPantalla.map((m: any) => m?.key?.id ?? null),
        },
        ultimosMensajes: filas.map((f) => ({
          id: f.messageId,
          mio: f.fromMe,
          tipo: f.messageType,
          cuando: f.messageTimestamp.toISOString(),
          texto: f.texto,
        })),
      };
    }),
  );

  let fichasCreadas = 0;
  let fallos = 0;
  let primerFallo: string | undefined;

  if (aplicar) {
    for (const g of grupos) {
      if (g.sessionId !== null) continue;
      try {
        await db.$executeRaw`
          INSERT INTO "Session" ("userId", "remoteJid", "pushName", "instanceId", "status", "createdAt", "updatedAt")
          VALUES (${userId}, ${g.remoteJid}, ${g.pushName || 'Desconocido'}, ${g.instanceName}, TRUE, NOW(), NOW())
          ON CONFLICT ("userId", "instanceId", "remoteJid") DO NOTHING
        `;
        fichasCreadas += 1;
      } catch (error) {
        fallos += 1;
        if (!primerFallo) primerFallo = error instanceof Error ? error.message : String(error);
        console.error('[grupos] no se pudo crear la ficha', { remoteJid: g.remoteJid, error });
      }
    }
  }

  return NextResponse.json({
    ok: true,
    modo: aplicar ? 'aplicado' : 'informe (no se tocó nada)',
    cuenta: userId,
    linea: linea || '(todas las de la cuenta)',
    grupos: grupos.length,
    sinFicha: grupos.filter((g) => g.sessionId === null).length,
    ...(aplicar ? { fichasCreadas, fallos, primerFallo } : {}),
    comoAplicar: `${url.pathname}?userId=${userId}${linea ? `&instanceName=${linea}` : ''}&aplicar=si`,
    detalle,
  });
}
