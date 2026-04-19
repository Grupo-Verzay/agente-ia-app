'use client';

import { usePathname, useRouter } from 'next/navigation';
import { ChevronRight } from 'lucide-react';
import { useRef, useState } from 'react';

import { canAccessRoute } from '@/utils/access';
import { PremiumModule } from './shared/PremiumModule';

import {
    SidebarGroup,
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
    SidebarMenuSub,
    SidebarMenuSubButton,
    SidebarMenuSubItem,
    useSidebar,
} from '@/components/ui/sidebar';

import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
} from '@/components/ui/collapsible';

import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover';

import { Separator } from '@/components/ui/separator';

import Link from 'next/link';
import { User } from '@prisma/client';
import clsx from 'clsx';
import { iconMap } from '@/schema/module';
import { useModuleStore } from '@/stores/modules/useModuleStore';

export function NavMain({ user }: { user: User }) {
    const { modules, setLabelModule, labelModule, setCanvaUrl } = useModuleStore();
    const pathname = usePathname();
    const router = useRouter();
    const { state } = useSidebar();

    const [openPopover, setOpenPopover] = useState<string | null>(null);
    const hoverTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

    const openWithDelay = (key: string) => {
        if (hoverTimeout.current) clearTimeout(hoverTimeout.current);
        setOpenPopover(key);
    };

    const closeWithDelay = () => {
        hoverTimeout.current = setTimeout(() => setOpenPopover(null), 120);
    };

    const cancelClose = () => {
        if (hoverTimeout.current) clearTimeout(hoverTimeout.current);
    };

    /* Se ocupa de ocultar/mostrar basado en los permisos del modulo */
    const navItems = modules
        .filter(link => link.showInSidebar)
        .filter(link => {
            const access = canAccessRoute({
                route: link.route,
                userRole: user.role,
                userPlan: user.plan,
                modules,
                label: link.label,
            });

            // Control de acceso por rol
            if (!access.allowed) {
                return false;
            }

            return true;
        })
        .map(link => {
            let isActive = false;

            if (pathname === '/canva') {
                isActive = labelModule === link.label
            } else {
                isActive = pathname === link.route;
            }

            return { ...link, isActive };
        });

    const handleRoute = (label: string, targetRoute: string, customUrl?: string | null) => {
        setLabelModule(label)
        if (targetRoute === '/canva' && customUrl) setCanvaUrl(customUrl)
        router.push(targetRoute)
    }
    return (
        <SidebarGroup>
            {/* <SidebarGroupLabel>Módulos</SidebarGroupLabel> */}
            <SidebarMenu>
                {navItems.map((item) => {
                    const { id, route, icon, label, requiresPremium, isActive, moduleItems } = item;
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
                                <SidebarMenuButton className={linkClasses} tooltip={label} onClick={() => handleRoute(label, targetRoute, item.customUrl)}>
                                    {Icon && <Icon className={iconClasses} />}
                                    <span>{label}</span>
                                    <ChevronRight className="invisible ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                                    {route === '/profile' && <ChevronRight />}
                                    {requiresPremium && <PremiumModule />}
                                </SidebarMenuButton>

                            </SidebarMenuItem>
                        );
                    }

                    // Modo icon (collapsed): popover flotante hacia la derecha
                    if (state === 'collapsed') {
                        return (
                            <SidebarMenuItem
                                key={id}
                                onMouseEnter={() => openWithDelay(id)}
                                onMouseLeave={closeWithDelay}
                            >
                                <Popover
                                    open={openPopover === id}
                                    onOpenChange={(open) => setOpenPopover(open ? id : null)}
                                >
                                    <PopoverTrigger asChild>
                                        <SidebarMenuButton className={linkClasses}>
                                            {Icon && <Icon className={iconClasses} />}
                                            <span>{label}</span>
                                        </SidebarMenuButton>
                                    </PopoverTrigger>

                                    <PopoverContent
                                        side="right"
                                        align="start"
                                        sideOffset={10}
                                        className="w-52 p-1.5 shadow-lg"
                                        onMouseEnter={cancelClose}
                                        onMouseLeave={closeWithDelay}
                                    >
                                        {/* Header del módulo */}
                                        <div className="flex items-center gap-2 px-2 py-1.5 mb-1">
                                            {Icon && (
                                                <div className="flex h-6 w-6 items-center justify-center rounded-md bg-gradient-to-br from-blue-500 to-blue-700">
                                                    <Icon className="h-3.5 w-3.5 text-white" />
                                                </div>
                                            )}
                                            <span className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">
                                                {label}
                                            </span>
                                            {requiresPremium && <PremiumModule />}
                                        </div>

                                        <Separator className="mb-1" />

                                        {/* Sub-items */}
                                        <div className="flex flex-col gap-0.5">
                                            {moduleItems.map((subItem) => {
                                                const isSubActive = pathname === subItem.url;
                                                return (
                                                    <Link
                                                        key={subItem.url}
                                                        href={subItem.url}
                                                        onClick={() => {
                                                            if (subItem.url === '/canva' && subItem.customUrl) setCanvaUrl(subItem.customUrl)
                                                            setOpenPopover(null)
                                                        }}
                                                        className={clsx(
                                                            'flex items-center rounded-md px-2 py-1.5 text-sm font-medium transition-colors',
                                                            isSubActive
                                                                ? 'bg-gradient-to-r from-blue-500 to-blue-700 text-white'
                                                                : 'text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                                                        )}
                                                    >
                                                        {subItem.title}
                                                    </Link>
                                                );
                                            })}
                                        </div>
                                    </PopoverContent>
                                </Popover>
                            </SidebarMenuItem>
                        );
                    }

                    // Modo expanded: acordeón inline normal
                    return (
                        <Collapsible
                            key={id}
                            asChild
                            defaultOpen={isActive}
                            className="group/collapsible"
                        >
                            <SidebarMenuItem>
                                <CollapsibleTrigger asChild>
                                    <SidebarMenuButton className={linkClasses} tooltip={label}>
                                        {Icon && <Icon className={iconClasses} />}
                                        <span>{label}</span>
                                        <ChevronRight className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                                        {requiresPremium && <PremiumModule />}
                                    </SidebarMenuButton>
                                </CollapsibleTrigger>

                                <CollapsibleContent>
                                    <SidebarMenuSub>
                                        {moduleItems.map((subItem) => (
                                            <SidebarMenuSubItem key={subItem.title}>
                                                <SidebarMenuSubButton asChild>
                                                    <Link
                                                        href={subItem.url}
                                                        onClick={() => {
                                                            if (subItem.url === '/canva' && subItem.customUrl) setCanvaUrl(subItem.customUrl)
                                                        }}
                                                        className='text-sm
                                                        text-muted-foreground
                                                        flex
                                                        items-center
                                                        justify-between
                                                        py-2
                                                        rounded-md
                                                        font-medium
                                                        transition
                                                        text-zinc-600
                                                        dark:text-zinc-300
                                                        hover:bg-zinc-100
                                                        dark:hover:bg-zinc-800'
                                                    >
                                                        {subItem.title}
                                                    </Link>
                                                </SidebarMenuSubButton>
                                            </SidebarMenuSubItem>
                                        ))}
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
