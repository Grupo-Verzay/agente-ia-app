'use server';

import type { SendMessageResult } from '@/actions/chat-actions';
import type { ChatToolActionResult } from '@/types/chat';

/**
 * Acciones de la pantalla de Chats para las lineas de WhatsApp Mensajeria (Waha).
 *
 * LEER ya funciona sin nada de aqui: los mensajes los guarda el backend al
 * recibirlos por webhook, y `warmChatMessagesAction` con `apiKeyData: null`
 * los saca de nuestra base. Es el mismo trato que Baileys.
 *
 * ESCRIBIR desde la App todavia no. Y mientras no este, tiene que DECIRLO: un
 * boton de enviar que no hace nada es la peor version de este fallo —el asesor
 * escribe, se queda tan tranquilo y el cliente nunca recibe nada—. Por eso
 * estas devuelven un error VISIBLE en vez de fallar callando.
 *
 * Cuando se implemente de verdad, va contra `/api/sendText` de WAHA con la
 * configuracion de `site_config` (ver `lib/waha.ts`), y tiene que pausar la IA
 * antes de que salga el mensaje, como hace la de Baileys.
 */

const TODAVIA_NO =
  'Escribir a mano por WhatsApp Mensajería todavía no está disponible. La IA sí responde por esta línea.';

export async function sendWahaTextAction(
  _instanceName: string,
  remoteJid: string,
): Promise<SendMessageResult> {
  return { success: false, message: TODAVIA_NO, remoteJid };
}

export async function sendWahaWorkflowAction(
  _instanceName: string,
  _remoteJid: string,
  _workflowId: string,
): Promise<ChatToolActionResult> {
  return { success: false, message: TODAVIA_NO };
}

export async function sendWahaQuickReplyAction(
  _instanceName: string,
  _remoteJid: string,
  _quickReplyId: number,
): Promise<ChatToolActionResult> {
  return { success: false, message: TODAVIA_NO };
}
