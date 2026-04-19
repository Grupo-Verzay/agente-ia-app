// utils/access.ts
import { Plan } from '@prisma/client';
import type { ModuleWithItems } from '@/schema/module';

function normalizePath(p?: string | null) {
  const s = (p ?? '').trim();
  return s.replace(/\/+$/, '') || '/';
}

/** Getters tolerantes al shape de los items */
function getItemLabel(it: any): string {
  return (it?.label ?? it?.title ?? '').toString().trim();
}
function getItemRoute(it: any): string {
  return normalizePath(it?.route ?? it?.url ?? '');
}

/**
 * Devuelve el módulo que corresponde a la ruta.
 * Si hay varios con la misma base, prioriza:
 * 1) label del módulo (si se pasó)
 * 2) label/title de un item del módulo (si se pasó)
 * 3) item con ruta/url exacta (cuando comparten base)
 * 4) módulo con ruta base más específica (prefijo más largo)
 */
export function getRouteAccess(
  route: string,
  modules: ModuleWithItems[],
  opts?: { label?: string }
) {
  const target = normalizePath(route);
  const label = opts?.label?.trim();

  const candidates = modules.filter(m => target.startsWith(normalizePath(m.route)));
  if (candidates.length === 0) return undefined;

  const bySpecificity = [...candidates].sort(
    (a, b) => normalizePath(b.route).length - normalizePath(a.route).length
  );

  if (!label) return bySpecificity[0];

  // 1) label exacto del módulo
  const byModuleLabel = bySpecificity.find(m => m.label.trim() === label);
  if (byModuleLabel) return byModuleLabel;

  // 2) label/title exacto en algún item del módulo
  const byItemLabel = bySpecificity.find(m =>
    (m.moduleItems ?? []).some(it => getItemLabel(it) === label)
  );
  if (byItemLabel) return byItemLabel;

  // 3) ruta/url exacta en algún item del módulo
  const byItemExactRoute = bySpecificity.find(m =>
    (m.moduleItems ?? []).some(it => getItemRoute(it) === target)
  );
  if (byItemExactRoute) return byItemExactRoute;

  // 4) fallback: el más específico por prefijo
  return bySpecificity[0];
}

/**
 * Control de acceso por rol/plan + módulo.
 * Acepta `label` para desambiguar módulos con rutas iguales.
 */
export function canAccessRoute({
  route,
  userRole,
  userPlan,
  modules,
  label, // opcional: desambiguación
}: {
  route: string;
  userRole: string; // 'user' | 'admin' | 'super_admin' | 'reseller'
  userPlan: Plan;
  modules: ModuleWithItems[];
  label: string;
}) {
  const isAdminLike = userRole === 'admin' || userRole === 'super_admin' || userRole === 'reseller';

  const link = getRouteAccess(route, modules, { label });
  if (!link) return { allowed: true as const };

  if (link.adminOnly && !isAdminLike) {
    return { allowed: false as const, reason: 'Only admin' as const };
  }

  if (link.allowedPlans?.length && !link.allowedPlans.includes(userPlan)) {
    return { allowed: false as const, reason: 'Invalid plan' as const };
  }

  return { allowed: true as const };
}
