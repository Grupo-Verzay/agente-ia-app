'use server';

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
