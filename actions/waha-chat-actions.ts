'use server';

import { db } from '@/lib/db';
import type { Prisma } from '@prisma/client';
import { currentUser } from '@/lib/auth';
import { persistChatMessage, resolveInstanceOwner } from '@/lib/chat-persistence';
import { pausarIaPorIntervencionHumana } from '@/lib/human-takeover';
import { sendWahaMedia, sendWahaText, type WahaMediaType } from '@/lib/waha';
import { canonicalToWahaJid } from '@/lib/waha-jid';
import { assertCanAccessTargetUser } from '@/actions/billing/helpers/app-access-guard';
import type { SendMessageResult } from '@/actions/chat-actions';
import type { ChatToolActionResult } from '@/types/chat';

/**
 * Acciones de la pantalla de Chats para las lineas de WhatsApp Mensajeria (waha).
 *
 * LEER no pasa por aqui: los mensajes los guarda el backend al recibirlos por
 * webhook y `warmChatMessagesAction` con `apiKeyData: null` los saca de nuestra
 * base. Es el mismo trato que Baileys.
 *
 * ESCRIBIR va contra el servidor WAHA configurado en Panel > Conexion
 * (`lib/waha.ts`), en este orden y no en otro:
 *
 * 1. Se comprueba de quien es la linea y que quien escribe puede tocarla.
 * 2. Se PAUSA la IA. Antes de que salga el mensaje, no despues: un adjunto
 *    tarda segundos en subir y la IA alcanzaba a contestar encima del asesor.
 * 3. Se envia, con el `chatId` traducido a la forma de WAHA (`@c.us`; el
 *    `@lid` se manda tal cual, que WAHA lo acepta).
 * 4. Se guarda en nuestra base como saliente, para que la conversacion lo
 *    pinte y la lista suba la fila. Con el id que devolvio WAHA, para que un
 *    eco por webhook no lo duplique.
 *
 * Y cualquier fallo se DICE. Un boton de enviar que no hace nada es la peor
 * version de este fallo: el asesor escribe tranquilo y el cliente no recibe
 * nada.
 */

type OutgoingPayload = {
  kind: string;
  text?: string;
  mediatype?: string;
  mediaUrl?: string;
  mimetype?: string;
  fileName?: string;
  caption?: string;
  ptt?: boolean;
  quotedMessage?: { key?: { id?: string | null } | null } | null;
  [key: string]: unknown;
};

const TIPOS_DE_MEDIA: ReadonlySet<string> = new Set(['image', 'video', 'audio', 'document']);

async function lineaWahaAutorizada(instanceName: string): Promise<
  { ok: true; userId: string } | { ok: false; message: string }
> {
  const user = await currentUser();
  if (!user?.id) return { ok: false, message: 'No autorizado.' };

  const dueno = await resolveInstanceOwner(instanceName);
  if (!dueno?.userId) return { ok: false, message: `No se encontró la línea ${instanceName}.` };
  if ((dueno.instanceType ?? '').trim().toLowerCase() !== 'waha') {
    return { ok: false, message: `La línea ${instanceName} no es de WhatsApp Mensajería.` };
  }
  await assertCanAccessTargetUser(dueno.userId);
  return { ok: true, userId: dueno.userId };
}

/** Lo que se guarda de un adjunto: la URL si la hay; un `data:` gigante no va a la base. */
function mediaUrlParaGuardar(mediaUrl?: string): string | null {
  return mediaUrl && /^https?:\/\//i.test(mediaUrl) ? mediaUrl : null;
}

export async function sendWahaTextAction(
  instanceName: string,
  remoteJid: string,
  payload: OutgoingPayload,
): Promise<SendMessageResult> {
  try {
    const linea = await lineaWahaAutorizada(instanceName);
    if (!linea.ok) return { success: false, message: linea.message, remoteJid };

    await pausarIaPorIntervencionHumana(linea.userId, remoteJid);

    const chatId = canonicalToWahaJid(remoteJid);
    if (!chatId) return { success: false, message: 'El contacto no tiene una identidad válida.', remoteJid };
    const replyTo = payload.quotedMessage?.key?.id ?? null;

    if (payload.kind === 'media') {
      const mediatype = String(payload.mediatype ?? '').toLowerCase();
      if (!TIPOS_DE_MEDIA.has(mediatype) || !payload.mediaUrl) {
        return { success: false, message: 'Adjunto no reconocido.', remoteJid };
      }
      const envio = await sendWahaMedia({
        session: instanceName,
        chatId,
        mediatype: mediatype as WahaMediaType,
        mediaUrl: payload.mediaUrl,
        mimetype: payload.mimetype,
        fileName: payload.fileName,
        caption: payload.caption,
        ptt: payload.ptt ?? false,
        replyTo,
      });
      if (!envio.ok) return { success: false, message: envio.message, remoteJid };

      const ahora = new Date();
      const mediaUrl = mediaUrlParaGuardar(payload.mediaUrl);
      const texto = String(payload.caption ?? payload.fileName ?? etiquetaDeMedia(mediatype, payload.ptt));
      await persistChatMessage({
        userId: linea.userId,
        instanceName,
        instanceType: 'waha',
        remoteJid,
        fromMe: true,
        messageId: envio.messageId,
        messageType: `${mediatype}Message`,
        content: texto,
        mediaUrl,
        raw: snapshotDeSaliente({
          messageId: envio.messageId,
          remoteJid,
          messageType: `${mediatype}Message`,
          message: {
            conversation: texto,
            ...(mediaUrl ? { mediaUrl } : {}),
            [`${mediatype}Message`]: {
              caption: payload.caption?.trim() || undefined,
              fileName: payload.fileName ?? undefined,
              mimetype: payload.mimetype ?? undefined,
              ...(mediaUrl ? { mediaUrl } : {}),
              ptt: payload.ptt ?? undefined,
            },
          },
          fecha: ahora,
        }),
        messageTimestamp: ahora,
      });
      return { success: true, message: 'Enviado.', remoteJid };
    }

    const text = (payload.text ?? '').trim();
    if (!text) return { success: false, message: 'El mensaje está vacío.', remoteJid };

    const envio = await sendWahaText({ session: instanceName, chatId, text, replyTo });
    if (!envio.ok) return { success: false, message: envio.message, remoteJid };

    const ahora = new Date();
    await persistChatMessage({
      userId: linea.userId,
      instanceName,
      instanceType: 'waha',
      remoteJid,
      fromMe: true,
      messageId: envio.messageId,
      messageType: 'conversation',
      content: text,
      raw: snapshotDeSaliente({
        messageId: envio.messageId,
        remoteJid,
        messageType: 'conversation',
        message: { conversation: text },
        fecha: ahora,
        replyTo,
      }),
      messageTimestamp: ahora,
    });
    return { success: true, message: 'Enviado.', remoteJid };
  } catch (error) {
    console.error('[sendWahaTextAction]', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'No se pudo enviar por WhatsApp Mensajería.',
      remoteJid,
    };
  }
}

/**
 * El `raw` que se guarda con el mensaje, con la MISMA forma que un mensaje de
 * Evolution (`key`, `message`, `messageTimestamp`, `status`). La pantalla lee
 * las filas guardadas a traves de `getRawEvolutionSnapshot`, que reconoce esa
 * forma; un objeto cualquiera se colaba entero dentro de `message` y la
 * burbuja llevaba campos que no eran suyos. Sellado en SEGUNDOS, como todo lo
 * nuestro.
 */
function snapshotDeSaliente(params: {
  messageId: string | null;
  remoteJid: string;
  messageType: string;
  message: Record<string, unknown>;
  fecha: Date;
  replyTo?: string | null;
}): Prisma.InputJsonValue {
  // Los `undefined` los descarta JSON.stringify al guardar; el tipo de Prisma no
  // los contempla, de ahi el cast.
  return {
    key: { id: params.messageId ?? null, fromMe: true, remoteJid: params.remoteJid },
    messageType: params.messageType,
    message: params.message,
    messageTimestamp: Math.floor(params.fecha.getTime() / 1000),
    status: 'DELIVERY_ACK',
    source: 'waha',
    origen: 'waha-app',
    ...(params.replyTo ? { replyTo: params.replyTo } : {}),
  } as unknown as Prisma.InputJsonValue;
}

function etiquetaDeMedia(mediatype: string, ptt?: boolean): string {
  if (mediatype === 'audio') return ptt ? '🎤 Nota de voz' : '🎵 Audio';
  if (mediatype === 'image') return '📷 Imagen';
  if (mediatype === 'video') return '🎥 Video';
  return '📎 Documento';
}

export async function sendWahaWorkflowAction(
  _instanceName: string,
  _remoteJid: string,
  _workflowId: string,
): Promise<ChatToolActionResult> {
  // Los flujos manuales los ejecuta el backend contra Evolution. Mientras no
  // haya camino por WAHA, se dice; no se finge que salio.
  return {
    success: false,
    message: 'Los flujos manuales todavía no están disponibles por WhatsApp Mensajería.',
  };
}

export async function sendWahaQuickReplyAction(
  instanceName: string,
  remoteJid: string,
  quickReplyId: number,
): Promise<ChatToolActionResult> {
  try {
    const rr = await db.quickReply.findUnique({ where: { id: quickReplyId } });
    const texto = rr?.mensaje?.trim();
    if (!texto) return { success: false, message: 'Respuesta rápida no encontrada.' };

    const result = await sendWahaTextAction(instanceName, remoteJid, { kind: 'text', text: texto });
    return { success: result.success, message: result.message };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Error al enviar la respuesta rápida.',
    };
  }
}
