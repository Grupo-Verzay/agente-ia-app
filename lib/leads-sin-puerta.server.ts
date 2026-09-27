import "server-only";

import type { Session as PrismaSession } from "@prisma/client";
import { z } from "zod";

import { autoSyncContactIfEnabled } from "@/actions/google-sheets-actions";
import type { ActionResponse } from "@/actions/tag-actions";
import { resolvePreferredRemoteJid } from "@/lib/chat-session-match";
import { db } from "@/lib/db";
import { buildWhatsAppJidCandidates, pickObservedAlternateRemoteJid } from "@/lib/whatsapp-jid";
import { registerSessionSchema } from "@/schema/session";
import type { SessionResponse } from "@/types/session";

/**
 * Crear un lead y ponerle etiquetas, SIN puerta — para quien no tiene sesión.
 *
 * # Por qué viven aquí y no en `actions/session-action.ts`
 *
 * `registerSession` y `addTagsToSessionAction` no preguntaban de quién era la
 * cuenta: con la sesión de cualquiera y otro `userId` se creaban leads —y se
 * les ponían etiquetas— en una cuenta ajena. Ponerles la puerta de siempre las
 * cierra para el navegador… y **apaga** a dos llamadores legítimos que no
 * tienen sesión que preguntar:
 *
 * - `createAppointment`, que abre la página pública de reservas
 *   (`/schedule/[userId]`): quien reserva no tiene cuenta, y su lead se crea
 *   dentro de la cita.
 * - el modo dueño por WhatsApp (`lib/owner-commands.ts`), que entra por
 *   `/api/owner/*` con su propia clave.
 *
 * Es la regla de *un runner de sistema no puede ser una acción*: el cuerpo se
 * muda a un fichero `server-only` —no se empaqueta hacia el navegador y no es
 * un endpoint— y la acción se queda como la puerta. **Una pantalla nunca
 * importa de aquí**: va por la acción.
 *
 * El código se movió tal cual.
 */

// schema para agregar varios tags a una sesión
const addTagsToSessionSchema = z.object({
  userId: z.string().min(1),
  sessionId: z.number().int().positive(),
  tagIds: z.array(z.number().int().positive()).min(1),
});

async function triggerTagAutomations(sessionId: number, tagId: number): Promise<void> {
  const backendUrl = (process.env.BACKEND_URL ?? '').replace(/\/$/, '');
  if (!backendUrl) return;
  const key = process.env.CRM_FOLLOW_UP_RUNNER_KEY ?? '';
  try {
    await fetch(`${backendUrl}/tag-automations/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-internal-secret': key },
      body: JSON.stringify({ sessionId, tagId }),
    });
  } catch (error) {
    console.error('[triggerTagAutomations]', error);
  }
}

export async function registrarLaSesion(input: z.infer<typeof registerSessionSchema>): Promise<SessionResponse<PrismaSession>> {
  const validation = registerSessionSchema.safeParse(input);

  if (!validation.success) {
    const issues = validation.error.issues.map(issue => issue.message).join(", ");
    return {
      success: false,
      message: `Datos inválidos: ${issues}`,
    };
  }

  const { userId, remoteJid, remoteJidAlt, senderPn, pushName, instanceId } = validation.data;

  try {
    const trimmedRemoteJid = remoteJid.trim();
    const trimmedInstanceId = instanceId.trim();
    const observedAliases = [
      trimmedRemoteJid,
      remoteJidAlt?.trim(),
      senderPn?.trim(),
    ];
    const candidates = buildWhatsAppJidCandidates(trimmedRemoteJid, observedAliases);
    const preferredRemoteJid = resolvePreferredRemoteJid(observedAliases);

    const existingSession = await db.session.findFirst({
      where: {
        userId,
        instanceId: trimmedInstanceId,
        OR: [
          { remoteJid: { in: candidates } },
          { remoteJidAlt: { in: candidates } },
        ],
      },
      orderBy: { updatedAt: 'desc' },
    });

    if (existingSession) {
      const remoteJidAlt = pickObservedAlternateRemoteJid(preferredRemoteJid, [
        ...observedAliases,
        existingSession.remoteJid,
        existingSession.remoteJidAlt,
      ]);

      // Solo actualizar pushName desde WhatsApp si la sesión aún no tiene nombre guardado.
      // Si el usuario editó el nombre manualmente, no sobreescribir.
      const resolvedPushName = existingSession.pushName?.trim()
        ? existingSession.pushName
        : (pushName ?? null);

      const updated = await db.session.update({
        where: { id: existingSession.id },
        data: {
          pushName: resolvedPushName,
          remoteJid: preferredRemoteJid,
          remoteJidAlt,
          updatedAt: new Date(),
        },
      });

      return {
        success: true,
        message: "Sesión actualizada correctamente.",
        data: updated,
      };
    }

    const created = await db.session.create({
      data: {
        userId,
        remoteJid: preferredRemoteJid,
        remoteJidAlt: pickObservedAlternateRemoteJid(preferredRemoteJid, observedAliases),
        pushName,
        instanceId: trimmedInstanceId,
        status: true,
      },
    });

    // Auto-sync a Google Sheets (opt-in): contacto nuevo.
    await autoSyncContactIfEnabled(created.userId, created.remoteJid);

    return {
      success: true,
      message: "Sesión creada correctamente.",
      data: created,
    };
  } catch (error) {
    console.error("[REGISTER_SESSION]", error);
    return {
      success: false,
      message: "Error al registrar la sesión.",
    };
  }
}

export async function anadirEtiquetasALaSesion(
  input: z.infer<typeof addTagsToSessionSchema>,
): Promise<ActionResponse<null>> {
  try {
    const { userId, sessionId, tagIds } = addTagsToSessionSchema.parse(input);

    // 1) Validar que la sesión exista y sea del usuario
    const session = await db.session.findUnique({
      where: { id: sessionId },
    });

    if (!session || session.userId !== userId) {
      return {
        success: false,
        message: "Sesión no encontrada o no pertenece a este usuario.",
      };
    }

    // 2) Validar que TODOS los tags existan y pertenezcan al mismo user
    const tags = await db.tag.findMany({
      where: {
        id: { in: tagIds },
      },
    });

    if (tags.length !== tagIds.length) {
      return {
        success: false,
        message: "Uno o más tags no existen.",
      };
    }

    const allBelongToUser = tags.every((t) => t.userId === userId);
    if (!allBelongToUser) {
      return {
        success: false,
        message: "Uno o más tags no pertenecen a este usuario.",
      };
    }

    // Tags previos (para disparar automatizaciones solo de los nuevos)
    const prevTags = await db.sessionTag.findMany({
      where: { sessionId },
      select: { tagId: true },
    });
    const prevTagSet = new Set(prevTags.map((p: { tagId: number }) => p.tagId));

    // 3) Crear relaciones en SessionTag (sin duplicados)
    await db.sessionTag.createMany({
      data: tagIds.map((tagId) => ({
        sessionId,
        tagId,
      })),
      skipDuplicates: true,
    });

    // Disparar automatizaciones de cada tag recién agregado
    for (const tagId of tagIds) {
      if (!prevTagSet.has(tagId)) void triggerTagAutomations(sessionId, tagId);
    }

    return {
      success: true,
      message: "Tags agregados a la sesión correctamente.",
      data: null,
    };
  } catch (error) {
    console.error("[anadirEtiquetasALaSesion]", error);
    return {
      success: false,
      message: "Error agregando tags a la sesión.",
    };
  }
}
