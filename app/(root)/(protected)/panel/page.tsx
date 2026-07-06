import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { isAdminLike } from "@/lib/rbac";
import AccessDenied from "@/app/AccessDenied";
import { PanelHome } from "./_components/PanelHome";
import { resolveModuleItemDest } from "@/lib/canva-embed";

export default async function PanelPage() {
    const user = await currentUser();
    if (!user || !isAdminLike(user.role)) return <AccessDenied />;

    const panelModule = await db.module.findFirst({
        where: { route: { in: ["/panel", "/admin"] } },
        include: { moduleItems: { orderBy: { createdAt: "asc" } } },
    });

    const sections = (panelModule?.moduleItems ?? []).map((item) => ({
        url: resolveModuleItemDest(item.url, item.customUrl),
        title: item.title,
    }));

    const adminName = user.company?.trim() || user.name?.trim() || "Administrador";

    return <PanelHome sections={sections} adminName={adminName} />;
}
