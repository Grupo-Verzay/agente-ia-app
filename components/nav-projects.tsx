"use client"

import {
    SidebarGroup,
    SidebarGroupLabel,
    SidebarMenu,
    SidebarMenuItem,
} from "@/components/ui/sidebar"
import { CreditsWidget } from "./custom"
import { User } from "@prisma/client"

export function NavProjects({ user }: { user: User }) {

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
