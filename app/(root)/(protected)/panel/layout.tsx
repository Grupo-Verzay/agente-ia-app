import { currentUser } from "@/lib/auth";
import { isAdminLike } from "@/lib/rbac";
import AccessDenied from "@/app/AccessDenied";
import { db } from "@/lib/db";
import { PanelAwareTabNav } from "@/components/custom/PanelAwareTabNav";
import { aplicaBloqueoPorPlan, buildPanelTabs } from "@/lib/panel-tabs";
import { apartadosDelPanel } from "@/lib/panel-acceso";

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
    const user = await currentUser();
    if (!user) return <AccessDenied />;

    // Entra quien tenga algún apartado del panel, con la misma cuenta que hace
    // el menú. Antes se exigía rol de admin, y a quien se le habían dado
    // apartados sueltos se le cerraba la puerta antes de mirarlos.
    const acceso = await apartadosDelPanel(user);

    if (!acceso || acceso.items.length === 0) {
        return (
            <AccessDenied
                detalle={`layout · rol ${user.role} · equipo ${user.advisorRole ?? "—"} · apartados 0 · sesión ${user.sessionUserId.slice(0, 8)} · viendo ${user.effectiveId.slice(0, 8)}`}
            />
        );
    }

    const resellerModule =
        user.role === 'reseller'
            ? await db.module.findFirst({
                where: { route: "/reseller-panel" },
                include: { moduleItems: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] } },
            })
            : null;

    const bloqueaPorPlan = aplicaBloqueoPorPlan(user);

    const panelTabs =
        user.role === 'reseller'
            ? buildPanelTabs(resellerModule?.moduleItems ?? [], { plan: user.plan, bloqueaPorPlan })
            : buildPanelTabs(acceso.items, {
                plan: user.plan,
                bloqueaPorPlan,
                excluirSoloReseller: true,
                // Equipo interno: lo que su plan no alcanza no se muestra.
                ocultarBloqueadas: isAdminLike(user.role),
            });

    return (
        <div className="flex h-full min-w-0 w-full flex-col">
            <PanelAwareTabNav tabs={panelTabs} />
            <div className="flex-1 min-h-0 flex flex-col overflow-hidden">{children}</div>
        </div>
    );
}
