"use client"

import { User } from "@prisma/client"

import { NavMain } from "@/components/nav-main"
import { NavProjects } from "@/components/nav-projects"
import { TeamSwitcher } from "@/components/team-switcher"

import {
    Sidebar,
    SidebarContent,
    SidebarFooter,
    SidebarHeader,
    SidebarRail,
    SidebarTrigger,
} from "@/components/ui/sidebar"
import ThemeSwitcher from "./custom/ThemeSwitcher"
import LogoutButton from "./logout-button"
import { ResellerInfoResponse } from "@/schema/reseller"
import { usePathname } from "next/navigation"

interface AppSidebarProps extends React.ComponentProps<typeof Sidebar> {
    user: User;
}

export function AppSidebar({ user, ...props }: AppSidebarProps) {
    const pathname = usePathname();

    return (
        <Sidebar collapsible="icon" {...props} className="bg-white dark:bg-gray-900 text-gray-800 dark:text-zinc-100 border-r border-zinc-200 dark:border-gray-800">
            <SidebarHeader>
                <TeamSwitcher user={user} />
            </SidebarHeader>

            <SidebarContent>
                <NavMain user={user} />
            </SidebarContent>
            <SidebarFooter>
                <div className="flex items-center justify-end">
                    <SidebarTrigger />
                </div>
                <div className="flex flex-row w-full justify-center items-center">
                    {/* <NavProjects user={user} /> */}
                    <LogoutButton user={user} />

                    <div>
                        <ThemeSwitcher />
                    </div>
                </div>
                {/* <LogoutButton user={user} /> */}
            </SidebarFooter>
            <SidebarRail />
        </Sidebar>
    )
}
