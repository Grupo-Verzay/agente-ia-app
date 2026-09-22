import "server-only";

/**
 * El barrido que rescata las llamadas de las que nadie avisó.
 *
 * El porqué está entero en `lib/rescate-de-llamadas.ts`, que es donde se
 * decide. Aquí solo está lo que toca la base: encontrarlas, intentarlo **una
 * vez por vuelta y en serie**, y dejar constancia de que se intentó.
 *
 * Tres cosas que hay que mantener:
 *
 * 1. **La consulta va acotada por `messageTimestamp`.** Los cinco índices de
 *    `chat_messages` empiezan por `userId` y aquí no hay ninguno que dar, así
 *    que sin esa condición se barrería la tabla entera — el caso exacto que
 *    describe la regla del BRIN. Y el parámetro va **moldeado**
 *    (`make_interval(days => $1::int)`): Prisma lo manda sin tipo y
 *    `make_interval` solo acepta `int`.
 * 2. **En serie, nunca en paralelo.** El pool de Prisma es de diez por proceso
 *    y son los mismos turnos que atienden la bandeja de Chats; y cada rescate
 *    se baja un WAV entero. Diez a la vez es quitarle los turnos a lo que sí
 *    está mirando alguien.
 * 3. **Nunca lanza, y nunca es mudo.** Cuelga de un reloj: un barrido que
 *    revienta no puede tumbar a quien lo llamó, y uno que se rinde en silencio
 *    es justo el fallo del que venimos.
 */

import { db } from '@/lib/db';
import { processCallRecordingForUser } from '@/lib/grabacion-de-llamada.server';
import {
  TOPE_POR_VUELTA,
  VENTANA_DE_RESCATE_DIAS,
  elSiguienteSello,
  queLeFaltaALaLlamada,
  type LlamadaParaRescatar,
} from '@/lib/rescate-de-llamadas';

export type InformeDelRescate = {
  /** Candidatas que trajo la consulta. */
  miradas: number;
  /** Las que de verdad se intentaron en esta vuelta. */
  intentadas: number;
  /** Las que quedaron con su transcripción escrita. **Este número es la
   * alarma**: si sube, la cadena del aviso de fin está rota. */
  rescatadas: number;
  /** Se intentó y la grabación seguía sin estar (o no se pudo). */
  pendientes: number;
  /** De las que se intentaron cerrar sin tener duración, o sea a las que NO
   * les llegó el aviso de fin. Separado a propósito: distingue «la cadena está
   * caída» de «la transcripción no salió». */
  sinAviso: number;
  /** Llegaron al tope de intentos y dejan de mirarse. */
  agotadas: number;
  /** Se reventó el intento (red, base). */
  fallos: number;
};

/** Las candidatas: llamadas con su par de ids y sin transcripción, dentro de la
 * ventana. El resto de la decisión —si toca ya, si se agotó, si sigue en
 * curso— la toma la función pura con la fila delante; filtrarlo todo en SQL
 * sería tener la regla escrita dos veces y en dos lenguajes. */
async function lasCandidatas(limite: number) {
  return db.$queryRaw<{ id: bigint; userId: string; raw: unknown; edadMs: number }[]>`
    SELECT "id",
           "userId",
           "raw",
           EXTRACT(EPOCH FROM (NOW() - "messageTimestamp")) * 1000 AS "edadMs"
      FROM "chat_messages"
     WHERE "messageType" = 'call'
       AND "messageTimestamp" > NOW() - make_interval(days => ${VENTANA_DE_RESCATE_DIAS}::int)
       AND "raw" -> 'call' ->> 'astraCallId' IS NOT NULL
       AND "raw" -> 'call' ->> 'astraSid' IS NOT NULL
       AND ("raw" -> 'call' ->> 'transcript') IS NULL
     ORDER BY "messageTimestamp" ASC
     LIMIT ${limite}
  `;
}

/** Deja escrito que se intentó. Va en su propio `try`: que no se pueda sellar
 * no puede tumbar el barrido —lo peor que pasa es que esa llamada se reintente
 * antes de tiempo—, pero tampoco puede ser mudo, porque un sello que no se
 * escribe convierte esto en el bucle que el tope viene a evitar. */
async function sellarElIntento(id: bigint, anterior: unknown): Promise<void> {
  const sello = elSiguienteSello(anterior, new Date());
  try {
    await db.$executeRaw`
      UPDATE "chat_messages"
         SET "raw" = COALESCE("raw", '{}'::jsonb)
                  || jsonb_build_object(
                       'call',
                       COALESCE("raw" -> 'call', '{}'::jsonb)
                       || jsonb_build_object('rescate', ${JSON.stringify(sello)}::jsonb)
                     )
       WHERE "id" = ${id}
    `;
  } catch (error) {
    console.warn('[llamadas] no se pudo sellar el intento de rescate', {
      chatMessageId: String(id),
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

function elCallDeLaFila(raw: unknown): LlamadaParaRescatar | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const call = (raw as Record<string, unknown>).call;
  if (!call || typeof call !== 'object' || Array.isArray(call)) return null;
  return call as LlamadaParaRescatar;
}

export async function rescatarLlamadasSinCerrar(
  opciones: { limite?: number } = {},
): Promise<InformeDelRescate> {
  const informe: InformeDelRescate = {
    miradas: 0,
    intentadas: 0,
    rescatadas: 0,
    pendientes: 0,
    sinAviso: 0,
    agotadas: 0,
    fallos: 0,
  };

  let filas: { id: bigint; userId: string; raw: unknown; edadMs: number }[] = [];
  try {
    filas = await lasCandidatas(Math.max(1, opciones.limite ?? TOPE_POR_VUELTA));
  } catch (error) {
    console.warn('[llamadas] el barrido de rescate no pudo leer las candidatas', {
      error: error instanceof Error ? error.message : String(error),
    });
    return informe;
  }
  informe.miradas = filas.length;

  const ahoraMs = Date.now();
  for (const fila of filas) {
    const call = elCallDeLaFila(fila.raw);
    const veredicto = queLeFaltaALaLlamada({
      call,
      edadMs: Number(fila.edadMs) || 0,
      ahoraMs,
    });
    if (!veredicto.rescatar) {
      if (veredicto.motivo === 'agotada') informe.agotadas += 1;
      continue;
    }

    informe.intentadas += 1;
    if (veredicto.que === 'cerrar') informe.sinAviso += 1;

    // El sello se escribe ANTES de intentarlo. Al revés, un intento que
    // revienta a mitad —o un despliegue que se lleva el proceso, que es
    // exactamente lo que pasa aquí— dejaría la llamada sin gastar su turno y
    // el barrido siguiente volvería a bajarse el mismo WAV.
    await sellarElIntento(fila.id, call?.rescate);

    try {
      const res = await processCallRecordingForUser({
        userId: fila.userId,
        chatMessageId: String(fila.id),
        astraSid: String((call as LlamadaParaRescatar).astraSid),
        astraCallId: String((call as LlamadaParaRescatar).astraCallId),
      });
      if (res.success) {
        informe.rescatadas += 1;
      } else {
        informe.pendientes += 1;
      }
    } catch (error) {
      informe.fallos += 1;
      console.warn('[llamadas] fallo el rescate de una llamada', {
        chatMessageId: String(fila.id),
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // Que haya algo que rescatar NO es normal: significa que el aviso de fin de
  // llamada no llegó. Por eso se dice con nombre y apellidos, y no como una
  // línea más de un barrido que corrió.
  if (informe.sinAviso > 0) {
    console.warn(
      '[llamadas] hubo que rescatar llamadas a las que NO les llegó el aviso de fin: revisa la cadena AstraCalls → backend → App',
      informe,
    );
  } else if (informe.intentadas > 0) {
    console.info('[llamadas] barrido de rescate', informe);
  }

  return informe;
}
