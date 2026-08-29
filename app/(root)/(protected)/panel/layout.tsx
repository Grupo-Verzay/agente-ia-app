import { currentUser } from "@/lib/auth";
import { isAdminLike, isAdminOrReseller } from "@/lib/rbac";
import AccessDenied from "@/app/AccessDenied";
import { db } from "@/lib/db";
import { PanelAwareTabNav } from "@/components/custom/PanelAwareTabNav";
import { aplicaBloqueoPorPlan, buildPanelTabs } from "@/lib/panel-tabs";

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
    const user = await currentUser();
    if (!user || !isAdminOrReseller(user.role)) return <AccessDenied />;

    const [panelModule, resellerModule] = await Promise.all([
        db.module.findFirst({
            where: { route: { in: ["/panel", "/admin"] } },
            include: { moduleItems: { orderBy: { createdAt: "asc" } } },
        }),
        user.role === 'reseller'
            ? db.module.findFirst({
                where: { route: "/reseller-panel" },
                include: { moduleItems: { orderBy: { createdAt: "asc" } } },
              })
            : Promise.resolve(null),
    ]);

    const bloqueaPorPlan = aplicaBloqueoPorPlan(user);
    const panelTabs =
        user.role === 'reseller'
            ? buildPanelTabs(resellerModule?.moduleItems ?? [], { plan: user.plan, bloqueaPorPlan })
            : buildPanelTabs(panelModule?.moduleItems ?? [], {
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
