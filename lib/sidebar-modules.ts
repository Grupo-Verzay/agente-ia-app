import type { User } from '@prisma/client';
import type { ModuleWithItems } from '@/schema/module';
import { canAccessRoute } from '@/utils/access';

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
    user: User,
    modules: ModuleWithItems[],
): ModuleWithItems[] {
    const isAdvisor = !!user.ownerId;
    // Agente = cuenta vinculada SIN rol administrador. Los administradores de una
    // cuenta vinculada tienen los mismos accesos que el dueño de esa cuenta.
    const isAgente = isAdvisor && user.advisorRole !== 'administrador';

    return modules
        .filter((link) => link.showInSidebar)
        .filter((link) => {
            // Gestión (equipo, leads, pipeline): oculta para agentes; visible para
            // la cuenta principal y los administradores de cuenta vinculada.
            if (isAgente && AGENT_HIDDEN_ROUTES.includes(link.route)) return false;
            // /panel/mis-planes solo para resellers
            if (link.route === '/panel/mis-planes' && user.role !== 'reseller') return false;
            // /panel y sub-rutas nunca aparecen en sidebar para resellers (van en tabs superiores)
            if ((PANEL_ROUTES.includes(link.route) || link.route.startsWith('/panel/')) && user.role === 'reseller') return false;
            // El módulo /reseller-panel solo se muestra en sidebar para resellers (no admins)
            if (link.route === '/reseller-panel' && user.role !== 'reseller') return false;
            if (link.route === CLIENT_PANEL_ROUTE && (user.role === 'admin' || user.role === 'super_admin' || user.role === 'reseller')) return false;
            const access = canAccessRoute({
                route: link.route,
                userRole: user.role,
                userPlan: user.plan,
                modules,
                label: link.label,
                isAdvisor,
            });
            if (!access.allowed) return false;
            return true;
        });
}
