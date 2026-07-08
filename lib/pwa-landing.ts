import "server-only";

import { db } from "@/lib/db";
import { getAllModules } from "@/actions/module-actions";
import { isAdmin, isAdminOrReseller } from "@/lib/rbac";

type LandingUser = {
  id: string;
  role: string;
  plan: any; // Plan enum
  ownerId?: string | null;
  trialEndsAt?: Date | null;
};

const CHATS_ROUTE = "/chats";
const normRoute = (p?: string | null) => (p ?? "").replace(/\/+$/, "") || "/";

/**
 * ¿El usuario puede realmente USAR /chats? Replica el gating del layout (root):
 * módulo visible según rol/plan/asignaciones (UserModule) y NO bloqueado por
 * `lockedPlans`. Se usa para decidir el landing de la PWA (ver app/abrir/page.tsx):
 * si puede, abre en Chats; si no, deriva al home.
 */
export async function canAccessChats(user: LandingUser): Promise<boolean> {
  const allModules = (await getAllModules()).data ?? [];
  // Sin módulos cargados no forzamos Chats: mejor derivar al home.
  if (allModules.length === 0) return false;

  const isAdvisor = !!user.ownerId;
  const isActiveTrial = !!user.trialEndsAt && new Date(user.trialEndsAt) > new Date();

  let modules = allModules;
  if (!isAdmin(user.role)) {
    if (user.role === "reseller") {
      // Resellers: por plan y sin adminOnly (igual que el layout).
      modules = allModules.filter(
        (m) => !m.adminOnly && !(m.allowedPlans?.length && !m.allowedPlans.includes(user.plan)),
      );
    } else {
      // Usuarios regulares: primero por asignaciones explícitas UserModule.
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
          // Asesores y prueba activa no se filtran por plan.
          if (!isAdvisor && !isActiveTrial && m.allowedPlans?.length && !m.allowedPlans.includes(user.plan)) return false;
          return true;
        });
      }
    }
  }

  // Coincidencia exacta con el módulo /chats (evita el falso positivo de un
  // módulo base "/" que haría prefijo con cualquier ruta).
  const chatsModule = modules.find((m) => normRoute(m.route) === CHATS_ROUTE);
  if (!chatsModule) return false;

  // Bloqueado por plan (visible pero con pantalla de "actualiza tu plan").
  if (!isAdmin(user.role) && !isAdvisor && !isActiveTrial) {
    if ((chatsModule as any).lockedPlans?.includes(user.plan)) return false;
  }

  return true;
}
