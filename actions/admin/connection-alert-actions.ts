"use server";

import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import {
  DEFAULT_ALERT_MESSAGE,
  DEFAULT_ALERT_SLOTS,
  validarHorarios,
  type ConnectionAlertConfigData,
} from "@/lib/connection-alert-defaults";

/**
 * Aviso de "WhatsApp desvinculado": horarios, texto y línea que lo emite.
 *
 * Vivía fijo en el backend y solo se podía cambiar desplegando. Aquí se guarda
 * en `site_config` —la fila única de ajustes de la plataforma— y el backend lo
 * lee en cada revisión, así que un cambio surte efecto sin reiniciar nada.
 */

export async function getConnectionAlertConfig(): Promise<ConnectionAlertConfigData> {
  const defaults: ConnectionAlertConfigData = {
    enabled: true,
    slots: DEFAULT_ALERT_SLOTS,
    message: DEFAULT_ALERT_MESSAGE,
    instanceName: "",
  };

  try {
    const c = await db.siteConfig.findUnique({ where: { id: 1 } });
    if (!c) return defaults;
    return {
      enabled: c.connectionAlertEnabled ?? true,
      slots: c.connectionAlertSlots?.trim() || defaults.slots,
      message: c.connectionAlertMessage?.trim() || defaults.message,
      instanceName: c.connectionAlertInstance?.trim() || "",
    };
  } catch {
    return defaults;
  }
}

export async function saveConnectionAlertConfig(
  data: ConnectionAlertConfigData,
): Promise<{ success: boolean; message: string }> {
  try {
    const user = await currentUser();
    if (!user || (user.role !== "admin" && user.role !== "super_admin")) {
      return { success: false, message: "No autorizado" };
    }

    const horarios = validarHorarios(data.slots ?? "");
    if (!horarios.ok) return { success: false, message: horarios.error };

    const texto = (data.message ?? "").trim();
    if (data.enabled && !texto) {
      return { success: false, message: "El aviso no puede quedar sin texto si está activo." };
    }

    // Guardar NULL cuando coincide con el valor de siempre mantiene una sola
    // fuente del defecto (el backend). Si se guardara la copia, cambiar el texto
    // por defecto en el código no se reflejaría nunca en quien no lo ha tocado.
    const igualAlDefecto = (valor: string, defecto: string) => valor.trim() === defecto.trim();

    const payload = {
      connectionAlertEnabled: data.enabled,
      connectionAlertSlots:
        !horarios.limpio || igualAlDefecto(horarios.limpio, DEFAULT_ALERT_SLOTS) ? null : horarios.limpio,
      connectionAlertMessage: !texto || igualAlDefecto(texto, DEFAULT_ALERT_MESSAGE) ? null : texto,
      connectionAlertInstance: (data.instanceName ?? "").trim() || null,
    };

    await db.siteConfig.upsert({
      where: { id: 1 },
      update: payload,
      create: { id: 1, ...payload },
    });

    return { success: true, message: "Aviso de desconexión guardado." };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { success: false, message: msg };
  }
}
