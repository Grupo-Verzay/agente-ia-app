"use server";

import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { buildDynamicSalesPlaybook } from "@/lib/sales-learning";
import { assertCanAccessTargetUser } from "@/actions/billing/helpers/app-access-guard";
import { laPersonaQueActua } from "@/lib/chat-de-equipo";

/**
 * La conversación, si quien mira la ALCANZA.
 *
 * Antes se buscaba con `userId = ownerId ?? id` de quien mira, o sea exigiendo
 * que la conversación fuera de SU cuenta. La bandeja enseña además las líneas
 * de las cuentas que cuelgan de la suya (y el superadministrador, todas), así
 * que abrir el Contexto del lead de un chat de una hija devolvía «No
 * autorizado.» —en rojo, cada vez que se abría el panel— sin que nadie hubiera
 * pedido nada fuera de su alcance.
 *
 * La puerta es la de siempre: la cuenta DUEÑA de la conversación, pasada por
 * `assertCanAccessTargetUser` (uno mismo, su dueño, lo que cuelga hacia abajo y
 * el superadministrador de verdad; nunca hacia arriba).
 */
async function authorizedSession(sessionId: number) {
  const user = await currentUser();
  if (!user?.id) return null;
  const session = await db.session.findUnique({
    where: { id: sessionId },
    select: { id: true, userId: true },
  });
  if (!session?.userId) return null;
  try {
    await assertCanAccessTargetUser(session.userId);
  } catch (error) {
    console.warn("[sales-playbook] conversación fuera del alcance de quien mira", {
      sessionId,
      cuentaDeLaConversacion: session.userId,
      quienMira: user.id,
      motivo: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
  return { user, cuentaId: session.userId };
}

export async function getSalesPlaybookAction(sessionId: number) {
  const auth = await authorizedSession(sessionId);
  if (!auth) return { success: false as const, message: "No autorizado." };
  try {
    const data = await buildDynamicSalesPlaybook(sessionId);
    return data
      ? { success: true as const, data }
      : { success: false as const, message: "No se pudo generar el playbook." };
  } catch (error) {
    console.error("[sales-playbook:get]", error);
    return { success: false as const, message: "No se pudo generar el playbook." };
  }
}

export async function saveSalesPlaybookFeedbackAction(input: {
  sessionId: number;
  product: string;
  stage: string;
  useful: boolean;
}) {
  const auth = await authorizedSession(input.sessionId);
  if (!auth) return { success: false as const };
  try {
    await db.salesPlaybookFeedback.create({
      data: {
        // La valoración es de la CUENTA de la conversación (con la que se
        // aprende) y la firma la PERSONA que la dio.
        userId: auth.cuentaId,
        sessionId: input.sessionId,
        advisorId: laPersonaQueActua(auth.user).id || auth.user.id,
        product: input.product.slice(0, 120),
        stage: input.stage.slice(0, 40),
        useful: input.useful,
      },
    });
    return { success: true as const };
  } catch (error) {
    console.error("[sales-playbook:feedback]", error);
    return { success: false as const };
  }
}
