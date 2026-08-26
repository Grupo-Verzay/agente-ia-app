"use client"

import {
    SidebarGroup,
    SidebarGroupLabel,
    SidebarMenu,
    SidebarMenuItem,
} from "@/components/ui/sidebar"
import type { CurrentUser } from '@/lib/auth';
import { CreditsWidget } from "./custom/CreditsWidget"
import { User } from "@prisma/client"

export function NavProjects({ user }: { user: CurrentUser }) {

    return (
        <SidebarGroup className="group-data-[collapsible=icon]:hidden">
            <SidebarMenu>
                <SidebarMenuItem>
                    {/* <CreditsWidget userId={user.id} webhookUrl={user.webhookUrl ?? 'null'} /> */}
                </SidebarMenuItem>
            </SidebarMenu>
        </SidebarGroup>
    )
}
