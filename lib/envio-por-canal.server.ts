import 'server-only';

/**
 * El ENVÍO por un canal unificado (Meta: WhatsApp Cloud / Facebook / Instagram;
 * Telegram), sin puerta.
 *
 * Vivía dentro de `actions/channel-chat-actions.ts`, que es `'use server'`: o
 * sea que `sendChannelTextAction` y `sendMetaTemplate` eran endpoints a los que
 * cualquiera con sesión llegaba con el nombre de CUALQUIER línea. No comprobaban
 * de quién era: se podía escribir a un cliente por la línea de otra cuenta.
 *
 * Esto se partió en dos, como manda CLAUDE.md para un envío que llaman a la vez
 * una pantalla y un despachador («un RUNNER de sistema no puede ser una
 * acción»):
 *
 * - **Aquí**, con `server-only`, el cuerpo de siempre sin cambiar una línea.
 *   Lo llaman los caminos del servidor que no tienen sesión —el despachador de
 *   avisos, las notificaciones de facturación, la página pública de reservas—,
 *   que ya deciden por su cuenta qué línea usar. Ponerles la guarda no los
 *   protegería: los apagaría.
 * - **En la acción**, la puerta (`lib/linea-del-canal.server.ts`) y después
 *   esto. Es lo que abre el navegador.
 *
 * **Nadie importa esto desde un fichero que el navegador pueda llamar con la
 * línea que quiera.** Si hace falta enviar por canal desde una pantalla, va por
 * la acción.
 */

import { persistChatMessage, resolveInstanceOwner } from '@/lib/chat-persistence';
import { currentUser } from '@/lib/auth';
import { db } from '@/lib/db';
import type { SendMessageResult } from '@/actions/chat-actions';
import { pausarIaPorIntervencionHumana } from '@/lib/human-takeover';
import { apuntarLoQueHizo, apuntarUnaVezAlDia } from '@/lib/apuntar-actividad';

export type ChannelOutgoingPayload = { kind: string; text?: string; [key: string]: unknown };

function backendUrl() {
  return (process.env.BACKEND_URL ?? '').replace(/\/$/, '');
}

function authHeaders(): Record<string, string> {
  return {
    'x-internal-secret': process.env.CRM_FOLLOW_UP_RUNNER_KEY ?? '',
    'Content-Type': 'application/json',
  };
}

function mediaFallbackLabel(payload: ChannelOutgoingPayload) {
  const mediatype = String(payload.mediatype ?? 'media');
  if (mediatype === 'image') return '🖼️ Imagen';
  if (mediatype === 'video') return '🎥 Video';
  if (mediatype === 'audio') return payload.ptt === false ? '🎧 Audio' : '🎙️ Nota de voz';
  if (mediatype === 'document') return '📄 Documento';
  return '📎 Archivo';
}

/**
 * Apunta el envio en la Actividad del equipo.
 *
 * Se llama SOLO tras haber persistido el mensaje, o sea cuando de verdad salio:
 * contar un envio que rebotó seria anotar algo que no paso. Y resuelve la
 * persona aqui —`currentUser()`— porque el `userId` que estas funciones tienen a
 * mano es el de la CUENTA dueña de la linea, no el de quien escribe.
 */
async function apuntarElEnvio(remoteJid: string): Promise<void> {
  const quien = await currentUser();
  if (!quien) return;
  await apuntarLoQueHizo(quien, 'mensaje_enviado');
  await apuntarUnaVezAlDia(quien, 'chat_atendido', remoteJid);
}

async function applyAdvisorSignatureIfEnabled(instanceName: string, remoteJid: string, text: string) {
  const user = await currentUser();
  const signature = (user?.advisorSignature as string | null | undefined)?.trim();
  if (!user?.id || !signature) return text;

  const owner = await resolveInstanceOwner(instanceName);
  const userIds = Array.from(
    new Set([owner?.userId, user.effectiveId, user.ownerId, user.id].filter(Boolean) as string[]),
  );
  if (userIds.length === 0) return text;

  const sessionRow = await db.session.findFirst({
    where: {
      userId: { in: userIds },
      remoteJid,
      signatureEnabled: true,
    },
    select: { id: true },
  });

  return sessionRow ? `${signature}\n${text}` : text;
}

export async function enviarPorCanal(
  instanceName: string,
  remoteJid: string,
  payload: ChannelOutgoingPayload,
): Promise<SendMessageResult> {
  try {
    // El asesor interviene: la IA se calla antes de que salga el mensaje, no
    // después. Un audio o una imagen tardan segundos en subir y la IA alcanzaba
    // a contestar encima.
    const dueno = await resolveInstanceOwner(instanceName);
    await pausarIaPorIntervencionHumana(dueno?.userId, remoteJid);

    if (payload.kind === 'media') {
      const res = await fetch(
        `${backendUrl()}/whatsapp/channels/send-media-channel/${encodeURIComponent(instanceName)}`,
        {
          method: 'POST',
          headers: authHeaders(),
          body: JSON.stringify({
            remoteJid,
            mediatype: payload.mediatype,
            mediaUrl: payload.mediaUrl,
            mimetype: payload.mimetype,
            fileName: payload.fileName,
            caption: payload.caption,
            ptt: payload.ptt ?? false,
          }),
          cache: 'no-store',
        },
      );
      if (!res.ok) {
        const reason = await res.json().then((j) => j?.message).catch(() => null);
        return { success: false, message: typeof reason === 'string' && reason ? reason : `Error ${res.status} al enviar.`, remoteJid };
      }
      const publicUrl = await res.json().then((j) => j?.mediaUrl).catch(() => null);
      const owner = dueno;
      if (owner?.userId) {
        await persistChatMessage({
          userId: owner.userId,
          instanceName,
          instanceType: owner.instanceType ?? undefined,
          remoteJid,
          fromMe: true,
          messageType: `${String(payload.mediatype ?? 'media')}Message`,
          content: String(payload.caption ?? payload.fileName ?? mediaFallbackLabel(payload)),
          mediaUrl: typeof publicUrl === 'string' ? publicUrl : (typeof payload.mediaUrl === 'string' ? payload.mediaUrl : null),
          messageTimestamp: new Date(),
        });
      }
      await apuntarElEnvio(remoteJid);
      return { success: true, message: 'Enviado.', remoteJid };
    }
    const text = await applyAdvisorSignatureIfEnabled(
      instanceName,
      remoteJid,
      (payload.text ?? '').trim(),
    );
    if (!text) return { success: false, message: 'Mensaje vacío.', remoteJid };

    const res = await fetch(
      `${backendUrl()}/whatsapp/channels/send-channel/${encodeURIComponent(instanceName)}`,
      {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ remoteJid, text }),
        cache: 'no-store',
      },
    );
    if (!res.ok) {
      // El backend devuelve un motivo legible (p.ej. fuera de la ventana de 24h de Meta).
      const reason = await res.json().then((j) => j?.message).catch(() => null);
      return {
        success: false,
        message: typeof reason === 'string' && reason ? reason : `Error ${res.status} al enviar.`,
        remoteJid,
      };
    }

    const owner = dueno;
    if (owner?.userId) {
      await persistChatMessage({
        userId: owner.userId,
        instanceName,
        instanceType: owner.instanceType ?? undefined,
        remoteJid,
        fromMe: true,
        messageType: 'conversation',
        content: text,
        messageTimestamp: new Date(),
      });
    }
    await apuntarElEnvio(remoteJid);
    return { success: true, message: 'Enviado.', remoteJid };
  } catch (err: any) {
    return { success: false, message: err?.message ?? 'Error al enviar.', remoteJid };
  }
}

/* ─── Plantillas de WhatsApp Cloud (Meta) ─── */

export interface MetaTemplateOption {
  name: string;
  language: string;
  category: string;
  bodyText: string;
  paramCount: number;
}

/** Lista las plantillas aprobadas de la WABA de una instancia Meta. */
export async function listarPlantillasMeta(
  instanceName: string,
): Promise<{ success: boolean; templates: MetaTemplateOption[] }> {
  try {
    const res = await fetch(
      `${backendUrl()}/whatsapp/channels/meta-templates/${encodeURIComponent(instanceName)}`,
      { headers: authHeaders(), cache: 'no-store' },
    );
    if (!res.ok) return { success: false, templates: [] };
    const json = await res.json();
    return { success: true, templates: (json?.templates ?? []) as MetaTemplateOption[] };
  } catch {
    return { success: false, templates: [] };
  }
}

/** Renderiza el cuerpo de la plantilla sustituyendo {{1}}, {{2}}… por los params. */
function renderTemplateBody(bodyText: string, params: string[]): string {
  return bodyText.replace(/\{\{\s*(\d+)\s*\}\}/g, (_, n) => params[Number(n) - 1] ?? `{{${n}}}`);
}

/** Envía una plantilla de WhatsApp Cloud y persiste el saliente en el panel. */
export async function enviarPlantillaMeta(
  instanceName: string,
  remoteJid: string,
  template: MetaTemplateOption,
  params: string[],
): Promise<SendMessageResult> {
  try {
    const res = await fetch(
      `${backendUrl()}/whatsapp/channels/send-template/${encodeURIComponent(instanceName)}`,
      {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          remoteJid,
          name: template.name,
          language: template.language,
          params,
        }),
        cache: 'no-store',
      },
    );
    if (!res.ok) {
      const reason = await res.json().then((j) => j?.message).catch(() => null);
      return { success: false, message: typeof reason === 'string' && reason ? reason : `Error ${res.status} al enviar la plantilla.`, remoteJid };
    }

    const owner = await resolveInstanceOwner(instanceName);
    if (owner?.userId) {
      await persistChatMessage({
        userId: owner.userId,
        instanceName,
        instanceType: owner.instanceType ?? 'meta',
        remoteJid,
        fromMe: true,
        messageType: 'conversation',
        content: renderTemplateBody(template.bodyText, params) || `[Plantilla: ${template.name}]`,
        messageTimestamp: new Date(),
      });
    }
    await apuntarElEnvio(remoteJid);
    return { success: true, message: 'Plantilla enviada.', remoteJid };
  } catch (err: any) {
    return { success: false, message: err?.message ?? 'Error al enviar la plantilla.', remoteJid };
  }
}
