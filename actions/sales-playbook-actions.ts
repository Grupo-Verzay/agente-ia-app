"use server";

import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { buildDynamicSalesPlaybook } from "@/lib/sales-learning";

async function authorizedSession(sessionId: number) {
  const user = await currentUser();
  if (!user?.id) return null;
  const ownerId = user.ownerId ?? user.id;
  const session = await db.session.findFirst({
    where: { id: sessionId, userId: ownerId },
    select: { id: true },
  });
  return session ? { user, ownerId } : null;
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
        userId: auth.ownerId,
        sessionId: input.sessionId,
        advisorId: auth.user.id,
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
