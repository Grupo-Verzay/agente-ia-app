'use server';

import { currentUser } from '@/lib/auth';
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
 * otra cuenta. Aqui el id no llega del navegador: sale de la sesion.
 */

export async function processCallRecordingAction(input: {
  chatMessageId: string;
  astraSid: string;
  astraCallId: string;
}): Promise<{ success: boolean; message?: string }> {
  const me = await currentUser();
  const userId = me?.effectiveId ?? me?.ownerId ?? me?.id;
  if (!userId) return { success: false, message: 'No autorizado.' };
  return processCallRecordingForUser({ ...input, userId });
}

export async function processMetaCallRecordingAction(input: {
  chatMessageId: string;
  audioBase64: string;
  mimeType?: string;
}): Promise<{ success: boolean; message?: string }> {
  const me = await currentUser();
  const userId = me?.effectiveId ?? me?.ownerId ?? me?.id;
  if (!userId) return { success: false, message: 'No autorizado.' };
  return processMetaCallRecordingForUser({ ...input, userId });
}
