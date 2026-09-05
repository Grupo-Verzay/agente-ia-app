import { db } from '@/lib/db';

/**
 * Cliente de WAHA (WhatsApp HTTP API) — SOLO servidor.
 *
 * No importar desde un componente de cliente. Se usa unicamente desde los
 * route handlers de /app/api/waha/* y desde acciones 'use server'.
 *
 * La API key no puede salir al navegador nunca: todo lo que necesite la tarjeta
 * de "WhatsApp V2" pasa por las rutas de /app/api/waha/*, que llaman aqui y
 * devuelven solo lo justo.
 */

export interface WahaConfig {
  baseUrl: string;
  apiKey: string;
}

/** Estados que devuelve WAHA en `SessionDTO.status`. */
export type WahaSessionStatus =
  | 'STOPPED'
  | 'STARTING'
  | 'SCAN_QR_CODE'
  | 'PASSKEY_REQUIRED'
  | 'PASSKEY_CONFIRMATION_REQUIRED'
  | 'WORKING'
  | 'FAILED';

export interface WahaSession {
  name: string;
  status: WahaSessionStatus;
  /** `null` mientras la sesion no esta conectada. */
  me?: { id?: string | null; pushName?: string | null } | null;
  config?: unknown;
}

/**
 * El servidor de WAHA sale de la BD (Panel > Conexion), NO del entorno. Es el
 * mismo trato que Evolution, cuya url y key viven en la tabla `ApiKey` desde
 * siempre: cambiar una credencial no puede costar un redespliegue.
 *
 * Devuelve `null` si no esta configurado. Sin configurar, la App tiene que
 * seguir funcionando igual que hoy, solo sin la tarjeta de WhatsApp V2.
 */
export async function getWahaConfig(): Promise<WahaConfig | null> {
  try {
    const config = await db.siteConfig.findFirst({
      select: { wahaUrl: true, wahaApiKey: true },
    });
    const baseUrl = config?.wahaUrl?.trim().replace(/\/+$/, '');
    const apiKey = config?.wahaApiKey?.trim();
    if (!baseUrl || !apiKey) return null;
    return { baseUrl, apiKey };
  } catch (error) {
    // Un fallo de BD aqui no puede ser mudo: desde fuera se veria como una
    // tarjeta que "no hace nada", que es mucho peor de diagnosticar.
    console.error('[waha] no se pudo leer la configuracion del servidor', error);
    return null;
  }
}

export async function isWahaConfigured(): Promise<boolean> {
  return (await getWahaConfig()) !== null;
}

async function wahaFetch(
  cfg: WahaConfig,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  return fetch(`${cfg.baseUrl}${path}`, {
    ...init,
    headers: {
      'X-Api-Key': cfg.apiKey,
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init.headers ?? {}),
    },
    cache: 'no-store',
  });
}

/**
 * Crea la sesion y la arranca. El webhook se deja configurado aqui mismo,
 * apuntando a nuestro backend y llevando `secret` en la cabecera `X-Api-Key`:
 * el normalizador del backend lo compara contra `metaVerifyToken` de la
 * instancia, asi que ese mismo valor es el que se guarda en la base.
 */
export async function createWahaSession(params: {
  session: string;
  webhookUrl: string;
  secret: string;
}): Promise<{ ok: boolean; message?: string }> {
  const cfg = await getWahaConfig();
  if (!cfg) return { ok: false, message: 'El servidor de WhatsApp V2 no esta configurado (Panel > Conexion).' };

  try {
    const res = await wahaFetch(cfg, '/api/sessions', {
      method: 'POST',
      body: JSON.stringify({
        name: params.session,
        start: true,
        config: {
          webhooks: [
            {
              url: params.webhookUrl,
              events: ['message'],
              customHeaders: [{ name: 'X-Api-Key', value: params.secret }],
            },
          ],
        },
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      return { ok: false, message: `WAHA respondio ${res.status}: ${body.slice(0, 300)}` };
    }
    return { ok: true };
  } catch {
    return { ok: false, message: 'No se pudo contactar con WAHA.' };
  }
}

export async function getWahaSession(session: string): Promise<WahaSession | null> {
  const cfg = await getWahaConfig();
  if (!cfg) return null;
  try {
    const res = await wahaFetch(cfg, `/api/sessions/${encodeURIComponent(session)}`);
    if (!res.ok) return null;
    return (await res.json()) as WahaSession;
  } catch {
    return null;
  }
}

/** `start` | `stop` | `logout` | `restart` — los cuatro son POST sin cuerpo. */
export async function wahaSessionAction(
  session: string,
  action: 'start' | 'stop' | 'logout' | 'restart',
): Promise<{ ok: boolean; message?: string }> {
  const cfg = await getWahaConfig();
  if (!cfg) return { ok: false, message: 'El servidor de WhatsApp V2 no esta configurado (Panel > Conexion).' };
  try {
    const res = await wahaFetch(cfg, `/api/sessions/${encodeURIComponent(session)}/${action}`, {
      method: 'POST',
    });
    if (!res.ok) {
      const body = await res.text();
      return { ok: false, message: `WAHA respondio ${res.status}: ${body.slice(0, 300)}` };
    }
    return { ok: true };
  } catch {
    return { ok: false, message: 'No se pudo contactar con WAHA.' };
  }
}

export async function deleteWahaSession(session: string): Promise<{ ok: boolean; message?: string }> {
  const cfg = await getWahaConfig();
  if (!cfg) return { ok: false, message: 'El servidor de WhatsApp V2 no esta configurado (Panel > Conexion).' };
  try {
    const res = await wahaFetch(cfg, `/api/sessions/${encodeURIComponent(session)}`, {
      method: 'DELETE',
    });
    // Una sesion que ya no existe no es un fallo: el objetivo es que no este.
    if (!res.ok && res.status !== 404) {
      const body = await res.text();
      return { ok: false, message: `WAHA respondio ${res.status}: ${body.slice(0, 300)}` };
    }
    return { ok: true };
  } catch {
    return { ok: false, message: 'No se pudo contactar con WAHA.' };
  }
}

/** El QR como PNG, tal cual lo devuelve WAHA. `null` si aun no hay. */
export async function getWahaQrPng(session: string): Promise<ArrayBuffer | null> {
  const cfg = await getWahaConfig();
  if (!cfg) return null;
  try {
    const res = await wahaFetch(cfg, `/api/${encodeURIComponent(session)}/auth/qr?format=image`, {
      headers: { Accept: 'image/png' },
    });
    if (!res.ok) return null;
    return await res.arrayBuffer();
  } catch {
    return null;
  }
}

/** El numero que sale de `me.id` viene como `573001234567@c.us` o con `:sufijo`. */
export function wahaMePhone(me?: WahaSession['me']): string | null {
  const id = me?.id;
  if (!id) return null;
  const digits = id.split('@')[0]?.split(':')[0] ?? '';
  return digits || null;
}
