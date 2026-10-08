'use client';

import { useState, useEffect } from 'react';
import type { CurrentUser } from '@/lib/auth';
import { usePathname, useRouter } from 'next/navigation';
import { ChevronDown, ChevronRight, Lock } from 'lucide-react';
import { usePendientesDelMenu } from '@/hooks/usePendientesDelMenu';
import { CLASE_DEL_CONTADOR, elTextoDelContador, type ConteosDelMenu } from '@/lib/pendientes-del-menu';

import { PremiumModule } from './shared/PremiumModule';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

import {
    SidebarGroup,
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuBadge,
    SidebarMenuItem,
    SidebarMenuSub,
    SidebarMenuSubItem,
    SidebarMenuSubButton,
    useSidebar,
} from '@/components/ui/sidebar';

import { User } from '@prisma/client';
import clsx from 'clsx';
import { iconMap } from '@/schema/module';
import { useModuleStore } from '@/stores/modules/useModuleStore';
import { resolveModuleItemDest } from '@/lib/canva-embed';
import { laUrlQueSeAbre } from '@/lib/integraciones';
import { Settings2 } from 'lucide-react';
import { getVisibleSidebarModules, PANEL_ROUTES, CLIENT_PANEL_ROUTE, ADMIN_PANEL_ROUTE, esVarianteDePanel } from '@/lib/sidebar-modules';
import { aplicaBloqueoPorPlan } from '@/lib/panel-tabs';
import { isAdminLike } from '@/lib/rbac';
import { LOS_PRECIOS_DE_LA_LANDING } from "@/lib/pantalla-de-verzy";

export function NavMain({ user }: { user: CurrentUser }) {
    const { modules, navPrefs, setLabelModule, labelModule, setCanvaUrl, canvaUrl, userIntegrations } = useModuleStore();
    const pathname = usePathname();
    const router = useRouter();
    const { isMobile, openMobile, setOpenMobile, state: sidebarState } = useSidebar();

    const isAdvisor = !!user.ownerId;
    // Mismo criterio que el guardián de rutas del layout: sin esto el sidebar
    // pinta candados sobre rutas a las que la cuenta sí entra.
    const bloqueaPorPlan = aplicaBloqueoPorPlan(user);
    // Los administradores son del equipo, no clientes: no compran plan, así que
    // el candado no los manda a la pantalla de planes.
    const puedeMejorarPlan = !isAdminLike(user.role);

    const [openModuleId, setOpenModuleId] = useState<string | null>(null);
    useEffect(() => { setOpenModuleId(null); }, [pathname]);

    /* Aplica preferencias del usuario (displayLabel, isHidden, sortOrder).
       La visibilidad (rol/plan/acceso) se resuelve en un helper compartido con el
       personalizador de menú para que ambos usen exactamente los mismos módulos. */
    const navItems = getVisibleSidebarModules(user, modules)
        .map(link => {
            // El orden y el nombre son SIEMPRE del sistema; del usuario solo se
            // respeta la visibilidad (ocultar/mostrar). No hay reordenamiento.
            const pref = navPrefs.find(p => p.moduleId === link.id);
            const isHidden = pref?.isHidden ?? false;
            const displayLabel = link.label;
            const sortOrder = link.order;

            let isActive = false;
            if (pathname === '/canva') {
                isActive = labelModule === link.label;
            } else if (link.route === '/reseller-panel' || link.route === CLIENT_PANEL_ROUTE) {
                isActive = (link.moduleItems ?? []).some(sub => {
                    const dest = (sub.url ?? '').replace('/admin/', '/panel/');
                    return dest && (pathname === dest || pathname.startsWith(dest + '/'));
                }) || pathname === link.route || pathname.startsWith(link.route + '/');
            } else {
                isActive = pathname === link.route || pathname.startsWith(link.route + '/');
            }

            const isLocked = bloqueaPorPlan && (link as any).lockedPlans?.includes(user.plan);
            return { ...link, isActive, isHidden, displayLabel, sortOrder, isLocked };
        })
        // Al equipo interno no se le pintan candados: lo que su plan no alcanza
        // desaparece del menú, igual que las pestañas del panel.
        .filter(link => !link.isHidden && !(link.isLocked && !puedeMejorarPlan))
        .sort((a, b) => a.sortOrder - b.sortOrder);

    // El numerito de pendientes va por la RUTA de cada apartado, esté suelto o
    // dentro de un módulo: da igual cómo se agrupen, donde esté lleva su número.
    const conteos = usePendientesDelMenu(
        navItems.flatMap((m) => [m.route, ...(m.moduleItems ?? []).map((sub) => sub.url ?? null)]),
    );

    const handleRoute = (label: string, targetRoute: string, customUrl?: string | null, isLocked?: boolean) => {
        if (isLocked) {
            if (puedeMejorarPlan) router.push(LOS_PRECIOS_DE_LA_LANDING);
            if (isMobile) setOpenMobile(false);
            return;
        }
        setLabelModule(label)
        // Mantener el store por compatibilidad, pero la URL a embeber viaja en el
        // query param (?u=) para que /canva sea stateless (sobrevive recargas y
        // navegación por pestañas).
        if (targetRoute === '/canva' && customUrl) setCanvaUrl(customUrl)
        if (isMobile) setOpenMobile(false)
        router.push(resolveModuleItemDest(targetRoute, customUrl))
    }
    const itemTextClass = isMobile ? 'text-base' : 'text-sm';
    const itemIconClass = isMobile ? 'h-6' : 'h-5';

    return (
        <SidebarGroup>
            {/* <SidebarGroupLabel>Módulos</SidebarGroupLabel> */}
            <SidebarMenu>
                {navItems.map((item) => {
                    const { id, route, icon, label, displayLabel, requiresPremium, isActive, moduleItems, isLocked } = item as typeof item & { isLocked?: boolean };
                    const Icon = iconMap[icon as keyof typeof iconMap];
                    const linkClasses = clsx(
                        `flex items-center py-2 rounded-md ${itemTextClass} font-medium transition`,
                        isActive
                            ? 'bg-gradient-to-r from-blue-500 to-blue-700 text-white'
                            : 'text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                    );

                    const iconClasses = clsx(
                        itemIconClass,
                        isActive && 'invert brightness-200'
                    );

                    const validateRouteAndRole = user.role === 'reseller' && PANEL_ROUTES.includes(route);
                    const targetRoute = validateRouteAndRole ? '/admin/clientes' : route;

                    // Si NO hay subitems, renderizar directamente como link
                    if (!moduleItems || moduleItems.length === 0) {
                        return (
                            <SidebarMenuItem key={id}>
                                <SidebarMenuButton className={linkClasses} tooltip={displayLabel} onClick={() => handleRoute(label, targetRoute, item.customUrl, isLocked)}>
                                    {Icon && <Icon className={iconClasses} />}
                                    <span>{displayLabel}</span>
                                    <ChevronRight className="invisible ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                                    {route === '/profile' && <ChevronRight />}
                                    {isLocked
                                        ? <Lock className="ml-auto h-3.5 w-3.5 text-orange-400" />
                                        : requiresPremium && <PremiumModule />}
                                </SidebarMenuButton>
                                <ContadorSuelto ruta={route} conteos={conteos} />

                            </SidebarMenuItem>
                        );
                    }

                    // Admin/Panel y reseller-panel: submódulos van a la barra superior — navegar al primero
                    // Resellers (panel admin) van directo a /admin/clientes sin importar los sub-items
                    if (esVarianteDePanel(route)) {
                        const firstSubItem = moduleItems[0];
                        // El panel tiene su propia portada con los apartados que
                        // la persona puede abrir; entrar directo al primero
                        // dejaba fuera esa vista, y a quien solo tiene dos
                        // concedidos le caia en uno sin saber que habia otro.
                        // /reseller-panel no tiene portada: ahi se sigue entrando
                        // al primer apartado.
                        const tienePortada =
                            PANEL_ROUTES.includes(route) ||
                            route === ADMIN_PANEL_ROUTE ||
                            route === CLIENT_PANEL_ROUTE;
                        const firstDest = validateRouteAndRole
                            ? targetRoute
                            : tienePortada
                                ? targetRoute
                                : firstSubItem?.url?.replace('/admin/', '/panel/') ?? targetRoute;
                        return (
                            <SidebarMenuItem key={id}>
                                <SidebarMenuButton className={linkClasses} tooltip={displayLabel} onClick={() => handleRoute(label, firstDest, firstSubItem?.customUrl ?? item.customUrl, isLocked)}>
                                    {Icon && <Icon className={iconClasses} />}
                                    <span>{displayLabel}</span>
                                    <ChevronRight className="invisible ml-auto" />
                                    {isLocked
                                        ? <Lock className="ml-auto h-3.5 w-3.5 text-orange-400" />
                                        : requiresPremium && <PremiumModule />}
                                </SidebarMenuButton>
                            </SidebarMenuItem>
                        );
                    }

                    // Cualquier otro módulo con submódulos: desplegable en el sidebar
                    const isAnySubActive = moduleItems.some(subItem => {
                        const dest = subItem.url?.replace('/admin/', '/panel/') ?? '';
                        return pathname === dest || pathname.startsWith(dest + '/');
                    });
                    const parentClasses = clsx(
                        `flex items-center py-2 rounded-md ${itemTextClass} font-medium transition`,
                        isAnySubActive
                            ? 'bg-gradient-to-r from-blue-500 to-blue-700 text-white'
                            : 'text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                    );
                    const parentIconClasses = clsx(
                        itemIconClass,
                        isAnySubActive ? 'invert brightness-200' : ''
                    );

                    // Módulo especial: integraciones dinámicas del usuario
                    if (route === '#user-integrations') {
                        const subItems = [
                            // La dirección que se abre pasa por la misma regla que al
                            // guardar: una app vieja sin «https://» se abre bien.
                            ...userIntegrations.map(intg => ({ id: intg.id, title: intg.name, dest: '/canva', url: laUrlQueSeAbre(intg.url) ?? intg.url })),
                            { id: '__manage__', title: 'Gestionar integraciones', dest: '/integraciones', url: null },
                        ];
                        const isAnyIntgActive = pathname === '/integraciones' || (labelModule === label && pathname === '/canva' && userIntegrations.length > 0);

                        // En `/canva` hay UNA app abierta: la que se pulsó. Comparar
                        // solo la ruta encendía todas las apps del menú a la vez.
                        const renderSubItems = () => subItems.map((sub) => {
                            const isSubActive = sub.dest === '/canva'
                                ? pathname === '/canva' && labelModule === label && canvaUrl === sub.url
                                : pathname === sub.dest;
                            return (
                                <SidebarMenuSubItem key={sub.id}>
                                    <button
                                        onClick={() => {
                                            handleRoute(label, sub.dest, sub.url);
                                        }}
                                        className={clsx(
                                            `flex w-full items-center gap-2 rounded-md px-2 py-1.5 ${itemTextClass} transition-colors`,
                                            isSubActive
                                                ? 'bg-zinc-200 text-zinc-800 font-medium dark:bg-zinc-700 dark:text-zinc-100'
                                                : 'text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-900 dark:hover:text-zinc-100'
                                        )}
                                    >
                                        {sub.id === '__manage__' && <Settings2 className="h-3.5 w-3.5 shrink-0 opacity-60" />}
                                        {sub.title}
                                    </button>
                                </SidebarMenuSubItem>
                            );
                        });

                        const intgParentClasses = clsx(
                            `flex items-center py-2 rounded-md ${itemTextClass} font-medium transition`,
                            isAnyIntgActive
                                ? 'bg-gradient-to-r from-blue-500 to-blue-700 text-white'
                                : 'text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                        );

                        if (sidebarState === 'collapsed' && !isMobile && !openMobile) {
                            return (
                                <SidebarMenuItem key={id}>
                                    <Popover open={openModuleId === id} onOpenChange={(o) => setOpenModuleId(o ? id : null)}>
                                        <PopoverTrigger asChild>
                                            <SidebarMenuButton className={intgParentClasses} tooltip={displayLabel}>
                                                {Icon && <Icon className={clsx('h-5', isAnyIntgActive && 'invert brightness-200')} />}
                                                <span>{displayLabel}</span>
                                            </SidebarMenuButton>
                                        </PopoverTrigger>
                                        <PopoverContent side="right" align="start" sideOffset={8} className="w-52 p-1">
                                            <p className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">{displayLabel}</p>
                                            {subItems.map((sub) => (
                                                <button
                                                    key={sub.id}
                                                    onClick={() => {
                                                        handleRoute(label, sub.dest, sub.url);
                                                        setOpenModuleId(null);
                                                    }}
                                                    className={clsx(
                                                        'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-left transition-colors',
                                                        'text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                                                    )}
                                                >
                                                    {sub.id === '__manage__' && <Settings2 className="h-3.5 w-3.5 shrink-0 opacity-60" />}
                                                    {sub.title}
                                                </button>
                                            ))}
                                        </PopoverContent>
                                    </Popover>
                                </SidebarMenuItem>
                            );
                        }

                        return (
                            <Collapsible
                                key={id}
                                asChild
                                open={openModuleId !== null ? openModuleId === id : isAnyIntgActive}
                                onOpenChange={(open) => setOpenModuleId(open ? id : null)}
                                className="group/collapsible"
                            >
                                <SidebarMenuItem>
                                    <CollapsibleTrigger asChild>
                                        <SidebarMenuButton className={intgParentClasses} tooltip={displayLabel}>
                                            {Icon && <Icon className={clsx('h-5', isAnyIntgActive && 'invert brightness-200')} />}
                                            <span>{displayLabel}</span>
                                            <ChevronDown className="ml-auto h-4 w-4 transition-transform duration-200 group-data-[state=open]/collapsible:rotate-180" />
                                        </SidebarMenuButton>
                                    </CollapsibleTrigger>
                                    <CollapsibleContent>
                                        <SidebarMenuSub>{renderSubItems()}</SidebarMenuSub>
                                    </CollapsibleContent>
                                </SidebarMenuItem>
                            </Collapsible>
                        );
                    }

                    // Sidebar colapsado → popover flotante con los sub-ítems (nunca en móvil)
                    if (sidebarState === 'collapsed' && !isMobile && !openMobile) {
                        return (
                            <SidebarMenuItem key={id}>
                                <Popover open={openModuleId === id} onOpenChange={(o) => setOpenModuleId(o ? id : null)}>
                                    <PopoverTrigger asChild>
                                        <SidebarMenuButton className={parentClasses} tooltip={displayLabel}>
                                            {Icon && <Icon className={parentIconClasses} />}
                                            <span>{displayLabel}</span>
                                        </SidebarMenuButton>
                                    </PopoverTrigger>
                                    <PopoverContent side="right" align="start" sideOffset={8} className="w-48 p-1">
                                        <p className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">{displayLabel}</p>
                                        {moduleItems.map((subItem) => {
                                            const dest = subItem.url?.replace('/admin/', '/panel/') ?? targetRoute;
                                            const isSubActive = pathname === dest || pathname.startsWith(dest + '/');
                                            const isSubLocked = !isAdvisor && (subItem as any).lockedPlans?.includes(user.plan);
                                            return (
                                                <button
                                                    key={subItem.id}
                                                    onClick={() => { handleRoute(label, dest, subItem.customUrl ?? item.customUrl, isSubLocked); setOpenModuleId(null); }}
                                                    className={clsx(
                                                        'flex w-full items-center rounded-md px-2 py-1.5 text-sm text-left transition-colors',
                                                        isSubActive
                                                            ? 'bg-zinc-200 text-zinc-800 font-medium dark:bg-zinc-700 dark:text-zinc-100'
                                                            : 'text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-900 dark:hover:text-zinc-100'
                                                    )}
                                                >
                                                    <span className="min-w-0 flex-1 truncate">{subItem.title}</span>
                                                    {isSubLocked
                                                        ? <Lock className="ml-2 h-3 w-3 text-orange-400 shrink-0" />
                                                        : <ContadorDelMenu ruta={dest} conteos={conteos} />}
                                                </button>
                                            );
                                        })}
                                    </PopoverContent>
                                </Popover>
                            </SidebarMenuItem>
                        );
                    }

                    return (
                        <Collapsible
                            key={id}
                            asChild
                            open={openModuleId !== null ? openModuleId === id : isAnySubActive}
                            onOpenChange={(open) => setOpenModuleId(open ? id : null)}
                            className="group/collapsible"
                        >
                            <SidebarMenuItem>
                                <CollapsibleTrigger asChild>
                                    <SidebarMenuButton className={parentClasses} tooltip={displayLabel}>
                                        {Icon && <Icon className={parentIconClasses} />}
                                        <span>{displayLabel}</span>
                                        <ChevronDown className="ml-auto h-4 w-4 transition-transform duration-200 group-data-[state=open]/collapsible:rotate-180" />
                                        {requiresPremium && <PremiumModule />}
                                    </SidebarMenuButton>
                                </CollapsibleTrigger>
                                <CollapsibleContent>
                                    <SidebarMenuSub>
                                        {moduleItems.map((subItem) => {
                                            const dest = subItem.url?.replace('/admin/', '/panel/') ?? targetRoute;
                                            const isSubActive = pathname === dest || pathname.startsWith(dest + '/');
                                            const isSubLocked = !isAdvisor && (subItem as any).lockedPlans?.includes(user.plan);
                                            return (
                                                <SidebarMenuSubItem key={subItem.id}>
                                                    <button
                                                        onClick={() => handleRoute(label, dest, subItem.customUrl ?? item.customUrl, isSubLocked)}
                                                        className={clsx(
                                                            `flex w-full items-center rounded-md px-2 py-1.5 ${itemTextClass} transition-colors`,
                                                            isSubActive
                                                                ? 'bg-zinc-200 text-zinc-800 font-medium dark:bg-zinc-700 dark:text-zinc-100'
                                                                : 'text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-900 dark:hover:text-zinc-100'
                                                        )}
                                                    >
                                                        <span className="min-w-0 flex-1 truncate text-left">{subItem.title}</span>
                                                        {isSubLocked
                                                            ? <Lock className="ml-2 h-3 w-3 text-orange-400 shrink-0" />
                                                            : <ContadorDelMenu ruta={dest} conteos={conteos} />}
                                                    </button>
                                                </SidebarMenuSubItem>
                                            );
                                        })}
                                    </SidebarMenuSub>
                                </CollapsibleContent>
                            </SidebarMenuItem>
                        </Collapsible>
                    );
                })}
            </SidebarMenu>
        </SidebarGroup >
    );
}

/**
 * El numerito de pendientes junto al nombre de un apartado de un desplegable
 * (abierto, o flotante con la barra plegada). Misma forma que el del apartado
 * suelto (`CLASE_DEL_CONTADOR`); sin número que enseñar no pinta nada.
 */
function ContadorDelMenu({ ruta, conteos }: { ruta: string | null | undefined; conteos: ConteosDelMenu }) {
    const texto = elTextoDelContador(ruta, conteos);
    if (!texto) return null;
    return (
        <span data-contador-del-menu={ruta ?? undefined} className={clsx('ml-2', CLASE_DEL_CONTADOR)}>
            {texto}
        </span>
    );
}

/**
 * El mismo numerito en un apartado SUELTO del menú: va sobre el botón, pegado
 * a la derecha, como lo llevaban Chats y Mis tareas antes de agruparse —con la
 * barra plegada se queda en la esquina del icono—.
 */
function ContadorSuelto({ ruta, conteos }: { ruta: string | null | undefined; conteos: ConteosDelMenu }) {
    const texto = elTextoDelContador(ruta, conteos);
    if (!texto) return null;
    return (
        <SidebarMenuBadge
            data-contador-del-menu={ruta ?? undefined}
            className={clsx('right-2 top-1/2 z-20 -translate-y-1/2 group-data-[collapsible=icon]:right-0.5', CLASE_DEL_CONTADOR)}
        >
            {texto}
        </SidebarMenuBadge>
    );
}
