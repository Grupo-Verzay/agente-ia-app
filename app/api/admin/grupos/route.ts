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
 *   GET …?email=<correo>                     → informe, no toca nada
 *   GET …?email=<correo>&aplicar=si          → además, crea las fichas que falten
 *
 * Se pregunta por el CORREO, que es lo que se ve en el panel. El `userId` sigue
 * valiendo —es lo que había— pero no sirve para pedirlo: es un id interno que
 * no aparece en ninguna pantalla, así que quien tenía que usar esta ruta no
 * podía. Una herramienta que solo acepta un dato que nadie ve no es una
 * herramienta.
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
  const email = (url.searchParams.get('email') ?? '').trim().toLowerCase();
  const linea = (url.searchParams.get('instanceName') ?? '').trim();
  const aplicar = url.searchParams.get('aplicar') === 'si';

  let userId = (url.searchParams.get('userId') ?? '').trim();
  let cuenta: { id: string; email: string | null; name: string | null } | null = null;

  if (email) {
    // Se busca sin distinguir mayúsculas: un correo escrito a mano casi nunca
    // viene igual que como se guardó, y «no encontrado» sobre una cuenta que sí
    // existe manda a buscar el fallo al sitio equivocado.
    const encontradas = await db.$queryRaw<{ id: string; email: string | null; name: string | null }[]>`
      SELECT "id", "email", "name" FROM "User" WHERE lower("email") = ${email} LIMIT 2
    `.catch(() => []);

    if (encontradas.length === 0) {
      return NextResponse.json(
        { ok: false, error: `No hay ninguna cuenta con el correo "${email}".` },
        { status: 404 },
      );
    }
    if (encontradas.length > 1) {
      // No se elige por la cara: dos cuentas con el mismo correo es un problema
      // de datos, y quedarse con una escribiría fichas en la que no era.
      return NextResponse.json(
        {
          ok: false,
          error: `Hay más de una cuenta con el correo "${email}". Pásame el \`userId\` de la que quieras.`,
          cuentas: encontradas.map((c) => c.id),
        },
        { status: 409 },
      );
    }

    cuenta = encontradas[0];
    userId = cuenta.id;
  }

  if (!userId) {
    return NextResponse.json(
      {
        ok: false,
        error: 'Falta `email` (o `userId`): esto va siempre acotado a una cuenta.',
        ejemplo: `${url.pathname}?email=alguien@sucorreo.com`,
      },
      { status: 400 },
    );
  }

  // El enlace que se devuelve se pide igual que se pidió este: con el correo si
  // vino por correo. Devolver el `userId` obligaría a copiar un id que no se ve
  // en ninguna pantalla, que es justo el problema que esto vino a quitar.
  const comoSePidio = email ? `email=${encodeURIComponent(email)}` : `userId=${userId}`;

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
  let yaLaTenian = 0;
  let fallos = 0;
  let primerFallo: string | undefined;

  if (aplicar) {
    for (const g of grupos) {
      if (g.sessionId !== null) continue;
      try {
        // `pushName` va SIEMPRE 'Desconocido', nunca el de la conversación.
        //
        // En un grupo ese campo es el de QUIEN ESCRIBIÓ, no el del grupo, así
        // que copiarlo bautizaría el grupo con el nombre del último que habló:
        // la fila de la bandeja prefiere el nombre de la ficha, y «Alex» habría
        // pasado a llamarse «José». Con 'Desconocido' —que la pantalla trata
        // como nombre malo— manda el nombre de verdad del grupo. Es lo mismo
        // que hace el backend, que pasa el `pushName` vacío a propósito.
        //
        // `status: TRUE` y el resto de columnas, igual que `registerSession`:
        // una ficha rellenada aquí y una creada por un mensaje nuevo tienen que
        // ser indistinguibles, o el grupo se vería distinto según cuál le tocó.
        const filas = await db.$executeRaw`
          INSERT INTO "Session" ("userId", "remoteJid", "pushName", "instanceId", "status", "createdAt", "updatedAt")
          VALUES (${userId}, ${g.remoteJid}, 'Desconocido', ${g.instanceName}, TRUE, NOW(), NOW())
          ON CONFLICT ("userId", "instanceId", "remoteJid") DO NOTHING
        `;
        // Se cuenta lo que la base dice que escribió, no las vueltas del bucle:
        // un contador que cuenta intentos dice «listo» cuando no hizo nada.
        if (filas > 0) fichasCreadas += 1;
        else yaLaTenian += 1;
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
    cuenta: cuenta ? { id: cuenta.id, email: cuenta.email, nombre: cuenta.name } : { id: userId },
    linea: linea || '(todas las de la cuenta)',
    grupos: grupos.length,
    sinFicha: grupos.filter((g) => g.sessionId === null).length,
    ...(aplicar ? { fichasCreadas, yaLaTenian, fallos, primerFallo } : {}),
    comoAplicar: `${url.pathname}?${comoSePidio}${linea ? `&instanceName=${linea}` : ''}&aplicar=si`,
    detalle,
  });
}
