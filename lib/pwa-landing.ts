import "server-only";

import { db } from "@/lib/db";
import { getAllModules } from "@/actions/module-actions";
import { getRouteAccess } from "@/utils/access";
import { isAdmin, isAdminOrReseller } from "@/lib/rbac";
import type { ModuleWithItems } from "@/schema/module";

type LandingUser = {
  id: string;
  role: string;
  plan: any; // Plan enum
  ownerId?: string | null;
  trialEndsAt?: Date | null;
};

const normRoute = (p?: string | null) => (p ?? "").replace(/\/+$/, "") || "/";

// Rutas candidatas de aterrizaje, en orden de preferencia. La primera a la que el
// usuario tenga acceso gana; si a ninguna, cae al home (/). Así los usuarios entran
// directo a su pantalla operativa (dashboard del CRM) sin chocar con el gating.
const LANDING_PREFERENCE = ["/crm/dashboard", "/chats"];

/** Módulos visibles para el usuario (mismo gating rol/plan/asignaciones del layout). */
async function getVisibleModules(user: LandingUser): Promise<ModuleWithItems[]> {
  const allModules = (await getAllModules()).data ?? [];
  if (isAdmin(user.role)) return allModules;

  const isAdvisor = !!user.ownerId;
  const isActiveTrial = !!user.trialEndsAt && new Date(user.trialEndsAt) > new Date();

  let modules = allModules;
  if (user.role === "reseller") {
    modules = allModules.filter(
      (m) => !m.adminOnly && !(m.allowedPlans?.length && !m.allowedPlans.includes(user.plan)),
    );
  } else {
    const userModuleRecords = await db.userModule.findMany({
      where: { B: user.id },
      select: { A: true },
    });
    if (userModuleRecords.length > 0) {
      const allowedIds = new Set(userModuleRecords.map((r) => r.A));
      modules = allModules.filter((m) => allowedIds.has(m.id));
    }
    if (!isAdminOrReseller(user.role)) {
      modules = modules.filter((m) => {
        if (m.adminOnly) return false;
        if (!isAdvisor && !isActiveTrial && m.allowedPlans?.length && !m.allowedPlans.includes(user.plan)) return false;
        return true;
      });
    }
  }
  return modules;
}

/** ¿El usuario puede realmente usar una ruta? (módulo visible y no bloqueado por plan). */
function canUseRoute(route: string, modules: ModuleWithItems[], user: LandingUser): boolean {
  const m = getRouteAccess(route, modules);
  if (!m) return false;
  // Evita el falso positivo del módulo base "/" (prefijo de cualquier ruta).
  if (normRoute(m.route) === "/") return false;
  const isAdvisor = !!user.ownerId;
  const isActiveTrial = !!user.trialEndsAt && new Date(user.trialEndsAt) > new Date();
  if (!isAdmin(user.role) && !isAdvisor && !isActiveTrial && (m as any).lockedPlans?.includes(user.plan)) {
    return false;
  }
  return true;
}

/**
 * Ruta de aterrizaje del usuario: la primera de LANDING_PREFERENCE a la que tenga
 * acceso (CRM dashboard → Chats); si a ninguna, el home (/). La usan la ruta de
 * arranque de la PWA (/abrir) y el home web.
 */
export async function resolveLandingRoute(user: LandingUser): Promise<string> {
  const modules = await getVisibleModules(user);
  for (const route of LANDING_PREFERENCE) {
    if (canUseRoute(route, modules, user)) return route;
  }
  return "/";
}
