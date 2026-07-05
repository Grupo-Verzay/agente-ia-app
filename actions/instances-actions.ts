'use server'

import { db } from "@/lib/db";
import { z } from "zod";
import { Instancia } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { randomUUID } from "crypto";

const getInstancesSchema = z.object({
  userId: z.string().min(1, "El userId es obligatorio"),
});

// 1. Corrige la interfaz para que 'data' sea siempre un array
export interface InstanceResponse<T> {
  success: boolean;
  message: string;
  data: T;
}

export async function checkInstanceNameExists(instanceName: string): Promise<boolean> {
  if (!instanceName || instanceName.trim().length === 0) return false;
  try {
    const existing = await db.instancia.findFirst({
      where: { instanceName: { equals: instanceName.trim(), mode: 'insensitive' } },
      select: { id: true },
    });
    return !!existing;
  } catch {
    return false;
  }
}

export type SwitchAdapterResult = { success: boolean; message: string };

export async function switchInstanceAdapter(
  instanceName: string,
  targetType: 'baileys' | 'Whatsapp',
): Promise<SwitchAdapterResult> {
  if (!instanceName) return { success: false, message: 'Nombre de instancia requerido.' };

  const backendUrl = process.env.BACKEND_URL?.replace(/\/$/, '');
  const secret = process.env.BAILEYS_SECRET;

  try {
    if (targetType === 'baileys') {
      await db.instancia.updateMany({
        where: { instanceName },
        data: { instanceType: 'baileys' },
      });

      if (backendUrl && secret) {
        await fetch(`${backendUrl}/whatsapp/baileys/start/${encodeURIComponent(instanceName)}`, {
          method: 'POST',
          headers: { 'x-internal-secret': secret },
          cache: 'no-store',
        }).catch(() => {});
      }
    } else {
      if (backendUrl && secret) {
        await fetch(`${backendUrl}/whatsapp/baileys/stop/${encodeURIComponent(instanceName)}`, {
          method: 'DELETE',
          headers: { 'x-internal-secret': secret },
          cache: 'no-store',
        }).catch(() => {});
      }

      await db.instancia.updateMany({
        where: { instanceName },
        data: { instanceType: 'Whatsapp' },
      });
    }

    revalidatePath('/connection');
    return { success: true, message: `Adaptador cambiado a ${targetType === 'baileys' ? 'Baileys' : 'Evolution API'}.` };
  } catch (error) {
    console.error('[switchInstanceAdapter]', error);
    return { success: false, message: 'Error al cambiar el adaptador.' };
  }
}

export async function stopBaileysSession(
  instanceName: string,
): Promise<{ success: boolean; message: string }> {
  if (!instanceName) return { success: false, message: 'Nombre de instancia requerido.' };

  const backendUrl = process.env.BACKEND_URL?.replace(/\/$/, '');
  const secret = process.env.BAILEYS_SECRET;

  if (!backendUrl || !secret) return { success: false, message: 'Backend no configurado.' };

  try {
    await fetch(`${backendUrl}/whatsapp/baileys/stop/${encodeURIComponent(instanceName)}`, {
      method: 'DELETE',
      headers: { 'x-internal-secret': secret },
      cache: 'no-store',
    });
    return { success: true, message: 'Sesión detenida.' };
  } catch {
    return { success: false, message: 'Error al detener la sesión.' };
  }
}

export async function createBaileysInstance(
  instanceName: string,
  userId: string,
): Promise<{ success: boolean; message: string }> {
  if (!instanceName || !userId) return { success: false, message: 'Datos requeridos.' };

  const backendUrl = process.env.BACKEND_URL?.replace(/\/$/, '');
  const secret = process.env.BAILEYS_SECRET;

  if (!backendUrl || !secret) return { success: false, message: 'Backend no configurado.' };

  try {
    // 1. Crear registro en BD
    await db.instancia.create({
      data: {
        instanceName,
        instanceType: 'baileys',
        userId,
        instanceId: `baileys-${instanceName}`,
      },
    });

    // 2. Iniciar sesión Baileys en el backend
    await fetch(`${backendUrl}/whatsapp/baileys/start/${encodeURIComponent(instanceName)}`, {
      method: 'POST',
      headers: { 'x-internal-secret': secret },
      cache: 'no-store',
    }).catch(() => {});

    revalidatePath('/connection');
    return { success: true, message: 'Instancia Baileys creada. Escanea el QR para conectar.' };
  } catch (error) {
    console.error('[createBaileysInstance]', error);
    return { success: false, message: error?.message ?? 'Error al crear la instancia.' };
  }
}

export async function deleteBaileysInstance(
  instanceName: string,
): Promise<{ success: boolean; message: string }> {
  if (!instanceName) return { success: false, message: 'Nombre de instancia requerido.' };

  const backendUrl = process.env.BACKEND_URL?.replace(/\/$/, '');
  const secret = process.env.BAILEYS_SECRET;

  try {
    // 1. Detener sesión Baileys en el backend (ignorar errores si ya está detenida)
    if (backendUrl && secret) {
      await fetch(`${backendUrl}/whatsapp/baileys/stop/${encodeURIComponent(instanceName)}`, {
        method: 'DELETE',
        headers: { 'x-internal-secret': secret },
        cache: 'no-store',
      }).catch(() => {});
    }

    // 2. Eliminar contactos (cascade elimina mensajes también)
    await db.baileysContact.deleteMany({ where: { instanceName } });

    // 3. Eliminar el registro de Instancia
    await db.instancia.deleteMany({ where: { instanceName } });

    revalidatePath('/connection');
    return { success: true, message: 'Instancia eliminada correctamente.' };
  } catch (error) {
    console.error('[deleteBaileysInstance]', error);
    return { success: false, message: 'Error al eliminar la instancia.' };
  }
}

export async function startBaileysSession(
  instanceName: string,
): Promise<{ success: boolean; message: string }> {
  if (!instanceName) return { success: false, message: 'Nombre de instancia requerido.' };

  const backendUrl = process.env.BACKEND_URL?.replace(/\/$/, '');
  const secret = process.env.BAILEYS_SECRET;

  if (!backendUrl || !secret) return { success: false, message: 'Backend no configurado.' };

  try {
    await fetch(`${backendUrl}/whatsapp/baileys/start/${encodeURIComponent(instanceName)}`, {
      method: 'POST',
      headers: { 'x-internal-secret': secret },
      cache: 'no-store',
    });
    return { success: true, message: 'Sesión iniciada.' };
  } catch {
    return { success: false, message: 'Error al iniciar la sesión.' };
  }
}

export async function getInstancesByUserId(userId: string): Promise<InstanceResponse<Instancia[]>> {
  const validation = getInstancesSchema.safeParse({ userId });

  if (!validation.success) {
    return {
      success: false,
      message: "User ID inválido",
      // 2. Retorna un array vacío en caso de error de validación
      data: []
    };
  }

  try {
    const instances = await db.instancia.findMany({
      where: { userId },
      orderBy: { id: "desc" },
    });

    return {
      success: true,
      message: "Instancia obtenidas correctamente",
      data: instances, // 'instances' es un array
    };
  } catch (error) {
    console.error("[GET_INSTANCES_BY_USER_ID]", error);
    return {
      success: false,
      message: "Error al obtener las instancias",
      // 3. Retorna un array vacío en caso de error de la base de datos
      data: []
    };
  }
}

export async function setUserConnectionType(
  userId: string,
  targetType: 'baileys' | 'Whatsapp',
  companyName?: string,
): Promise<{ success: boolean; message: string }> {
  if (!userId) return { success: false, message: 'userId requerido.' };

  const backendUrl = process.env.BACKEND_URL?.replace(/\/$/, '');
  const secret = process.env.BAILEYS_SECRET;

  try {
    const existing = await db.instancia.findFirst({
      where: {
        userId,
        NOT: { instanceType: { in: ['Instagram', 'Facebook'] } },
      },
    });

    if (existing) {
      if (targetType === 'baileys') {
        await db.instancia.update({ where: { id: existing.id }, data: { instanceType: 'baileys' } });
        if (backendUrl && secret) {
          await fetch(`${backendUrl}/whatsapp/baileys/start/${encodeURIComponent(existing.instanceName)}`, {
            method: 'POST', headers: { 'x-internal-secret': secret }, cache: 'no-store',
          }).catch(() => {});
        }
      } else {
        if (existing.instanceType === 'baileys' && backendUrl && secret) {
          await fetch(`${backendUrl}/whatsapp/baileys/stop/${encodeURIComponent(existing.instanceName)}`, {
            method: 'DELETE', headers: { 'x-internal-secret': secret }, cache: 'no-store',
          }).catch(() => {});
        }
        await db.instancia.update({ where: { id: existing.id }, data: { instanceType: 'Whatsapp' } });
      }
    } else {
      // Sin instancia → crear una nueva
      const base = (companyName ?? userId)
        .toLowerCase()
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]/g, '_')
        .replace(/_+/g, '_')
        .slice(0, 20)
        .replace(/^_|_$/g, '');
      const instanceName = `${base}_${Math.random().toString(36).slice(2, 7)}`;

      await db.instancia.create({
        data: {
          instanceName,
          instanceType: targetType,
          userId,
          instanceId: `${targetType === 'baileys' ? 'baileys' : 'evo'}-${instanceName}`,
        },
      });

      if (targetType === 'baileys' && backendUrl && secret) {
        await fetch(`${backendUrl}/whatsapp/baileys/start/${encodeURIComponent(instanceName)}`, {
          method: 'POST', headers: { 'x-internal-secret': secret }, cache: 'no-store',
        }).catch(() => {});
      }
    }

    revalidatePath('/connection');
    const label = targetType === 'baileys' ? 'Baileys' : 'Evolution API';
    return { success: true, message: `Canal configurado como ${label}. El cliente puede conectar desde su página de Conexión.` };
  } catch (err) {
    console.error('[setUserConnectionType]', err);
    return { success: false, message: 'Error al configurar el canal.' };
  }
}

/* ─── Meta Cloud API instances ─────────────────────────────── */

/**
 * Suscribe NUESTRA app a la WABA (`POST /{waba}/subscribed_apps`) para que Meta
 * entregue los mensajes entrantes de ese WABA a nuestro webhook. El Embedded
 * Signup lo hacía automático; en la conexión manual hay que ejecutarlo aquí,
 * si no, aunque la app esté en modo Activo NO llegan los mensajes reales.
 */
async function subscribeMetaAppToWaba(wabaId: string, token: string): Promise<boolean> {
  if (!wabaId || !token) return false;
  const version =
    process.env.META_GRAPH_VERSION || process.env.NEXT_PUBLIC_META_GRAPH_VERSION || 'v21.0';
  try {
    const res = await fetch(
      `https://graph.facebook.com/${version}/${encodeURIComponent(wabaId)}/subscribed_apps`,
      { method: 'POST', headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' },
    );
    const json: any = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error('[subscribeMetaAppToWaba] fallo', res.status, JSON.stringify(json));
      return false;
    }
    console.log('[subscribeMetaAppToWaba] OK waba=', wabaId, JSON.stringify(json));
    return true;
  } catch (e: any) {
    console.error('[subscribeMetaAppToWaba] error', e?.message ?? e);
    return false;
  }
}

export async function createMetaInstance(params: {
  instanceName: string;
  userId: string;
  phoneNumberId: string;
  accessToken: string;
  wabaId: string;
  verifyToken: string;
}): Promise<{ success: boolean; message: string }> {
  const { instanceName, userId, phoneNumberId, accessToken, wabaId, verifyToken } = params;
  if (!instanceName || !userId || !phoneNumberId || !accessToken) {
    return { success: false, message: 'Nombre, Phone Number ID y Access Token son requeridos.' };
  }
  try {
    await db.instancia.create({
      data: {
        instanceName,
        instanceType: 'meta',
        userId,
        instanceId: `meta-${phoneNumberId}`,
        metaPhoneNumberId: phoneNumberId,
        metaAccessToken: accessToken,
        metaWabaId: wabaId || null,
        metaVerifyToken: verifyToken || null,
        metaChannel: 'whatsapp',
      } as any,
    });
    // Suscribe la app a la WABA para recibir mensajes entrantes (best-effort).
    const subscribed = wabaId ? await subscribeMetaAppToWaba(wabaId, accessToken) : false;
    revalidatePath('/connection');
    return {
      success: true,
      message: subscribed
        ? 'Instancia Meta creada y suscrita. Configura el webhook en Meta Developer.'
        : 'Instancia Meta creada. Configura el webhook en Meta Developer.',
    };
  } catch (error: any) {
    console.error('[createMetaInstance]', error);
    return { success: false, message: error?.message ?? 'Error al crear la instancia Meta.' };
  }
}

export async function createFacebookInstance(params: {
  instanceName: string;
  userId: string;
  pageId: string;
  accessToken: string;
  verifyToken: string;
}): Promise<{ success: boolean; message: string }> {
  const { instanceName, userId, pageId, accessToken, verifyToken } = params;
  if (!instanceName || !userId || !pageId || !accessToken) {
    return { success: false, message: 'Page ID y Access Token son requeridos.' };
  }
  try {
    await db.instancia.create({
      data: {
        instanceName,
        instanceType: 'meta',
        userId,
        instanceId: `meta-fb-${pageId}`,
        metaAccessToken: accessToken,
        metaVerifyToken: verifyToken || null,
        metaChannel: 'facebook',
        metaPageId: pageId,
      } as any,
    });
    revalidatePath('/connection');
    return { success: true, message: 'Instancia Facebook creada. Configura el webhook en Meta Developer.' };
  } catch (error: any) {
    console.error('[createFacebookInstance]', error);
    return { success: false, message: error?.message ?? 'Error al crear la instancia Facebook.' };
  }
}

export async function createInstagramInstance(params: {
  instanceName: string;
  userId: string;
  instagramAccountId: string;
  accessToken: string;
  verifyToken: string;
}): Promise<{ success: boolean; message: string }> {
  const { instanceName, userId, instagramAccountId, accessToken, verifyToken } = params;
  if (!instanceName || !userId || !instagramAccountId || !accessToken) {
    return { success: false, message: 'Instagram Account ID y Access Token son requeridos.' };
  }
  try {
    await db.instancia.create({
      data: {
        instanceName,
        instanceType: 'meta',
        userId,
        instanceId: `meta-ig-${instagramAccountId}`,
        metaAccessToken: accessToken,
        metaVerifyToken: verifyToken || null,
        metaChannel: 'instagram',
        metaPageId: instagramAccountId,
      } as any,
    });
    revalidatePath('/connection');
    return { success: true, message: 'Instancia Instagram creada. Configura el webhook en Meta Developer.' };
  } catch (error: any) {
    console.error('[createInstagramInstance]', error);
    return { success: false, message: error?.message ?? 'Error al crear la instancia Instagram.' };
  }
}

export async function deleteMetaInstance(
  instanceName: string,
): Promise<{ success: boolean; message: string }> {
  if (!instanceName) return { success: false, message: 'Nombre de instancia requerido.' };
  try {
    await db.instancia.deleteMany({ where: { instanceName } });
    revalidatePath('/connection');
    return { success: true, message: 'Instancia eliminada.' };
  } catch (error: any) {
    console.error('[deleteMetaInstance]', error);
    return { success: false, message: 'Error al eliminar la instancia.' };
  }
}

/* ─── Telegram Bot API instances ───────────────────────────── */

const TELEGRAM_API = 'https://api.telegram.org';

/** Valida el bot token contra getMe y devuelve el username del bot. */
async function telegramGetMe(
  botToken: string,
): Promise<{ ok: boolean; username?: string; message?: string }> {
  try {
    const res = await fetch(`${TELEGRAM_API}/bot${botToken}/getMe`, { cache: 'no-store' });
    const json = await res.json();
    if (!json?.ok) {
      return { ok: false, message: json?.description ?? 'Token inválido.' };
    }
    return { ok: true, username: json.result?.username };
  } catch {
    return { ok: false, message: 'No se pudo contactar a Telegram.' };
  }
}

/** Registra el webhook del bot apuntando a nuestro backend. */
async function telegramSetWebhook(
  botToken: string,
  instanceName: string,
  secretToken: string,
): Promise<{ ok: boolean; message?: string }> {
  const backendUrl = process.env.BACKEND_URL?.replace(/\/$/, '');
  if (!backendUrl) {
    return { ok: false, message: 'BACKEND_URL no configurado en el servidor.' };
  }
  const webhookUrl = `${backendUrl}/webhook/telegram/${encodeURIComponent(instanceName)}`;
  try {
    const res = await fetch(`${TELEGRAM_API}/bot${botToken}/setWebhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: webhookUrl,
        secret_token: secretToken,
        allowed_updates: ['message', 'edited_message'],
      }),
      cache: 'no-store',
    });
    const json = await res.json();
    if (!json?.ok) return { ok: false, message: json?.description ?? 'No se pudo configurar el webhook.' };
    return { ok: true };
  } catch {
    return { ok: false, message: 'No se pudo configurar el webhook en Telegram.' };
  }
}

export async function createTelegramInstance(params: {
  instanceName: string;
  userId: string;
  botToken: string;
}): Promise<{ success: boolean; message: string }> {
  const { instanceName, userId, botToken } = params;
  if (!instanceName || !userId || !botToken) {
    return { success: false, message: 'Nombre y Bot Token son requeridos.' };
  }

  // 1. Validar el token con Telegram
  const me = await telegramGetMe(botToken.trim());
  if (!me.ok) {
    return { success: false, message: me.message ?? 'Bot Token inválido.' };
  }

  // 2. Secret token para validar los webhooks entrantes
  const secretToken = randomUUID().replace(/-/g, '');

  try {
    await db.instancia.create({
      data: {
        instanceName,
        instanceType: 'telegram',
        userId,
        instanceId: `telegram-${me.username ?? instanceName}`,
        metaAccessToken: botToken.trim(),
        metaVerifyToken: secretToken,
        metaChannel: 'telegram',
        metaPhoneNumberId: me.username ?? null,
      } as any,
    });
  } catch (error: any) {
    console.error('[createTelegramInstance]', error);
    return { success: false, message: error?.message ?? 'Error al crear la instancia de Telegram.' };
  }

  // 3. Configurar el webhook automáticamente
  const hook = await telegramSetWebhook(botToken.trim(), instanceName, secretToken);

  revalidatePath('/connection');

  if (!hook.ok) {
    return {
      success: true,
      message: `Bot @${me.username ?? ''} conectado, pero el webhook no se configuró: ${hook.message ?? ''}`,
    };
  }
  return { success: true, message: `Bot @${me.username ?? ''} conectado y webhook configurado.` };
}

export async function updateTelegramInstance(params: {
  instanceName: string;
  botToken: string;
}): Promise<{ success: boolean; message: string }> {
  const { instanceName, botToken } = params;
  if (!instanceName || !botToken) {
    return { success: false, message: 'Bot Token requerido.' };
  }

  const me = await telegramGetMe(botToken.trim());
  if (!me.ok) {
    return { success: false, message: me.message ?? 'Bot Token inválido.' };
  }

  const secretToken = randomUUID().replace(/-/g, '');

  try {
    await db.instancia.updateMany({
      where: { instanceName },
      data: {
        metaAccessToken: botToken.trim(),
        metaVerifyToken: secretToken,
        metaPhoneNumberId: me.username ?? null,
      } as any,
    });
  } catch (error: any) {
    console.error('[updateTelegramInstance]', error);
    return { success: false, message: 'Error al actualizar el token.' };
  }

  const hook = await telegramSetWebhook(botToken.trim(), instanceName, secretToken);
  revalidatePath('/connection');

  if (!hook.ok) {
    return { success: true, message: `Token actualizado, pero el webhook no se configuró: ${hook.message ?? ''}` };
  }
  return { success: true, message: `Token actualizado (@${me.username ?? ''}) y webhook reconfigurado.` };
}

export async function deleteTelegramInstance(
  instanceName: string,
): Promise<{ success: boolean; message: string }> {
  if (!instanceName) return { success: false, message: 'Nombre de instancia requerido.' };
  try {
    const inst = await db.instancia.findFirst({
      where: { instanceName, instanceType: 'telegram' },
      select: { metaAccessToken: true },
    });

    // Eliminar el webhook en Telegram (best-effort)
    if (inst?.metaAccessToken) {
      await fetch(`${TELEGRAM_API}/bot${inst.metaAccessToken}/deleteWebhook`, {
        method: 'POST',
        cache: 'no-store',
      }).catch(() => {});
    }

    await db.instancia.deleteMany({ where: { instanceName } });
    revalidatePath('/connection');
    return { success: true, message: 'Bot de Telegram desconectado.' };
  } catch (error: any) {
    console.error('[deleteTelegramInstance]', error);
    return { success: false, message: 'Error al desconectar el bot.' };
  }
}

export async function updateMetaInstance(params: {
  instanceName: string;
  phoneNumberId?: string;
  pageId?: string;
  accessToken?: string;
  wabaId?: string;
  verifyToken?: string;
  metaChannel?: string;
}): Promise<{ success: boolean; message: string }> {
  const { instanceName, phoneNumberId, pageId, accessToken, wabaId, verifyToken } = params;
  try {
    await db.instancia.updateMany({
      where: { instanceName },
      data: {
        ...(phoneNumberId !== undefined && { metaPhoneNumberId: phoneNumberId }),
        ...(pageId !== undefined && { metaPageId: pageId }),
        ...(accessToken && { metaAccessToken: accessToken }),
        ...(wabaId !== undefined && { metaWabaId: wabaId || null }),
        ...(verifyToken !== undefined && { metaVerifyToken: verifyToken || null }),
      } as any,
    });

    // Suscribe la app a la WABA (mensajes entrantes). Usa token/WABA del formulario
    // o, si no vinieron, los que ya están guardados en la instancia.
    const inst: any = await db.instancia.findFirst({
      where: { instanceName },
      select: { metaAccessToken: true, metaWabaId: true, metaChannel: true } as any,
    });
    const effToken = accessToken || inst?.metaAccessToken;
    const effWaba = (wabaId ?? undefined) || inst?.metaWabaId;
    let subscribed = false;
    if ((inst?.metaChannel ?? 'whatsapp') === 'whatsapp' && effToken && effWaba) {
      subscribed = await subscribeMetaAppToWaba(effWaba, effToken);
    }

    revalidatePath('/connection');
    return {
      success: true,
      message: subscribed ? 'Credenciales actualizadas y app suscrita a la WABA.' : 'Credenciales actualizadas.',
    };
  } catch (error: any) {
    console.error('[updateMetaInstance]', error);
    return { success: false, message: 'Error al actualizar.' };
  }
}

export async function enableMetaCalling(instanceName: string): Promise<{ success: boolean; message: string }> {
  try {
    const version = process.env.META_GRAPH_VERSION || process.env.NEXT_PUBLIC_META_GRAPH_VERSION || 'v25.0';
    const inst: any = await db.instancia.findFirst({
      where: { instanceName, instanceType: 'meta', metaChannel: 'whatsapp' } as any,
      select: { metaPhoneNumberId: true, metaAccessToken: true } as any,
    });

    if (!inst?.metaPhoneNumberId || !inst?.metaAccessToken) {
      return { success: false, message: 'Faltan credenciales de WhatsApp Cloud API.' };
    }

    const res = await fetch(
      `https://graph.facebook.com/${version}/${encodeURIComponent(inst.metaPhoneNumberId)}/settings`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${inst.metaAccessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          calling: {
            status: 'ENABLED',
            call_icon_visibility: 'DEFAULT',
            callback_permission_status: 'ENABLED',
          },
        }),
        cache: 'no-store',
      },
    );

    const json: any = await res.json().catch(() => ({}));
    if (!res.ok) {
      return {
        success: false,
        message: json?.error?.message || `Meta respondió ${res.status}.`,
      };
    }

    return { success: true, message: 'Llamadas activadas en WhatsApp Cloud API.' };
  } catch (error: any) {
    console.error('[enableMetaCalling]', error);
    return { success: false, message: error?.message || 'No se pudieron activar las llamadas.' };
  }
}

export async function getMetaDisplayPhone(instanceName: string): Promise<{ success: boolean; displayPhone?: string; message?: string }> {
  try {
    const version = process.env.META_GRAPH_VERSION || process.env.NEXT_PUBLIC_META_GRAPH_VERSION || 'v25.0';
    const inst: any = await db.instancia.findFirst({
      where: { instanceName, instanceType: 'meta', metaChannel: 'whatsapp' } as any,
      select: { metaPhoneNumberId: true, metaAccessToken: true } as any,
    });

    if (!inst?.metaPhoneNumberId || !inst?.metaAccessToken) {
      return { success: false, message: 'Faltan credenciales de WhatsApp Cloud API.' };
    }

    const res = await fetch(
      `https://graph.facebook.com/${version}/${encodeURIComponent(inst.metaPhoneNumberId)}?fields=display_phone_number`,
      {
        headers: { Authorization: `Bearer ${inst.metaAccessToken}` },
        cache: 'no-store',
      },
    );
    const json: any = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { success: false, message: json?.error?.message || `Meta respondió ${res.status}.` };
    }

    return { success: true, displayPhone: json?.display_phone_number };
  } catch (error: any) {
    console.error('[getMetaDisplayPhone]', error);
    return { success: false, message: error?.message || 'No se pudo consultar el número.' };
  }
}

export async function getMetaCallingStatus(instanceName: string): Promise<{ success: boolean; enabled?: boolean; message?: string }> {
  try {
    const version = process.env.META_GRAPH_VERSION || process.env.NEXT_PUBLIC_META_GRAPH_VERSION || 'v25.0';
    const inst: any = await db.instancia.findFirst({
      where: { instanceName, instanceType: 'meta', metaChannel: 'whatsapp' } as any,
      select: { metaPhoneNumberId: true, metaAccessToken: true } as any,
    });

    if (!inst?.metaPhoneNumberId || !inst?.metaAccessToken) {
      return { success: false, message: 'Faltan credenciales de WhatsApp Cloud API.' };
    }

    const res = await fetch(
      `https://graph.facebook.com/${version}/${encodeURIComponent(inst.metaPhoneNumberId)}/settings`,
      {
        headers: { Authorization: `Bearer ${inst.metaAccessToken}` },
        cache: 'no-store',
      },
    );
    const json: any = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { success: false, message: json?.error?.message || `Meta respondió ${res.status}.` };
    }

    const calling = Array.isArray(json?.data) ? json.data[0]?.calling : json?.calling;
    return { success: true, enabled: calling?.status === 'ENABLED' };
  } catch (error: any) {
    console.error('[getMetaCallingStatus]', error);
    return { success: false, message: error?.message || 'No se pudo consultar el estado de llamadas.' };
  }
}
