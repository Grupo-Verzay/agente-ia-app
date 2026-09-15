import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { currentUser } from '@/lib/auth';
import { isAdminLike } from '@/lib/rbac';

/**
 * Esta ruta ESCRIBE. Nada de caché entre ella y quien la llama: una respuesta
 * servida de caché diría que limpió lo que ya estaba limpio, o al revés, y es
 * justo la clase de duda que costó esta sesión.
 */
export const dynamic = 'force-dynamic';

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
 *   GET …?userId=<cuenta>                       → informe de los TEXTOS
 *   GET …?userId=<cuenta>&tipo=media            → informe de la MEDIA
 *   GET …?userId=<cuenta>&tipo=todo             → informe de las dos
 *   GET …?userId=<cuenta>&tipo=media&aplicar=si → limpia la media
 *
 * **Siempre acotado a una cuenta.** `userId` es obligatorio también en el
 * informe: una pasada global sobre `chat_messages` tocaría a todos los clientes,
 * y eso no se hace ni sin querer. `instanceName` acota además a una línea.
 */

/** Cuántos segundos puede tardar el eco en llegar. */
const VENTANA_SEGUNDOS = 300;

/**
 * Y cuántos para la media, que va más apretada a propósito.
 *
 * Un texto se reconoce por su contenido exacto; una media no —dos videos de un
 * mismo flujo, sin pie, son indistinguibles por lo que guardamos—, así que lo
 * que la separa de su vecina es el reloj. En la pasada de los textos
 * `segundosEntreLasDos` salió **0 en todas**: el eco llega el mismo segundo.
 * Dos minutos es holgado de sobra y deja fuera al video siguiente del flujo.
 */
const VENTANA_MEDIA_SEGUNDOS = 120;

/** Cuántas parejas se tratan por vuelta. Se repite hasta que el informe diga 0. */
const TOPE_POR_VUELTA = 500;

/** Cuántos días atrás se mira, por defecto. El fallo empezó con la mudanza a Waha. */
const DIAS_POR_DEFECTO = 15;

type Clase = 'texto' | 'media';

type Pareja = {
  id_nuestra: bigint;
  mid_nuestra: string;
  jid_nuestra: string;
  id_eco: bigint;
  mid_eco: string;
  jid_eco: string;
  linea: string;
  texto: string;
  tipo: string;
  url_nuestra: string | null;
  url_eco: string | null;
  segundos: number;
};

/** La pareja, ya con la clase por la que entró. */
type ParejaConClase = Pareja & { clase: Clase };

/**
 * ¿Es admin la PERSONA que está sentada delante?
 *
 * `currentUser()` devuelve la fila de la cuenta en la que se está metido: con
 * la cookie de «Ingresar» puesta, el `role` es el del CLIENTE (`user`), no el
 * de quien entró. Así que un super admin que estaba mirando los chats de un
 * cliente abría esta ruta y le salía «No autorizado», sin pista de por qué.
 *
 * Es la misma regla que ya está escrita para el administrador de una cuenta:
 * **el rol no se hereda**. Aquí se mira el de siempre, el de la sesión real.
 */
async function esAdminDeVerdad(user: { role?: string | null; sessionUserId?: string | null; id: string }): Promise<boolean> {
  if (isAdminLike(user.role)) return true;

  const real = (user.sessionUserId ?? '').trim();
  if (!real || real === user.id) return false;

  const fila = await db.user
    .findUnique({ where: { id: real }, select: { role: true } })
    .catch(() => null);

  return isAdminLike(fila?.role);
}

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

/** El mismo contacto, aunque una fila esté por su número y la otra por su `@lid`. */
const MISMO_CONTACTO = Prisma.sql`
  (
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
`;

/**
 * Las parejas de TEXTO: nuestra copia con id inventado y su eco con el de verdad.
 *
 * Cuatro condiciones, todas obligatorias:
 *
 * 1. **La misma cuenta y la misma línea.** Nunca se cruzan dos líneas.
 * 2. **El mismo contacto**, que puede estar guardado por su número en una fila y
 *    por su `@lid` en la otra —es justo lo que pasaba—, así que vale el mismo
 *    `remoteJid` o el par que guarda `chat_lid_map`.
 * 3. **El mismo texto**, exacto.
 * 4. **Dentro de la ventana** del eco, y con nuestra copia marcada como
 *    automática (`sentByAi`): dos mensajes iguales escritos por un asesor a mano
 *    no son una pareja y no se tocan.
 *
 * Cada copia se empareja con el eco MÁS CERCANO en el tiempo (`DISTINCT ON`),
 * para que con varios envíos seguidos cada una se lleve el suyo.
 */
function sqlDeTexto(params: { userId: string; instanceName?: string | null; desde: Date }) {
  const linea = params.instanceName?.trim();
  return Prisma.sql`
    SELECT DISTINCT ON (nuestra."id")
           nuestra."id"           AS id_nuestra,
           nuestra."messageId"    AS mid_nuestra,
           nuestra."remoteJid"    AS jid_nuestra,
           eco."id"               AS id_eco,
           eco."messageId"        AS mid_eco,
           eco."remoteJid"        AS jid_eco,
           nuestra."instanceName" AS linea,
           LEFT(BTRIM(COALESCE(nuestra."content", '')), 70) AS texto,
           nuestra."messageType"  AS tipo,
           NULL::text             AS url_nuestra,
           NULL::text             AS url_eco,
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
       AND ${MISMO_CONTACTO}
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
  `;
}

/**
 * Las parejas de MEDIA. Es el mismo caso, con una diferencia que manda en todo:
 * **el contenido no sirve para reconocerlas.**
 *
 * En un texto la prueba es el texto. En una media no la hay:
 *
 * - **Las dos filas NO comparten el archivo.** Nuestra copia guarda la URL que
 *   mandamos (`node.url`, el fichero nuestro); el eco guarda la que devuelve el
 *   proveedor, que es otra cosa y otro dominio. Compararlas no encontraría ni
 *   una pareja.
 * - **El tamaño no está.** Nuestra copia escribe `raw: { sentByAi: true }` y
 *   nada más: ahí no hay ni bytes, ni duración, ni nombre de fichero.
 *
 * Así que lo que empareja es el reloj, y por eso hace falta una regla que
 * impida cruzar dos envíos distintos. Es **la vecindad mutua**: la pareja vale
 * solo si el eco más cercano a nuestra copia es ese, **y** la copia más cercana
 * a ese eco es la nuestra. Las dos direcciones, no una.
 *
 * Eso es lo que cierra el caso que de verdad duele —una copia nuestra cuyo eco
 * nunca llegó—: sin la vecindad mutua le robaría el eco al video siguiente y
 * borraríamos una fila que no tenía duplicado, o sea **un mensaje perdido**. Con
 * ella, ese eco ya tiene dueño más cercano y la pareja se descarta.
 *
 * Cuando hay empate exacto (dos envíos en el MISMO segundo) la vecindad mutua
 * deja fuera al segundo. No es un problema: **repetir la pasada lo recoge**,
 * porque el primero ya no está. Por eso la pasada converge repitiéndola y nunca
 * hace falta relajar la regla.
 *
 * Y encima de eso, tres condiciones más:
 *
 * 1. **El mismo tipo** (`videoMessage` con `videoMessage`), normalizando la
 *    variante `documentWithCaptionMessage`, que es el mismo documento con otro
 *    nombre.
 * 2. **El mismo pie de foto**, contando como «sin pie» las etiquetas que el
 *    webhook escribe cuando no hay ninguno (`[Video]`, `[Imagen]`…).
 * 3. **El eco no puede venir ya marcado** como automático: si lo está, su copia
 *    ya se limpió en una vuelta anterior y lo que tenemos delante es OTRO
 *    mensaje.
 */
const TIPO_NORMALIZADO = (tabla: string) => Prisma.raw(
  `CASE WHEN ${tabla}."messageType" = 'documentWithCaptionMessage' THEN 'documentMessage' ELSE ${tabla}."messageType" END`,
);

const PIE_NORMALIZADO = (tabla: string) => Prisma.raw(
  `CASE WHEN BTRIM(COALESCE(${tabla}."content", '')) IN ('[Imagen]','[Video]','[Audio]','[Documento]','[Sticker]')` +
    ` THEN '' ELSE BTRIM(COALESCE(${tabla}."content", '')) END`,
);

function sqlDeMedia(params: {
  userId: string;
  instanceName?: string | null;
  desde: Date;
  ventana: number;
}) {
  const linea = params.instanceName?.trim();
  return Prisma.sql`
    WITH candidatas AS (
      SELECT nuestra."id"           AS id_nuestra,
             nuestra."messageId"    AS mid_nuestra,
             nuestra."remoteJid"    AS jid_nuestra,
             eco."id"               AS id_eco,
             eco."messageId"        AS mid_eco,
             eco."remoteJid"        AS jid_eco,
             nuestra."instanceName" AS linea,
             ${PIE_NORMALIZADO('nuestra')} AS texto,
             ${TIPO_NORMALIZADO('nuestra')} AS tipo,
             nuestra."mediaUrl"     AS url_nuestra,
             eco."mediaUrl"         AS url_eco,
             EXTRACT(EPOCH FROM (eco."messageTimestamp" - nuestra."messageTimestamp"))::float AS segundos,
             ABS(EXTRACT(EPOCH FROM (eco."messageTimestamp" - nuestra."messageTimestamp"))) AS cerca
        FROM "chat_messages" AS nuestra
        JOIN "chat_messages" AS eco
          ON eco."userId" = nuestra."userId"
         AND eco."instanceName" = nuestra."instanceName"
         AND eco."id" <> nuestra."id"
         AND eco."fromMe" = TRUE
         AND eco."messageId" NOT LIKE 'out\\_%'
         AND eco."mediaUrl" IS NOT NULL
         AND (eco."raw" ->> 'sentByAi') IS DISTINCT FROM 'true'
         AND ${TIPO_NORMALIZADO('eco')} = ${TIPO_NORMALIZADO('nuestra')}
         AND ${PIE_NORMALIZADO('eco')} = ${PIE_NORMALIZADO('nuestra')}
         AND ABS(EXTRACT(EPOCH FROM (eco."messageTimestamp" - nuestra."messageTimestamp"))) <= ${params.ventana}
         AND ${MISMO_CONTACTO}
       WHERE nuestra."userId" = ${params.userId}
         AND nuestra."fromMe" = TRUE
         AND nuestra."messageId" LIKE 'out\\_%'
         AND (nuestra."raw" ->> 'sentByAi') = 'true'
         AND nuestra."mediaUrl" IS NOT NULL
         AND ${TIPO_NORMALIZADO('nuestra')} IN
             ('imageMessage','videoMessage','audioMessage','documentMessage')
         AND nuestra."messageTimestamp" >= ${params.desde}
         ${linea ? Prisma.sql`AND nuestra."instanceName" = ${linea}` : Prisma.empty}
    ),
    -- Para cada copia nuestra, su eco más cercano.
    suEco AS (
      SELECT DISTINCT ON (id_nuestra) *
        FROM candidatas
       ORDER BY id_nuestra, cerca ASC, id_eco ASC
    ),
    -- Y para cada eco, su copia más cercana. La pareja vale si coinciden.
    suCopia AS (
      SELECT DISTINCT ON (id_eco) id_eco, id_nuestra
        FROM candidatas
       ORDER BY id_eco, cerca ASC, id_nuestra ASC
    )
    SELECT suEco."id_nuestra", suEco."mid_nuestra", suEco."jid_nuestra",
           suEco."id_eco", suEco."mid_eco", suEco."jid_eco",
           suEco."linea", suEco."texto", suEco."tipo",
           suEco."url_nuestra", suEco."url_eco", suEco."segundos"
      FROM suEco
      JOIN suCopia
        ON suCopia."id_eco" = suEco."id_eco"
       AND suCopia."id_nuestra" = suEco."id_nuestra"
     ORDER BY suEco."id_nuestra"
  `;
}

function sqlDeLaClase(
  clase: Clase,
  params: { userId: string; instanceName?: string | null; desde: Date; ventanaMedia: number },
) {
  return clase === 'media'
    ? sqlDeMedia({ ...params, ventana: params.ventanaMedia })
    : sqlDeTexto(params);
}

async function buscarParejas(
  clase: Clase,
  params: { userId: string; instanceName?: string | null; desde: Date; ventanaMedia: number; limite: number },
): Promise<Pareja[]> {
  return db.$queryRaw<Pareja[]>`
    ${sqlDeLaClase(clase, params)} LIMIT ${params.limite}
  `;
}

/**
 * Cuántas parejas hay DE VERDAD, sin el tope de la vuelta.
 *
 * El informe decía `parejasEncontradas: 500` con un tope de 500, que es un
 * número que no informa de nada: no se sabe si son 500 o cinco mil. Es la regla
 * de siempre —un contador es un `COUNT`, no el largo de lo que se pudo traer—,
 * y aquí importa más, porque de ese número depende cuántas vueltas hay que dar.
 */
async function contarParejas(
  clase: Clase,
  params: { userId: string; instanceName?: string | null; desde: Date; ventanaMedia: number },
): Promise<number> {
  const filas = await db.$queryRaw<{ n: number }[]>`
    SELECT COUNT(*)::int AS n FROM (${sqlDeLaClase(clase, params)}) AS t
  `;
  return filas[0]?.n ?? 0;
}

/** Lo que se enseña de cada pareja. La media enseña además los dos archivos. */
function paraElInforme(p: Pareja) {
  return {
    linea: p.linea,
    tipo: p.tipo,
    texto: p.texto || '(sin pie)',
    seQueda: { messageId: p.mid_eco, remoteJid: p.jid_eco, archivo: p.url_eco ?? undefined },
    seBorra: { messageId: p.mid_nuestra, remoteJid: p.jid_nuestra, archivo: p.url_nuestra ?? undefined },
    segundosEntreLasDos: Math.round(p.segundos),
  };
}

export async function GET(request: Request) {
  const user = await currentUser().catch(() => null);
  const esAdmin = !!user?.id && (await esAdminDeVerdad(user));
  if (!autorizado(request, esAdmin)) {
    return NextResponse.json({ ok: false, error: 'No autorizado' }, { status: 401 });
  }

  const url = new URL(request.url);
  const userId = (url.searchParams.get('userId') ?? '').trim();
  const instanceName = url.searchParams.get('instanceName');
  const aplicar = url.searchParams.get('aplicar') === 'si';
  const dias = Number(url.searchParams.get('dias') ?? DIAS_POR_DEFECTO) || DIAS_POR_DEFECTO;
  const limite = Math.min(Number(url.searchParams.get('limite') ?? TOPE_POR_VUELTA) || TOPE_POR_VUELTA, 2000);
  const ventanaMedia = Math.min(
    Number(url.searchParams.get('ventanaMedia') ?? VENTANA_MEDIA_SEGUNDOS) || VENTANA_MEDIA_SEGUNDOS,
    VENTANA_SEGUNDOS,
  );

  // Por defecto solo los textos, que es lo que ya estaba corriendo. La media se
  // pide a propósito, porque se reconoce por otra regla.
  const pedido = (url.searchParams.get('tipo') ?? 'texto').trim().toLowerCase();
  if (!['texto', 'media', 'todo'].includes(pedido)) {
    return NextResponse.json(
      { ok: false, error: '`tipo` solo admite `texto`, `media` o `todo`.' },
      { status: 400 },
    );
  }
  const clases: Clase[] = pedido === 'todo' ? ['texto', 'media'] : [pedido as Clase];

  // Sin cuenta no se corre, ni para mirar: una pasada global sobre
  // `chat_messages` tocaría a todos los clientes.
  if (!userId) {
    return NextResponse.json(
      { ok: false, error: 'Falta `userId`: esta pasada va siempre acotada a una cuenta.' },
      { status: 400 },
    );
  }

  const desde = new Date(Date.now() - dias * 24 * 60 * 60 * 1000);
  const comun = { userId, instanceName, desde, ventanaMedia };

  const porClase: Record<string, {
    antes: number | string;
    enEstaVuelta: number;
    limpiadas?: number;
    yaNoEstaban?: number;
    fallos?: number;
    despues?: number | string;
  }> = {};
  const tratables: ParejaConClase[] = [];
  // Un eco no puede adoptar dos copias, ni una copia irse dos veces.
  const ecosVistos = new Set<string>();
  const nuestrasVistas = new Set<string>();

  for (const clase of clases) {
    let parejas: Pareja[];
    try {
      parejas = await buscarParejas(clase, { ...comun, limite });
    } catch (error) {
      // Un fallo mudo aquí se lee como «no había duplicados», que es lo
      // contrario de lo que pasa.
      console.error(`[duplicados] no se pudieron buscar las parejas de ${clase}`, error);
      return NextResponse.json(
        { ok: false, error: `No se pudieron buscar las parejas de ${clase}.` },
        { status: 500 },
      );
    }

    const deEstaClase = parejas.filter((p) => {
      if (ecosVistos.has(String(p.id_eco))) return false;
      if (nuestrasVistas.has(String(p.id_nuestra))) return false;
      ecosVistos.add(String(p.id_eco));
      nuestrasVistas.add(String(p.id_nuestra));
      return true;
    });
    tratables.push(...deEstaClase.map((p) => ({ ...p, clase })));

    const total = await contarParejas(clase, comun).catch((error) => {
      console.error(`[duplicados] no se pudo contar el total de ${clase}`, error);
      return -1;
    });
    porClase[clase] = {
      antes: total >= 0 ? total : 'no se pudo contar (ver la consola)',
      enEstaVuelta: deEstaClase.length,
    };
  }

  const totalNumerico = clases.reduce((suma, clase) => {
    const n = porClase[clase]?.antes;
    return typeof n === 'number' && suma >= 0 ? suma + n : -1;
  }, 0);

  const muestra = tratables.slice(0, 20).map(paraElInforme);
  // La URL de aplicar tiene que llevar TODO lo que le dio forma a este informe.
  // Le faltaban `limite` y `ventanaMedia`: quien corriera el informe con
  // `&limite=2000` y luego pulsara este enlace aplicaba con 500, o sea sobre un
  // conjunto distinto del que acababa de mirar. Un enlace que promete «aplica
  // esto» tiene que aplicar ESTO.
  const cola =
    `userId=${userId}${instanceName ? `&instanceName=${instanceName}` : ''}` +
    `&dias=${dias}&tipo=${pedido}&limite=${limite}` +
    (clases.includes('media') ? `&ventanaMedia=${ventanaMedia}` : '');

  if (!aplicar) {
    return NextResponse.json({
      ok: true,
      modo: 'informe (no se tocó nada)',
      cuenta: userId,
      linea: instanceName ?? '(todas las de la cuenta)',
      mirando: pedido,
      desde: desde.toISOString(),
      parejasEnTotal: totalNumerico >= 0 ? totalNumerico : 'no se pudo contar (ver la consola)',
      porClase,
      seTrataraEnEstaVuelta: tratables.length,
      topePorVuelta: limite,
      ventanaDeLaMedia: clases.includes('media') ? `${ventanaMedia}s` : undefined,
      faltanTrasEstaVuelta: totalNumerico >= 0 ? Math.max(0, totalNumerico - tratables.length) : null,
      muestra,
      comoAplicar: `${url.pathname}?${cola}&aplicar=si`,
      siSonMuchas: 'se repite la misma llamada hasta que `parejasEnTotal` diga 0; `limite` sube el tamaño de la vuelta (máximo 2000).',
    });
  }

  // Lo que se cuenta son FILAS BORRADAS, no vueltas del bucle que no reventaron.
  //
  // Antes `limpiadas` subía en cuanto la transacción no lanzaba, así que decía
  // lo mismo tanto si borró la fila como si no había nada que borrar. Con eso,
  // «limpiadas: 0» no distinguía «no hizo nada» de «ya estaba hecho», que son
  // dos cosas opuestas y es justo la pregunta que uno viene a hacerle a este
  // número. `$executeRaw` devuelve cuántas filas tocó: eso es lo que se cuenta.
  let limpiadas = 0;
  let yaNoEstaban = 0;
  let fallos = 0;
  let primerFallo: string | undefined;

  const hechoPorClase: Record<string, { limpiadas: number; yaNoEstaban: number; fallos: number }> = {};
  for (const clase of clases) hechoPorClase[clase] = { limpiadas: 0, yaNoEstaban: 0, fallos: 0 };

  for (const p of tratables) {
    const cuenta = hechoPorClase[p.clase];
    try {
      const borradas = await db.$transaction(async (tx) => {
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

        // 3. Y se borra la copia con el id inventado. Lo que devuelve es el dato.
        return tx.$executeRaw`DELETE FROM "chat_messages" WHERE "id" = ${p.id_nuestra}`;
      });

      if (borradas > 0) {
        limpiadas += borradas;
        cuenta.limpiadas += borradas;
      } else {
        yaNoEstaban += 1;
        cuenta.yaNoEstaban += 1;
      }
    } catch (error) {
      fallos += 1;
      cuenta.fallos += 1;
      // El motivo viaja en la RESPUESTA, no solo a la consola del contenedor.
      // Quien corre esto lo corre desde el navegador y no ve esa consola: un
      // fallo que solo se escribe donde nadie mira es un fallo mudo.
      if (!primerFallo) primerFallo = error instanceof Error ? error.message : String(error);
      console.error('[duplicados] no se pudo limpiar una pareja', {
        linea: p.linea,
        tipo: p.tipo,
        seBorra: p.mid_nuestra,
        error,
      });
    }
  }

  // Y se vuelve a contar. Es la única forma de que la respuesta se explique
  // sola: `antes` y `despues` salen los dos de la base, así que dicen lo que
  // pasó de verdad y no lo que el bucle creyó que pasaba.
  for (const clase of clases) {
    const despues = await contarParejas(clase, comun).catch((error) => {
      console.error(`[duplicados] no se pudo recontar ${clase}`, error);
      return -1;
    });
    porClase[clase] = {
      ...porClase[clase],
      ...hechoPorClase[clase],
      despues: despues >= 0 ? despues : 'no se pudo contar (ver la consola)',
    };
  }

  const quedan = clases.reduce((suma, clase) => {
    const n = porClase[clase]?.despues;
    return typeof n === 'number' && suma >= 0 ? suma + n : -1;
  }, 0);

  console.info('[duplicados] pasada terminada', {
    cuenta: userId,
    mirando: pedido,
    limpiadas,
    yaNoEstaban,
    fallos,
    quedan,
  });

  return NextResponse.json({
    ok: true,
    modo: 'aplicado',
    cuenta: userId,
    linea: instanceName ?? '(todas las de la cuenta)',
    mirando: pedido,
    desde: desde.toISOString(),
    parejasAntes: totalNumerico >= 0 ? totalNumerico : 'no se pudo contar (ver la consola)',
    parejasDespues: quedan >= 0 ? quedan : 'no se pudo contar (ver la consola)',
    porClase,
    tratadasEnEstaVuelta: tratables.length,
    limpiadas,
    yaNoEstaban,
    fallos,
    primerFallo,
    muestra,
    siQuedanMas:
      quedan > 0
        ? 'vuelve a llamar con `aplicar=si` hasta que `parejasDespues` diga 0.'
        : 'no queda ninguna en esta ventana.',
  });
}
