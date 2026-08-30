import type { User } from '@prisma/client';
import type { CurrentUser } from '@/lib/auth';
import type { ModuleWithItems } from '@/schema/module';
import { canAccessRoute } from '@/utils/access';
import { isAdminLike } from '@/lib/rbac';
import { parseItemIds } from '@/lib/permisos';

// Rutas de panel administrativo y del panel del cliente. Se mantienen aquí para
// que el sidebar (NavMain) y el personalizador de menú (NavCustomizer) usen
// EXACTAMENTE el mismo criterio de visibilidad y no se desincronicen.
export const PANEL_ROUTES = ['/panel', '/admin'];
export const CLIENT_PANEL_ROUTE = '/client-panel';

// Rutas de gestión ocultas para agentes (cuentas vinculadas sin rol admin).
const AGENT_HIDDEN_ROUTES = ['/equipo', '/sessions', '/crm', '/asesores'];

/**
 * Devuelve los módulos que el usuario realmente puede ver en el sidebar,
 * aplicando visibilidad estructural (showInSidebar) + reglas de rol/plan/acceso.
 *
 * NO aplica las preferencias del usuario (orden/oculto/etiqueta): eso lo hace
 * cada consumidor. Es la ÚNICA fuente de verdad de "qué módulos existen para
 * esta cuenta", compartida entre el sidebar y el personalizador de menú para
 * evitar duplicados y órdenes inconsistentes.
 */
export function getVisibleSidebarModules(
    user: CurrentUser,
    modules: ModuleWithItems[],
): ModuleWithItems[] {
    const isAdvisor = !!user.ownerId;
    // Agente = cuenta vinculada SIN rol administrador. Los administradores de una
    // cuenta vinculada tienen los mismos accesos que el dueño de esa cuenta.
    const isAgente = isAdvisor && user.advisorRole !== 'administrador';
    const concedidos = parseItemIds(user.grantedModuleItems);

    // El "Panel" existe en variantes: /panel y /admin (el del equipo),
    // /reseller-panel y /client-panel. Todas se llaman "Panel", y puede haber
    // más de una fila para la misma. En el sidebar va UNA: la que corresponde
    // al rol. Sin esto salían dos entradas "Panel", una encima de la otra.
    const rutasDelPanelDelRol =
        user.role === 'reseller'
            ? ['/reseller-panel']
            : isAdminLike(user.role)
                ? PANEL_ROUTES
                : [CLIENT_PANEL_ROUTE];
    const panelDelRol = modules.find(
        (m) => m.showInSidebar && rutasDelPanelDelRol.includes(m.route),
    );
    const esVarianteDePanel = (route: string) =>
        PANEL_ROUTES.includes(route) || route === '/reseller-panel' || route === CLIENT_PANEL_ROUTE;

    return modules
        .filter((link) => link.showInSidebar)
        .filter((link) => {
            // Gestión (equipo, leads, pipeline): oculta para agentes; visible para
            // la cuenta principal y los administradores de cuenta vinculada.
            if (isAgente && AGENT_HIDDEN_ROUTES.includes(link.route)) return false;
            // /panel/mis-planes solo para resellers
            if (link.route === '/panel/mis-planes' && user.role !== 'reseller') return false;
            // Las sub-rutas de /panel no van en el sidebar del reseller: las tiene
            // arriba, en las pestañas de su panel.
            if (link.route.startsWith('/panel/') && user.role === 'reseller') return false;
            // Un solo Panel, el del rol.
            if (esVarianteDePanel(link.route) && link.id !== panelDelRol?.id) return false;
            const access = canAccessRoute({
                route: link.route,
                userRole: user.role,
                userPlan: user.plan,
                modules,
                label: link.label,
                isAdvisor,
                // Los apartados que llegan aquí ya vienen filtrados por permisos
                // (ver el layout): si un módulo "Solo Admin" conserva alguno, es
                // porque a esta persona se le concedió.
                tieneConcedidos: concedidos.size > 0 && (link.moduleItems ?? []).some((it) => concedidos.has(it.id)),
            });
            if (!access.allowed) return false;
            return true;
        });
}
