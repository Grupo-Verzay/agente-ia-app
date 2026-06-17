'use client';

import { useState, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { ChevronDown, ChevronRight } from 'lucide-react';
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
import { Settings2 } from 'lucide-react';

const PANEL_ROUTES = ['/panel', '/admin'];

export function NavMain({ user }: { user: User }) {
    const { modules, navPrefs, setLabelModule, labelModule, setCanvaUrl, userIntegrations } = useModuleStore();
    const pathname = usePathname();
    const router = useRouter();
    const { isMobile, openMobile, setOpenMobile, state: sidebarState } = useSidebar();
    const taskPendingCount = useTaskStore((s) => s.pendingCount);
    const chatUnreadCount = useChatUnreadStore((s) => s.unreadCount);

    const isAdvisor = !!user.ownerId;

    const [openModuleId, setOpenModuleId] = useState<string | null>(null);
    useEffect(() => { setOpenModuleId(null); }, [pathname]);

    /* Aplica preferencias del usuario (displayLabel, isHidden, sortOrder) */
    const navItems = modules
        .filter(link => link.showInSidebar)
        .filter(link => {
            // /equipo solo visible para dueños, nunca para asesores
            if (link.route === '/equipo' && isAdvisor) return false;
            // /panel/mis-planes solo para resellers
            if (link.route === '/panel/mis-planes' && user.role !== 'reseller') return false;
            // El módulo Admin (/panel) nunca aparece en el sidebar para resellers
            if (PANEL_ROUTES.includes(link.route) && user.role === 'reseller') return false;
            // El módulo /reseller-panel solo se muestra en sidebar para resellers (no admins)
            if (link.route === '/reseller-panel' && user.role !== 'reseller') return false;
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
            } else if (link.route === '/reseller-panel') {
                isActive = (link.moduleItems ?? []).some(sub => {
                    const dest = (sub.url ?? '').replace('/admin/', '/panel/');
                    return dest && (pathname === dest || pathname.startsWith(dest + '/'));
                });
            } else {
                isActive = pathname === link.route || pathname.startsWith(link.route + '/');
            }

            return { ...link, isActive, isHidden, displayLabel, sortOrder };
        })
        .filter(link => !link.isHidden)
        .sort((a, b) => a.sortOrder - b.sortOrder);

    const handleRoute = (label: string, targetRoute: string, customUrl?: string | null) => {
        setLabelModule(label)
        if (targetRoute === '/canva' && customUrl) setCanvaUrl(customUrl)
        if (isMobile) setOpenMobile(false)
        router.push(targetRoute)
    }
    return (
        <SidebarGroup>
            {/* <SidebarGroupLabel>Módulos</SidebarGroupLabel> */}
            <SidebarMenu>
                {navItems.map((item) => {
                    const { id, route, icon, label, displayLabel, requiresPremium, isActive, moduleItems } = item;
                    const Icon = iconMap[icon as keyof typeof iconMap];
                    const linkClasses = clsx(
                        'flex items-center py-2 rounded-md text-base md:text-sm font-medium transition',
                        isActive
                            ? 'bg-gradient-to-r from-blue-500 to-blue-700 text-white'
                            : 'text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                    );

                    const iconClasses = clsx(
                        'h-6 md:h-5',
                        isActive && 'invert brightness-200'
                    );

                    const validateRouteAndRole = user.role === 'reseller' && PANEL_ROUTES.includes(route);
                    const targetRoute = validateRouteAndRole ? '/admin/clientes' : route;

                    // Si NO hay subitems, renderizar directamente como link
                    if (!moduleItems || moduleItems.length === 0) {
                        return (
                            <SidebarMenuItem key={id}>
                                <SidebarMenuButton className={linkClasses} tooltip={displayLabel} onClick={() => handleRoute(label, targetRoute, item.customUrl)}>
                                    {Icon && <Icon className={iconClasses} />}
                                    <span>{displayLabel}</span>
                                    <ChevronRight className="invisible ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                                    {route === '/profile' && <ChevronRight />}
                                    {requiresPremium && <PremiumModule />}
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
                    if (PANEL_ROUTES.includes(route) || route === '/reseller-panel') {
                        const firstSubItem = moduleItems[0];
                        const firstDest = validateRouteAndRole
                            ? targetRoute
                            : firstSubItem?.url?.replace('/admin/', '/panel/') ?? targetRoute;
                        return (
                            <SidebarMenuItem key={id}>
                                <SidebarMenuButton className={linkClasses} tooltip={displayLabel} onClick={() => handleRoute(label, firstDest, firstSubItem?.customUrl ?? item.customUrl)}>
                                    {Icon && <Icon className={iconClasses} />}
                                    <span>{displayLabel}</span>
                                    <ChevronRight className="invisible ml-auto" />
                                    {requiresPremium && <PremiumModule />}
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
                        'flex items-center py-2 rounded-md text-base md:text-sm font-medium transition',
                        isAnySubActive
                            ? 'bg-gradient-to-r from-blue-500 to-blue-700 text-white'
                            : 'text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                    );
                    const parentIconClasses = clsx(
                        'h-6 md:h-5',
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
                                            if (sub.url) setCanvaUrl(sub.url);
                                            handleRoute(label, sub.dest);
                                        }}
                                        className={clsx(
                                            'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-base md:text-sm transition-colors',
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
                            'flex items-center py-2 rounded-md text-base md:text-sm font-medium transition',
                            isAnyIntgActive
                                ? 'bg-gradient-to-r from-blue-500 to-blue-700 text-white'
                                : 'text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                        );

                        if (sidebarState === 'collapsed' && !isMobile && !openMobile) {
                            return (
                                <SidebarMenuItem key={id}>
                                    <Popover>
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
                                                        if (sub.url) setCanvaUrl(sub.url);
                                                        handleRoute(label, sub.dest);
                                                    }}
                                                    className={clsx(
                                                        'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors',
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
                                <Popover>
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
                                            return (
                                                <button
                                                    key={subItem.id}
                                                    onClick={() => handleRoute(label, dest, subItem.customUrl ?? item.customUrl)}
                                                    className={clsx(
                                                        'flex w-full items-center rounded-md px-2 py-1.5 text-sm transition-colors',
                                                        isSubActive
                                                            ? 'bg-zinc-200 text-zinc-800 font-medium dark:bg-zinc-700 dark:text-zinc-100'
                                                            : 'text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-900 dark:hover:text-zinc-100'
                                                    )}
                                                >
                                                    {subItem.title}
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
                                            return (
                                                <SidebarMenuSubItem key={subItem.id}>
                                                    <button
                                                        onClick={() => handleRoute(label, dest, subItem.customUrl ?? item.customUrl)}
                                                        className={clsx(
                                                            'flex w-full items-center rounded-md px-2 py-1.5 text-base md:text-sm transition-colors',
                                                            isSubActive
                                                                ? 'bg-zinc-200 text-zinc-800 font-medium dark:bg-zinc-700 dark:text-zinc-100'
                                                                : 'text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-900 dark:hover:text-zinc-100'
                                                        )}
                                                    >
                                                        {subItem.title}
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
