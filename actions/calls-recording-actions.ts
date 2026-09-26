'use server';

import { db } from '@/lib/db';
import { laCuentaDeLaFilaDeLlamada } from '@/lib/cuenta-de-la-llamada.server';
import {
  processCallRecordingForUser,
  processMetaCallRecordingForUser,
} from '@/lib/grabacion-de-llamada.server';

/**
 * Los dos envoltorios que abre `CallDialog` al colgar. Lo unico que hacen es
 * **resolver de quien es la llamada** con `currentUser()` y pasarselo a la
 * maquinaria, que vive en `lib/grabacion-de-llamada.server.ts` con el motivo
 * escrito al lado.
 *
 * En dos palabras: **una accion es un endpoint**, y la funcion de debajo
 * aceptaba el `userId` que le mandaran — o sea, transcribir con los creditos de
 * otra cuenta. Aqui el id no llega del navegador: sale de la FILA de la
 * llamada, pasada por la puerta de siempre (`laCuentaDeLaFilaDeLlamada`).
 *
 * Y es la fila y no la sesion por lo mismo que la llamada sale por la cuenta
 * dueña de la conversacion: esa fila esta escrita bajo ESA cuenta. Con
 * `effectiveId` —la de quien mira— la busqueda `(id, userId)` no la encontraba
 * y la llamada se quedaba sin transcripcion ni Resumen IA, sin un error.
 */

export async function processCallRecordingAction(input: {
  chatMessageId: string;
  astraSid: string;
  astraCallId: string;
}): Promise<{ success: boolean; message?: string }> {
  const userId = await laCuentaDeLaFilaDeLlamada(input.chatMessageId);
  if (!userId) return { success: false, message: 'No autorizado.' };
  return processCallRecordingForUser({ ...input, userId });
}

export async function processMetaCallRecordingAction(input: {
  chatMessageId: string;
  audioBase64: string;
  mimeType?: string;
}): Promise<{ success: boolean; message?: string }> {
  const userId = await laCuentaDeLaFilaDeLlamada(input.chatMessageId);
  if (!userId) return { success: false, message: 'No autorizado.' };
  return processMetaCallRecordingForUser({ ...input, userId });
}

/**
 * Vuelve a intentar la transcripción de una llamada que se quedó sin ella.
 *
 * Es el equivalente del botón que ya tiene una nota de voz en Chats, y existe
 * por el mismo motivo: **un fallo de hoy no puede ser definitivo**. Hasta
 * ahora, cuando una llamada abandonaba —OpenAI no contestó, la cuenta se quedó
 * sin créditos a mitad— no había absolutamente ninguna forma de recuperarla:
 * la tarjeta decía «Procesando…» y ahí se acababa.
 *
 * Tres cosas que hay que mantener:
 *
 * 1. **El par de ids sale de la FILA, nunca del navegador.** Aceptarlos de
 *    fuera sería pedirle a AstraCalls la grabación de la llamada que alguien
 *    nombrara y escribirla en esta fila.
 * 2. **La puerta es la de siempre** (`laCuentaDeLaFilaDeLlamada`): la cuenta
 *    dueña de la llamada, que es también la que paga la transcripción.
 * 3. **Sin el par de ids no se intenta**, y se dice: una llamada de Meta o una
 *    que se registró sin ellos no tiene de dónde bajar el audio, y sondearla
 *    sería quemar vueltas sobre algo que nunca va a dar.
 */
export async function reintentarLaTranscripcionAction(
  chatMessageId: string,
): Promise<{ success: boolean; message?: string }> {
  const userId = await laCuentaDeLaFilaDeLlamada(chatMessageId);
  if (!userId) return { success: false, message: 'No autorizado.' };

  let id: bigint;
  try {
    id = BigInt(chatMessageId);
  } catch {
    return { success: false, message: 'Llamada no encontrada.' };
  }

  const fila = await db.chatMessage.findFirst({
    where: { id, userId, messageType: 'call' },
    select: { raw: true },
  });
  if (!fila) return { success: false, message: 'Llamada no encontrada.' };

  const raw = fila.raw && typeof fila.raw === 'object' && !Array.isArray(fila.raw)
    ? (fila.raw as Record<string, unknown>)
    : {};
  const call = raw.call && typeof raw.call === 'object' && !Array.isArray(raw.call)
    ? (raw.call as Record<string, unknown>)
    : {};
  const astraSid = typeof call.astraSid === 'string' ? call.astraSid.trim() : '';
  const astraCallId = typeof call.astraCallId === 'string' ? call.astraCallId.trim() : '';
  if (!astraSid || !astraCallId) {
    return { success: false, message: 'Esta llamada no tiene grabación que pedir.' };
  }

  const res = await processCallRecordingForUser({ userId, chatMessageId, astraSid, astraCallId });
  return { success: res.success, message: res.message };
}
