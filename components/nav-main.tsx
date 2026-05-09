'use client';

import { usePathname, useRouter } from 'next/navigation';
import { ChevronRight, Users } from 'lucide-react';

import { canAccessRoute } from '@/utils/access';
import { PremiumModule } from './shared/PremiumModule';

import {
    SidebarGroup,
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
} from '@/components/ui/sidebar';

import { User } from '@prisma/client';
import clsx from 'clsx';
import { iconMap } from '@/schema/module';
import { useModuleStore } from '@/stores/modules/useModuleStore';

export function NavMain({ user }: { user: User }) {
    const { modules, navPrefs, setLabelModule, labelModule, setCanvaUrl } = useModuleStore();
    const pathname = usePathname();
    const router = useRouter();

    const isAdvisor = !!(user as any).ownerId;

    /* Aplica preferencias del usuario (displayLabel, isHidden, sortOrder) */
    const navItems = modules
        .filter(link => link.showInSidebar)
        .filter(link => {
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
            } else {
                isActive = pathname === link.route;
            }

            return { ...link, isActive, isHidden, displayLabel, sortOrder };
        })
        .filter(link => !link.isHidden)
        .sort((a, b) => a.sortOrder - b.sortOrder);

    const handleRoute = (label: string, targetRoute: string, customUrl?: string | null) => {
        setLabelModule(label)
        if (targetRoute === '/canva' && customUrl) setCanvaUrl(customUrl)
        router.push(targetRoute)
    }
    const equipoActive = pathname === '/equipo';

    return (
        <SidebarGroup>
            {/* <SidebarGroupLabel>Módulos</SidebarGroupLabel> */}
            <SidebarMenu>
                {!isAdvisor && (
                    <SidebarMenuItem>
                        <SidebarMenuButton
                            className={clsx(
                                'flex items-center justify-between py-2 rounded-md text-sm font-medium transition',
                                equipoActive
                                    ? 'bg-gradient-to-r from-blue-500 to-blue-700 text-white'
                                    : 'text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                            )}
                            tooltip="Mi Equipo"
                            onClick={() => router.push('/equipo')}
                        >
                            <Users className={clsx('h-5', equipoActive && 'invert brightness-200')} />
                            <span>Mi Equipo</span>
                            <ChevronRight className="invisible ml-auto" />
                        </SidebarMenuButton>
                    </SidebarMenuItem>
                )}
                {navItems.map((item) => {
                    const { id, route, icon, label, displayLabel, requiresPremium, isActive, moduleItems } = item;
                    const Icon = iconMap[icon as keyof typeof iconMap];
                    const linkClasses = clsx(
                        'flex items-center justify-between py-2 rounded-md text-sm font-medium transition',
                        isActive
                            ? 'bg-gradient-to-r from-blue-500 to-blue-700 text-white'
                            : 'text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                    );

                    const iconClasses = clsx(
                        'h-5',
                        isActive && 'invert brightness-200'
                    );

                    const validateRouteAndRole = user.role === 'reseller' && route === '/admin';
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

                            </SidebarMenuItem>
                        );
                    }

                    // Con sub-ítems: navega directo al primer sub-ítem (evita /panel en blanco)
                    const firstSubItem = moduleItems[0];
                    const firstDest = firstSubItem?.url?.replace('/admin/', '/panel/') ?? targetRoute;
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
                })}
            </SidebarMenu>
        </SidebarGroup >
    );
}
