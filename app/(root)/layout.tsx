import type { Metadata } from "next";
import { cookies } from "next/headers";

import { requireAuth } from "@/lib/require-auth";
import { currentUser } from "@/lib/auth";
import { getResellerProfileForUser } from "@/actions/reseller-action";
import { getSiteConfig } from "@/actions/admin/site-config-actions";
import { getAllModules } from "@/actions/module-actions";
import { isAdmin, isAdminOrReseller } from "@/lib/rbac";
import { db } from "@/lib/db";
import { buildBillingServiceAccessState } from "@/actions/billing/helpers/service-access";
import type { ThemeApp } from "@prisma/client";

import AppInitializer from "@/components/custom/AppInitializer";
import AppSkeleton from "@/components/custom/AppSkeleton";
import { Breadcrumbs } from "@/components/custom";
import { PanelAwareTabNav } from "@/components/custom/PanelAwareTabNav";
import BillingLockScreen from "@/components/shared/BillingLockScreen";
import { LockedRouteGuard } from "@/components/shared/LockedRouteGuard";

import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";

import { themeClass } from "@/types/generic";
import { ChatWidget } from "./ai-chat/components";
import { ChatOnboardingModal } from "@/components/shared/ChatOnboardingModal";
import { TaskNotificationProvider } from "@/components/providers/TaskNotificationProvider";
import { ChatUnreadProvider } from "@/components/providers/ChatUnreadProvider";
import type { UserNavPref } from "@/types/nav-preference";
import { getUserIntegrations } from "@/actions/user-integration-actions";

// Branding por reseller: favicon y título de pestaña según el reseller del
// usuario logueado (con fallback al favicon global de SiteConfig y luego al
// favicon por defecto de la plataforma).
export async function generateMetadata(): Promise<Metadata> {
    const fallback: Metadata = { title: "Agente IA", icons: { icon: "/favicon.ico" } };
    try {
        const user = await currentUser();
        if (!user) return fallback;

        const [reseller, siteConfig] = await Promise.all([
            getResellerProfileForUser(user.id),
            getSiteConfig(),
        ]);

        const favicon =
            reseller?.data?.faviconUrl?.trim() ||
            siteConfig.faviconUrl?.trim() ||
            "/favicon.ico";

        const brandName = reseller?.data?.brandName?.trim() || siteConfig.brandName?.trim();
        const company = reseller?.data?.company?.trim();
        const title = brandName || (company && company !== "Empresa Demo" ? company : "Agente IA");

        return { title, icons: { icon: favicon } };
    } catch {
        return fallback;
    }
}

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
    const isActiveTrial = !!user?.trialEndsAt && user.trialEndsAt > new Date();

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

    if (!user) return <AppSkeleton />;

    const [onReseller, siteConfig] = await Promise.all([
        getResellerProfileForUser(user.id),
        getSiteConfig(),
    ]);

    // Logo abajo: del reseller asignado, o del platform (SiteConfig)
    const resellerImage = onReseller?.data?.image ?? siteConfig.logoUrl ?? null;
    const resellerCompany = onReseller?.data?.company ?? null;

    // Tema fresco de DB: del reseller/super_admin, o del propio user
    let initialTheme: ThemeApp = 'Default';
    if (onReseller?.data?.theme) {
        initialTheme = onReseller.data.theme as ThemeApp;
    } else {
        const freshUser = await db.user.findUnique({ where: { id: user.id }, select: { theme: true } });
        initialTheme = (freshUser?.theme as ThemeApp) ?? 'Default';
    }

    const allModules = (await getAllModules()).data ?? [];

    if (allModules.length === 0) return <AppSkeleton />;

    let modules = allModules;
    if (!isAdmin(user?.role)) {
        if (user.role === 'reseller') {
            // Resellers: filtrado por plan (igual que usuarios regulares) sin restricción adminOnly
            const userPlan = user.plan;
            modules = allModules.filter(m => {
                if (m.adminOnly) return false;
                if (m.allowedPlans?.length && !m.allowedPlans.includes(userPlan)) return false;
                return true;
            });
        } else {
            const userModuleRecords = await db.userModule.findMany({
                where: { B: user.id },
                select: { A: true },
            });
            if (userModuleRecords.length > 0) {
                const allowedIds = new Set(userModuleRecords.map(r => r.A));
                modules = allModules.filter(m => allowedIds.has(m.id));
            }
            // Para usuarios regulares (no reseller), filtrar por adminOnly y plan
            if (!isAdminOrReseller(user?.role)) {
                const isAdvisor = !!user.ownerId;
                const userPlan = user!.plan;
                modules = modules.filter(m => {
                    if (m.adminOnly) return false;
                    // Asesores y usuarios en prueba activa no se filtran por plan
                    if (!isAdvisor && !isActiveTrial && m.allowedPlans?.length && !m.allowedPlans.includes(userPlan)) return false;
                    return true;
                });
            }
        }
    }

    // Rutas bloqueadas para el plan actual (visibles en sidebar pero sin acceso)
    const isAdvisor = !!user.ownerId;
    const lockedRoutes: string[] = (!isAdmin(user?.role) && !isAdvisor && !isActiveTrial)
        ? [
            ...modules
                .filter(m => (m as any).lockedPlans?.includes(user.plan))
                .map(m => m.route),
            ...modules.flatMap(m =>
                (m.moduleItems ?? [])
                    .filter(item => (item as any).lockedPlans?.includes(user.plan))
                    .map(item => item.url.replace('/admin/', '/panel/'))
            ),
        ]
        : [];

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

    const userIntegrationsResult = await getUserIntegrations();
    const userIntegrations = userIntegrationsResult.data;

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
            <AppInitializer onReseller={onReseller} modules={modules} user={user} navPrefs={navPrefs} userIntegrations={userIntegrations} initialTheme={initialTheme} />
            <SidebarProvider defaultOpen={defaultOpen}>
                <AppSidebar user={user} resellerImage={resellerImage} resellerCompany={resellerCompany} />
                <SidebarInset className="h-screen h-[100dvh] flex flex-col min-w-0 overflow-x-hidden">
                    <Breadcrumbs />
                    <main className={`flex-1 flex flex-col overflow-hidden overflow-x-hidden ${themeClass}`}>
                        <PanelAwareTabNav tabs={panelTabs} excludePanelRoutes />
                        <div className="flex-1 min-h-0 flex flex-col overflow-hidden p-0 sm:p-1">
                            <div className="app-module-content flex-1 min-h-0 flex flex-col overflow-y-auto overflow-x-hidden rounded-none border-0 sm:rounded-md sm:border sm:border-border/70">
                                <LockedRouteGuard lockedRoutes={lockedRoutes}>
                                    {children}
                                </LockedRouteGuard>
                            </div>
                        </div>
                    </main>
                    <ChatWidget />
                    <ChatOnboardingModal />
                    <TaskNotificationProvider />
                    <ChatUnreadProvider />
                </SidebarInset>
            </SidebarProvider>
        </>
    );
}
