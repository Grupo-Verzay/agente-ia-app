import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { currentUser } from '@/lib/auth';
import { isAdminLike } from '@/lib/rbac';

/**
 * Limpia los salientes que quedaron guardados DOS veces.
 *
 * El origen se cerró en el backend (ver `api-webhook#145` y `#146`): un mensaje
 * del agente o de un flujo se guardaba al momento con la marca «Agente IA», y si
 * el emisor no devolvía el id de WhatsApp se guardaba con uno inventado
 * (`out_…`). Un par de segundos después llegaba el eco del proveedor con el id
 * de verdad y, como el índice único va por `messageId`, entraba como fila NUEVA.
 * Al cliente le llegó UNA sola vez; en el panel salían dos, una rotulada «Agente
 * IA» y otra con el nombre del asesor asignado, que ni lo envió.
 *
 * Esto limpia lo que ya estaba guardado. Dos pasadas, y la primera NO TOCA NADA:
 *
 *   GET /api/admin/limpiar-salientes-duplicados?userId=<cuenta>            → informe
 *   GET /api/admin/limpiar-salientes-duplicados?userId=<cuenta>&aplicar=si → limpia
 *
 * **Siempre acotado a una cuenta.** `userId` es obligatorio también en el
 * informe: una pasada global sobre `chat_messages` tocaría a todos los clientes,
 * y eso no se hace ni sin querer. `instanceName` acota además a una línea.
 */

/** Cuántos segundos puede tardar el eco en llegar. */
const VENTANA_SEGUNDOS = 300;

/** Cuántas parejas se tratan por vuelta. Se repite hasta que el informe diga 0. */
const TOPE_POR_VUELTA = 500;

/** Cuántos días atrás se mira, por defecto. El fallo empezó con la mudanza a Waha. */
const DIAS_POR_DEFECTO = 15;

type Pareja = {
  id_nuestra: bigint;
  mid_nuestra: string;
  jid_nuestra: string;
  id_eco: bigint;
  mid_eco: string;
  jid_eco: string;
  linea: string;
  texto: string;
  segundos: number;
};

function autorizado(request: Request, esAdmin: boolean): boolean {
  if (esAdmin) return true;
  const esperada = (process.env.CRM_FOLLOW_UP_RUNNER_KEY ?? '').trim();
  if (!esperada) return false;
  const bearer = request.headers.get('authorization');
  const secreta = bearer?.startsWith('Bearer ')
    ? bearer.slice(7).trim()
    : (request.headers.get('x-internal-secret') ?? '').trim();
  return secreta === esperada;
}

/**
 * Las parejas: nuestra copia con id inventado y su eco con el id de verdad.
 *
 * Cuatro condiciones, todas obligatorias:
 *
 * 1. **La misma cuenta y la misma línea.** Nunca se cruzan dos líneas.
 * 2. **El mismo contacto**, que puede estar guardado por su número en una fila y
 *    por su `@lid` en la otra —es justo lo que pasaba—, así que vale el mismo
 *    `remoteJid` o el par que guarda `chat_lid_map`.
 * 3. **El mismo texto**, exacto. Solo texto: la media se empareja por su id, no
 *    por contenido (dos videos de un mismo flujo, sin pie y con segundos de
 *    diferencia, se parecen demasiado, y fundir dos mensajes distintos es peor
 *    que dejar uno repetido).
 * 4. **Dentro de la ventana** del eco, y con nuestra copia marcada como
 *    automática (`sentByAi`): dos mensajes iguales escritos por un asesor a mano
 *    no son una pareja y no se tocan.
 *
 * Cada copia se empareja con el eco MÁS CERCANO en el tiempo (`DISTINCT ON`),
 * para que con varios envíos seguidos cada una se lleve el suyo.
 */
async function buscarParejas(params: {
  userId: string;
  instanceName?: string | null;
  desde: Date;
  limite: number;
}): Promise<Pareja[]> {
  const linea = params.instanceName?.trim();
  return db.$queryRaw<Pareja[]>`
    SELECT DISTINCT ON (nuestra."id")
           nuestra."id"          AS id_nuestra,
           nuestra."messageId"   AS mid_nuestra,
           nuestra."remoteJid"   AS jid_nuestra,
           eco."id"              AS id_eco,
           eco."messageId"       AS mid_eco,
           eco."remoteJid"       AS jid_eco,
           nuestra."instanceName" AS linea,
           LEFT(BTRIM(COALESCE(nuestra."content", '')), 70) AS texto,
           EXTRACT(EPOCH FROM (eco."messageTimestamp" - nuestra."messageTimestamp"))::float AS segundos
      FROM "chat_messages" AS nuestra
      JOIN "chat_messages" AS eco
        ON eco."userId" = nuestra."userId"
       AND eco."instanceName" = nuestra."instanceName"
       AND eco."id" <> nuestra."id"
       AND eco."fromMe" = TRUE
       AND eco."messageId" NOT LIKE 'out\\_%'
       AND eco."mediaUrl" IS NULL
       AND BTRIM(COALESCE(eco."content", '')) = BTRIM(COALESCE(nuestra."content", ''))
       AND ABS(EXTRACT(EPOCH FROM (eco."messageTimestamp" - nuestra."messageTimestamp"))) <= ${VENTANA_SEGUNDOS}
       AND (
             eco."remoteJid" = nuestra."remoteJid"
          OR EXISTS (
               SELECT 1 FROM "chat_lid_map" AS m
                WHERE m."userId" = nuestra."userId"
                  AND (
                        (m."lid" = REPLACE(eco."remoteJid", '@lid', '') AND m."remoteJid" = nuestra."remoteJid")
                     OR (m."lid" = REPLACE(nuestra."remoteJid", '@lid', '') AND m."remoteJid" = eco."remoteJid")
                  )
             )
       )
     WHERE nuestra."userId" = ${params.userId}
       AND nuestra."fromMe" = TRUE
       AND nuestra."messageId" LIKE 'out\\_%'
       AND (nuestra."raw" ->> 'sentByAi') = 'true'
       AND nuestra."mediaUrl" IS NULL
       AND BTRIM(COALESCE(nuestra."content", '')) <> ''
       AND nuestra."messageTimestamp" >= ${params.desde}
       ${linea ? Prisma.sql`AND nuestra."instanceName" = ${linea}` : Prisma.empty}
     ORDER BY nuestra."id",
              ABS(EXTRACT(EPOCH FROM (eco."messageTimestamp" - nuestra."messageTimestamp"))) ASC
     LIMIT ${params.limite}
  `;
}

export async function GET(request: Request) {
  const user = await currentUser().catch(() => null);
  const esAdmin = !!user?.id && isAdminLike(user.role);
  if (!autorizado(request, esAdmin)) {
    return NextResponse.json({ ok: false, error: 'No autorizado' }, { status: 401 });
  }

  const url = new URL(request.url);
  const userId = (url.searchParams.get('userId') ?? '').trim();
  const instanceName = url.searchParams.get('instanceName');
  const aplicar = url.searchParams.get('aplicar') === 'si';
  const dias = Number(url.searchParams.get('dias') ?? DIAS_POR_DEFECTO) || DIAS_POR_DEFECTO;
  const limite = Math.min(Number(url.searchParams.get('limite') ?? TOPE_POR_VUELTA) || TOPE_POR_VUELTA, 2000);

  // Sin cuenta no se corre, ni para mirar: una pasada global sobre
  // `chat_messages` tocaría a todos los clientes.
  if (!userId) {
    return NextResponse.json(
      { ok: false, error: 'Falta `userId`: esta pasada va siempre acotada a una cuenta.' },
      { status: 400 },
    );
  }

  const desde = new Date(Date.now() - dias * 24 * 60 * 60 * 1000);

  let parejas: Pareja[];
  try {
    parejas = await buscarParejas({ userId, instanceName, desde, limite });
  } catch (error) {
    // Un fallo mudo aquí se lee como «no había duplicados», que es lo contrario
    // de lo que pasa.
    console.error('[duplicados] no se pudieron buscar las parejas', error);
    return NextResponse.json(
      { ok: false, error: 'No se pudieron buscar las parejas.' },
      { status: 500 },
    );
  }

  // Un eco no puede adoptar dos copias: si dos filas nuestras apuntan al mismo,
  // solo se trata la primera y la otra se deja para la vuelta siguiente.
  const vistos = new Set<string>();
  const tratables = parejas.filter((p) => {
    const clave = String(p.id_eco);
    if (vistos.has(clave)) return false;
    vistos.add(clave);
    return true;
  });

  const muestra = tratables.slice(0, 20).map((p) => ({
    linea: p.linea,
    texto: p.texto,
    seQueda: { messageId: p.mid_eco, remoteJid: p.jid_eco },
    seBorra: { messageId: p.mid_nuestra, remoteJid: p.jid_nuestra },
    segundosEntreLasDos: Math.round(p.segundos),
  }));

  if (!aplicar) {
    return NextResponse.json({
      ok: true,
      modo: 'informe (no se tocó nada)',
      cuenta: userId,
      linea: instanceName ?? '(todas las de la cuenta)',
      desde: desde.toISOString(),
      parejasEncontradas: tratables.length,
      seTrataraEnEstaVuelta: tratables.length,
      muestra,
      comoAplicar: `${url.pathname}?userId=${userId}${instanceName ? `&instanceName=${instanceName}` : ''}&dias=${dias}&aplicar=si`,
    });
  }

  let limpiadas = 0;
  let fallos = 0;

  for (const p of tratables) {
    try {
      await db.$transaction(async (tx) => {
        // 1. La marca «Agente IA» se la queda el eco ANTES de borrar nada: es lo
        //    único que aporta nuestra copia, y perderla dejaría el mensaje
        //    atribuido al asesor.
        await tx.$executeRaw`
          UPDATE "chat_messages"
             SET "raw" = jsonb_set(COALESCE("raw", '{}'::jsonb), '{sentByAi}', 'true'::jsonb),
                 "updatedAt" = NOW()
           WHERE "id" = ${p.id_eco}
        `;

        // 2. Si la fila de la lista apuntaba al id que se va, se repunta al que
        //    se queda. Si no, el último mensaje quedaría señalando a nada.
        await tx.$executeRaw`
          UPDATE "chat_conversations"
             SET "lastMessageId" = ${p.mid_eco}, "updatedAt" = NOW()
           WHERE "userId" = ${userId}
             AND "instanceName" = ${p.linea}
             AND "lastMessageId" = ${p.mid_nuestra}
        `;

        // 3. Y se borra la copia con el id inventado.
        await tx.$executeRaw`DELETE FROM "chat_messages" WHERE "id" = ${p.id_nuestra}`;
      });
      limpiadas += 1;
    } catch (error) {
      fallos += 1;
      console.error('[duplicados] no se pudo limpiar una pareja', {
        linea: p.linea,
        seBorra: p.mid_nuestra,
        error,
      });
    }
  }

  console.info('[duplicados] pasada terminada', { cuenta: userId, limpiadas, fallos });

  return NextResponse.json({
    ok: true,
    modo: 'aplicado',
    cuenta: userId,
    linea: instanceName ?? '(todas las de la cuenta)',
    desde: desde.toISOString(),
    parejasEncontradas: tratables.length,
    limpiadas,
    fallos,
    muestra,
    siQuedanMas: 'vuelve a llamar sin `aplicar` para ver si el informe ya dice 0.',
  });
}
