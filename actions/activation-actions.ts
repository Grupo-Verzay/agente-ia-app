"use server";

import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { BASE_TRAINING_AGENT_ID } from "@/lib/channel-training";
import { isAdminOrReseller } from "@/lib/rbac";
import { getInstances } from "@/actions/api-action";

/**
 * Estado de "puesta en marcha" del Agente IA para el checklist del Inicio.
 * Reúne las 3 señales que hoy están dispersas en pantallas distintas:
 *   1) agentConfigured  → el prompt base tiene contenido (asistente / editor).
 *   2) whatsappConnected → el número está vinculado (estado 'open' en Evolution).
 *   3) botEnabled        → el webhook del bot está encendido.
 * "En vivo" = las tres en verde.
 */
export interface ActivationChecklist {
  applicable: boolean;      // solo dueños de cuenta (no admin/reseller/asesor)
  agentConfigured: boolean;
  provisioned: boolean;     // tiene API Key de Evolution asignada
  whatsappConnected: boolean;
  botEnabled: boolean;
  live: boolean;
}

const NOT_APPLICABLE: ActivationChecklist = {
  applicable: false,
  agentConfigured: false,
  provisioned: false,
  whatsappConnected: false,
  botEnabled: false,
  live: false,
};

/** GET con timeout corto para no colgar el Inicio si Evolution tarda/está caído. */
async function fetchJson(url: string, apikey: string, timeoutMs = 6000): Promise<any | null> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const r = await fetch(url, { method: "GET", headers: { apikey }, signal: controller.signal });
    if (!r.ok) return null;
    return await r.json().catch(() => null);
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

export async function getActivationChecklist(): Promise<ActivationChecklist> {
  const me = await currentUser();
  if (!me?.id) return NOT_APPLICABLE;
  if ((me as { advisorRole?: string | null }).advisorRole) return NOT_APPLICABLE;
  if (isAdminOrReseller((me as { role?: string | null }).role)) return NOT_APPLICABLE;

  const userId = me.effectiveId ?? me.id;

  // 1) ¿Agente configurado? — mismo prompt base que lee el editor.
  let agentConfigured = false;
  try {
    const p = await db.agentPrompt.findFirst({
      where: { userId, agentId: BASE_TRAINING_AGENT_ID },
      select: { businessName: true, status: true, sections: true },
    });
    if (p) {
      const hasBiz = !!(p.businessName && p.businessName.trim());
      const steps = (p.sections as any)?.training?.steps;
      const hasFlow = Array.isArray(steps) && steps.length > 0;
      agentConfigured = hasBiz || hasFlow || p.status === "published";
    }
  } catch {
    /* si falla, lo dejamos en false */
  }

  // 2 y 3) Conexión de WhatsApp + bot encendido (Evolution).
  let provisioned = false;
  let whatsappConnected = false;
  let botEnabled = false;
  try {
    const instances = await getInstances(userId);
    const wa =
      instances?.find((i) => i.instanceType === "Whatsapp") ?? instances?.[0] ?? null;
    const serverUrl = wa?.serverUrl ?? null;
    provisioned = !!(serverUrl && wa?.instanceName && wa?.instanceId);

    if (provisioned && wa && serverUrl) {
      const base = `https://${serverUrl}`;
      const key = wa.instanceId as string;
      const [state, webhook] = await Promise.all([
        fetchJson(`${base}/instance/connectionState/${wa.instanceName}`, key),
        fetchJson(`${base}/webhook/find/${wa.instanceName}`, key),
      ]);
      const s = state?.instance?.state ?? state?.state ?? "";
      whatsappConnected = s === "open";
      botEnabled = webhook?.enabled === true;
    }
  } catch {
    /* Evolution caído / sin API Key → se refleja como no conectado */
  }

  return {
    applicable: true,
    agentConfigured,
    provisioned,
    whatsappConnected,
    botEnabled,
    live: agentConfigured && whatsappConnected && botEnabled,
  };
}
