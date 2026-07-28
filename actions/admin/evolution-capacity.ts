"use server";

import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { isAdminOrReseller } from "@/lib/rbac";
import {
  contarInstancias,
  elegirServidorConCupo,
  leerOcupacionServidores,
  type EvolutionServerCapacity,
} from "@/lib/evolution-capacity";

/**
 * Cupo de instancias por servidor de Evolution, para el panel.
 *
 * La lógica vive en lib/evolution-capacity.ts porque también la necesita el
 * registro público, donde todavía no hay sesión que comprobar. Aquí solo se le
 * pone la puerta.
 */

export type { EvolutionServerCapacity };

export async function getEvolutionCapacity(): Promise<{
  success: boolean;
  message: string;
  data: EvolutionServerCapacity[];
}> {
  const user = await currentUser();
  if (!user || !isAdminOrReseller(user.role)) {
    return { success: false, message: "No autorizado", data: [] };
  }

  return { success: true, message: "Ocupación obtenida", data: await leerOcupacionServidores() };
}

export async function pickApiKeyWithCapacity(): Promise<{
  success: boolean;
  message: string;
  apiKeyId?: string;
}> {
  const user = await currentUser();
  if (!user || !isAdminOrReseller(user.role)) {
    return { success: false, message: "No autorizado" };
  }

  const elegido = await elegirServidorConCupo();
  if (elegido.apiKeyId) {
    return { success: true, message: `Asignado a ${elegido.url}`, apiKeyId: elegido.apiKeyId };
  }

  return {
    success: false,
    message: `${elegido.motivo} Añade uno nuevo antes de crear más instancias.`,
  };
}

/**
 * ¿Cabe una instancia más en este servidor?
 *
 * Se comprueba en el servidor y no solo en el formulario: el desplegable puede
 * estar viejo, y entre abrirlo y guardar puede haberse llenado.
 */
export async function assertApiKeyHasCapacity(
  apiKeyId: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const apiKey = await db.apiKey.findUnique({
    where: { id: apiKeyId },
    select: { id: true, url: true, key: true },
  });
  if (!apiKey) return { ok: false, message: "El servidor de Evolution elegido no existe." };

  const estado = await contarInstancias(apiKey);

  // Si no se pudo contar no se bloquea: dejar la plataforma sin poder crear
  // instancias porque un servidor no contesta es peor que pasarse de uno.
  if (estado.total === null) return { ok: true };

  if (estado.lleno) {
    return {
      ok: false,
      message: `El servidor ${apiKey.url} ya tiene ${estado.total} instancias (límite ${estado.limite}). Elige otro.`,
    };
  }

  return { ok: true };
}
