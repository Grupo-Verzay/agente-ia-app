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

export interface MetaSignupRuntimeConfig {
  appId: string;
  configId: string;
  graphVersion: string;
  featureType: string;
}

export async function getMetaSignupRuntimeConfig(): Promise<MetaSignupRuntimeConfig> {
  return {
    appId: metaAppId() ?? '',
    configId: process.env.META_CONFIG_ID || process.env.NEXT_PUBLIC_META_CONFIG_ID || '',
    graphVersion:
      process.env.META_GRAPH_VERSION ||
      process.env.NEXT_PUBLIC_META_GRAPH_VERSION ||
      'v25.0',
    featureType:
      process.env.META_FEATURE_TYPE ||
      process.env.NEXT_PUBLIC_META_FEATURE_TYPE ||
      'whatsapp_business_app_onboarding',
  };
}

/** Un número disponible dentro de las WABAs que el usuario autorizó. */
export interface MetaNumberOption {
  phoneNumberId: string;
  wabaId: string;
  displayPhone?: string;
  verifiedName?: string;
}

export interface MetaSignupResult {
  success: boolean;
  message: string;
  /** Número legible ya conectado (ej. +57 300 123 4567), si Meta lo devolvió. */
  displayPhone?: string;
  /** Todos los números disponibles (para que el usuario elija cuál usar). */
  numbers?: MetaNumberOption[];
  /** ID en BD de la instancia creada/actualizada (para cambiar de número luego). */
  instanceDbId?: string;
  /** phone_number_id que quedó conectado por defecto. */
  phoneNumberId?: string;
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
  /** URL de la página donde se abrió FB.login (para el redirect_uri del token). */
  redirectUri?: string;
  /**
   * URL del "xd_arbiter" que el SDK de JS usa realmente como redirect_uri (leída
   * del iframe del SDK, sin el fragmento #). Es el candidato principal.
   */
  channelRedirectUri?: string;
}

/**
 * Cambia el `code` del Embedded Signup por un access token permanente.
 * Meta exige que el `redirect_uri` del intercambio sea IDÉNTICO al que usó el
 * SDK en el diálogo de OAuth. Como el SDK de JS lo maneja internamente (puede ser
 * la URL de la página, la raíz del dominio o vacío), probamos varios candidatos
 * en orden: un mismatch devuelve error SIN consumir el código, así que es seguro.
 */
async function exchangeCodeForToken(
  code: string,
  redirectCandidates: string[],
): Promise<{ token?: string; error?: string }> {
  const appId = metaAppId();
  const secret = process.env.META_APP_SECRET;
  if (!appId || !secret) {
    return { error: 'Falta META_APP_ID / META_APP_SECRET en el servidor.' };
  }

  // De-duplicar conservando el orden.
  const candidates = Array.from(new Set(redirectCandidates));
  let lastMsg = 'Meta rechazó el código.';

  for (const redirectUri of candidates) {
    const url =
      `${GRAPH}/oauth/access_token` +
      `?client_id=${encodeURIComponent(appId)}` +
      `&client_secret=${encodeURIComponent(secret)}` +
      (redirectUri ? `&redirect_uri=${encodeURIComponent(redirectUri)}` : '') +
      `&code=${encodeURIComponent(code)}`;
    try {
      const res = await fetch(url, { cache: 'no-store' });
      const json: any = await res.json();
      if (res.ok && json?.access_token) {
        return { token: json.access_token as string };
      }
      lastMsg = json?.error?.message ?? `Meta devolvió ${res.status}`;
      console.error(
        '[exchangeCodeForToken] fallo con redirect_uri=',
        JSON.stringify(redirectUri),
        '→',
        lastMsg,
      );
      // Seguir probando si el error es de redirect_uri o de dominio ("Can't load
      // URL"). Otros errores (código usado/expirado) sí cortan el bucle.
      if (!/redirect_uri|can't load url|app's domains|domain of this url/i.test(lastMsg)) {
        break;
      }
    } catch (e: any) {
      lastMsg = e?.message ?? 'Error de red al contactar a Meta.';
      break;
    }
  }
  return { error: `No se pudo obtener el token: ${lastMsg}` };
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
 * Descubre TODOS los números disponibles a partir del token. Usa debug_token
 * para saber a qué WABAs quedó autorizado y lista los números de cada una.
 * Sirve para que el usuario elija cuál conectar (puede tener varios).
 */
async function discoverNumbers(token: string): Promise<MetaNumberOption[]> {
  const appId = metaAppId();
  const secret = process.env.META_APP_SECRET;
  if (!appId || !secret) return [];
  const out: MetaNumberOption[] = [];
  try {
    // 1. debug_token → granular_scopes.target_ids = WABAs autorizadas.
    const dbg = await fetch(
      `${GRAPH}/debug_token?input_token=${encodeURIComponent(token)}` +
        `&access_token=${encodeURIComponent(`${appId}|${secret}`)}`,
      { cache: 'no-store' },
    );
    const dbgJson: any = await dbg.json();
    const scopes: any[] = dbgJson?.data?.granular_scopes ?? [];
    const wabaIds = new Set<string>();
    for (const s of scopes) {
      if (
        (s?.scope === 'whatsapp_business_management' ||
          s?.scope === 'whatsapp_business_messaging') &&
        Array.isArray(s?.target_ids)
      ) {
        for (const id of s.target_ids) wabaIds.add(id);
      }
    }

    // 2. Por cada WABA, listar sus números.
    for (const id of wabaIds) {
      const res = await fetch(
        `${GRAPH}/${encodeURIComponent(id)}/phone_numbers?fields=id,display_phone_number,verified_name`,
        { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' },
      );
      const json: any = await res.json();
      for (const p of json?.data ?? []) {
        if (p?.id) {
          out.push({
            phoneNumberId: p.id,
            wabaId: id,
            displayPhone: p.display_phone_number,
            verifiedName: p.verified_name,
          });
        }
      }
    }
  } catch {
    // best-effort: si falla, devolvemos lo que haya.
  }
  return out;
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

  // 1. code → token permanente. En el flujo actual abrimos el OAuth manualmente
  //    con redirect_uri explícito, así que ese redirect debe probarse primero.
  //    Dejamos los redirects históricos del SDK como respaldo para conexiones
  //    iniciadas con builds anteriores.
  const redirectCandidates: string[] = [];
  if (params.redirectUri) {
    redirectCandidates.push(params.redirectUri);
    try {
      redirectCandidates.push(new URL(params.redirectUri).origin + '/');
    } catch {
      // redirectUri malformado; ignorar.
    }
  }
  if (params.channelRedirectUri) redirectCandidates.push(params.channelRedirectUri);
  redirectCandidates.push('https://staticxx.facebook.com/x/connect/xd_arbiter/?version=46');
  redirectCandidates.push('https://staticxx.facebook.com/x/connect/xd_arbiter/');
  redirectCandidates.push('');
  const { token, error } = await exchangeCodeForToken(code, redirectCandidates);
  if (!token) return { success: false, message: error ?? 'No se pudo autenticar con Meta.' };

  // 1b. Descubrimos TODOS los números disponibles (el usuario elegirá cuál usar).
  const numbers = await discoverNumbers(token);

  // Número que quedará conectado por defecto: el que trajo el evento del cliente,
  // o el primero descubierto. Si no hay ninguno, no se puede continuar.
  let chosen: MetaNumberOption | undefined;
  if (phoneNumberId) {
    chosen =
      numbers.find((n) => n.phoneNumberId === phoneNumberId) ??
      ({ phoneNumberId, wabaId } as MetaNumberOption);
  } else {
    chosen = numbers[0];
  }
  if (!chosen?.phoneNumberId) {
    return {
      success: false,
      message:
        'Conexión autorizada, pero ninguna de las cuentas seleccionadas tiene un número de WhatsApp registrado. Agrega/registra un número y reintenta.',
    };
  }
  phoneNumberId = chosen.phoneNumberId;
  wabaId = wabaId || chosen.wabaId || '';

  // 2. suscribir nuestra app a la WABA (webhooks entrantes) — no bloqueante
  await subscribeAppToWaba(wabaId, token);

  // 3. número legible para mostrar
  const displayPhone = chosen.displayPhone ?? (await fetchDisplayPhone(phoneNumberId, token));

  // 4. upsert de la instancia Meta del usuario (por phoneNumberId)
  let instanceDbId: string;
  try {
    const existing = await db.instancia.findFirst({
      where: { userId, metaPhoneNumberId: phoneNumberId } as any,
      select: { id: true },
    });

    if (existing) {
      const updated = await db.instancia.update({
        where: { id: existing.id },
        data: {
          metaAccessToken: token,
          metaWabaId: wabaId || null,
          metaChannel: 'whatsapp',
          instanceType: 'meta',
        } as any,
        select: { id: true },
      });
      instanceDbId = updated.id;
    } else {
      const created = await db.instancia.create({
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
        select: { id: true },
      });
      instanceDbId = created.id;
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
    numbers,
    instanceDbId,
    phoneNumberId,
  };
}

/**
 * Cambia el número conectado de una instancia Meta ya creada (reutiliza el token
 * guardado). Se usa cuando el usuario elige, en el selector, un número distinto
 * al que quedó por defecto.
 */
export async function selectMetaNumber(params: {
  instanceDbId: string;
  phoneNumberId: string;
  wabaId: string;
}): Promise<MetaSignupResult> {
  const { instanceDbId, phoneNumberId, wabaId } = params;
  if (!instanceDbId || !phoneNumberId) {
    return { success: false, message: 'Faltan datos para seleccionar el número.' };
  }

  const inst: any = await db.instancia.findUnique({
    where: { id: instanceDbId },
    select: { metaAccessToken: true } as any,
  });
  const token: string | undefined = inst?.metaAccessToken;
  if (!token) {
    return {
      success: false,
      message: 'No se encontró la conexión. Vuelve a "Conectar con Facebook".',
    };
  }

  await subscribeAppToWaba(wabaId, token);
  const displayPhone = await fetchDisplayPhone(phoneNumberId, token);

  try {
    await db.instancia.update({
      where: { id: instanceDbId },
      data: {
        metaPhoneNumberId: phoneNumberId,
        metaWabaId: wabaId || null,
        instanceId: `meta-${phoneNumberId}`,
      } as any,
    });
  } catch (e: any) {
    console.error('[selectMetaNumber] db', e);
    return { success: false, message: 'No se pudo cambiar el número. Reintenta.' };
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
