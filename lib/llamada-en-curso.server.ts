import 'server-only';

import { db } from '@/lib/db';
import {
  hayUnaLlamadaEnCurso,
  lasLlamadasVivas,
  VENTANA_DE_LLAMADA_EN_CURSO_MIN,
} from '@/lib/llamada-en-curso';

/**
 * Los `astraCallId` de las llamadas que se le hicieron a este número por esta
 * sesión en la ventana. Entra por `messageTimestamp` (BRIN) y el `messageId`
 * con el número al final, que es como lo escribe `logOutgoingCallAction`.
 */
export async function losIdsDeLasLlamadasAlNumero(sid: string, digitos: string): Promise<string[]> {
  const filas = await db.$queryRaw<{ id: string | null }[]>`
    SELECT raw->'call'->>'astraCallId' AS id
    FROM chat_messages
    WHERE "messageTimestamp" > NOW() - make_interval(mins => ${VENTANA_DE_LLAMADA_EN_CURSO_MIN}::int)
      AND "messageId" LIKE ${`callout\\_%\\_${digitos}`}
      AND raw->'call'->>'astraSid' = ${sid}
  `;
  return filas.map((f) => f.id).filter((x): x is string => !!x);
}

/**
 * ¿Hay una llamada en curso con este número? Si no se puede saber (la base o
 * el servidor de llamadas no contestan) se contesta que NO: bloquear una
 * llamada legítima por no poder preguntar es peor que el duplicado. Y se dice.
 */
export async function yaHayUnaLlamadaEnCurso(
  base: string,
  clave: string,
  sid: string,
  digitos: string,
): Promise<boolean> {
  try {
    const ids = await losIdsDeLasLlamadasAlNumero(sid, digitos);
    if (ids.length === 0) return false;
    const r = await fetch(`${base}/api/sessions/${sid}/calls`, {
      headers: { 'X-API-Key': clave },
      signal: AbortSignal.timeout(5000),
    });
    if (!r.ok) {
      console.warn('[llamadas] no se pudo leer las llamadas vivas; se deja llamar', { status: r.status });
      return false;
    }
    return hayUnaLlamadaEnCurso(ids, lasLlamadasVivas(await r.json().catch(() => null)));
  } catch (e) {
    console.warn('[llamadas] no se pudo comprobar si hay una llamada en curso; se deja llamar', {
      error: (e as Error)?.message,
    });
    return false;
  }
}
