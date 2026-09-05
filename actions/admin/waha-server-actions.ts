'use server';

import { db } from '@/lib/db';
import { currentUser } from '@/lib/auth';
import { isAdminLike } from '@/lib/rbac';
import { revalidatePath } from 'next/cache';

/**
 * Servidor de WAHA ("WhatsApp V2"), uno para toda la plataforma.
 *
 * Vive en la BD y se edita en Panel > Conexion, igual que los servidores de
 * Evolution. NO en variables de entorno del stack: cambiar una credencial no
 * puede costar un redespliegue (~100 s de 502, ver el pendiente 1 del CLAUDE.md).
 */

export interface WahaServerData {
  url: string | null;
  /** Solo si hay clave guardada. La clave NUNCA se devuelve al navegador. */
  tieneApiKey: boolean;
}

const SIN_CONFIGURAR: WahaServerData = { url: null, tieneApiKey: false };

export async function obtenerServidorWaha(): Promise<WahaServerData> {
  const user = await currentUser();
  if (!user || !isAdminLike(user.role)) return SIN_CONFIGURAR;

  try {
    const config = await db.siteConfig.findFirst({
      select: { wahaUrl: true, wahaApiKey: true },
    });
    return {
      url: config?.wahaUrl ?? null,
      tieneApiKey: Boolean(config?.wahaApiKey?.trim()),
    };
  } catch (error) {
    console.error('[obtenerServidorWaha]', error);
    return SIN_CONFIGURAR;
  }
}

export async function guardarServidorWaha(params: {
  url: string;
  /** Vacio = dejar la clave que ya estaba. Es lo que permite editar solo la URL. */
  apiKey: string;
}): Promise<{ success: boolean; message: string }> {
  const user = await currentUser();
  if (!user || !isAdminLike(user.role)) {
    return { success: false, message: 'No tienes permiso para cambiar esto.' };
  }

  const url = params.url.trim().replace(/\/+$/, '');
  const apiKey = params.apiKey.trim();

  if (!url) {
    return { success: false, message: 'La URL del servidor es obligatoria.' };
  }
  if (!/^https?:\/\//i.test(url)) {
    return { success: false, message: 'La URL tiene que empezar por http:// o https://' };
  }

  try {
    const actual = await db.siteConfig.findFirst({ select: { id: true, wahaApiKey: true } });

    // Guardar sin clave solo vale si YA habia una: si no, quedaria a medias y la
    // tarjeta de WhatsApp V2 no se ofreceria, sin que nadie sepa por que.
    if (!apiKey && !actual?.wahaApiKey?.trim()) {
      return { success: false, message: 'Falta la API key del servidor.' };
    }

    const datos = apiKey ? { wahaUrl: url, wahaApiKey: apiKey } : { wahaUrl: url };

    if (actual) {
      await db.siteConfig.update({ where: { id: actual.id }, data: datos });
    } else {
      await db.siteConfig.create({ data: { id: 1, ...datos } as any });
    }
  } catch (error: any) {
    console.error('[guardarServidorWaha]', error);
    return { success: false, message: error?.message ?? 'No se pudo guardar el servidor.' };
  }

  revalidatePath('/panel/conexion');
  revalidatePath('/connection');
  return { success: true, message: 'Servidor de WhatsApp V2 guardado.' };
}

export async function borrarServidorWaha(): Promise<{ success: boolean; message: string }> {
  const user = await currentUser();
  if (!user || !isAdminLike(user.role)) {
    return { success: false, message: 'No tienes permiso para cambiar esto.' };
  }

  try {
    const actual = await db.siteConfig.findFirst({ select: { id: true } });
    if (actual) {
      await db.siteConfig.update({
        where: { id: actual.id },
        data: { wahaUrl: null, wahaApiKey: null },
      });
    }
  } catch (error: any) {
    console.error('[borrarServidorWaha]', error);
    return { success: false, message: 'No se pudo borrar el servidor.' };
  }

  revalidatePath('/panel/conexion');
  revalidatePath('/connection');
  return {
    success: true,
    message: 'Servidor borrado. La conexión de WhatsApp V2 deja de ofrecerse.',
  };
}

/** Comprueba que el servidor contesta, antes de guardarlo a ciegas. */
export async function probarServidorWaha(params: {
  url: string;
  apiKey: string;
}): Promise<{ success: boolean; message: string }> {
  const user = await currentUser();
  if (!user || !isAdminLike(user.role)) {
    return { success: false, message: 'No tienes permiso para esto.' };
  }

  const url = params.url.trim().replace(/\/+$/, '');
  let apiKey = params.apiKey.trim();

  if (!url) return { success: false, message: 'Escribe la URL del servidor.' };

  // Sin clave escrita se prueba con la guardada: es el caso de "solo cambio la URL".
  if (!apiKey) {
    const config = await db.siteConfig.findFirst({ select: { wahaApiKey: true } });
    apiKey = config?.wahaApiKey?.trim() ?? '';
    if (!apiKey) return { success: false, message: 'Escribe la API key del servidor.' };
  }

  try {
    const res = await fetch(`${url}/api/server/version`, {
      headers: { 'X-Api-Key': apiKey },
      cache: 'no-store',
    });

    if (res.status === 401 || res.status === 403) {
      return { success: false, message: 'El servidor responde, pero la API key no vale.' };
    }
    if (!res.ok) {
      return { success: false, message: `El servidor respondió ${res.status}.` };
    }

    const info = await res.json();
    const version = info?.version ?? '¿?';
    const engine = info?.engine ?? '¿?';
    return { success: true, message: `Conectado. WAHA ${version}, motor ${engine}.` };
  } catch {
    return { success: false, message: 'No se pudo contactar con el servidor.' };
  }
}
