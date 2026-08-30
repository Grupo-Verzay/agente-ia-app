import { currentUser } from "@/lib/auth";
import { isAdminLike, isAdminOrReseller } from "@/lib/rbac";
import AccessDenied from "@/app/AccessDenied";
import { db } from "@/lib/db";
import { PanelAwareTabNav } from "@/components/custom/PanelAwareTabNav";
import { aplicaBloqueoPorPlan, buildPanelTabs } from "@/lib/panel-tabs";
import { parseItemIds } from "@/lib/permisos";

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
    const user = await currentUser();
    // Quien tiene apartados concedidos entra aunque su rol no sea de admin: lo
    // que puede abrir dentro lo decide el guardián de rutas del layout raíz, que
    // tapa uno por uno los que no se le dieron.
    const conConcedidos = parseItemIds(user?.grantedModuleItems).size > 0;
    if (!user || (!isAdminOrReseller(user.role) && !conConcedidos)) {
        return (
            <AccessDenied
                detalle={`layout · rol ${user?.role ?? "?"} · equipo ${user?.advisorRole ?? "—"} · concedidos ${parseItemIds(user?.grantedModuleItems).size} · sesión ${user?.sessionUserId?.slice(0, 8) ?? "?"} · viendo ${user?.effectiveId?.slice(0, 8) ?? "?"}`}
            />
        );
    }

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

    // Las pestañas de aquí se leen de la base directamente, así que hay que
    // aplicarles los permisos de la persona igual que hace el layout raíz.
    // El panel es "Solo Admin", de modo que a quien no entra por rol le manda
    // lo concedido; a los demás, lo quitado.
    const esAgente = !!user.ownerId && user.advisorRole !== 'administrador';
    const mandaLoConcedido = esAgente || !isAdminOrReseller(user.role);
    const concedidos = parseItemIds(user.grantedModuleItems);
    const negados = parseItemIds(user.deniedModuleItems);
    const conPermisos = <T extends { id: string }>(items: T[]) =>
        items.filter((it) => (mandaLoConcedido ? concedidos.has(it.id) : !negados.has(it.id)));

    const panelTabs =
        user.role === 'reseller'
            ? buildPanelTabs(resellerModule?.moduleItems ?? [], { plan: user.plan, bloqueaPorPlan })
            : buildPanelTabs(conPermisos(panelModule?.moduleItems ?? []), {
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
