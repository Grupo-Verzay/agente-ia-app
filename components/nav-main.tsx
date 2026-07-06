'use client';

import { useState, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { ChevronDown, ChevronRight, Lock } from 'lucide-react';
import { useTaskStore } from '@/stores/useTaskStore';
import { useChatUnreadStore } from '@/stores/useChatUnreadStore';

import { canAccessRoute } from '@/utils/access';
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
import { Settings2 } from 'lucide-react';

const PANEL_ROUTES = ['/panel', '/admin'];
const CLIENT_PANEL_ROUTE = '/client-panel';

export function NavMain({ user }: { user: User }) {
    const { modules, navPrefs, setLabelModule, labelModule, setCanvaUrl, userIntegrations } = useModuleStore();
    const pathname = usePathname();
    const router = useRouter();
    const { isMobile, openMobile, setOpenMobile, state: sidebarState } = useSidebar();
    const taskPendingCount = useTaskStore((s) => s.pendingCount);
    const chatUnreadCount = useChatUnreadStore((s) => s.unreadCount);

    const isAdvisor = !!user.ownerId;
    // Agente = cuenta vinculada SIN rol administrador. Los administradores de una
    // cuenta vinculada tienen los mismos accesos que el dueño de esa cuenta.
    const isAgente = isAdvisor && user.advisorRole !== 'administrador';
    // Rutas de gestión (leads en masa / equipo / pipeline) ocultas para agentes.
    const AGENT_HIDDEN_ROUTES = ['/equipo', '/sessions', '/crm', '/asesores'];

    const [openModuleId, setOpenModuleId] = useState<string | null>(null);
    useEffect(() => { setOpenModuleId(null); }, [pathname]);

    /* Aplica preferencias del usuario (displayLabel, isHidden, sortOrder) */
    const navItems = modules
        .filter(link => link.showInSidebar)
        .filter(link => {
            // Gestión (equipo, leads, pipeline): oculta para agentes; visible para
            // la cuenta principal y los administradores de cuenta vinculada.
            if (isAgente && AGENT_HIDDEN_ROUTES.includes(link.route)) return false;
            // /profile (Perfil/Conexión/Ajustes) sí es visible para asesores.
            // /panel/mis-planes solo para resellers
            if (link.route === '/panel/mis-planes' && user.role !== 'reseller') return false;
            // /panel y sub-rutas nunca aparecen en sidebar para resellers (van en tabs superiores)
            if ((PANEL_ROUTES.includes(link.route) || link.route.startsWith('/panel/')) && user.role === 'reseller') return false;
            // El módulo /reseller-panel solo se muestra en sidebar para resellers (no admins)
            if (link.route === '/reseller-panel' && user.role !== 'reseller') return false;
            if (link.route === CLIENT_PANEL_ROUTE && (user.role === 'admin' || user.role === 'super_admin' || user.role === 'reseller')) return false;
            const access = canAccessRoute({
                route: link.route,
                userRole: user.role,
                userPlan: user.plan,
                modules,
                label: link.label,
                isAdvisor,
            });
            if (!access.allowed) return false;
            return true;
        })
        .map(link => {
            const pref = navPrefs.find(p => p.moduleId === link.id);
            const isHidden = pref?.isHidden ?? false;
            const displayLabel = pref?.displayLabel ?? link.label;
            const sortOrder = pref?.sortOrder ?? link.order;

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

            const isLocked = !isAdvisor && (link as any).lockedPlans?.includes(user.plan);
            return { ...link, isActive, isHidden, displayLabel, sortOrder, isLocked };
        })
        .filter(link => !link.isHidden)
        .sort((a, b) => a.sortOrder - b.sortOrder);

    const handleRoute = (label: string, targetRoute: string, customUrl?: string | null, isLocked?: boolean) => {
        if (isLocked) { router.push('/planes'); if (isMobile) setOpenMobile(false); return; }
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
                                {route === '/tareas' && taskPendingCount > 0 && (
                                    <SidebarMenuBadge className="right-2 top-1/2 z-20 flex h-4 min-w-4 -translate-y-1/2 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white shadow-sm group-data-[collapsible=icon]:right-0.5">
                                        {taskPendingCount > 99 ? '99+' : taskPendingCount}
                                    </SidebarMenuBadge>
                                )}
                                {route === '/chats' && chatUnreadCount > 0 && (
                                    <SidebarMenuBadge className="right-2 top-1/2 z-20 flex h-4 min-w-4 -translate-y-1/2 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white shadow-sm group-data-[collapsible=icon]:right-0.5">
                                        {chatUnreadCount > 99 ? '99+' : chatUnreadCount}
                                    </SidebarMenuBadge>
                                )}

                            </SidebarMenuItem>
                        );
                    }

                    // Admin/Panel y reseller-panel: submódulos van a la barra superior — navegar al primero
                    // Resellers (panel admin) van directo a /admin/clientes sin importar los sub-items
                    if (PANEL_ROUTES.includes(route) || route === '/reseller-panel' || route === CLIENT_PANEL_ROUTE) {
                        const firstSubItem = moduleItems[0];
                        const firstDest = validateRouteAndRole
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
                            ...userIntegrations.map(intg => ({ id: intg.id, title: intg.name, dest: '/canva', url: intg.url })),
                            { id: '__manage__', title: 'Gestionar integraciones', dest: '/integraciones', url: null },
                        ];
                        const isAnyIntgActive = pathname === '/integraciones' || userIntegrations.some(() => labelModule === label && pathname === '/canva');

                        const renderSubItems = () => subItems.map((sub) => {
                            const isSubActive = pathname === sub.dest && (sub.dest !== '/canva' || (labelModule === label));
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
                                                    <span className="flex-1">{subItem.title}</span>
                                                    {isSubLocked && <Lock className="h-3 w-3 text-orange-400 shrink-0" />}
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
                                                        {subItem.title}
                                                        {isSubLocked && <Lock className="ml-auto h-3 w-3 text-orange-400 shrink-0" />}
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
