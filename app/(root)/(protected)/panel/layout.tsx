import { currentUser } from "@/lib/auth";
import { isAdminOrReseller } from "@/lib/rbac";
import AccessDenied from "@/app/AccessDenied";
import { db } from "@/lib/db";
import { PanelAwareTabNav } from "@/components/custom/PanelAwareTabNav";

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
    const user = await currentUser();
    if (!user || !isAdminOrReseller(user.role)) return <AccessDenied />;

    const panelModule = await db.module.findFirst({
        where: { route: { in: ["/panel", "/admin"] } },
        include: { moduleItems: { orderBy: { createdAt: "asc" } } },
    });
    const allTabs = (panelModule?.moduleItems ?? []).map((item) => ({
        url: item.url.replace("/admin/", "/panel/"),
        title: item.title,
    }));

    const RESELLER_ALLOWED_TABS = ['/panel/clientes', '/panel/client-billing'];
    const panelTabs = user.role === 'reseller'
        ? allTabs.filter(tab => RESELLER_ALLOWED_TABS.includes(tab.url))
        : allTabs;

    return (
        <div className="flex h-full min-w-0 w-full flex-col">
            <PanelAwareTabNav tabs={panelTabs} />
            <div className="flex-1 min-h-0 flex flex-col overflow-hidden">{children}</div>
        </div>
    );
}
