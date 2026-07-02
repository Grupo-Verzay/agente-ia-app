'use server'

import { db } from '@/lib/db';
import { revalidatePath } from 'next/cache';

/**
 * Embedded Signup de Meta (WhatsApp Cloud API / Coexistencia).
 *
 * El frontend abre el popup oficial de Meta (FB.login con config_id). Cuando el
 * usuario termina, Meta devuelve:
 *   - un `code` (por el callback de FB.login, response_type=code)
 *   - `phone_number_id` + `waba_id` (por el evento `message` WA_EMBEDDED_SIGNUP)
 *
 * Aquí, en el servidor (con el APP_SECRET que NUNCA debe ir al cliente),
 * cambiamos ese `code` por un token permanente de Business Integration y
 * guardamos las credenciales en la instancia del usuario (instanceType='meta').
 *
 * Con `featureType='whatsapp_business_app_onboarding'` en el frontend, el número
 * queda en COEXISTENCIA: el cliente sigue usando su app de WhatsApp normal y
 * nosotros podemos enviar notificaciones por Cloud API con el mismo número.
 */

const GRAPH_VERSION =
  process.env.META_GRAPH_VERSION ||
  process.env.NEXT_PUBLIC_META_GRAPH_VERSION ||
  'v21.0';

const GRAPH = `https://graph.facebook.com/${GRAPH_VERSION}`;

function metaAppId(): string | undefined {
  return process.env.META_APP_ID || process.env.NEXT_PUBLIC_META_APP_ID;
}

export interface MetaSignupResult {
  success: boolean;
  message: string;
  /** Número legible ya conectado (ej. +57 300 123 4567), si Meta lo devolvió. */
  displayPhone?: string;
}

interface ExchangeParams {
  /** `code` devuelto por FB.login (response_type=code). */
  code: string;
  userId: string;
  /** ID del número que Meta entregó en el evento WA_EMBEDDED_SIGNUP. */
  phoneNumberId: string;
  /** WABA (WhatsApp Business Account) ID del evento WA_EMBEDDED_SIGNUP. */
  wabaId: string;
  /** Nombre lógico de la instancia (derivado de la empresa). */
  instanceName: string;
}

/** Cambia el `code` del Embedded Signup por un access token permanente. */
async function exchangeCodeForToken(code: string): Promise<{ token?: string; error?: string }> {
  const appId = metaAppId();
  const secret = process.env.META_APP_SECRET;
  if (!appId || !secret) {
    return { error: 'Falta META_APP_ID / META_APP_SECRET en el servidor.' };
  }

  const url =
    `${GRAPH}/oauth/access_token` +
    `?client_id=${encodeURIComponent(appId)}` +
    `&client_secret=${encodeURIComponent(secret)}` +
    `&code=${encodeURIComponent(code)}`;

  try {
    const res = await fetch(url, { cache: 'no-store' });
    const json: any = await res.json();
    if (!res.ok || !json?.access_token) {
      const msg = json?.error?.message ?? `Meta devolvió ${res.status}`;
      return { error: `No se pudo obtener el token: ${msg}` };
    }
    return { token: json.access_token as string };
  } catch (e: any) {
    return { error: e?.message ?? 'Error de red al contactar a Meta.' };
  }
}

/** Suscribe NUESTRA app a la WABA para recibir sus webhooks (mensajes entrantes). */
async function subscribeAppToWaba(wabaId: string, token: string): Promise<void> {
  if (!wabaId) return;
  try {
    await fetch(`${GRAPH}/${encodeURIComponent(wabaId)}/subscribed_apps`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
  } catch {
    // best-effort: si falla, el usuario puede reintentar; no bloquea la conexión.
  }
}

/** Obtiene el número legible del phone_number_id (best-effort, solo para UI). */
async function fetchDisplayPhone(phoneNumberId: string, token: string): Promise<string | undefined> {
  try {
    const res = await fetch(
      `${GRAPH}/${encodeURIComponent(phoneNumberId)}?fields=display_phone_number,verified_name`,
      { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' },
    );
    const json: any = await res.json();
    return json?.display_phone_number || undefined;
  } catch {
    return undefined;
  }
}

/**
 * Descubre WABA + phone_number_id a partir del token, cuando el evento
 * WA_EMBEDDED_SIGNUP del cliente no los entregó (p. ej. el usuario autorizó
 * cuentas ya existentes en vez de registrar un número nuevo). Usa debug_token
 * para saber a qué WABAs quedó autorizado el token y toma el primer número.
 */
async function discoverFromToken(
  token: string,
): Promise<{ phoneNumberId?: string; wabaId?: string; displayPhone?: string }> {
  const appId = metaAppId();
  const secret = process.env.META_APP_SECRET;
  if (!appId || !secret) return {};
  try {
    // 1. debug_token → granular_scopes.target_ids = WABAs autorizadas.
    const dbg = await fetch(
      `${GRAPH}/debug_token?input_token=${encodeURIComponent(token)}` +
        `&access_token=${encodeURIComponent(`${appId}|${secret}`)}`,
      { cache: 'no-store' },
    );
    const dbgJson: any = await dbg.json();
    const scopes: any[] = dbgJson?.data?.granular_scopes ?? [];
    const waScope =
      scopes.find((s) => s?.scope === 'whatsapp_business_management') ??
      scopes.find((s) => s?.scope === 'whatsapp_business_messaging');
    const wabaIds: string[] = waScope?.target_ids ?? [];

    // 2. Por cada WABA, buscar su primer número registrado.
    for (const id of wabaIds) {
      const res = await fetch(
        `${GRAPH}/${encodeURIComponent(id)}/phone_numbers?fields=id,display_phone_number`,
        { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' },
      );
      const json: any = await res.json();
      const first = json?.data?.[0];
      if (first?.id) {
        return { phoneNumberId: first.id, wabaId: id, displayPhone: first.display_phone_number };
      }
    }
    // Hay WABA autorizada pero sin números registrados aún.
    if (wabaIds[0]) return { wabaId: wabaIds[0] };
  } catch {
    // best-effort: si falla, devolvemos vacío y el caller decide.
  }
  return {};
}

/**
 * Punto de entrada del Embedded Signup. Intercambia el code, suscribe la app a la
 * WABA y guarda (o actualiza) la instancia Meta del usuario.
 */
export async function exchangeMetaSignup(params: ExchangeParams): Promise<MetaSignupResult> {
  const { code, userId, instanceName } = params;
  let phoneNumberId = params.phoneNumberId;
  let wabaId = params.wabaId;

  if (!code) return { success: false, message: 'Meta no devolvió un código de autorización.' };
  if (!userId) return { success: false, message: 'Sesión inválida.' };

  // 1. code → token permanente
  const { token, error } = await exchangeCodeForToken(code);
  if (!token) return { success: false, message: error ?? 'No se pudo autenticar con Meta.' };

  // 1b. Si el cliente no entregó el número (evento WA_EMBEDDED_SIGNUP ausente),
  //     lo descubrimos con el token, que ya tiene acceso a las WABAs autorizadas.
  let displayPhone: string | undefined;
  if (!phoneNumberId) {
    const disc = await discoverFromToken(token);
    phoneNumberId = disc.phoneNumberId ?? '';
    wabaId = wabaId || disc.wabaId || '';
    displayPhone = disc.displayPhone;
  }
  if (!phoneNumberId) {
    return {
      success: false,
      message:
        'Conexión autorizada, pero la cuenta seleccionada no tiene un número de WhatsApp registrado. Agrega/registra un número en esa cuenta de WhatsApp Business y reintenta.',
    };
  }

  // 2. suscribir nuestra app a la WABA (webhooks entrantes) — no bloqueante
  await subscribeAppToWaba(wabaId, token);

  // 3. número legible para mostrar (si no lo trajo el descubrimiento)
  if (!displayPhone) displayPhone = await fetchDisplayPhone(phoneNumberId, token);

  // 4. upsert de la instancia Meta del usuario (por phoneNumberId)
  try {
    const existing = await db.instancia.findFirst({
      where: { userId, metaPhoneNumberId: phoneNumberId } as any,
      select: { id: true },
    });

    if (existing) {
      await db.instancia.update({
        where: { id: existing.id },
        data: {
          metaAccessToken: token,
          metaWabaId: wabaId || null,
          metaChannel: 'whatsapp',
          instanceType: 'meta',
        } as any,
      });
    } else {
      await db.instancia.create({
        data: {
          instanceName,
          instanceType: 'meta',
          userId,
          instanceId: `meta-${phoneNumberId}`,
          metaPhoneNumberId: phoneNumberId,
          metaAccessToken: token,
          metaWabaId: wabaId || null,
          metaChannel: 'whatsapp',
        } as any,
      });
    }
  } catch (e: any) {
    console.error('[exchangeMetaSignup] db', e);
    return { success: false, message: 'Conexión con Meta OK, pero falló al guardar. Reintenta.' };
  }

  revalidatePath('/connection');
  return {
    success: true,
    message: displayPhone
      ? `WhatsApp conectado por API oficial (${displayPhone}). ✅`
      : 'WhatsApp conectado por API oficial. ✅',
    displayPhone,
  };
}
