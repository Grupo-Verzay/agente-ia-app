"use server";

import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { BASE_TRAINING_AGENT_ID } from "@/lib/channel-training";
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
 * paso a paso: datos del negocio + objetivo (plantilla). Reutiliza el mismo
 * entrenamiento (AgentPrompt.sections) que usa el editor y "IA Prompts", así
 * que no rompe ni duplica nada, y todo queda versionado (reversible).
 *
 * IMPORTANTE: NO usa ninguna columna nueva en la BD. El estado se deriva de:
 *   - ¿El agente ya tiene contenido? → ya está dado de alta (no mostrar).
 *   - Cookie de "hacerlo después" → el dueño lo pospuso (no mostrar).
 * Así evitamos migraciones y no rompemos consultas del usuario.
 */

const DISMISS_COOKIE = "agent_onboarding_dismissed";

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
 * ¿El Agente IA REAL (el prompt base de WhatsApp que atiende) ya está configurado?
 * Mira exactamente el mismo prompt que lee el editor (agentId base), no "cualquiera".
 */
async function isAgentConfigured(userId: string): Promise<boolean> {
  const p = await db.agentPrompt.findFirst({
    where: { userId, agentId: BASE_TRAINING_AGENT_ID },
    select: { businessName: true, status: true, sections: true },
  });
  if (!p) return false;
  const hasBiz = !!(p.businessName && p.businessName.trim());
  const steps = (p.sections as any)?.training?.steps;
  const hasFlow = Array.isArray(steps) && steps.length > 0;
  return hasBiz || hasFlow || p.status === "published";
}

/**
 * ¿Debe mostrarse el asistente de primer arranque?
 * Solo al dueño (no a asesores ni admins), solo si NO pospuso el asistente y su
 * agente aún no tiene contenido.
 */
export async function getAgentOnboardingState(): Promise<{ show: boolean; name?: string | null }> {
  const me = await currentUser();
  if (!me?.id) return { show: false };
  if ((me as { advisorRole?: string | null }).advisorRole) return { show: false };
  if (isAdminOrReseller((me as { role?: string | null }).role)) return { show: false };

  const cookieStore = await cookies();
  if (cookieStore.get(DISMISS_COOKIE)?.value === "1") return { show: false };

  const userId = ownerId(me);
  if (await isAgentConfigured(userId)) return { show: false };

  return { show: true, name: (me as { name?: string | null }).name ?? null };
}

/** Marca el asistente como pospuesto ("hacerlo después") vía cookie. */
export async function dismissAgentOnboarding(): Promise<{ ok: boolean }> {
  const cookieStore = await cookies();
  cookieStore.set(DISMISS_COOKIE, "1", {
    maxAge: 60 * 60 * 24 * 365, // 1 año
    path: "/",
    httpOnly: true,
    sameSite: "lax",
  });
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
 * (que trae el flujo/camino, FAQ y captura de datos) y publica.
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

    // 1) Prompt base de WhatsApp — el MISMO que lee el editor (agentId base).
    //    OJO: 'whatsapp' es el slug del tab, NO el agentId; el agentId real es
    //    'system-prompt-ai' (BASE_TRAINING_AGENT_ID). Usar el slug crea un prompt
    //    fantasma que ningún editor lee.
    const prompt = await getOrCreateChannelPrompt({ userId, agentId: BASE_TRAINING_AGENT_ID });

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
    await patchBusinessSection({
      promptId: prompt.id,
      version: afterTemplate?.version ?? prompt.version,
      data: {
        nombre: b.nombre ?? "",
        sector: b.sector ?? "",
        horarios: b.horarios ?? "",
        notas,
      },
    });

    // 4) Publicar (crea revisión + deja promptText compilado).
    const afterBiz = await db.agentPrompt.findUnique({
      where: { id: prompt.id },
      select: { version: true },
    });
    await publishPrompt({
      promptId: prompt.id,
      version: afterBiz?.version ?? prompt.version + 1,
      publishedBy: me.name ?? (me as { email?: string }).email ?? "Asistente",
      note: "Configuración inicial (asistente)",
      revalidate: "/ia",
    });

    // 5) Marcar como pospuesto/hecho vía cookie (el agente ya tiene contenido,
    //    así que tampoco reaparecería por la verificación de "configurado").
    const cookieStore = await cookies();
    cookieStore.set(DISMISS_COOKIE, "1", {
      maxAge: 60 * 60 * 24 * 365,
      path: "/",
      httpOnly: true,
      sameSite: "lax",
    });

    return { ok: true };
  } catch (e: any) {
    console.error("[completeAgentOnboarding]", e);
    return { ok: false, error: "No se pudo dar de alta el agente." };
  }
}
