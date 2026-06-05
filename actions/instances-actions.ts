'use server'

import { db } from "@/lib/db";
import { z } from "zod";
import { Instancia } from "@prisma/client";
import { revalidatePath } from "next/cache";

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
      } as any,
    });
    revalidatePath('/connection');
    return { success: true, message: 'Instancia Meta creada. Configura el webhook en Meta Developer.' };
  } catch (error: any) {
    console.error('[createMetaInstance]', error);
    return { success: false, message: error?.message ?? 'Error al crear la instancia Meta.' };
  }
}

export async function deleteMetaInstance(
  instanceName: string,
): Promise<{ success: boolean; message: string }> {
  if (!instanceName) return { success: false, message: 'Nombre de instancia requerido.' };
  try {
    await db.instancia.deleteMany({ where: { instanceName } });
    revalidatePath('/connection');
    return { success: true, message: 'Instancia Meta eliminada.' };
  } catch (error: any) {
    console.error('[deleteMetaInstance]', error);
    return { success: false, message: 'Error al eliminar la instancia Meta.' };
  }
}

export async function updateMetaInstance(params: {
  instanceName: string;
  phoneNumberId: string;
  accessToken: string;
  wabaId: string;
  verifyToken: string;
}): Promise<{ success: boolean; message: string }> {
  const { instanceName, phoneNumberId, accessToken, wabaId, verifyToken } = params;
  try {
    await db.instancia.updateMany({
      where: { instanceName },
      data: {
        metaPhoneNumberId: phoneNumberId,
        metaAccessToken: accessToken,
        metaWabaId: wabaId || null,
        metaVerifyToken: verifyToken || null,
      } as any,
    });
    revalidatePath('/connection');
    return { success: true, message: 'Credenciales actualizadas.' };
  } catch (error: any) {
    console.error('[updateMetaInstance]', error);
    return { success: false, message: 'Error al actualizar.' };
  }
}