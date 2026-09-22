'use server';

import {
  getPersistedInboxChats,
  getPersistedMessages,
  resolveInstanceOwner,
} from '@/lib/chat-persistence';
import { currentUser } from '@/lib/auth';
import type {
  FetchChatsResult,
  FindMessagesResult,
  SendMessageResult,
} from '@/actions/chat-actions';
import type { ChatToolActionResult } from '@/types/chat';
import { assertCanAccessTargetUser } from '@/actions/billing/helpers/app-access-guard';
import {
  enviarPlantillaMeta,
  enviarPorCanal,
  listarPlantillasMeta,
  type ChannelOutgoingPayload,
  type MetaTemplateOption,
} from '@/lib/envio-por-canal.server';
import { laLineaDelCanalAlcanza } from '@/lib/linea-del-canal.server';

export type { MetaTemplateOption } from '@/lib/envio-por-canal.server';

/**
 * Acciones de chat para canales que viven en el store unificado
 * (Telegram, Meta: WhatsApp Cloud / Facebook / Instagram).
 *
 * Lectura: tablas chat_messages / chat_conversations (persistidas por el backend).
 * Envío manual: endpoint genérico /whatsapp/channels/send-channel (WhatsAppSenderFactory).
 */

export async function fetchChannelChats(instanceName: string): Promise<FetchChatsResult> {
  try {
    // Una acción ES un endpoint: la ruta de la lista ya comprueba la línea,
    // pero esto se puede llamar directo con el nombre de cualquier otra.
    const puerta = await laLineaDelCanalAlcanza(instanceName, 'lista');
    if (!puerta.ok) return { success: false, message: puerta.message };

    const owner = await resolveInstanceOwner(instanceName);
    if (!owner?.userId) return { success: false, message: 'Instancia sin propietario.' };

    const data = await getPersistedInboxChats({
      userIds: [owner.userId],
      instanceNames: [instanceName],
    });
    return { success: true, message: 'OK', data };
  } catch (err: any) {
    return { success: false, message: err?.message ?? 'Error al cargar chats.' };
  }
}

/**
 * La pagina siguiente de la bandeja de UNA linea.
 *
 * La lista se carga acotada (`TOPE_DE_LA_BANDEJA`, 300) y el contador de cada
 * canal dice el total de verdad. Sin esto las dos cifras no podian encontrarse
 * nunca: el desplegable ofrecia «Ventas 574», se elegia, y la lista solo tenia
 * 290 filas que enseñar. **Un filtro que ofrece un numero tiene que poder
 * llegar a el**, y la forma de hacerlo sin encarecer todas las cargas es traer
 * la pagina siguiente cuando la persona baja del todo.
 */
export async function traerMasChatsDeLaLinea(
  instanceName: string,
  anteriorA: number,
): Promise<FetchChatsResult> {
  try {
    const user = await currentUser();
    if (!user?.id) return { success: false, message: 'No autorizado.' };

    const owner = await resolveInstanceOwner(instanceName);
    if (!owner?.userId) return { success: false, message: 'Instancia sin propietario.' };

    // De quien es la linea, igual que en cualquier otra accion que reciba un id.
    await assertCanAccessTargetUser(owner.userId);

    const data = await getPersistedInboxChats({
      userIds: [owner.userId],
      instanceNames: [instanceName],
      antesDe: anteriorA > 0 ? new Date(anteriorA) : undefined,
    });
    return { success: true, message: 'OK', data };
  } catch (err: any) {
    return { success: false, message: err?.message ?? 'Error al cargar mas chats.' };
  }
}

export async function warmChannelMessages(
  instanceName: string,
  remoteJid: string,
  opts?: { pageSize?: number; before?: string; page?: number; remoteJidAliases?: string[]; localOnly?: boolean; localFirst?: boolean },
): Promise<FindMessagesResult> {
  // Telegram/Meta siempre leen de local (el webhook persiste todo), así que
  // localFirst/localOnly se comportan igual: no hay fuente remota a la que caer.
  try {
    // Misma puerta que la lista: llamada directa, sería leer la conversación de
    // cualquier línea de la plataforma.
    const puerta = await laLineaDelCanalAlcanza(instanceName, 'conversacion');
    if (!puerta.ok) return { success: false, message: puerta.message };

    const owner = await resolveInstanceOwner(instanceName);
    if (!owner?.userId) return { success: false, message: 'Instancia sin propietario.' };

    const pageSize = opts?.pageSize ?? 50;
    const page = opts?.page && opts.page > 0 ? opts.page : 1;

    const data = await getPersistedMessages({
      userIds: [owner.userId],
      instanceName,
      remoteJid,
      aliases: opts?.remoteJidAliases,
      take: pageSize,
      skip: (page - 1) * pageSize,
    });
    return {
      success: true,
      message: 'OK',
      data,
      currentPage: page,
      nextPage: data.length === pageSize ? page + 1 : null,
    };
  } catch (err: any) {
    return { success: false, message: err?.message ?? 'Error al cargar mensajes.' };
  }
}

/**
 * Envío manual de texto o archivo por un canal (Meta, Telegram).
 *
 * **Pregunta primero de quién es la línea.** Antes no lo hacía: con sesión y el
 * nombre de cualquier línea se le escribía a un cliente por un canal ajeno. Lo
 * decide `laLineaDelCanalAlcanza` —la cuenta propia y las que cuelgan de ella,
 * nunca la madre ni las hermanas— y va ANTES de pausar la IA y de hablar con
 * el backend: un rechazo no toca nada ni llega al proveedor.
 *
 * El cuerpo de siempre vive en `lib/envio-por-canal.server.ts`; los caminos del
 * servidor sin sesión (despachador, facturación) van por ahí directamente.
 */
export async function sendChannelTextAction(
  instanceName: string,
  remoteJid: string,
  payload: ChannelOutgoingPayload,
): Promise<SendMessageResult> {
  try {
    const puerta = await laLineaDelCanalAlcanza(instanceName, 'texto');
    if (!puerta.ok) return { success: false, message: puerta.message, remoteJid };
    return await enviarPorCanal(instanceName, remoteJid, payload);
  } catch (err: any) {
    return { success: false, message: err?.message ?? 'Error al enviar.', remoteJid };
  }
}

/* ─── Plantillas de WhatsApp Cloud (Meta) ─── */

/**
 * Lista las plantillas aprobadas de la WABA de una línea Meta. Con la misma
 * puerta: la lista de plantillas de otra cuenta no es de quien pregunta.
 */
export async function listMetaTemplates(
  instanceName: string,
): Promise<{ success: boolean; templates: MetaTemplateOption[] }> {
  try {
    const puerta = await laLineaDelCanalAlcanza(instanceName, 'plantillas');
    if (!puerta.ok) return { success: false, templates: [] };
    return await listarPlantillasMeta(instanceName);
  } catch {
    return { success: false, templates: [] };
  }
}

/** Envía una plantilla de WhatsApp Cloud por una línea de quien envía. */
export async function sendMetaTemplate(
  instanceName: string,
  remoteJid: string,
  template: MetaTemplateOption,
  params: string[],
): Promise<SendMessageResult> {
  try {
    const puerta = await laLineaDelCanalAlcanza(instanceName, 'plantilla');
    if (!puerta.ok) return { success: false, message: puerta.message, remoteJid };
    return await enviarPlantillaMeta(instanceName, remoteJid, template, params);
  } catch (err: any) {
    return { success: false, message: err?.message ?? 'Error al enviar la plantilla.', remoteJid };
  }
}

export async function sendChannelWorkflowAction(
  _instanceName: string,
  _remoteJid: string,
  _workflowId: string,
): Promise<ChatToolActionResult> {
  return { success: false, message: 'Workflows manuales no disponibles en este canal.' };
}

export async function sendChannelQuickReplyAction(
  instanceName: string,
  remoteJid: string,
  quickReplyId: number,
): Promise<ChatToolActionResult> {
  try {
    // La línea primero: sin ella, el aviso de abajo diría «no es de la línea»
    // a quien en realidad no tiene acceso a la línea.
    const puerta = await laLineaDelCanalAlcanza(instanceName, 'respuesta rápida');
    if (!puerta.ok) return { success: false, message: puerta.message };

    const { db } = await import('@/lib/db');
    const rr = await db.quickReply.findUnique({ where: { id: quickReplyId } });
    if (!rr?.mensaje?.trim()) return { success: false, message: 'Respuesta rápida no encontrada.' };
    // No comprobaba de quién era: cualquier respuesta rápida de la plataforma
    // salía por esta línea. Tiene que ser de la cuenta de la línea
    // (`lib/atajos-de-la-linea.ts`).
    const { esAtajoDeLaLinea } = await import('@/lib/atajos-de-la-linea.server');
    const { porQueNoEsDeLaLinea } = await import('@/lib/atajos-de-la-linea');
    if (!(await esAtajoDeLaLinea(rr.userId, instanceName)).ok) {
      return { success: false, message: porQueNoEsDeLaLinea('respuesta rápida', instanceName) };
    }

    const res = await sendChannelTextAction(instanceName, remoteJid, { kind: 'text', text: rr.mensaje.trim() });
    return res.success
      ? { success: true, message: 'Enviado.' }
      : { success: false, message: res.message };
  } catch (err: any) {
    return { success: false, message: err?.message ?? 'Error al enviar respuesta rápida.' };
  }
}
