import { currentUser } from "@/lib/auth";
import { isAdminLike } from "@/lib/rbac";
import AccessDenied from "@/app/AccessDenied";
import { db } from "@/lib/db";
import { PanelAwareTabNav } from "@/components/custom/PanelAwareTabNav";

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
    const user = await currentUser();
    if (!user || !isAdminLike(user.role)) return <AccessDenied />;

    const panelModule = await db.module.findFirst({
        where: { route: { in: ["/panel", "/admin"] } },
        include: { moduleItems: { orderBy: { createdAt: "asc" } } },
    });
    const panelTabs = (panelModule?.moduleItems ?? []).map((item) => ({
        url: item.url.replace("/admin/", "/panel/"),
        title: item.title,
    }));

    return (
        <div className="flex h-full min-w-0 flex-col gap-2">
            <PanelAwareTabNav tabs={panelTabs} />
            {children}
        </div>
    );
}
