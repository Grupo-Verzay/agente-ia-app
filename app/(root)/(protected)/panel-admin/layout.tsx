import { currentUser } from "@/lib/auth";
import { isAdminLike } from "@/lib/rbac";
import AccessDenied from "@/app/AccessDenied";
import { PanelAwareTabNav } from "@/components/custom/PanelAwareTabNav";
import { aplicaBloqueoPorPlan, buildPanelTabs } from "@/lib/panel-tabs";
import { apartadosDelPanel } from "@/lib/panel-acceso";

/**
 * La barra de pestañas del panel del administrador.
 *
 * Cada variante de panel pone la suya en su propio layout, y el layout raíz
 * solo la pinta en los SUBMÓDULOS (`excludePanelRoutes`). Sin este archivo,
 * /panel-admin era la única que se quedaba sin barra arriba: el de la raíz no
 * la pinta porque su `panelRoutes` por defecto es ["/panel"], y aquí no había
 * nadie que lo hiciera.
 *
 * `panelRoutes` tiene que decir /panel-admin: es lo que le dice a la barra que
 * esta ruta es la raíz de un panel y no un submódulo suelto.
 *
 * No hay rama de reseller como en /panel: un reseller nunca llega aquí, su
 * panel es otro.
 */
export default async function PanelAdminLayout({ children }: { children: React.ReactNode }) {
    const user = await currentUser();
    if (!user) return <AccessDenied />;

    const acceso = await apartadosDelPanel(user);

    if (!acceso || acceso.items.length === 0) {
        return (
            <AccessDenied
                detalle={`layout admin · rol ${user.role} · equipo ${user.advisorRole ?? "—"} · apartados 0 · sesión ${user.sessionUserId.slice(0, 8)} · viendo ${user.effectiveId.slice(0, 8)}`}
            />
        );
    }

    const panelTabs = buildPanelTabs(acceso.items, {
        plan: user.plan,
        bloqueaPorPlan: aplicaBloqueoPorPlan(user),
        excluirSoloReseller: true,
        // Equipo interno: lo que su plan no alcanza no se muestra.
        ocultarBloqueadas: isAdminLike(user.role),
    });

    return (
        <div className="flex h-full min-w-0 w-full flex-col">
            <PanelAwareTabNav tabs={panelTabs} panelRoutes={["/panel-admin"]} />
            <div className="flex-1 min-h-0 flex flex-col overflow-hidden">{children}</div>
        </div>
    );
}
