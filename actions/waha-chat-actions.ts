'use server';

import { db } from '@/lib/db';
import type { Prisma } from '@prisma/client';
import { currentUser } from '@/lib/auth';
import { persistChatMessage, resolveInstanceOwner } from '@/lib/chat-persistence';
import { pausarIaPorIntervencionHumana } from '@/lib/human-takeover';
import { anteponerFirmaDelAsesor } from '@/lib/firma-del-asesor';
import { ensureWahaSessionEvents, getWahaPresence, sendWahaMedia, sendWahaText, type PresenciaWaha, type WahaMediaType } from '@/lib/waha';
import { canonicalToWahaJid } from '@/lib/waha-jid';
import { subirAdjuntoSaliente } from '@/lib/adjuntos-salientes';
import { assertCanAccessTargetUser } from '@/actions/billing/helpers/app-access-guard';
import type { SendMessageResult } from '@/actions/chat-actions';
import type { ChatToolActionResult } from '@/types/chat';
import { sendManualWorkflowAction } from '@/actions/chat-manual-actions';

/**
 * Acciones de la pantalla de Chats para las lineas de WhatsApp Mensajeria (waha).
 *
 * LEER no pasa por aqui: los mensajes los guarda el backend al recibirlos por
 * webhook y `warmChatMessagesAction` con `apiKeyData: null` los saca de nuestra
 * base. Es el mismo trato que Baileys.
 *
 * ESCRIBIR va contra el servidor Waha configurado en Panel > Conexion
 * (`lib/waha.ts`), en este orden y no en otro:
 *
 * 1. Se comprueba de quien es la linea y que quien escribe puede tocarla.
 * 2. Se PAUSA la IA. Antes de que salga el mensaje, no despues: un adjunto
 *    tarda segundos en subir y la IA alcanzaba a contestar encima del asesor.
 * 3. Se envia, con el `chatId` traducido a la forma de Waha (`@c.us`; el
 *    `@lid` se manda tal cual, que Waha lo acepta).
 * 4. Se guarda en nuestra base como saliente, para que la conversacion lo
 *    pinte y la lista suba la fila. Con el id que devolvio Waha, para que un
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
    return { ok: false, message: `La línea ${instanceName} no usa esta conexión.` };
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
      // El adjunto se sube a S3 ANTES de enviarlo: Waha lo descarga de ahi y la
      // conversacion lo reproduce de ahi. Sin esto la nota de voz llegaba al
      // cliente pero la burbuja quedaba vacia. Si la subida falla, se manda
      // igual en base64 (el cliente lo recibe) y se avisa: la burbuja saldra
      // sin archivo, que es peor que un aviso pero mejor que no enviar.
      const subida = await subirAdjuntoSaliente({
        userId: linea.userId,
        mediaUrl: payload.mediaUrl,
        mimetype: payload.mimetype,
        fileName: payload.fileName,
      });
      if (!subida) {
        console.warn('[waha] adjunto saliente sin copia en S3: la burbuja no tendra archivo', {
          instanceName,
          mediatype,
          mimetype: payload.mimetype ?? null,
        });
      }
      const archivo = subida ?? payload.mediaUrl;

      const envio = await sendWahaMedia({
        session: instanceName,
        chatId,
        mediatype: mediatype as WahaMediaType,
        mediaUrl: archivo,
        mimetype: payload.mimetype,
        fileName: payload.fileName,
        caption: payload.caption,
        ptt: payload.ptt ?? false,
        replyTo,
      });
      if (!envio.ok) return { success: false, message: envio.message, remoteJid };

      const ahora = new Date();
      const mediaUrl = mediaUrlParaGuardar(archivo);
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

    const escrito = (payload.text ?? '').trim();
    if (!escrito) return { success: false, message: 'El mensaje está vacío.', remoteJid };
    // La firma del asesor, con la MISMA regla que las lineas de Evolution.
    // Estaba escrita solo dentro del envio de Evolution -que ni siquiera
    // arranca sin sus credenciales-, asi que en una linea de Waha el
    // interruptor se veia encendido y el mensaje salia sin firma.
    const text = await anteponerFirmaDelAsesor({
      ownerUserId: linea.userId,
      remoteJid,
      texto: escrito,
    });

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
      message: error instanceof Error ? error.message : 'No se pudo enviar el mensaje.',
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
    // Una palomita: llego al servidor. Las siguientes las traen los acuses
    // (message.ack) y las escribe el backend en raw.status.
    status: 'SERVER_ACK',
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

/**
 * Presencia actual del contacto (en linea / ult. vez / escribiendo) al abrir
 * una conversacion de una linea waha. Deja el chat suscrito para lo que venga
 * despues por tiempo real. Devuelve null si no se puede saber.
 */
export async function getWahaPresenceAction(
  instanceName: string,
  remoteJid: string,
): Promise<PresenciaWaha | null> {
  try {
    const linea = await lineaWahaAutorizada(instanceName);
    if (!linea.ok) return null;
    const chatId = canonicalToWahaJid(remoteJid);
    if (!chatId || chatId.endsWith('@g.us')) return null;
    // De paso, que la sesion tenga los eventos completos (acuses, borrados,
    // presencia). Asi se autocura al abrir un chat, sin pasar por Conexion.
    void ensureWahaSessionEvents(instanceName);
    return await getWahaPresence(instanceName, chatId);
  } catch (error) {
    console.warn('[waha] no se pudo leer la presencia inicial', { instanceName, error: String(error) });
    return null;
  }
}

export async function sendWahaWorkflowAction(
  instanceName: string,
  remoteJid: string,
  workflowId: string,
): Promise<ChatToolActionResult> {
  // El mismo motor de nodos que Evolution (texto, media, automatizaciones):
  // `sendManualWorkflowAction` detecta que la linea es waha y manda cada nodo
  // por Waha. Aqui solo se le da el contexto sin clave, que es lo que tiene.
  return sendManualWorkflowAction({ apiKeyData: null, instanceName }, remoteJid, workflowId);
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
