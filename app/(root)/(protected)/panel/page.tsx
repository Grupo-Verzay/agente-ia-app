import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { isAdminLike, isAdminOrReseller } from "@/lib/rbac";
import AccessDenied from "@/app/AccessDenied";
import { PanelHome } from "./_components/PanelHome";
import { resolveModuleItemDest } from "@/lib/canva-embed";
import { parseItemIds } from "@/lib/permisos";

export default async function PanelPage() {
    const user = await currentUser();
    if (!user) return <AccessDenied />;

    // El panel es "Solo Admin", pero a una persona del equipo se le pueden
    // conceder apartados sueltos de aquí dentro: entonces entra, y ve esos.
    const concedidos = parseItemIds(user.grantedModuleItems);
    const negados = parseItemIds(user.deniedModuleItems);
    const esAgente = !!user.ownerId && user.advisorRole !== "administrador";
    const mandaLoConcedido = esAgente || !isAdminOrReseller(user.role);

    if (!isAdminLike(user.role) && concedidos.size === 0) {
        return (
            <AccessDenied
                detalle={`portada · rol ${user.role} · equipo ${user.advisorRole ?? "—"} · concedidos 0 · sesión ${user.sessionUserId.slice(0, 8)} · viendo ${user.effectiveId.slice(0, 8)}`}
            />
        );
    }

    const panelModule = await db.module.findFirst({
        where: { route: { in: ["/panel", "/admin"] } },
        include: { moduleItems: { orderBy: { createdAt: "asc" } } },
    });

    const sections = (panelModule?.moduleItems ?? [])
        .filter((item) => (mandaLoConcedido ? concedidos.has(item.id) : !negados.has(item.id)))
        .map((item) => ({
            url: resolveModuleItemDest(item.url, item.customUrl),
            title: item.title,
        }));

    const adminName = user.company?.trim() || user.name?.trim() || "Administrador";

    return <PanelHome sections={sections} adminName={adminName} />;
}
