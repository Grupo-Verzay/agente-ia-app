/**
 * El resultado de una llamada que PROPONE la IA, y quién manda cuando una
 * persona ya lo cambió.
 *
 * Puro a propósito: lo usan el procesado de la grabación (servidor), la tabla
 * de CRM › Llamadas y el banco. La regla de quién manda está escrita aquí y
 * repetida —la misma condición— en el `UPDATE` que la aplica
 * (`proponerElResultado` en `lib/grabacion-de-llamada.server.ts`): el banco
 * las compara.
 *
 * # Los cinco, y el orden cuando dos encajan
 *
 * | resultado | cuándo |
 * | --- | --- |
 * | Interesado | el cliente muestra interés y NO se le envió el enlace de agenda |
 * | Link enviado | además se le envió el enlace. **Gana sobre Interesado**: es el estado más avanzado |
 * | Volver a llamar | pide que lo llamen después |
 * | No contesta | no hubo conversación |
 * | No interesado | dice que no le interesa |
 *
 * # Quién manda
 *
 * **La persona manda sobre la IA, siempre.** La propuesta se guarda aparte
 * (`dispositionIa`) y solo se escribe en `disposition` cuando no hay nada
 * puesto o lo que hay lo puso la IA. Un resultado guardado sin
 * `dispositionSource` —todos los de antes— cuenta como puesto a mano: pisarlo
 * sería reescribir lo que alguien marcó.
 */
import { CALL_DISPOSITIONS, isCallDisposition, type CallDisposition } from '@/lib/call-dispositions';

export type OrigenDelResultado = 'ia' | 'manual';

/** Lo que se le pide al modelo. Una sola línea de respuesta: el valor. */
export const INSTRUCCIONES_DE_CLASIFICACION = `Clasifica el resultado de esta llamada de ventas a partir de su transcripción. Responde SOLO con uno de estos valores, sin nada más:
- interesado: el cliente manifiesta interés pero NO se le envió el enlace de agenda.
- link_enviado: el cliente mostró interés y ADEMÁS se le envió (o se le confirmó que se le envía) el enlace de agenda por WhatsApp. Si se envió el enlace, este valor gana sobre "interesado".
- volver_llamar: el cliente pide que lo llamen en otro momento.
- no_contesta: no hubo conversación (no contestó, buzón, silencio, se cortó al saludar).
- no_interesado: el cliente dice que no le interesa.`;

/**
 * El valor que contestó el modelo, o null si no se entiende.
 *
 * El modelo puede contestar con comillas, en mayúsculas, con el rótulo en vez
 * del valor («Link enviado») o con una frase alrededor. Se busca el valor; si
 * aparecen dos, gana el más avanzado (`link_enviado` sobre `interesado`), que
 * es la regla del encargo, y un «no interesado» no se confunde con
 * «interesado» porque se mira primero.
 */
export function leerElResultadoDeLaIa(texto: string | null | undefined): CallDisposition | null {
  const t = sinAcentos(String(texto ?? '')).toLowerCase().replace(/[_-]+/g, ' ');
  if (!t.trim()) return null;
  const hay = (re: RegExp) => re.test(t);
  if (hay(/\bno\s+interesad[oa]\b/)) return 'no_interesado';
  if (hay(/\blink\s+enviado\b|\benlace\s+enviado\b/)) return 'link_enviado';
  if (hay(/\bvolver\s+(a\s+)?llamar\b/)) return 'volver_llamar';
  if (hay(/\bno\s+contesta\b/)) return 'no_contesta';
  if (hay(/\binteresad[oa]\b/)) return 'interesado';
  return null;
}

/**
 * Lo que se propone SIN preguntarle al modelo. Sin transcripción no hubo
 * conversación que clasificar: eso ES «No contesta», y llamar al modelo para
 * que lo diga sería gastar por nada.
 */
export function resultadoSinConversacion(input: {
  transcript?: string | null;
  contestada?: boolean;
}): CallDisposition | null {
  if (input.contestada === false) return 'no_contesta';
  if (!String(input.transcript ?? '').trim()) return 'no_contesta';
  return null;
}

/**
 * ¿Puede la IA escribir su propuesta como resultado? Solo si no hay ninguno,
 * o si el que hay también lo puso ella. Es la MISMA condición del `UPDATE`.
 */
export function laIaPuedeEscribir(actual: {
  disposition?: string | null;
  dispositionSource?: string | null;
}): boolean {
  if (!actual.disposition) return true;
  return actual.dispositionSource === 'ia';
}

/** Cómo se enseña el resultado de una fila: su valor y si lo propuso la IA. */
export function elResultadoQueSeVe(call: {
  disposition?: string | null;
  dispositionSource?: string | null;
}): { valor: string | null; deIa: boolean } {
  return {
    valor: call.disposition ?? null,
    deIa: Boolean(call.disposition) && call.dispositionSource === 'ia',
  };
}

export { isCallDisposition };
export const VALORES_DE_RESULTADO = CALL_DISPOSITIONS.map((d) => d.value);

function sinAcentos(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '');
}
