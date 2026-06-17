import { currentUser } from "@/lib/auth";
import { isAdminOrReseller } from "@/lib/rbac";
import AccessDenied from "@/app/AccessDenied";
import { db } from "@/lib/db";
import { PanelAwareTabNav } from "@/components/custom/PanelAwareTabNav";

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

    const RESELLER_ONLY_URLS = ['/panel/mis-planes', '/panel/mi-landing'];
    const allTabs = (panelModule?.moduleItems ?? [])
        .filter((item) => !RESELLER_ONLY_URLS.includes(item.url.replace("/admin/", "/panel/")))
        .map((item) => ({
            url: item.url.replace("/admin/", "/panel/"),
            title: item.title,
        }));

    const resellerExtraTabs = (resellerModule?.moduleItems ?? []).map((item) => ({
        url: item.url.replace("/admin/", "/panel/"),
        title: item.title,
    }));

    const FORMULARIOS_TAB = { url: '/mis-formularios', title: 'Formularios' };

    const panelTabs =
        user.role === 'reseller'
            ? [...resellerExtraTabs, FORMULARIOS_TAB]
            : [...allTabs, { url: '/panel/analytics', title: 'Analytics' }, FORMULARIOS_TAB];

    return (
        <div className="flex h-full min-w-0 w-full flex-col">
            <PanelAwareTabNav tabs={panelTabs} />
            <div className="flex-1 min-h-0 flex flex-col overflow-hidden">{children}</div>
        </div>
    );
}
