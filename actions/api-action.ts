"use server"

import { db } from "@/lib/db";
import { ApiKey } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { randomUUID } from "crypto";
import { sendQrDisconnectedNotification } from "@/lib/aviso-de-desconexion.server";
import { crearSesionDeWaha, sePuedeCrearEnWaha } from "@/lib/crear-linea-waha";
import {
  borrarLaSesionDeLaLinea,
  cerrarLaSesionDeLaLinea,
  proveedorDeLaFila,
} from "@/lib/sesion-de-la-linea";
import { getWahaQrPng, getWahaSession } from "@/lib/waha";
import { ClientResponse, DISCONNECT_COOLDOWN_MS, EVO_FETCH_TIMEOUT_MS, GenerateQrInterface, getDayKeyBogota, getEvoCache, isApiConnected, isWhatsappLike, QRCodeResponse } from "@/types/evo-api";
import { assertUserCanUseApp } from "./billing/helpers/app-access-guard";
import { cleanInstanceDisplayName } from "@/lib/instance-display-name";
import { motivoDeNoPoderCrearLaLinea } from '@/lib/motivo-de-evolution';
import { assertApiKeyHasCapacity } from "./admin/evolution-capacity";

// Vincular Mensajería WhatsApp por NÚMERO de teléfono (código): Evolution devuelve
// un pairingCode al pasar ?number=. Alternativa al QR (evita el flujo QR+passkey).
export async function generateWhatsappPairingCode({
  instanceName,
  userId,
  phone,
}: {
  instanceName: string;
  userId: string;
  phone: string;
}): Promise<{ success: boolean; pairingCode?: string; message?: string }> {
  try {
    await assertUserCanUseApp(userId);
  } catch (error: any) {
    return { success: false, message: error?.message ?? 'No autorizado.' };
  }
  const digits = (phone || '').replace(/\D/g, '');
  if (digits.length < 8) return { success: false, message: 'Número inválido (incluye el código de país).' };

  // El codigo por numero es de Evolution. Esto no lo miraba, asi que con una
  // linea de WhatsApp Mensajeria salia «El usuario no tiene una ApiKey de
  // Evolution asignada» -que es cierto y no explica nada- o un error HTTP del
  // servidor equivocado. Se dice lo que si funciona.
  const fila = await db.instancia.findFirst({
    where: { userId, instanceName },
    select: { instanceType: true },
  });
  if (proveedorDeLaFila(fila?.instanceType) !== 'evolution') {
    return {
      success: false,
      message: 'Esta línea se vincula escaneando el código QR, no con un código por número.',
    };
  }

  const user = await db.user.findUnique({ where: { id: userId }, include: { apiKey: true } });
  if (!user?.apiKey) return { success: false, message: 'El usuario no tiene una ApiKey de Evolution asignada.' };
  const { key: apiKey, url: serverUrl } = user.apiKey;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), EVO_FETCH_TIMEOUT_MS);
    const response = await fetch(
      `https://${serverUrl}/instance/connect/${instanceName}?number=${encodeURIComponent(digits)}`,
      { method: 'GET', headers: { apikey: apiKey }, signal: controller.signal },
    ).finally(() => clearTimeout(timeout));
    if (!response.ok) return { success: false, message: `Error de Evolution (HTTP ${response.status}).` };
    const data = await response.json();
    const pairingCode = data?.pairingCode as string | undefined;
    if (!pairingCode) {
      return { success: false, message: 'Evolution no devolvió código (¿la instancia ya está conectada o el número es inválido?).' };
    }
    return { success: true, pairingCode };
  } catch (error: any) {
    return {
      success: false,
      message: error?.name === 'AbortError' ? 'Timeout al conectar con Evolution.' : (error?.message || 'Error generando el código.'),
    };
  }
}

/**
 * El QR de una linea de WhatsApp Mensajeria, con la MISMA forma de respuesta
 * que el de Evolution: `qr.code` es una `data:` url que el `<img>` pinta tal
 * cual. Waha entrega un PNG en crudo, asi que se codifica aqui.
 *
 * Waha SOLO da el QR en estado `SCAN_QR_CODE`, y de ahi salen los tres casos
 * que hay que distinguir -y que un booleano perderia-: ya esta conectada, hay
 * que reiniciar la sesion, o el servidor no contesta. Son tres arreglos
 * distintos.
 */
async function generarQrDeWaha(instanceName: string): Promise<QRCodeResponse> {
  const conectada = {
    isConnected: true,
    status: 'connected' as const,
    justNotified: false,
    cooldownMs: DISCONNECT_COOLDOWN_MS,
  };

  const sesion = await getWahaSession(instanceName);
  if (sesion?.status === 'WORKING') {
    return { success: true, connectionState: { instance: { state: 'open' } }, evo: conectada };
  }

  const qr = await getWahaQrPng(instanceName);

  if (qr.estado === 'ok') {
    const base64 = Buffer.from(qr.png).toString('base64');
    return { success: true, qr: { code: `data:image/png;base64,${base64}` }, evo: conectada };
  }

  if (qr.estado === 'todavia-no') {
    return { success: false, message: qr.motivo, evo: conectada };
  }

  return {
    success: false,
    message: qr.motivo,
    evo: {
      isConnected: false,
      status: 'disconnected',
      justNotified: false,
      cooldownMs: DISCONNECT_COOLDOWN_MS,
    },
  };
}

export async function generateQRCode({ instanceName, userId }: GenerateQrInterface): Promise<QRCodeResponse> {
  try {
    await assertUserCanUseApp(userId);
  } catch (error: any) {
    return { success: false, message: error?.message ?? "No autorizado." };
  }

  // Buscar el usuario y su ApiKey asignada (lo necesitas para el key del cache y para notificar)
  const user = await db.user.findUnique({
    where: { id: userId },
    include: { apiKey: true },
  });

  if (!user) {
    return { success: false, message: "El userId no existe." };
  }

  // Detectar tipo de instancia (si existe en BD)
  const inst = await db.instancia.findFirst({
    where: { userId, instanceName },
    select: { instanceType: true },
  });
  const instanceType = inst?.instanceType ?? null;
  const proveedor = proveedorDeLaFila(instanceType);

  if (proveedor === 'otro') {
    return { success: false, message: 'Este canal no se conecta con un código QR.' };
  }

  // Una linea de WhatsApp Mensajeria tambien se abre con un QR, solo que lo da
  // otro servidor. Antes esto se rendia con «No se pudo generar el código QR.»
  // -un mensaje que no dice nada- porque preguntaba `isWhatsappLike`, que da
  // false para `waha`. Y la comprobacion de la ApiKey de Evolution iba ANTES,
  // asi que una cuenta sin clave de Evolution -lo normal en una cuenta que solo
  // tiene Waha- ni siquiera llegaba hasta aqui.
  if (proveedor === 'waha') {
    return generarQrDeWaha(instanceName);
  }

  if (!user.apiKey) {
    return { success: false, message: "El usuario no tiene una ApiKey asignada." };
  }

  const { key: apiKey, url: serverUrl } = user.apiKey;

  // cache por user+instance (puedes cambiar a user+serverUrl si prefieres)
  const cache = getEvoCache();
  const cacheKey = `${userId}::${instanceName}`;
  const now = Date.now();
  const todayKey = getDayKeyBogota(now);

  const entry =
    cache.get(cacheKey) ??
    {
      lastIsConnected: null,
      lastNotifiedAt: 0,
      notifiedDayKey: todayKey,
      notifiedCountToday: 0,
    };

  if (entry.notifiedDayKey !== todayKey) {
    entry.notifiedDayKey = todayKey;
    entry.notifiedCountToday = 0;
  }

  let qr: { code: string; pairingCode?: string } | undefined;
  let connectionState: { instance: { state: string } } | undefined;

  // esto es el estado de CONEXIÓN a la API (Evolution alive / dead)
  let apiConnectedNow = false;

  // para devolver mensaje si algo falla
  let failMessage: string | null = null;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), EVO_FETCH_TIMEOUT_MS);

    const response = await fetch(`https://${serverUrl}/instance/connect/${instanceName}`, {
      method: 'GET',
      headers: { apikey: apiKey },
      signal: controller.signal,
    }).finally(() => clearTimeout(timeout));

    apiConnectedNow = isApiConnected(response.ok);

    if (!response.ok) {
      failMessage = `Error al conectar con la instancia. HTTP ${response.status}`;
    } else {
      const data = await response.json();

      if (data.base64) {
        qr = { code: data.base64, pairingCode: data.pairingCode };
      } else if (data.instance?.state === 'open') {
        connectionState = { instance: { state: 'open' } };
      } else {
        // API respondió OK pero no hay QR ni open (caso normal de “no listo”)
        // lo manejamos abajo con mensaje genérico
      }
    }
  } catch (error: any) {
    apiConnectedNow = false;
    failMessage =
      error?.name === 'AbortError'
        ? 'Timeout al conectar con Evolution.'
        : (error?.message || 'Error al generar el código QR.');
  }

  // regla anti-spam
  const transitionedToDisconnected = entry.lastIsConnected === true && apiConnectedNow === false;
  const cooldownOk = now - entry.lastNotifiedAt >= DISCONNECT_COOLDOWN_MS;

  const dailyOk = entry.notifiedCountToday < 2;


  let justNotified = false;

  if (
    dailyOk &&
    (
      (transitionedToDisconnected && cooldownOk) ||
      (entry.lastIsConnected === null && !apiConnectedNow && cooldownOk)
    )
  ) {
    const remoteJid = user.notificationNumber || undefined;

    if (remoteJid) {
      try {
        await sendQrDisconnectedNotification(remoteJid, userId);
      } catch {
        // best-effort
      }
    }

    entry.lastNotifiedAt = now;
    entry.notifiedCountToday += 1;
    justNotified = true;
  }

  entry.lastIsConnected = apiConnectedNow;
  cache.set(cacheKey, entry);

  //respuestas finales, conservando tu lógica original
  if (!apiConnectedNow) {
    return {
      success: false,
      message: failMessage || 'Error al conectar con Evolution.',
      evo: {
        isConnected: false,
        status: "disconnected",
        justNotified,
        cooldownMs: DISCONNECT_COOLDOWN_MS,
      },
    };
  }

  if (qr) {
    return {
      success: true,
      qr,
      evo: {
        isConnected: true,
        status: "connected",
        justNotified: false,
        cooldownMs: DISCONNECT_COOLDOWN_MS,
      },
    };
  }

  if (connectionState?.instance?.state === 'open') {
    return {
      success: true,
      connectionState,
      evo: {
        isConnected: true,
        status: "connected",
        justNotified: false,
        cooldownMs: DISCONNECT_COOLDOWN_MS,
      },
    };
  }

  return {
    success: false,
    message: 'No se pudo generar el código QR.',
    evo: {
      isConnected: true, // API está viva, pero no se pudo generar QR/open
      status: "connected",
      justNotified: false,
      cooldownMs: DISCONNECT_COOLDOWN_MS,
    },
  };
}

/* =========================
   API Keys CRUD (sin cambios de mensajes)
========================= */
export async function agregarApi(data: FormData): Promise<ClientResponse<ApiKey>> {
  const url = data.get('url') as string
  const key = data.get('key') as string

  if (!url || !key) {
    return { success: false, message: 'Todos los campos son obligatorios' }
  }

  try {
    const createdApiKey = await db.apiKey.create({ data: { url, key } })
    return { success: true, message: 'API Key agregada exitosamente', data: createdApiKey }
  } catch (error: any) {
    console.error(error)
    return { success: false, message: error.message || 'Error al agregar la API Key' }
  }
}

export async function editarApiKey(data: FormData): Promise<ClientResponse<ApiKey>> {
  const id = data.get('id') as string
  const url = data.get('url') as string
  const key = data.get('key') as string

  if (!url || !key || !id) {
    return { success: false, message: 'Todos los campos son obligatorios' }
  }

  try {
    await db.apiKey.update({ where: { id }, data: { url, key } });
    return { success: true, message: "API Key actualizada exitosamente." }
  } catch (error: any) {
    return { success: false, message: error.message || "Error al actualizar la API Key." }
  }
}

export async function eliminarApiKey(id: string) {
  if (!id) {
    return { success: false, message: 'No se encontró el id' }
  }

  try {
    await db.apiKey.delete({ where: { id } });
    revalidatePath('/agregar-api');
    return { success: true, message: "API Key eliminada exitosamente." }
  } catch (error: any) {
    return { success: false, message: error.message || "Error al eliminar la API Key." }
  }
}

export async function obtenerApiKeys() {
  try {
    const apiKeys = await db.apiKey.findMany();
    apiKeys.sort((a, b) => (a.url < b.url ? -1 : a.url > b.url ? 1 : 0));
    return { success: true, data: apiKeys };
  } catch (error: any) {
    return { success: false, message: error.message || "Error al obtener las API Keys." };
  }
}

export async function getApiKeyById(id: string) {
  try {
    if (!id) return { success: false, message: 'Missing id' };
    const apiKey = await db.apiKey.findUnique({ where: { id } });
    return { success: true, data: apiKey };
  } catch (error: any) {
    return { success: false, message: error.message || "Error al obtener las API Keys." };
  }
}

/* =========================
   Instancia
========================= */
export async function createInstance(data: FormData) {
  const instanceName = (data.get('instanceName') as string)?.trim();
  const instanceType = data.get('instanceType') as string;
  const userId = data.get('userId') as string;

  try {
    await assertUserCanUseApp(userId);

    // Validación de campos obligatorios
    if (!instanceName || !userId || !instanceType) {
      throw new Error('Todos los campos son obligatorios');
    }

    // Verificar si el usuario ya tiene una instancia activa
    const instanciaActiva = await checkActiveInstance(userId, instanceType);
    if (instanciaActiva) {
      return { success: false, message: "El usuario ya tiene una instancia activa.", instancia: instanciaActiva };
    }

    if (isWhatsappLike(instanceType)) {
      // Las lineas NUEVAS nacen en WhatsApp Mensajeria (Waha).
      //
      // Es el mismo canal y la misma tarjeta -«Mensajeria WhatsApp (QR)»-:
      // cambia por donde se conecta, que es un ajuste de la linea y no algo que
      // se enseñe. Si no hay servidor de Waha configurado se crea en Evolution,
      // como siempre, para no dejar sin linea a una instalacion que no lo use.
      if (await sePuedeCrearEnWaha()) {
        const enWaha = await crearSesionDeWaha(instanceName);
        if (!enWaha.ok) {
          console.warn('[linea] no se pudo crear en WhatsApp Mensajeria', { instanceName, motivo: enWaha.message });
          return { success: false, message: enWaha.message };
        }
        const nuevaEnWaha = await db.instancia.create({
          data: {
            instanceName,
            displayName: cleanInstanceDisplayName(instanceName),
            userId,
            ...enWaha.datos,
          } as any,
        });
        console.info('[linea] creada en WhatsApp Mensajeria', { instanceName, userId });
        revalidatePath('/agregar-api');
        return { success: true, message: "Instancia creada exitosamente.", instancia: nuevaEnWaha };
      }

      const user = await db.user.findUnique({
        where: { id: userId },
        include: { apiKey: true },
      });

      if (!user || !user.apiKey) {
        throw new Error("El usuario no tiene una ApiKey asignada.");
      }

      // Cupo del servidor. Se comprueba AQUÍ, justo antes de crear, porque este
      // es el punto donde se ocupa el sitio de verdad: cualquier aviso anterior
      // (el desplegable del formulario) puede haberse quedado viejo. Si el
      // servidor no responde no se bloquea; ver evolution-capacity.ts.
      const cupo = await assertApiKeyHasCapacity(user.apiKey.id);
      if (!cupo.ok) {
        return { success: false, message: cupo.message };
      }

      const { key: apiKey, url: serverUrl } = user.apiKey;

      const options = {
        method: 'POST',
        headers: {
          'apikey': apiKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          instanceName: instanceName,
          qrcode: true,
          integration: "WHATSAPP-BAILEYS"
        })
      };

      const response = await fetch(`https://${serverUrl}/instance/create`, options);
      const apiResult = await response.json();

      if (!response.ok) {
        // El motivo lo trae Evolution anidado (`response.message`), no en
        // `message`. Leyendo solo `message` el aviso se quedaba siempre en el
        // texto por defecto: un boton que falla y no dice por que.
        const motivo = motivoDeNoPoderCrearLaLinea(apiResult, 'Error al crear la instancia en la API.');
        console.warn('[linea] Evolution rechazo crear la instancia', {
          instanceName,
          estado: response.status,
          motivo,
        });
        throw new Error(motivo);
      }

      const instanceId = apiResult.hash;
      if (!instanceId) {
        throw new Error('No se recibió instanceId en la respuesta de la API.');
      }

      const nuevaInstancia = await db.instancia.create({
        data: { instanceName, displayName: cleanInstanceDisplayName(instanceName), instanceType, userId, instanceId } as any,
      });

      revalidatePath('/agregar-api');
      return { success: true, message: "Instancia creada exitosamente.", instancia: nuevaInstancia, apiResult };
    } else {
      const nuevaInstancia = await db.instancia.create({
        data: {
          instanceName,
          instanceType,
          userId,
          instanceId: `local-${randomUUID()}`,
        },
      });

      revalidatePath('/agregar-api');
      return { success: true, message: "Instancia creada exitosamente.", instancia: nuevaInstancia };
    }
  } catch (error: any) {
    return { success: false, message: error.message || "Error al crear la instancia." };
  }
}

export async function deleteInstance(userId: string, instanceType: string = 'Whatsapp') {
  try {
    await assertUserCanUseApp(userId);

    // Verificar si el usuario tiene una instancia activa
    const instanciaActiva = await checkActiveInstance(userId, instanceType);
    if (!instanciaActiva) {
      return { success: false, message: "El usuario no tiene ninguna instancia activa." };
    }

    const instanceName = instanciaActiva.instanceName;

    // 1 y 2. Cerrar y borrar la sesion, **en el proveedor de la FILA**.
    //
    // Antes se decidia con el tipo PEDIDO (`Whatsapp` por defecto), asi que una
    // linea de Waha se intentaba borrar en Evolution -que contesta «no existe»
    // sin fallar de forma visible- y su sesion se quedaba viva. Un fallo aqui no
    // impide limpiar el registro: la instancia puede estar rota y lo importante
    // es poder recrearla.
    const enElProveedor = await borrarLaSesionDeLaLinea({
      instanceName,
      instanceType: instanciaActiva.instanceType,
      userId,
    });
    if (!enElProveedor.ok) {
      console.warn('[linea] el proveedor no confirmo el borrado; se limpia el registro igual', {
        instanceName,
        instanceType: instanciaActiva.instanceType,
        motivo: enElProveedor.message,
      });
    }

    // 3. Eliminar la instancia de la base de datos, **por su id**. Buscarla otra
    // vez por el tipo pedido no encontraba las filas de Waha y esto contestaba
    // «No se encontró la instancia en la base de datos» con la fila delante.
    await db.instancia.delete({ where: { id: instanciaActiva.id } });

    return { success: true, message: "Instancia eliminada exitosamente." };
  } catch (error: any) {
    return { success: false, message: error?.message || "Error al eliminar la instancia." };
  }
}

/**
 * Cierra la sesion de WhatsApp de una linea, sin borrar nada.
 *
 * La llamada ya existia, pero SOLO dentro de `deleteInstance`: cerrar sesion y
 * borrar la instancia iban juntos, asi que la unica forma de desvincular un
 * telefono era cargarse la linea. Ahora las dos tarjetas lo ofrecen en el mismo
 * sitio -el boton verde-.
 *
 * El proveedor sale de la FILA. Escrita contra Evolution a secas, esto contestaba
 * «El usuario no tiene una ApiKey de Evolution asignada» a una cuenta cuya linea
 * es de Waha -que normalmente no tiene clave de Evolution ninguna-, o mandaba el
 * logout al servidor equivocado, que contesta «no existe» y deja el telefono
 * vinculado.
 *
 * A diferencia del borrado, aqui un fallo NO se traga: si el proveedor no acepta
 * el logout, el telefono sigue vinculado y hay que decirlo. Tragarselo dejaria
 * una tarjeta que dice "sesion cerrada" con la sesion abierta.
 */
export async function cerrarSesionDeLaLinea(userId: string, instanceType: string = 'Whatsapp') {
  try {
    await assertUserCanUseApp(userId);

    const instanciaActiva = await checkActiveInstance(userId, instanceType);
    if (!instanciaActiva) {
      return { success: false, message: "El usuario no tiene ninguna instancia activa." };
    }

    const res = await cerrarLaSesionDeLaLinea({
      instanceName: instanciaActiva.instanceName,
      instanceType: instanciaActiva.instanceType,
      userId,
    });

    return { success: res.ok, message: res.message };
  } catch (error: any) {
    return { success: false, message: error?.message || "Error al cerrar la sesión." };
  }
}

export async function forceRecreateInstance(userId: string, instanceType: string = 'Whatsapp') {
  try {
    await assertUserCanUseApp(userId);

    const instanciaActiva = await checkActiveInstance(userId, instanceType);
    if (!instanciaActiva) {
      return { success: false, message: "No se encontró una instancia activa para recrear." };
    }

    const instanceName = instanciaActiva.instanceName;
    const proveedor = proveedorDeLaFila(instanciaActiva.instanceType);

    if (proveedor === 'otro') {
      return { success: false, message: "Este canal no se recrea desde aquí." };
    }

    // 1. Cerrar y borrar la sesion en SU proveedor. Ignorar el fallo: la
    // instancia puede estar rota, que es justo para lo que existe este boton.
    await borrarLaSesionDeLaLinea({
      instanceName,
      instanceType: instanciaActiva.instanceType,
      userId,
    });

    // 2. Eliminar de BD, **por el id de la fila**.
    //
    // Antes era `deleteMany({ instanceName, instanceType })` con el tipo PEDIDO:
    // con una linea de Waha no borraba nada y luego creaba una fila de Evolution
    // con el mismo nombre. O sea DOS filas para un numero, que es exactamente lo
    // que la regla «una linea es una instancia» existe para evitar.
    await db.instancia.delete({ where: { id: instanciaActiva.id } });

    // 3. Crear la sesion nueva, tambien en SU proveedor.
    if (proveedor === 'waha') {
      const enWaha = await crearSesionDeWaha(instanceName);
      if (!enWaha.ok) {
        revalidatePath('/profile');
        return { success: true, message: "Instancia eliminada. Usa el formulario para crear una nueva y escanear el QR." };
      }
      await db.instancia.create({
        data: {
          instanceName,
          displayName: cleanInstanceDisplayName(instanceName),
          userId,
          ...enWaha.datos,
        } as any,
      });
      revalidatePath('/profile');
      return { success: true, message: "Instancia recreada exitosamente. Escanea el QR para reconectar WhatsApp." };
    }

    const user = await db.user.findUnique({
      where: { id: userId },
      include: { apiKey: true },
    });

    if (!user || !user.apiKey) {
      revalidatePath('/profile');
      return { success: true, message: "Instancia eliminada. Usa el formulario para crear una nueva y escanear el QR." };
    }

    const { key: apiKey, url: serverUrl } = user.apiKey;

    const createResponse = await fetch(`https://${serverUrl}/instance/create`, {
      method: 'POST',
      headers: { apikey: apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ instanceName, qrcode: true, integration: 'WHATSAPP-BAILEYS' }),
    }).catch(() => null);

    if (!createResponse?.ok) {
      // BD limpia pero Evolution falló — el usuario verá el formulario de creación manual
      revalidatePath('/profile');
      return { success: true, message: "Instancia eliminada. Usa el formulario para crear una nueva y escanear el QR." };
    }

    const apiResult = await createResponse.json().catch(() => ({}));
    const instanceId = apiResult?.hash;

    if (!instanceId) {
      revalidatePath('/profile');
      return { success: true, message: "Instancia eliminada. Usa el formulario para crear una nueva y escanear el QR." };
    }

    await db.instancia.create({
      data: {
        instanceName,
        displayName: cleanInstanceDisplayName(instanceName),
        instanceType: instanciaActiva.instanceType ?? 'Whatsapp',
        userId,
        instanceId,
      } as any,
    });

    revalidatePath('/profile');
    return { success: true, message: "Instancia recreada exitosamente. Escanea el QR para reconectar WhatsApp." };
  } catch (error: any) {
    return { success: false, message: error?.message || "Error al recrear la instancia." };
  }
}

export async function renameInstance(userId: string, instanceType: string, newName: string) {
  try {
    await assertUserCanUseApp(userId);

    const instanciaActiva = await checkActiveInstance(userId, instanceType);
    if (!instanciaActiva) {
      return { success: false, message: "El usuario no tiene ninguna instancia activa." };
    }

    const oldName = instanciaActiva.instanceName;
    const proveedor = proveedorDeLaFila(instanciaActiva.instanceType);

    // Waha NO sabe renombrar una sesion, y la sesion se llama igual que la
    // instancia. Cambiando solo la fila, el nombre nuevo deja de casar con la
    // sesion que existe: la linea se queda sin mensajes y sin un solo error.
    // Se dice, y se ofrece lo que si se puede hacer (cambiar el nombre visible).
    if (proveedor === 'waha') {
      return {
        success: false,
        message:
          "Una línea de WhatsApp Mensajería no se puede renombrar: la sesión se llama igual que la instancia. Cambia el nombre visible, o elimínala y créala con el nombre nuevo.",
      };
    }

    if (proveedor === 'evolution') {
      const user = await db.user.findUnique({
        where: { id: userId },
        include: { apiKey: true },
      });

      if (user?.apiKey) {
        const { key: apiKey, url: serverUrl } = user.apiKey;
        await fetch(`https://${serverUrl}/instance/rename/${oldName}`, {
          method: 'PUT',
          headers: { apikey: apiKey, 'Content-Type': 'application/json' },
          body: JSON.stringify({ instanceName: newName }),
        }).catch(() => {});
      }
    }

    await db.instancia.update({
      where: { id: instanciaActiva.id },
      data: { instanceName: newName },
    });

    revalidatePath('/connection');
    return { success: true, message: "Nombre actualizado correctamente." };
  } catch (error: any) {
    return { success: false, message: error?.message || "Error al renombrar la instancia." };
  }
}

/**
 * Borra la linea y su sesion. Version interna sin `assertUserCanUseApp` — para
 * uso exclusivo del sistema (el borrado de la cuenta a los 30 dias).
 *
 * **El proveedor sale de la FILA, no del parametro.** Antes no: esta funcion
 * recibe `instanceType = 'Whatsapp'` por defecto, encontraba la fila con
 * `checkActiveInstance` -que si busca en los dos tipos- y a partir de ahi
 * decidia con el tipo pedido. Con una linea de Waha eso hacia dos cosas malas
 * seguidas: mandaba el `logout` y el `delete` a Evolution, que contesta «no
 * existe» sin fallar de forma visible, y luego buscaba la fila **otra vez** con
 * `findFirst({ instanceName, instanceType })` — o sea por `Whatsapp` — no la
 * encontraba, y salia con `success: false` dejando la fila puesta.
 *
 * O sea: al eliminar una cuenta morosa a los 30 dias, la sesion de Waha se
 * quedaba viva y ocupada en su servidor **para siempre**, porque la cuenta ya
 * no existe y no queda nadie que sepa que esa sesion es suya.
 */
export async function deleteInstanceInternal(
  userId: string,
  instanceType: string = 'Whatsapp'
): Promise<{ success: boolean; message: string; instanceName: string | null }> {
  try {
    const instanciaActiva = await checkActiveInstance(userId, instanceType);
    if (!instanciaActiva) {
      return { success: false, message: "El usuario no tiene ninguna instancia activa.", instanceName: null };
    }

    const instanceName = instanciaActiva.instanceName;

    const enElProveedor = await borrarLaSesionDeLaLinea({
      instanceName,
      instanceType: instanciaActiva.instanceType,
      userId,
    });

    // Un fallo del proveedor no detiene la limpieza del registro —esto corre al
    // borrar la cuenta y no hay una vuelta siguiente que reintente— pero **no es
    // mudo**: una sesion que se queda viva sin fila es una sesion que nadie va a
    // volver a encontrar.
    if (!enElProveedor.ok) {
      console.warn('[linea] la sesion NO se pudo liberar; el registro se borra igual', {
        instanceName,
        instanceType: instanciaActiva.instanceType,
        motivo: enElProveedor.message,
      });
    }

    await db.instancia.delete({ where: { id: instanciaActiva.id } });
    return { success: true, message: "Instancia eliminada exitosamente.", instanceName };
  } catch (error: any) {
    return { success: false, message: error?.message || "Error al eliminar la instancia.", instanceName: null };
  }
}

/**
 * Borra la linea SOLO si su proveedor confirma el borrado (respuesta OK, 404 =
 * ya no existe, u otro 4xx no transitorio). Si el proveedor está caído o
 * inalcanzable (error de red o 5xx), CONSERVA el registro en BD para poder
 * reintentar después: el registro presente actúa como señal de "borrado
 * pendiente". Devuelve `retryable: true` cuando el fallo es transitorio.
 *
 * A diferencia de `deleteInstanceInternal`, que limpia el registro aunque el
 * proveedor no responda, esta variante es la que usa la cascada del reseller.
 *
 * **Y el proveedor sale de la FILA.** Antes preguntaba por el tipo pedido, y de
 * ahi salia el fallo que midio el banco del #791: una linea de Waha normalmente
 * **no tiene clave de Evolution**, asi que entraba por la rama
 * `if (!user || !user.apiKey)` —«sin ApiKey: registro eliminado»— y se llevaba
 * la fila por delante **sin tocar la sesion**, que seguia viva en el servidor de
 * Waha. La rama del `retryable` ni siquiera llegaba a ejercerse.
 */
export async function deleteInstanceEvolutionAware(
  userId: string,
  instanceType: string = 'Whatsapp'
): Promise<{ success: boolean; retryable: boolean; message: string; instanceName: string | null }> {
  try {
    const instanciaActiva = await checkActiveInstance(userId, instanceType);
    if (!instanciaActiva) {
      return { success: true, retryable: false, message: "Sin instancia activa.", instanceName: null };
    }

    const instanceName = instanciaActiva.instanceName;

    const enElProveedor = await borrarLaSesionDeLaLinea({
      instanceName,
      instanceType: instanciaActiva.instanceType,
      userId,
    });

    // Transitorio → conservamos el registro como señal de borrado pendiente.
    if (!enElProveedor.ok && enElProveedor.transitorio) {
      return {
        success: false,
        retryable: true,
        message: enElProveedor.message,
        instanceName,
      };
    }

    // Firme (confirmado, 404, o sin credenciales con las que contactar) → la
    // fila se va: reintentarlo eternamente no la va a arreglar.
    if (!enElProveedor.ok) {
      console.warn('[linea] borrado firme sin confirmar en el proveedor', {
        instanceName,
        instanceType: instanciaActiva.instanceType,
        motivo: enElProveedor.message,
      });
    }

    await db.instancia.delete({ where: { id: instanciaActiva.id } });
    return { success: true, retryable: false, message: "Instancia eliminada exitosamente.", instanceName };
  } catch (error: any) {
    return { success: false, retryable: true, message: error?.message || "Error al eliminar la instancia.", instanceName: null };
  }
}

export async function createInstanceInternal(
  userId: string,
  instanceName: string,
  instanceType: string = 'Whatsapp'
): Promise<{ success: boolean; message: string }> {
  try {
    if (!instanceName || !userId) {
      return { success: false, message: 'userId e instanceName son obligatorios.' };
    }

    const instanciaActiva = await checkActiveInstance(userId, instanceType);
    if (instanciaActiva) {
      return { success: false, message: "El usuario ya tiene una instancia activa." };
    }

    if (isWhatsappLike(instanceType)) {
      // Las lineas NUEVAS nacen en WhatsApp Mensajeria (Waha).
      //
      // Es el mismo canal y la misma tarjeta -«Mensajeria WhatsApp (QR)»-:
      // cambia por donde se conecta, que es un ajuste de la linea y no algo que
      // se enseñe. Si no hay servidor de Waha configurado se crea en Evolution,
      // como siempre, para no dejar sin linea a una instalacion que no lo use.
      if (await sePuedeCrearEnWaha()) {
        const enWaha = await crearSesionDeWaha(instanceName);
        if (!enWaha.ok) {
          console.warn('[linea] no se pudo crear en WhatsApp Mensajeria', { instanceName, motivo: enWaha.message });
          return { success: false, message: enWaha.message };
        }
        await db.instancia.create({
          data: {
            instanceName,
            displayName: cleanInstanceDisplayName(instanceName),
            userId,
            ...enWaha.datos,
          } as any,
        });
        console.info('[linea] creada en WhatsApp Mensajeria', { instanceName, userId });
        return { success: true, message: "Instancia creada exitosamente." };
      }

      const user = await db.user.findUnique({
        where: { id: userId },
        include: { apiKey: true },
      });

      if (!user || !user.apiKey) {
        return { success: false, message: "El usuario no tiene una ApiKey asignada." };
      }

      // Mismo guardia de cupo que en createInstance: son dos caminos distintos
      // para crear una instancia y el límite tiene que valer en los dos, o el que
      // se deje sin comprobar acaba siendo la vía por la que se pasa de largo.
      const cupo = await assertApiKeyHasCapacity(user.apiKey.id);
      if (!cupo.ok) {
        return { success: false, message: cupo.message };
      }

      const { key: apiKey, url: serverUrl } = user.apiKey;

      const response = await fetch(`https://${serverUrl}/instance/create`, {
        method: 'POST',
        headers: { 'apikey': apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ instanceName, qrcode: true, integration: "WHATSAPP-BAILEYS" }),
      });
      const apiResult = await response.json();
      if (!response.ok) {
        // Mismo lector que el otro camino de creacion: son dos puertas para lo
        // mismo y el aviso tiene que decir lo mismo en las dos.
        const motivo = motivoDeNoPoderCrearLaLinea(apiResult, 'Error al crear la instancia en la API.');
        console.warn('[linea] Evolution rechazo crear la instancia', {
          instanceName,
          estado: response.status,
          motivo,
        });
        return { success: false, message: motivo };
      }

      const instanceId = apiResult.hash;
      if (!instanceId) {
        return { success: false, message: 'No se recibió instanceId en la respuesta de la API.' };
      }

      await db.instancia.create({ data: { instanceName, displayName: cleanInstanceDisplayName(instanceName), instanceType, userId, instanceId } as any });
      return { success: true, message: "Instancia creada exitosamente." };
    } else {
      await db.instancia.create({
        data: { instanceName, displayName: cleanInstanceDisplayName(instanceName), instanceType, userId, instanceId: `local-${randomUUID()}` } as any,
      });
      return { success: true, message: "Instancia creada exitosamente." };
    }
  } catch (error: any) {
    return { success: false, message: error?.message || "Error al crear la instancia." };
  }
}

// Función para verificar si el usuario ya tiene una instancia
export async function checkActiveInstance(userId: string, instanceType: string = 'Whatsapp') {
  // La linea de WhatsApp por QR puede estar guardada con dos tipos -`Whatsapp`
  // si nacio en Evolution, `waha` si nacio o se paso a WhatsApp Mensajeria- y
  // son LA MISMA cosa: un numero conectado por QR. Preguntando solo por el tipo
  // pedido, una cuenta con su linea en Waha pasaba el guardia y acababa con dos
  // filas para el mismo numero, que es justo lo que la regla «una linea es una
  // instancia» existe para evitar.
  const tipos = isWhatsappLike(instanceType) ? [instanceType, 'waha'] : [instanceType];
  const where: any = { userId, instanceType: { in: Array.from(new Set(tipos)) } };

  // Y las lineas ANTIGUAS, que se guardaron con el tipo en nulo. Un `IN` de SQL
  // nunca casa con un nulo, asi que esas filas no las encontraba nadie: el boton
  // de borrar decia «el usuario no tiene ninguna instancia activa» con la linea
  // delante. Que `isWhatsappLike(null)` valga `true` desde siempre dice que la
  // intencion era incluirlas; lo que faltaba era la consulta.
  if (isWhatsappLike(instanceType)) {
    where.OR = [{ instanceType: { in: Array.from(new Set(tipos)) } }, { instanceType: null }];
    delete where.instanceType;
  }

  const instanciaActiva = await db.instancia.findFirst({ where });
  return instanciaActiva;
}

// Funcion para traer datos del cliente
export async function getInstances(userId: string) {
  try {
    await assertUserCanUseApp(userId);

    const instance = await db.instancia.findMany({
      where: { userId: userId },
      select: { instanceName: true, instanceId: true, instanceType: true },
    });

    const user = await db.user.findUnique({
      where: { id: userId },
      include: { apiKey: true },
    });

    const serverUrl = user?.apiKey?.url ?? null;

    const instances = instance.map((i) => ({ ...i, serverUrl }));
    return instances;
  } catch (error) {
    console.error(`Error fetching from:`, error);
  }
}

// actions/createBotAction.ts
export async function createBotAction(data: FormData) {
  const instanceName = data.get('instanceName') as string;
  const instanceId = data.get('instanceId') as string;
  const systemMessage = data.get('systemMessage') as string;

  if (!instanceName || !instanceId || !systemMessage) {
    throw new Error('Faltan datos necesarios.');
  }

  const requestBody = {
    enabled: true,
    openaiCredsId: 'cm2nql5yd6e7g12gecbdrflit',
    botType: 'chatCompletion',
    model: 'gpt-4',
    systemMessages: [systemMessage],
    assistantMessages: ['\n\nHello there, how may I assist you today?'],
    userMessages: ['Hello!'],
    maxTokens: 300,
    triggerType: 'keyword',
    triggerOperator: 'equals',
    triggerValue: 'test',
    expire: 20,
    keywordFinish: '#EXIT',
    delayMessage: 1000,
    unknownMessage: 'Message not recognized',
    listeningFromMe: false,
    stopBotFromMe: false,
    keepOpen: false,
    debounceTime: 10,
    ignoreJids: [],
  };

  try {
    const response = await fetch(`https://conexion.aizenbots.com/openai/create/${instanceName}`, {
      method: 'POST',
      headers: {
        'apikey': instanceId,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Error al crear el bot');
    }

    return await response.json();
  } catch (err) {
    console.error(`Error:`, err);
  }
}

//Datos para api status
export async function getDataApi(userId: string, apiKeyId: string) {
  try {
    await assertUserCanUseApp(userId);

    const apiKey = await db.apiKey.findFirst({
      where: { id: apiKeyId },
      select: { id: true, url: true, key: true },
    });

    const instancia = await db.instancia.findFirst({
      where: { userId },
      select: { id: true, instanceName: true, instanceId: true },
    });

    if (!apiKey || !instancia) {
      return {
        success: false,
        data: null,
        message: "No se encontró ApiKey o Instancia para este usuario.",
      };
    }

    return {
      success: true,
      data: {
        apiKeyId: apiKey.id,
        url: apiKey.url,
        key: instancia.instanceId,
        instanceName: instancia.instanceName,
        instanceId: instancia.instanceId,
      },
    };
  } catch (error: any) {
    return {
      success: false,
      message: error.message || "Error al obtener datos de la API.",
    };
  }
}
