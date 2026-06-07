import { currentUser } from "@/lib/auth";
import { isAdminLike } from "@/lib/rbac";
import AccessDenied from "@/app/AccessDenied";
import { db } from "@/lib/db";
import { PanelAwareTabNav } from "@/components/custom/PanelAwareTabNav";

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
    const user = await currentUser();
    if (!user) return <AccessDenied />;

    const panelModule = await db.module.findFirst({
        where: { route: { in: ["/panel", "/admin"] } },
        include: { moduleItems: { orderBy: { createdAt: "asc" } } },
    });

    // Admins del sistema siempre tienen acceso.
    // Otros usuarios acceden si el módulo no es adminOnly y su plan está permitido.
    if (!isAdminLike(user.role)) {
        const hasPlanAccess =
            panelModule &&
            !panelModule.adminOnly &&
            (!panelModule.allowedPlans?.length || panelModule.allowedPlans.includes(user.plan));
        if (!hasPlanAccess) return <AccessDenied />;
    }

    const panelTabs = (panelModule?.moduleItems ?? []).map((item) => ({
        url: item.url.replace("/admin/", "/panel/"),
        title: item.title,
    }));

    return (
        <div className="flex h-full min-w-0 w-full flex-col">
            <PanelAwareTabNav tabs={panelTabs} />
            <div className="flex-1 min-h-0 flex flex-col overflow-hidden">{children}</div>
        </div>
    );
}
