"use server";

import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { DEFAULT_TRAINING_CHANNEL } from "@/lib/channel-training";
import {
  getOrCreateChannelPrompt,
  patchBusinessSection,
  publishPrompt,
} from "@/actions/system-prompt-actions";
import { applyTemplateToPrompt } from "@/actions/apply-template-action";
import { isAdminOrReseller } from "@/lib/rbac";

/**
 * Asistente de "dar de alta el Agente IA" (primer arranque).
 *
 * Al registrarse y entrar por primera vez, el dueño configura su agente con un
 * paso a paso: datos del negocio + objetivo (plantilla). Esto reutiliza el
 * mismo entrenamiento (AgentPrompt.sections) que usa el editor y "IA Prompts",
 * así que no rompe ni duplica nada, y todo queda versionado (reversible).
 */

// Objetivos del asistente → ids de plantilla existentes (agentTemplates.ts).
const VALID_OBJECTIVES = new Set([
  "venta-directa",
  "venta-consultiva",
  "agendamiento-citas",
  "calificacion-leads",
  "atencion-cliente",
  "pedidos-delivery",
]);

/** La cuenta "efectiva" (dueña) del usuario actual. */
function ownerId(me: { effectiveId?: string | null; id: string }): string {
  return me.effectiveId ?? me.id;
}

/**
 * ¿Debe mostrarse el asistente de primer arranque?
 * Solo al dueño (no a asesores), solo si no lo completó y su agente aún no
 * tiene contenido (los usuarios existentes ya configurados NO lo ven).
 */
export async function getAgentOnboardingState(): Promise<{ show: boolean; name?: string | null }> {
  const me = await currentUser();
  if (!me?.id) return { show: false };
  // Los asesores / cuentas administradas no configuran el agente del dueño.
  if ((me as { advisorRole?: string | null }).advisorRole) return { show: false };
  // Administradores de la plataforma / revendedores no tienen su propio agente.
  if (isAdminOrReseller((me as { role?: string | null }).role)) return { show: false };

  const userId = ownerId(me);
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { agentOnboardingDone: true, name: true } as any,
  });
  if ((user as { agentOnboardingDone?: boolean } | null)?.agentOnboardingDone) return { show: false };

  // ¿Ya tiene un agente configurado? (defensa para cuentas previas a esta marca)
  const prompts = await db.agentPrompt.findMany({
    where: { userId },
    select: { businessName: true, status: true, sections: true },
  });
  const configured = prompts.some((p) => {
    const hasBiz = !!(p.businessName && p.businessName.trim());
    const steps = (p.sections as any)?.training?.steps;
    const hasFlow = Array.isArray(steps) && steps.length > 0;
    return hasBiz || hasFlow || p.status === "published";
  });
  if (configured) {
    await db.user.update({ where: { id: userId }, data: { agentOnboardingDone: true } as any }).catch(() => {});
    return { show: false };
  }

  return { show: true, name: (user as { name?: string } | null)?.name ?? null };
}

/** Marca el asistente como visto sin configurar ("hacerlo después"). */
export async function dismissAgentOnboarding(): Promise<{ ok: boolean }> {
  const me = await currentUser();
  if (!me?.id) return { ok: false };
  await db.user
    .update({ where: { id: ownerId(me) }, data: { agentOnboardingDone: true } as any })
    .catch(() => {});
  return { ok: true };
}

export interface AgentOnboardingInput {
  business: {
    nombre?: string;
    sector?: string;
    ofrece?: string;
    horarios?: string;
    pagos?: string;
    tono?: string;
  };
  objectiveId: string;
}

/**
 * Da de alta el agente: guarda el negocio, aplica la plantilla del objetivo
 * (que trae el flujo/camino, FAQ y captura de datos) y publica. Deja el
 * onboarding como completado.
 */
export async function completeAgentOnboarding(
  input: AgentOnboardingInput,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const me = await currentUser();
    if (!me?.id) return { ok: false, error: "No autorizado." };
    if ((me as { advisorRole?: string | null }).advisorRole) {
      return { ok: false, error: "Solo el dueño de la cuenta puede configurar el agente." };
    }
    const userId = ownerId(me);

    if (!VALID_OBJECTIVES.has(input.objectiveId)) {
      return { ok: false, error: "Objetivo no válido." };
    }

    // 1) Prompt del canal WhatsApp (lo crea si no existe).
    const prompt = await getOrCreateChannelPrompt({ userId, agentId: DEFAULT_TRAINING_CHANNEL });

    // 2) Aplicar la plantilla del objetivo (camino del cliente + FAQ + captura).
    const applied = await applyTemplateToPrompt({ promptId: prompt.id, templateId: input.objectiveId });
    if (!applied.ok) return { ok: false, error: applied.error ?? "No se pudo aplicar la plantilla." };

    // 3) Guardar los datos del negocio (tras aplicar, la versión cambió).
    const b = input.business ?? {};
    const notas = [
      b.ofrece ? `Qué ofrece: ${b.ofrece}` : "",
      b.pagos ? `Métodos de pago: ${b.pagos}` : "",
      b.tono ? `Tono de comunicación: ${b.tono}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    const afterTemplate = await db.agentPrompt.findUnique({
      where: { id: prompt.id },
      select: { version: true },
    });
    const bizRes = await patchBusinessSection({
      promptId: prompt.id,
      version: afterTemplate?.version ?? prompt.version,
      data: {
        nombre: b.nombre ?? "",
        sector: b.sector ?? "",
        horarios: b.horarios ?? "",
        notas,
      },
    });
    // Si hubo conflicto de versión, no es fatal: continuamos a publicar igual.

    // 4) Publicar (crea revisión + deja promptText compilado).
    const afterBiz = await db.agentPrompt.findUnique({
      where: { id: prompt.id },
      select: { version: true },
    });
    await publishPrompt({
      promptId: prompt.id,
      version: afterBiz?.version ?? (bizRes as any)?.data?.version ?? prompt.version + 1,
      publishedBy: me.name ?? (me as { email?: string }).email ?? "Asistente",
      note: "Configuración inicial (asistente)",
      revalidate: "/ia",
    });

    // 5) Onboarding completado.
    await db.user.update({ where: { id: userId }, data: { agentOnboardingDone: true } as any });

    return { ok: true };
  } catch (e: any) {
    console.error("[completeAgentOnboarding]", e);
    return { ok: false, error: "No se pudo dar de alta el agente." };
  }
}
