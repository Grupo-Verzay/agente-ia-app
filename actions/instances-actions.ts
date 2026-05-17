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