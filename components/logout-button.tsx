'use client'

import { useEffect, useState } from 'react'
import { User } from '@prisma/client'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import { ChevronsUpDown, CreditCard, LogOut, ShieldCheck, Users } from 'lucide-react'
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar } from './ui/sidebar'
import { Badge } from '@/components/ui/badge'
import { handleLogout } from '@/lib/handleLogout'
import { getAdvisorRoleLabel } from '@/lib/permissions'
import { getMyLinkedAccounts } from '@/actions/linked-account-actions'
import { getPlanLabel, PlanBadgeDisplay } from '@/components/shared/PlanBadgeDisplay'

type LogoutButtonProps = {
  user: User | null
  collapsed?: boolean
};

function getRoleLabel(user: User | null) {
  if (!user) return 'Agente'
  if (user.advisorRole) return getAdvisorRoleLabel(user.advisorRole)
  if (user.role === 'admin' || user.role === 'super_admin' || user.role === 'reseller') return 'Administrador'
  return 'Agente'
}

function getAccountCountLabel(count: number) {
  return count === 1 ? '1 cuenta' : `${count} cuentas`
}

const LogoutButton = ({ user }: LogoutButtonProps) => {
  const { isMobile } = useSidebar()
  const [accountCount, setAccountCount] = useState(1)

  useEffect(() => {
    getMyLinkedAccounts().then((res) => {
      if (res.success && res.data) setAccountCount((res.data.accounts?.length ?? 0) + 1)
    })
  }, [])

  const planLabel = getPlanLabel(user?.plan)
  const roleLabel = getRoleLabel(user)

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <PlanBadgeDisplay plan={user?.plan} />
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-semibold">{user?.name}</span>
                <span className="mt-0.5 truncate text-xs text-sidebar-foreground/70">
                  {planLabel}
                </span>
              </div>
              <ChevronsUpDown className="ml-auto size-4" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>

          <DropdownMenuContent
            className="w-[--radix-dropdown-menu-trigger-width] min-w-56 rounded-lg"
            side={isMobile ? 'bottom' : 'right'}
            align="start"
            sideOffset={4}
          >
            <DropdownMenuLabel className="p-0 font-normal">
              <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                <PlanBadgeDisplay plan={user?.plan} />
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-semibold">{user?.name}</span>
                  <span className="truncate text-xs">{user?.email}</span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-1.5 px-1 pb-1.5">
                <Badge variant="outline" className="justify-start gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium">
                  <ShieldCheck className="h-3 w-3" />
                  {roleLabel}
                </Badge>
                <Badge variant="outline" className="justify-start gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium">
                  <Users className="h-3 w-3" />
                  {getAccountCountLabel(accountCount)}
                </Badge>
                <Badge variant="outline" className="col-span-2 justify-start gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium">
                  <CreditCard className="h-3 w-3" />
                  Plan {planLabel}
                </Badge>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleLogout} className="text-red-600">
              <LogOut className="mr-2 h-4 w-4" />
              Salir
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}

export default LogoutButton
