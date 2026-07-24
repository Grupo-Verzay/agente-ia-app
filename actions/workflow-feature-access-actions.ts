"use server";

import { revalidatePath } from "next/cache";
import { Plan } from "@prisma/client";

import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { isAdminOrReseller } from "@/lib/rbac";
import {
  FeatureAccessMap,
  isFeatureLockedForPlan,
  isValidFeatureKey,
} from "@/lib/workflow-features";

/**
 * Acceso por plan de las piezas del creador de flujos.
 * La tabla (workflow_feature_access) la crea el backend; aquí solo se lee y
 * escribe. `allowed_plans` vacío o ausente = disponible para todos los planes.
 */

/** Mapa featureKey -> planes con acceso. */
export async function getWorkflowFeatureAccessMap(): Promise<FeatureAccessMap> {
  try {
    const rows = await db.workflowFeatureAccess.findMany();
    const map: FeatureAccessMap = {};
    for (const r of rows) map[r.featureKey] = r.allowedPlans;
    return map;
  } catch {
    // Si la tabla aún no existe (backend sin desplegar), no bloquear nada.
    return {};
  }
}

/** Guarda la configuración (solo admin/reseller). Reemplaza el acceso de cada función. */
export async function saveWorkflowFeatureAccess(
  input: { featureKey: string; allowedPlans: Plan[] }[],
): Promise<{ ok: boolean; error?: string }> {
  const me = await currentUser();
  if (!me?.id) return { ok: false, error: "No autorizado." };
  if (!isAdminOrReseller(me.role)) {
    return { ok: false, error: "Solo un administrador puede cambiar esto." };
  }

  const clean = input.filter((r) => isValidFeatureKey(r.featureKey));

  await db.$transaction(
    clean.map((r) =>
      db.workflowFeatureAccess.upsert({
        where: { featureKey: r.featureKey },
        update: { allowedPlans: r.allowedPlans },
        create: { featureKey: r.featureKey, allowedPlans: r.allowedPlans },
      }),
    ),
  );

  revalidatePath("/workflow");
  return { ok: true };
}

/**
 * Candado por el servidor: valida que el plan del usuario pueda usar esta pieza.
 * Devuelve un mensaje de error si está bloqueada, o null si está permitida.
 * Admin/reseller nunca se bloquean.
 */
export async function checkWorkflowFeatureAllowed(
  tipo: string,
  user: { role?: string | null; plan?: Plan | null },
): Promise<string | null> {
  if (isAdminOrReseller(user.role)) return null;
  const plan = user.plan;
  if (!plan) return null;
  if (!isValidFeatureKey(tipo)) return null; // tipo desconocido: no bloquear

  const access = await getWorkflowFeatureAccessMap();
  if (isFeatureLockedForPlan(tipo, plan, access)) {
    return "Esta función no está incluida en tu plan. Mejora tu plan para usarla.";
  }
  return null;
}
