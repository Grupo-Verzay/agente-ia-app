import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import {
  EXPRESION_INDEXADA_SQL,
  TOPE_DE_RESULTADOS,
  comoConsultaDeBusqueda,
  elExtracto,
  laFechaDelTexto,
  lasIdentidadesDelResultado,
  type ResultadoDeBusqueda,
} from "@/lib/busqueda-en-mensajes";

/**
 * La consulta de la busqueda dentro de los mensajes. Las reglas viven en
 * `lib/busqueda-en-mensajes.ts` (puro); aqui solo se pregunta a Postgres.
 *
 * ## La puerta la pone QUIEN LLAMA
 *
 * Recibe las cuentas y las lineas ya comprobadas (la ruta
 * `/api/chats/buscar` las pasa por `getAssociatedAccountIds` y
 * `resolveInstanceOwner`). Esta funcion no decide ningun acceso: acota la
 * consulta a lo que le den, y con listas vacias no devuelve nada.
 *
 * ## Dos ramas, cada una con su propio LIMIT
 *
 * Una por texto (el GIN) y otra por dia (el indice de `messageTimestamp`).
 * Cada una se puede parar sola: con el tope DENTRO, una cuenta de millones de
 * mensajes cuesta lo mismo que una de mil (ver «una consulta que devuelve una
 * pagina tiene que poder pararse» en CLAUDE.md). Despues se queda el mensaje
 * mas reciente de cada conversacion.
 */

/** Filas que cada rama trae como mucho antes de juntar por conversacion. */
const TOPE_POR_RAMA = 200;

export const NOMBRE_DEL_INDICE = "chat_messages_busqueda_gin_idx";

let indicePedido: Promise<void> | null = null;

/**
 * Crea el GIN de busqueda, UNA vez por proceso y de fondo: la primera busqueda
 * no lo espera (sin el indice la consulta funciona igual, solo mas lenta).
 *
 * `CONCURRENTLY` no bloquea las escrituras. Si una construccion anterior se
 * cayo a medias deja un indice INVALIDO que `IF NOT EXISTS` da por bueno y que
 * nadie usa: se borra y se vuelve a pedir, pero SOLO si ningun proceso lo esta
 * construyendo ahora (uno en construccion tambien sale invalido, y con dos
 * replicas la otra puede estar en ello).
 */
export function asegurarElIndiceDeBusqueda(): Promise<void> {
  indicePedido ??= (async () => {
    try {
      const filas = await db.$queryRaw<{ valido: boolean; construyendo: boolean }[]>`
        SELECT i.indisvalid AS valido,
               EXISTS (
                 SELECT 1 FROM pg_stat_progress_create_index p WHERE p.index_relid = c.oid
               ) AS construyendo
        FROM pg_class c
        JOIN pg_index i ON i.indexrelid = c.oid
        WHERE c.relname = ${NOMBRE_DEL_INDICE}
        LIMIT 1
      `;
      const estado = filas[0];
      if (estado?.valido || estado?.construyendo) return;
      if (estado && !estado.valido) {
        console.warn("[busqueda] el indice de busqueda quedo invalido; se rehace");
        await db.$executeRawUnsafe(`DROP INDEX CONCURRENTLY IF EXISTS "${NOMBRE_DEL_INDICE}"`);
      }
      const inicio = Date.now();
      await db.$executeRawUnsafe(
        `CREATE INDEX CONCURRENTLY IF NOT EXISTS "${NOMBRE_DEL_INDICE}" ON "chat_messages" USING GIN (${EXPRESION_INDEXADA_SQL})`,
      );
      console.info("[busqueda] indice de busqueda creado", { ms: Date.now() - inicio });
    } catch (error) {
      // Se suelta el recuerdo: la siguiente busqueda lo vuelve a intentar.
      indicePedido = null;
      const e = error as { code?: string; meta?: { code?: string }; message?: string };
      console.error("[busqueda] no se pudo crear el indice de busqueda", {
        codigo: e?.meta?.code ?? e?.code,
        mensaje: e?.message,
      });
    }
  })();
  return indicePedido;
}

type FilaDeBusqueda = {
  instanceName: string;
  remoteJid: string;
  remoteJidAlt: string | null;
  senderPn: string | null;
  pushName: string | null;
  fromMe: boolean | null;
  content: string | null;
  ts: number | string | null;
};

export async function buscarEnLosMensajes(params: {
  texto: string;
  cuentas: string[];
  lineas: string[];
  /** `Date#getTimezoneOffset` de quien busca. */
  desfaseMin?: number;
  ahoraMs?: number;
}): Promise<ResultadoDeBusqueda[]> {
  const cuentas = [...new Set(params.cuentas.filter(Boolean))];
  const lineas = [...new Set(params.lineas.filter(Boolean))];
  if (!cuentas.length || !lineas.length) return [];

  const texto = (params.texto ?? "").trim();
  const fecha = laFechaDelTexto(texto, params.ahoraMs ?? Date.now(), params.desfaseMin ?? 0);
  // Con fecha, el texto que se busca ADEMAS es lo que quedo sin ella.
  const consultaCompleta = comoConsultaDeBusqueda(texto);
  const consultaDelResto = fecha ? comoConsultaDeBusqueda(fecha.resto) : null;
  if (!consultaCompleta && !fecha) return [];

  void asegurarElIndiceDeBusqueda();

  const expresion = Prisma.raw(EXPRESION_INDEXADA_SQL);
  const comun = Prisma.sql`
    "userId" = ANY(${cuentas}::text[])
    AND "instanceName" = ANY(${lineas}::text[])
    AND COALESCE("deleted", FALSE) = FALSE
    AND "remoteJid" <> 'status@broadcast'
  `;
  const columnas = Prisma.sql`
    "instanceName", "remoteJid", "remoteJidAlt", "senderPn", "pushName", "fromMe", "content",
    "messageTimestamp"
  `;

  const ramas: Prisma.Sql[] = [];
  if (consultaCompleta) {
    ramas.push(Prisma.sql`(
      SELECT ${columnas} FROM "chat_messages"
      WHERE ${comun} AND ${expresion} @@ to_tsquery('simple'::regconfig, ${consultaCompleta})
      ORDER BY "messageTimestamp" DESC NULLS LAST
      LIMIT ${TOPE_POR_RAMA}
    )`);
  }
  if (fecha) {
    const delResto = consultaDelResto
      ? Prisma.sql`AND ${expresion} @@ to_tsquery('simple'::regconfig, ${consultaDelResto})`
      : Prisma.empty;
    ramas.push(Prisma.sql`(
      SELECT ${columnas} FROM "chat_messages"
      WHERE ${comun}
        AND "messageTimestamp" >= (to_timestamp(${fecha.desdeSeg}::double precision) AT TIME ZONE 'UTC')
        AND "messageTimestamp" <  (to_timestamp(${fecha.hastaSeg}::double precision) AT TIME ZONE 'UTC')
        ${delResto}
      ORDER BY "messageTimestamp" DESC NULLS LAST
      LIMIT ${TOPE_POR_RAMA}
    )`);
  }

  const filas = await db.$queryRaw<FilaDeBusqueda[]>`
    SELECT * FROM (
      SELECT DISTINCT ON (t."instanceName", t."remoteJid")
        t."instanceName", t."remoteJid", t."remoteJidAlt", t."senderPn", t."pushName",
        t."fromMe", t."content",
        EXTRACT(EPOCH FROM t."messageTimestamp")::double precision AS ts
      FROM (${Prisma.join(ramas, " UNION ALL ")}) t
      ORDER BY t."instanceName", t."remoteJid", t."messageTimestamp" DESC NULLS LAST
    ) u
    ORDER BY u.ts DESC NULLS LAST
    LIMIT ${TOPE_DE_RESULTADOS}
  `;

  const loQueSeResalta = fecha ? fecha.resto : texto;
  return filas.map((f) => ({
    instanceName: f.instanceName,
    remoteJid: f.remoteJid,
    remoteJidAlt: f.remoteJidAlt,
    senderPn: f.senderPn,
    pushName: f.pushName,
    fromMe: Boolean(f.fromMe),
    extracto: elExtracto(f.content ?? "", loQueSeResalta),
    messageTimestamp: Math.floor(Number(f.ts ?? 0)),
  }));
}

/**
 * Quien lleva cada conversacion de los resultados, por `linea::identidad`.
 * Una consulta para todos (por el indice `(userId, remoteJid)`), no una por
 * resultado. Lo usa la ruta para filtrar lo que ve un `agente`.
 */
export async function losAsesoresDeLosResultados(
  cuentas: string[],
  resultados: ResultadoDeBusqueda[],
): Promise<Map<string, string | null>> {
  const mapa = new Map<string, string | null>();
  const identidades = [...new Set(resultados.flatMap(lasIdentidadesDelResultado))];
  const lineas = [...new Set(resultados.map((r) => r.instanceName))];
  if (!cuentas.length || !identidades.length) return mapa;
  const sesiones = await db.session.findMany({
    where: {
      userId: { in: cuentas },
      instanceId: { in: lineas },
      OR: [{ remoteJid: { in: identidades } }, { remoteJidAlt: { in: identidades } }],
    },
    select: { instanceId: true, remoteJid: true, remoteJidAlt: true, assignedAdvisorId: true },
  });
  for (const s of sesiones) {
    for (const id of [s.remoteJid, s.remoteJidAlt]) {
      if (!id) continue;
      const llave = `${s.instanceId}::${id}`;
      // Si alguna ficha tiene dueño, manda el dueño.
      if (!mapa.get(llave)) mapa.set(llave, s.assignedAdvisorId ?? null);
    }
  }
  return mapa;
}
