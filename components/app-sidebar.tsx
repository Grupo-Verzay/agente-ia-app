"use client"

import { useEffect, useRef } from "react";
import { User } from "@prisma/client"

import { NavMain } from "@/components/nav-main"
import { NavProjects } from "@/components/nav-projects"
import { AccountSwitcher } from "@/components/AccountSwitcher"

import {
    Sidebar,
    SidebarContent,
    SidebarFooter,
    SidebarHeader,
    SidebarRail,
    SidebarTrigger,
    useSidebar,
} from "@/components/ui/sidebar"
import ThemeSwitcher from "./custom/ThemeSwitcher"
import LogoutButton from "./logout-button"
import { NavCustomizer } from "./custom/NavCustomizer"
import { ResellerInfoResponse } from "@/schema/reseller"
import { usePathname } from "next/navigation"

interface AppSidebarProps extends React.ComponentProps<typeof Sidebar> {
    user: User;
    resellerImage?: string | null;
    resellerCompany?: string | null;
}

function SidebarFooterContent({ user, resellerImage, resellerCompany }: { user: User; resellerImage?: string | null; resellerCompany?: string | null }) {
    const { state } = useSidebar();
    const collapsed = state === "collapsed";

    return (
        <SidebarFooter>
            <div className="flex items-center justify-end">
                <SidebarTrigger />
            </div>
            <div className="flex flex-row w-full justify-center items-center">
                <LogoutButton user={user} resellerImage={resellerImage} resellerCompany={resellerCompany} />
                {!collapsed && <NavCustomizer user={user} />}
                {!collapsed && (
                    <div>
                        <ThemeSwitcher />
                    </div>
                )}
            </div>
        </SidebarFooter>
    );
}

export function AppSidebar({ user, resellerImage, resellerCompany, ...props }: AppSidebarProps) {
    const { isMobile, openMobile, setOpenMobile } = useSidebar();
    const pathname = usePathname();
    const previousPathname = useRef(pathname);

    useEffect(() => {
        const pathChanged = previousPathname.current !== pathname;
        previousPathname.current = pathname;

        if (isMobile && openMobile && pathChanged) {
            setOpenMobile(false);
        }
    }, [isMobile, pathname, openMobile, setOpenMobile]);

    return (
        <Sidebar collapsible="icon" {...props} className="bg-white dark:bg-gray-900 text-gray-800 dark:text-zinc-100 border-r border-zinc-200 dark:border-gray-800">
            <SidebarHeader>
                <AccountSwitcher user={user} resellerImage={resellerImage} />
            </SidebarHeader>

            <SidebarContent>
                <NavMain user={user} />
            </SidebarContent>
            <SidebarFooterContent user={user} resellerImage={resellerImage} resellerCompany={resellerCompany} />
            <SidebarRail />
        </Sidebar>
    )
}
