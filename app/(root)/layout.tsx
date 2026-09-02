import type { Metadata } from "next";
import { cookies } from "next/headers";

import { requireAuth } from "@/lib/require-auth";
import { currentUser } from "@/lib/auth";
import { getResellerProfileForUser } from "@/actions/reseller-action";
import { getSiteConfig } from "@/actions/admin/site-config-actions";
import { getAllModules } from "@/actions/module-actions";
import { isAdmin, isAdminLike, isAdminOrReseller, isSuperAdmin } from "@/lib/rbac";
import { aplicaBloqueoPorPlan, buildPanelTabs } from "@/lib/panel-tabs";
import { aplicarPermisos, parseItemIds } from "@/lib/permisos";
import { esVarianteDePanel, rutasDePanelPara } from "@/lib/sidebar-modules";
import { db } from "@/lib/db";
import { buildBillingServiceAccessState } from "@/actions/billing/helpers/service-access";
import { facturacionQueMandaEn } from "@/actions/billing/helpers/billing-owner";
import type { ThemeApp } from "@prisma/client";

import AppInitializer from "@/components/custom/AppInitializer";
import AppSkeleton from "@/components/custom/AppSkeleton";
import { Breadcrumbs } from "@/components/custom/Breadcrumbs";
import { PanelAwareTabNav } from "@/components/custom/PanelAwareTabNav";
import BillingLockScreen from "@/components/shared/BillingLockScreen";
import { etiquetaDePlanParaCuenta } from "@/lib/plan-pricing";
import { whatsappDeLaMarca } from "@/lib/brand-support.server";
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
import { resolveModuleItemDest } from "@/lib/canva-embed";
import { getClientPanelTabs } from "@/lib/client-panel-tabs";

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

        // PWA con la marca del reseller del usuario logueado: manifest, ícono de
        // Apple e identidad de app se resuelven por ?u=<userId> (ver
        // app/manifest.webmanifest/route.ts y app/api/brand-icon/route.ts).
        return {
            title,
            icons: {
                icon: favicon,
                apple: `/api/brand-icon?size=180&u=${user.id}`,
            },
            manifest: `/manifest.webmanifest?u=${user.id}`,
            appleWebApp: { capable: true, statusBarStyle: "default", title },
        };
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

    // Quien ENTRA a otra cuenta no es quien debe la licencia: es quien la
    // gestiona. Un reseller entrando a un cliente suyo hereda el rol y el
    // estado de ESE cliente, así que el muro de "licencia venció" le cerraba
    // la puerta de todos sus clientes vencidos, que son justo los que necesita
    // abrir para arreglarlos o cobrarles.
    //
    // No abre ninguna puerta nueva: currentUser() solo deja actuar como otra
    // cuenta a quien ya está autorizado -admin, el reseller de ESE cliente, o
    // un colaborador con esa cuenta asignada-. Y el servicio sigue suspendido:
    // la instancia se borró al suspender y el agente no contesta. Lo único que
    // se recupera es poder entrar a mirar y configurar.
    const entrandoAOtraCuenta = !!user && user.sessionUserId !== user.id;

    if (user && !isAdmin(user?.role) && !entrandoAOtraCuenta) {
        // La ficha del DUEÑO cuando quien entra es un asesor: un asesor no
        // tiene servicio propio. Mirando la suya, un equipo entero se quedaba
        // fuera aunque su cuenta madre estuviera pagada al día.
        const { facturacion: billing } = await facturacionQueMandaEn(user.id);
        const access = buildBillingServiceAccessState(billing);

        if (access.isLocked) {
            // El nombre del plan lo pone cada marca, y los dólares son la
            // referencia con la que el cliente vio el precio en la landing:
            // verla al lado del monto en pesos es lo que le confirma que le
            // están cobrando lo que eligió.
            // El reseller dueño de la cuenta no viaja en la sesión, así que se
            // lee aquí: es lo que decide con qué nombre se le llama a su plan.
            const cuenta = await db.user
                .findUnique({ where: { id: user.id }, select: { demoResellerId: true, role: true } })
                .catch(() => null);
            const marcaParaEtiqueta =
                cuenta?.role === 'reseller' ? user.id : cuenta?.demoResellerId ?? null;

            const [planLabel, brandWhatsapp] = await Promise.all([
                etiquetaDePlanParaCuenta(user.plan, marcaParaEtiqueta),
                // El WhatsApp de SU marca: un cliente de un reseller no debe
                // acabar escribiendole a Verzay, que ni lo conoce.
                whatsappDeLaMarca(cuenta?.demoResellerId ?? null),
            ]);

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
                    awaitingFirstPayment={!billing?.lastPaymentAt}
                    canPayOnline={Number(billing?.price ?? 0) > 0}
                    planLabel={planLabel}
                    brandWhatsapp={brandWhatsapp}
                />
            );
        }
    }

    if (!user) return <AppSkeleton />;

    // Todo lo que sigue depende solo de `user`, no unas de otras, y antes se
    // pedía en cascada: cada consulta esperaba a la anterior sin necesitarla, y
    // el layout se ejecuta en TODAS las páginas protegidas. Se piden juntas.
    const [
        onReseller,
        siteConfig,
        allModulesRes,
        navPrefs,
        userIntegrationsResult,
        planLabelSidebar,
        userModuleRecords,
    ] = await Promise.all([
        getResellerProfileForUser(user.id),
        getSiteConfig(),
        getAllModules(),
        (async (): Promise<UserNavPref[]> => {
            try {
                return await db.$queryRaw<UserNavPref[]>`
                    SELECT "moduleId", "displayLabel", "isHidden", "sortOrder"
                    FROM "UserNavPreference"
                    WHERE "userId" = ${user!.id}
                    ORDER BY "sortOrder" ASC
                `;
            } catch {
                // tabla aún no existe — primera vez
                return [];
            }
        })(),
        getUserIntegrations(),
        // Cómo llama SU marca al nivel de plan de la cuenta. Si la cuenta ES un
        // reseller se resuelve con SUS propios planes; si es cliente de un
        // reseller, con los de ese reseller; si es directa, con los de la
        // plataforma. Los datos que decidían eso venían de una consulta aparte
        // a la misma fila del usuario: ahora llegan con `user`.
        etiquetaDePlanParaCuenta(
            user.plan,
            user.role === 'reseller' ? user.id : user.demoResellerId ?? null,
        ).catch(() => null),
        // "Módulos habilitados": la lista que se marca cliente por cliente. Es
        // para CLIENTES. Al equipo interno -admin y super admin- no le aplica:
        // lo que ellos ven se decide por rol y plan en el editor de módulos, y
        // hacerles caso a estas filas escondía módulos que en el editor estaban
        // activos para todos los niveles, sin nada en pantalla que lo explicara.
        (!isAdminLike(user.role) && user.role !== 'reseller')
            ? db.userModule.findMany({ where: { B: user.id }, select: { A: true } })
            : Promise.resolve([] as { A: string }[]),
    ]);

    // Logo abajo: del reseller asignado, o del platform (SiteConfig)
    const resellerImage = onReseller?.data?.image ?? siteConfig.logoUrl ?? null;
    const resellerCompany = onReseller?.data?.company ?? null;

    // Tema fresco de DB: del reseller/super_admin, o del propio user
    let initialTheme: ThemeApp = 'Default';
    if (onReseller?.data?.theme) {
        initialTheme = onReseller.data.theme as ThemeApp;
    } else {
        // El tema ya viaja en `user` (ver USER_SELECT): antes se volvía a pedir
        // la misma fila en cada navegación.
        initialTheme = (user.theme as ThemeApp) ?? 'Default';
    }

    const allModules = allModulesRes.data ?? [];

    if (allModules.length === 0) return <AppSkeleton />;

    // El módulo del panel y el del reseller ya vienen en `allModules`: antes se
    // pedían con dos consultas aparte que devolvían justo lo mismo. Los items se
    // ordenan igual que allí (por fecha de creación).
    const porFechaDeCreacion = <T extends { moduleItems?: { createdAt: Date }[] }>(m: T | undefined) =>
        m
            ? {
                ...m,
                moduleItems: [...(m.moduleItems ?? [])].sort(
                    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
                ),
            }
            : null;

    // Solo el super admin ve TODOS los módulos sin filtrar: es el dueño de la
    // plataforma. Los administradores pasan por el mismo filtro que las demás
    // cuentas (módulos habilitados + planes permitidos), que es justo lo que se
    // configura en el editor de módulos; lo único que no les aplica es
    // "Solo Admin", que precisamente es para ellos.
    // Permisos de la persona que está mirando. Se leen aquí arriba porque uno de
    // ellos —lo concedido— es una excepción a "Solo Admin": sin mirarlo, el
    // módulo se caería antes de llegar a aplicarlos.
    const negados = parseItemIds(user.deniedModuleItems);
    const concedidos = parseItemIds(user.grantedModuleItems);
    // A un agente no le vale el rol de la cuenta en la que entra: al cambiarse a
    // una cuenta vinculada hereda el rol del dueño, y sin esto un agente veía el
    // panel de administración entero.
    const esAgente = !!user.ownerId && user.advisorRole !== 'administrador';
    const mandaLoConcedido = esAgente || !isAdminOrReseller(user.role);
    const tieneConcedidos = (m: { moduleItems?: { id: string }[] | null }) =>
        (m.moduleItems ?? []).some((it) => concedidos.has(it.id));

    let modules = allModules;
    if (!isSuperAdmin(user?.role)) {
        if (user.role === 'reseller') {
            // Resellers: filtrado por plan (igual que usuarios regulares) sin restricción adminOnly
            const userPlan = user.plan;
            modules = allModules.filter(m => {
                if (m.adminOnly) return false;
                if (m.allowedPlans?.length && !m.allowedPlans.includes(userPlan)) return false;
                return true;
            });
        } else {
            if (userModuleRecords.length > 0) {
                const allowedIds = new Set(userModuleRecords.map(r => r.A));
                modules = allModules.filter(m => allowedIds.has(m.id));
            }
            const userPlan = user!.plan;
            // Un agente de una cuenta vinculada hereda el rol del dueño. Sin
            // descontarlo aquí, "Solo Admin" no lo frenaba y veía el panel de
            // administración entero.
            const esAdmin = isAdmin(user?.role) && !esAgente;
            // Mismo criterio que las rutas bloqueadas y que el sidebar: una sola
            // regla decide a quién le aplica el plan.
            const filtraPorPlan = aplicaBloqueoPorPlan(user);
            modules = modules.filter(m => {
                // "Solo Admin" sigue siendo para los administradores, salvo los
                // apartados sueltos que se le hayan concedido a esta persona.
                if (m.adminOnly && !esAdmin && !tieneConcedidos(m)) return false;
                if (filtraPorPlan && m.allowedPlans?.length && !m.allowedPlans.includes(userPlan)) return false;
                return true;
            });
        }
    }

    // Se aplican DESPUÉS del rol y del plan, y sobre `modules`, que es de donde
    // salen el menú, las pestañas del panel y la pantalla de inicio: así no hay
    // que acordarse de filtrarlo en cada sitio.
    //
    // Las rutas tapadas se sacan ANTES de filtrar: después ya no están en
    // `modules`, y sin ellas el que sabe la URL entraba igual.
    //
    // Una misma ruta aparece en varios módulos —"Diagramas" está en los tres
    // paneles, cada uno con su propia fila—, así que se tapa solo la que no le
    // quede abierta por NINGÚN lado: si no, apagarla en el panel del cliente
    // cerraba la que se le acababa de dar en el del equipo.
    modules = aplicarPermisos(modules, {
        denied: negados,
        granted: concedidos,
        mandaLoPermitido: mandaLoConcedido,
    });

    // De los paneles, uno solo: el que le toca. Los otros salen de en medio, que
    // si no sus apartados le abrían pestañas y rutas que nadie le dio —en la
    // pantalla de Permisos ni se listan para poder quitarlos—.
    //
    // Cuál le toca lo dice la CUENTA, no lo primero que se encuentre. Antes se
    // probaba /panel, /admin y /client-panel en ese orden y se quedaba con el
    // primero que estuviera: como el Panel de administración está abierto a
    // todos los planes y no es "Solo Admin", a un cliente final le entraba ese y
    // veía Informes, Clientes, Resellers y Finanzas en vez de su propio panel.
    //
    // A quien trabaja en una cuenta ajena le toca el panel de ESA cuenta: un
    // agente de una cuenta de administración usa el del equipo, aunque su propio
    // rol sea el de un usuario cualquiera.
    const rolDeLaCuenta = user.ownerId
        ? (await db.user
            .findUnique({ where: { id: user.ownerId }, select: { role: true } })
            .catch(() => null))?.role ?? user.role
        : user.role;
    const candidatosDePanel = rutasDePanelPara(rolDeLaCuenta);
    const suPanelId =
        candidatosDePanel
            .map((route) => modules.find((m) => m.route === route))
            .find(Boolean)?.id ?? null;
    const esPanelAjeno = (m: { id: string; route: string }) =>
        esVarianteDePanel(m.route) && m.id !== suPanelId;

    modules = modules.filter((m) => !esPanelAjeno(m));

    // Las rutas tapadas se sacan de TODOS los módulos, no de `modules`: ahí ya
    // no están, y sin ellas el que sabe la URL entraba igual.
    //
    // Una misma ruta aparece en varios módulos —"Diagramas" está en los tres
    // paneles, cada uno con su propia fila—, así que se tapa solo la que no le
    // quede abierta por NINGÚN lado: si no, apagarla en el panel del cliente
    // cerraba la que se le acababa de dar en el del equipo.
    const rutasAbiertas = new Set<string>();
    const rutasCerradas = new Set<string>();
    for (const m of allModules) {
        for (const item of m.moduleItems ?? []) {
            const ruta = item.url.replace('/admin/', '/panel/');
            const laVe =
                esPanelAjeno(m)
                    ? false
                    : mandaLoConcedido && m.adminOnly
                        ? concedidos.has(item.id)
                        : !negados.has(item.id);
            (laVe ? rutasAbiertas : rutasCerradas).add(ruta);
        }
    }
    const rutasNegadas = [...rutasCerradas].filter(ruta => !rutasAbiertas.has(ruta));

    // Las pestañas del panel salen de `modules`, ya filtrado por rol, plan y
    // permisos. Antes salían de `allModules`: una pestaña quitada a la persona
    // seguía apareciendo arriba.
    const panelModule = porFechaDeCreacion(
        modules.find((m) => m.route === "/panel" || m.route === "/admin"),
    );
    const resellerModule =
        user.role === 'reseller'
            ? porFechaDeCreacion(modules.find((m) => m.route === "/reseller-panel"))
            : null;

    // Rutas bloqueadas para el plan actual. Al cliente se le muestran con candado
    // y sin acceso; al equipo interno se le esconden del menú (ver nav-main).
    const isAdvisor = !!user.ownerId;
    const lockedRoutes: string[] = aplicaBloqueoPorPlan(user)
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

    const userIntegrations = userIntegrationsResult.data;
    // Pestañas del panel según rol (misma lógica que panel/layout.tsx). El reseller
    // ve las pestañas de SU panel (/reseller-panel), NO las de super admin
    // (Módulos/Prompt/Resellers/Monitoreo VPS/Plantillas). Sin esto, en rutas fuera
    // de /panel (ej. /dashboard/finance, /crm/dashboard) el reseller veía el tab-nav
    // admin. Admin/super_admin ven el panel admin; otros roles, ninguno.
    const bloqueaPorPlan = aplicaBloqueoPorPlan(user);
    // Los administradores son colaboradores del equipo, no clientes: lo que su
    // plan no alcanza se les esconde, no se les ofrece.
    const ocultarBloqueadas = isAdminLike(user.role);
    // Las pestañas salen del panel que le quedó, no de su rol: a quien se le
    // dieron apartados sueltos del panel del equipo le hacen la misma falta que
    // a un administrador. Sin esto, entraba a un apartado y se quedaba sin barra
    // arriba, sin forma de pasar al siguiente.
    const panelTabs = user.role === 'reseller'
        ? buildPanelTabs(resellerModule?.moduleItems ?? [], { plan: user.plan, bloqueaPorPlan })
        : buildPanelTabs(panelModule?.moduleItems ?? [], {
            plan: user.plan,
            bloqueaPorPlan,
            excluirSoloReseller: true,
            ocultarBloqueadas,
        });
    // El panel del cliente ya se descartó arriba si no era el suyo, así que
    // aquí solo queda cuando de verdad le toca.
    const clientPanelTabs = getClientPanelTabs(modules);

    return (
        <>
            <AppInitializer onReseller={onReseller} modules={modules} user={user} navPrefs={navPrefs} userIntegrations={userIntegrations} initialTheme={initialTheme} />
            <SidebarProvider defaultOpen={defaultOpen}>
                <AppSidebar user={user} resellerImage={resellerImage} resellerCompany={resellerCompany} planLabel={planLabelSidebar} />
                <SidebarInset className="h-screen h-[100dvh] flex flex-col min-w-0 overflow-x-hidden">
                    <Breadcrumbs />
                    <main className={`flex-1 flex flex-col overflow-hidden overflow-x-hidden ${themeClass}`}>
                        <PanelAwareTabNav tabs={panelTabs} excludePanelRoutes />
                        <PanelAwareTabNav tabs={clientPanelTabs} excludePanelRoutes panelRoutes={["/client-panel"]} />
                        <div className="flex-1 min-h-0 flex flex-col overflow-hidden p-0 sm:p-1">
                            <div className="app-module-content flex-1 min-h-0 flex flex-col overflow-y-auto overflow-x-hidden rounded-none border-0 sm:rounded-md sm:border sm:border-border/70">
                                <LockedRouteGuard
                                    lockedRoutes={lockedRoutes}
                                    deniedRoutes={rutasNegadas}
                                    canUpgrade={!isAdminLike(user.role)}
                                >
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
