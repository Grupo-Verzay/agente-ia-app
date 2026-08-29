import type { Plan } from '@prisma/client';
import { isAdmin, isSuperAdmin } from '@/lib/rbac';
import { resolveModuleItemDest } from '@/lib/canva-embed';

/** Submódulos que solo tienen sentido para un reseller. */
const RESELLER_ONLY_URLS = ['/panel/mis-planes', '/panel/mi-landing'];

export type PanelTab = {
    url: string;
    title: string;
    /** Bloqueado por el plan de la cuenta: se pinta con candado y lleva a /planes. */
    locked?: boolean;
};

type PanelTabSource = {
    url: string;
    title: string;
    customUrl?: string | null;
};

/**
 * ¿A esta cuenta le aplican los bloqueos por plan de los módulos?
 */
export function aplicaBloqueoPorPlan(user: {
    role?: string | null;
    ownerId?: string | null;
    trialEndsAt?: Date | null;
}): boolean {
    // El super admin es el dueño de la plataforma: nada lo limita.
    if (isSuperAdmin(user.role)) return false;

    // Un administrador es del equipo, no un cliente. Las dos excepciones de
    // abajo son de clientes -el asesor hereda del dueño de su cuenta, y la
    // prueba abre todo mientras dura- y aplicarselas dejaba sin efecto lo que
    // se marca en el editor de modulos, que es justo como se le da acceso.
    if (isAdmin(user.role)) return true;

    const esAsesor = !!user.ownerId;
    const enPrueba = !!user.trialEndsAt && new Date(user.trialEndsAt) > new Date();
    return !esAsesor && !enPrueba;
}

/**
 * Pestañas del panel a partir de los submódulos, marcando cuáles quedan
 * bloqueadas por el plan. Lo usan el layout raíz (para las rutas de fuera de
 * /panel) y el layout del propio /panel: si cada uno armara la lista por su
 * cuenta, una pestaña saldría con candado y la otra sin él.
 */
export function buildPanelTabs(
    items: PanelTabSource[],
    opts: {
        plan: Plan;
        bloqueaPorPlan: boolean;
        excluirSoloReseller?: boolean;
        /**
         * Quita las bloqueadas en vez de pintarlas con candado. Para el equipo
         * interno: un administrador no compra plan, así que un candado solo le
         * enseña una puerta que no puede abrir.
         */
        ocultarBloqueadas?: boolean;
    },
): PanelTab[] {
    return items
        .filter((item) =>
            opts.excluirSoloReseller
                ? !RESELLER_ONLY_URLS.includes(item.url.replace('/admin/', '/panel/'))
                : true,
        )
        .map((item) => ({
            url: resolveModuleItemDest(item.url, item.customUrl),
            title: item.title,
            locked:
                opts.bloqueaPorPlan &&
                !!(item as { lockedPlans?: string[] | null }).lockedPlans?.includes(opts.plan),
        }))
        .filter((tab) => !(tab.locked && opts.ocultarBloqueadas));
}
