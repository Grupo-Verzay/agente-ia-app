"use server"

import { db } from "@/lib/db";
import { ApiKey } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { randomUUID } from "crypto";
import { sendingMessages } from "./sending-messages-actions";
import { ClientResponse, DISCONNECT_COOLDOWN_MS, DISCONNECTION_MSG, EVO_FETCH_TIMEOUT_MS, GenerateQrInterface, getDayKeyBogota, getEvoCache, isApiConnected, isWhatsappLike, QRCodeResponse } from "@/types/evo-api";
import { assertUserCanUseApp } from "./billing/helpers/app-access-guard";

/* =========================
   Server-Action: Generar QR
   - Solo usa Evolution si instanceType es WhatsApp o nulo.
   - Mantiene TUS mensajes originales.
========================= */
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
  if (!user.apiKey) {
    return { success: false, message: "El usuario no tiene una ApiKey asignada." };
  }

  // Detectar tipo de instancia (si existe en BD)
  const inst = await db.instancia.findFirst({
    where: { userId, instanceName },
    select: { instanceType: true },
  });
  const instanceType = inst?.instanceType ?? null;

  if (!isWhatsappLike(instanceType)) {
    return { success: false, message: 'No se pudo generar el código QR.' };
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
    const remoteJid = (user as any).notificationNumber as string | undefined;

    if (remoteJid) {
      try {
        const serverUrlAdmin = "evoapi.ia-app.com";
        const instanceNameAdmin = "Verzay Pro Atc";
        const sendTextUrl = `https://${serverUrlAdmin}/message/sendText/${instanceNameAdmin}`;

        await sendingMessages({
          url: sendTextUrl,
          apikey: apiKey,
          remoteJid,
          text: DISCONNECTION_MSG,
          history: {
            instanceName: instanceNameAdmin,
            type: 'notification',
            additionalKwargs: {
              source: 'generateQRCode',
              userId,
              reason: 'evolution_disconnect',
            },
          },
        });
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
      const user = await db.user.findUnique({
        where: { id: userId },
        include: { apiKey: true },
      });

      if (!user || !user.apiKey) {
        throw new Error("El usuario no tiene una ApiKey asignada.");
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
        throw new Error(apiResult.message || 'Error al crear la instancia en la API.');
      }

      const instanceId = apiResult.hash;
      if (!instanceId) {
        throw new Error('No se recibió instanceId en la respuesta de la API.');
      }

      const nuevaInstancia = await db.instancia.create({
        data: { instanceName, instanceType, userId, instanceId },
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

    if (isWhatsappLike(instanceType)) {
      const user = await db.user.findUnique({
        where: { id: userId },
        include: { apiKey: true },
      });

      if (!user || !user.apiKey) {
        return { success: false, message: "El usuario no tiene una ApiKey asignada." };
      }

      const { key: apiKey, url: serverUrl } = user.apiKey;

      // 1. Logout de la instancia
      const logoutOptions = {
        method: 'DELETE',
        headers: {
          apikey: apiKey,
          'Content-Type': 'application/json',
        },
      };

      const logoutResponse = await fetch(
        `https://${serverUrl}/instance/logout/${instanceName}`,
        logoutOptions
      );

      const logoutResult = await logoutResponse.json().catch(() => ({} as any));

      if (!logoutResponse.ok) {
        return {
          success: false,
          message: logoutResult?.message || 'Error al hacer logout de la instancia en la API.',
        };
      }

      // 2. Eliminar la instancia en la API
      const deleteOptions = {
        method: 'DELETE',
        headers: {
          apikey: apiKey,
          'Content-Type': 'application/json',
        },
      };

      const deleteResponse = await fetch(
        `https://${serverUrl}/instance/delete/${instanceName}`,
        deleteOptions
      );

      const deleteResult = await deleteResponse.json().catch(() => ({} as any));

      if (!deleteResponse.ok) {
        return {
          success: false,
          message: deleteResult?.message || 'Error al eliminar la instancia en la API.',
        };
      }
    }

    // 3. Eliminar la instancia de la base de datos
    const instancia = await db.instancia.findFirst({
      where: { instanceName, instanceType },
    });

    if (!instancia) {
      return { success: false, message: "No se encontró la instancia en la base de datos." };
    }

    await db.instancia.delete({ where: { id: instancia.id } });

    return { success: true, message: "Instancia eliminada exitosamente." };
  } catch (error: any) {
    return { success: false, message: error?.message || "Error al eliminar la instancia." };
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

    if (isWhatsappLike(instanceType)) {
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

// Versión interna sin assertUserCanUseApp — para uso exclusivo del sistema (billing cron, activación de servicio)
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

    if (isWhatsappLike(instanceType)) {
      const user = await db.user.findUnique({
        where: { id: userId },
        include: { apiKey: true },
      });

      if (!user || !user.apiKey) {
        return { success: false, message: "El usuario no tiene una ApiKey asignada.", instanceName: null };
      }

      const { key: apiKey, url: serverUrl } = user.apiKey;

      await fetch(`https://${serverUrl}/instance/logout/${instanceName}`, {
        method: 'DELETE',
        headers: { apikey: apiKey, 'Content-Type': 'application/json' },
      }).catch(() => {});

      const deleteResponse = await fetch(`https://${serverUrl}/instance/delete/${instanceName}`, {
        method: 'DELETE',
        headers: { apikey: apiKey, 'Content-Type': 'application/json' },
      });
      const deleteResult = await deleteResponse.json().catch(() => ({} as any));
      if (!deleteResponse.ok) {
        return { success: false, message: deleteResult?.message || 'Error al eliminar la instancia en la API.', instanceName: null };
      }
    }

    const instancia = await db.instancia.findFirst({ where: { instanceName, instanceType } });
    if (!instancia) {
      return { success: false, message: "No se encontró la instancia en la base de datos.", instanceName: null };
    }

    await db.instancia.delete({ where: { id: instancia.id } });
    return { success: true, message: "Instancia eliminada exitosamente.", instanceName };
  } catch (error: any) {
    return { success: false, message: error?.message || "Error al eliminar la instancia.", instanceName: null };
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
      const user = await db.user.findUnique({
        where: { id: userId },
        include: { apiKey: true },
      });

      if (!user || !user.apiKey) {
        return { success: false, message: "El usuario no tiene una ApiKey asignada." };
      }

      const { key: apiKey, url: serverUrl } = user.apiKey;

      const response = await fetch(`https://${serverUrl}/instance/create`, {
        method: 'POST',
        headers: { 'apikey': apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ instanceName, qrcode: true, integration: "WHATSAPP-BAILEYS" }),
      });
      const apiResult = await response.json();
      if (!response.ok) {
        return { success: false, message: apiResult.message || 'Error al crear la instancia en la API.' };
      }

      const instanceId = apiResult.hash;
      if (!instanceId) {
        return { success: false, message: 'No se recibió instanceId en la respuesta de la API.' };
      }

      await db.instancia.create({ data: { instanceName, instanceType, userId, instanceId } });
      return { success: true, message: "Instancia creada exitosamente." };
    } else {
      await db.instancia.create({
        data: { instanceName, instanceType, userId, instanceId: `local-${randomUUID()}` },
      });
      return { success: true, message: "Instancia creada exitosamente." };
    }
  } catch (error: any) {
    return { success: false, message: error?.message || "Error al crear la instancia." };
  }
}

// Función para verificar si el usuario ya tiene una instancia
export async function checkActiveInstance(userId: string, instanceType: string = 'Whatsapp') {
  const instanciaActiva = await db.instancia.findFirst({
    where: { userId, instanceType: instanceType },
  });
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

    // 🔥 Buscar el usuario y su ApiKey asignada
    const user = await db.user.findUnique({
      where: { id: userId },
      include: { apiKey: true },
    });

    if (!user || !user.apiKey) {
      throw new Error("El usuario no tiene una ApiKey asignada.");
    }

    const { url: serverUrl } = user.apiKey;

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
