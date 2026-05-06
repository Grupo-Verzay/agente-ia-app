import { cookies } from "next/headers";

import { requireAuth } from "@/lib/require-auth";
import { currentUser } from "@/lib/auth";
import { getResellerProfileForUser } from "@/actions/reseller-action";
import { getAllModules } from "@/actions/module-actions";
import { isAdmin, isAdminOrReseller } from "@/lib/rbac";
import { db } from "@/lib/db";
import { buildBillingServiceAccessState } from "@/actions/billing/helpers/service-access";

import AppInitializer from "@/components/custom/AppInitializer";
import AppSkeleton from "@/components/custom/AppSkeleton";
import { Breadcrumbs } from "@/components/custom";
import { PanelAwareTabNav } from "@/components/custom/PanelAwareTabNav";
import BillingLockScreen from "@/components/shared/BillingLockScreen";

import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";

import { themeClass } from "@/types/generic";
import { ChatWidget } from "./ai-chat/components";
import { ChatOnboardingModal } from "@/components/shared/ChatOnboardingModal";
import type { UserNavPref } from "@/types/nav-preference";

export default async function RootGroupLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    await requireAuth();

    const user = await currentUser();
    const cookieStore = await cookies();
    const defaultOpen = cookieStore.get("sidebar_state")?.value === "true";
    const privilegedUser = isAdminOrReseller(user?.role);

    if (user && !isAdmin(user?.role)) {
        const billing = await db.userBilling.findUnique({
            where: { userId: user.id },
        });
        const access = buildBillingServiceAccessState(billing);

        if (access.isLocked) {
            const reasonLabel =
                access.reason === "SUSPENDED_STATUS"
                    ? "Servicio suspendido"
                    : access.reason === "OVERDUE_BEYOND_GRACE"
                        ? "Vencido y fuera de gracia"
                        : "Bloqueado por facturación";

            return (
                <BillingLockScreen
                    clientName={user.name || user.company || user.email || "Cliente"}
                    company={user.company}
                    amountDue={access.amountDue}
                    currencyCode={access.currencyCode}
                    dueDateIso={access.dueDateIso}
                    paymentMethodLabel={access.paymentMethodLabel}
                    paymentNotes={access.paymentNotes}
                    paymentUrl={access.paymentUrl}
                    reasonLabel={reasonLabel}
                />
            );
        }
    }

    const onReseller = await getResellerProfileForUser(user!.id);
    const allModules = (await getAllModules()).data ?? [];

    const loading = !user || allModules.length === 0;
    if (loading) return <AppSkeleton />;

    let modules = allModules;
    if (!isAdmin(user?.role)) {
        const userModuleRecords = await db.userModule.findMany({
            where: { B: user!.id },
            select: { A: true },
        });
        if (userModuleRecords.length > 0) {
            const allowedIds = new Set(userModuleRecords.map(r => r.A));
            modules = allModules.filter(m => allowedIds.has(m.id));
        }
    }

    let navPrefs: UserNavPref[] = [];
    try {
        navPrefs = await db.$queryRaw<UserNavPref[]>`
            SELECT "moduleId", "displayLabel", "isHidden", "sortOrder"
            FROM "UserNavPreference"
            WHERE "userId" = ${user!.id}
            ORDER BY "sortOrder" ASC
        `;
    } catch {
        // tabla aún no existe — primera vez
    }

    const panelModule = await db.module.findFirst({
        where: { route: { in: ["/panel", "/admin"] } },
        include: { moduleItems: { orderBy: { createdAt: "asc" } } },
    });
    const panelTabs = (panelModule?.moduleItems ?? []).map((item) => ({
        url: item.url.replace("/admin/", "/panel/"),
        title: item.title,
    }));

    return (
        <>
            <AppInitializer onReseller={onReseller} modules={modules} user={user} navPrefs={navPrefs} />
            <SidebarProvider defaultOpen={defaultOpen}>
                <AppSidebar user={user} />
                <SidebarInset className="h-screen flex flex-col min-w-0 overflow-x-hidden">
                    <Breadcrumbs />
                    <main className={`flex-1 overflow-y-auto overflow-x-hidden p-4 ${themeClass}`}>
                        <PanelAwareTabNav tabs={panelTabs} excludePanelRoutes />
                        {children}
                    </main>
                    <ChatWidget />
                    <ChatOnboardingModal />
                </SidebarInset>
            </SidebarProvider>
        </>
    );
}
