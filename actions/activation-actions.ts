"use server";

import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { BASE_TRAINING_AGENT_ID } from "@/lib/channel-training";
import { isAdminOrReseller } from "@/lib/rbac";
import { getInstances } from "@/actions/api-action";
import { leerMarcaDelRobot } from "@/lib/robot-de-la-linea";
import { estadoDeLaSesionDeLaLinea, proveedorDeLaFila } from "@/lib/sesion-de-la-linea";

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

  // 2 y 3) Conexión de WhatsApp + Robot encendido, **en los dos proveedores**.
  //
  // Antes esto solo sabía de Evolution: cogía `instanceType === "Whatsapp"` y
  // exigía `serverUrl`, que es la url de Evolution. Un cliente con su línea en
  // WhatsApp Mensajería salía con las tres casillas en gris —ni aprovisionado,
  // ni conectado, ni con el Robot— para siempre, aunque estuviera atendiendo
  // clientes ese mismo minuto: el checklist le decía que no había terminado de
  // configurarse a quien ya estaba en marcha.
  let provisioned = false;
  let whatsappConnected = false;
  let botEnabled = false;
  try {
    const instances = await getInstances(userId);
    const porQr = (instances ?? []).filter(
      (i) => i.instanceName && proveedorDeLaFila(i.instanceType) !== "otro",
    );
    // La de Evolution primero solo por conservar el orden de siempre; lo que
    // decide es que exista una línea por QR, sea del proveedor que sea.
    const wa =
      porQr.find((i) => proveedorDeLaFila(i.instanceType) === "evolution") ?? porQr[0] ?? null;

    if (wa) {
      const proveedor = proveedorDeLaFila(wa.instanceType);
      const serverUrl = wa.serverUrl ?? null;

      // Aprovisionada = tiene con qué conectarse. En Evolution eso es su
      // ApiKey; en Waha el servidor es de la plataforma y la línea ya nació
      // contra él, así que basta con que la fila exista.
      provisioned =
        proveedor === "waha" ? true : !!(serverUrl && wa.instanceName && wa.instanceId);

      if (provisioned) {
        whatsappConnected =
          (await estadoDeLaSesionDeLaLinea({
            instanceName: wa.instanceName as string,
            instanceType: wa.instanceType,
            userId,
          })) === "conectada";

        // El Robot ya NO es el webhook: es la marca `bot_enabled` de la línea,
        // que el backend lee igual para los dos proveedores (ver CLAUDE.md, «El
        // Robot no es el webhook»). Leyendo el webhook, esta casilla decía
        // `true` siempre en Evolution —va siempre encendido— y `false` siempre
        // en Waha, que no tiene webhook de Evolution ninguno. El webhook solo
        // manda mientras la columna no exista.
        const marca = await leerMarcaDelRobot(wa.instanceName as string);
        if (marca === "sin-columna") {
          if (serverUrl) {
            const webhook = await fetchJson(
              `https://${serverUrl}/webhook/find/${wa.instanceName}`,
              wa.instanceId as string,
            );
            botEnabled = webhook?.enabled === true;
          }
        } else {
          botEnabled = marca !== false;
        }
      }
    }
  } catch {
    /* Servidor caído / sin credenciales → se refleja como no conectado */
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
