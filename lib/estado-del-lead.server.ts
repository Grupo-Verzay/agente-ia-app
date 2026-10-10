import "server-only";

import type { LeadStatus } from "@prisma/client";

import { db } from "@/lib/db";
import { borrarSeguimientosDelNumeroEnLaCuenta } from "@/lib/seguimientos-de-la-cuenta.server";
import { recordConfirmedSalesOutcome } from "@/lib/sales-learning";

/**
 * Cambiar el estado de un lead, SIN puerta — para quien no tiene sesión.
 *
 * `updateSessionLeadStatus` (la acción) pide `assertUserCanUseApp`, que lee la
 * sesión del navegador. El Modo Dueño entra por `/api/owner/*` con su clave y
 * sin sesión: cada «mueve a Juan a caliente» fallaba con «No autorizado» y el
 * dueño recibía «No se pudo completar». Es el mismo arreglo que
 * `leads-sin-puerta.server.ts`: el cuerpo se muda aquí, `server-only`, y la
 * acción se queda como la puerta. **Una pantalla nunca importa de aquí.**
 *
 * Quien llama YA comprobó de quién es la sesión.
 */
export async function cambiarElEstadoDelLead(
  sessionId: number,
  leadStatus: LeadStatus | null,
): Promise<{ success: boolean; message: string }> {
  const session = await db.session.findUnique({
    where: { id: sessionId },
    select: { userId: true, remoteJid: true, leadStatus: true },
  });
  if (!session?.userId) {
    return { success: false, message: "Sesion no encontrada." };
  }

  const isDescartado = leadStatus === "DESCARTADO";
  const wasDescartado = session.leadStatus === "DESCARTADO";

  // Actualizar sesión: si pasa a DESCARTADO → deshabilitar agente; si sale de DESCARTADO → reactivar agente
  await db.session.update({
    where: { id: sessionId },
    data: {
      leadStatus: leadStatus ?? null,
      leadStatusSourceHash: null,
      leadStatusUpdatedAt: new Date(),
      // DESCARTADO → apaga el agente y retira el opt-in de IA del contacto.
      // Salir de DESCARTADO solo quita el bloqueo (no fuerza IA: eso es opt-in
      // explícito vía toggle "Agente" o nodo "Activar IA").
      ...(isDescartado && { agentDisabled: true, aiOptIn: false }),
      ...(wasDescartado && !isDescartado && { agentDisabled: false }),
    },
  });

  // Si se marca como DESCARTADO → eliminar todos los seguimientos, recordatorios y follow-ups
  if (isDescartado) {
    await db.crmFollowUp.deleteMany({ where: { sessionId } });

    if (session.remoteJid) {
      // Solo en las líneas de ESTA cuenta: el mismo número está en otras
      // cuentas de la plataforma y sus seguimientos no son de aquí.
      await borrarSeguimientosDelNumeroEnLaCuenta(session.userId, session.remoteJid);

      await db.session.update({
        where: { id: sessionId },
        data: { seguimientos: null, inactividad: null },
      });
    }

    await db.sessionWorkflowState.updateMany({
      where: { sessionId, intentionStatus: "waiting" },
      data: { intentionStatus: "cancelled", currentNodeId: null },
    });
  }

  // El cambio de estado es una clasificación INTERNA del asesor: mover una
  // ficha a FRIO/TIBIO/CALIENTE/FINALIZADO no debe escribirle al cliente.
  // Si se quiere avisar al cliente, se hace con un flujo configurado a
  // propósito (Ajustes → flujo por estado), no de forma implícita.

  // Ejecutar automatizaciones de etapa (fire-and-forget)
  if (leadStatus) {
    void triggerStageAutomations(sessionId, leadStatus).catch(() => undefined);
  }

  // Solo aprende de resultados confirmados explícitamente por el asesor.
  if (leadStatus === "FINALIZADO" || leadStatus === "DESCARTADO") {
    await recordConfirmedSalesOutcome(
      sessionId,
      leadStatus === "FINALIZADO" ? "WON" : "LOST",
    ).catch((error) => console.error("[sales-learning:record]", error));
  }

  return { success: true, message: "Estado del lead actualizado correctamente" };
}

async function triggerStageAutomations(sessionId: number, newStage: string): Promise<void> {
  const backendUrl = (process.env.BACKEND_URL ?? "").replace(/\/$/, "");
  if (!backendUrl) return;
  const key = process.env.CRM_FOLLOW_UP_RUNNER_KEY ?? "";
  await fetch(`${backendUrl}/stage-automations/execute`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-internal-secret": key },
    body: JSON.stringify({ sessionId, newStage }),
  });
}
