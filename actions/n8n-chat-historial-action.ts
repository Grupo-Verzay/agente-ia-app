'use server';

import { buildChatHistorySessionIdCandidates } from "@/lib/chat-history/build-session-id";
import { db } from "@/lib/db";
import { N8nChatHistory } from "@prisma/client";
import { laCuentaDeLaAccion } from "@/lib/cuenta-de-la-accion";

/**
 * Sin guarda ninguna, y lo que hay detrás es un `deleteMany`: con la sesión de
 * cualquier cuenta y otro id se le borraba a otra **la memoria entera de su
 * agente**. Es el H02 de siempre, en el sitio donde más duele — eso no se
 * recupera.
 */

interface N8nOperationResponse {
  success: boolean;
  message: string;
  data?: N8nChatHistory | null;
}

export async function deleteConversationN8N(
  userId: string,
  sessionId: number,
  remoteJid: string
): Promise<N8nOperationResponse> {
  try {
    // 1. Validación de parámetros
    if (!userId || !remoteJid) {
      return {
        success: false,
        message: 'Datos de entrada incompletos'
      };
    }

    const cuenta = await laCuentaDeLaAccion(userId);
    if (!cuenta) return { success: false, message: 'No autorizado.' };

    // 2. Obtener instancia del usuario
    const instance = await db.instancia.findFirst({
      where: { userId: cuenta },
      select: { instanceName: true }
    });

    if (!instance?.instanceName) {
      return {
        success: false,
        message: 'No se encontró instancia asociada al usuario'
      };
    }

    // 3. Eliminar TODAS las conversaciones con ese session_id
    const sessionIdentifiers = buildChatHistorySessionIdCandidates(instance.instanceName, remoteJid);

    const deleteResult = await db.n8nChatHistory.deleteMany({
      where: { sessionId: { in: sessionIdentifiers } }
    });

    if (deleteResult.count === 0) {
      return {
        success: false,
        message: 'No se encontró historial de conversación para este cliente'
      };
    }

    return {
      success: true,
      message: `Se eliminaron ${deleteResult.count} registros de historial de conversación exitosamente`,
      data: null
    };

  } catch (error) {
    console.error('Error en deleteConversationN8N:', error);
    return {
      success: false,
      message: 'Error interno al eliminar la conversación',
      data: null
    };
  }
}

// 🗑️ Eliminar el historial de todos los usuarios
export async function clearAllHistory(userId: string): Promise<N8nOperationResponse> {
  try {
    // 1. Validar que userId está presente
    if (!userId || typeof userId !== 'string') {
      return {
        success: false,
        message: 'El userId es requerido y debe ser una cadena de texto',
      };
    }

    const cuenta = await laCuentaDeLaAccion(userId);
    if (!cuenta) return { success: false, message: 'No autorizado.' };

    // 2. Buscar la instancia asociada al usuario
    const instance = await db.instancia.findFirst({
      where: { userId: cuenta },
      select: { instanceName: true }
    });

    if (!instance?.instanceName || typeof instance.instanceName !== 'string') {
      return {
        success: false,
        message: 'No se encontró una instancia válida asociada al usuario',
      };
    }

    const instancePrefix = `${instance.instanceName.trim()}-`;

    // 3. Eliminar todos los historiales con session_id que comiencen con el instanceName
    const deleteResult = await db.n8nChatHistory.deleteMany({
      where: {
        sessionId: {
          startsWith: instancePrefix, // Prisma no soporta ILIKE directamente, pero startsWith funciona para este caso
        }
      }
    });

    if (deleteResult.count === 0) {
      return {
        success: false,
        message: 'No se encontraron registros de historial para esta instancia',
      };
    }

    return {
      success: true,
      message: `Se eliminaron ${deleteResult.count} registros de historial exitosamente`,
      data: null
    };

  } catch (error) {
    console.error('Error en clearAllHistory:', error);
    return {
      success: false,
      message: 'Error interno al eliminar los historiales',
      data: null
    };
  }
}
