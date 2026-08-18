'use client'

import { User } from '@prisma/client'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu'
import { ChevronsUpDown, LogOut } from 'lucide-react'
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar } from './ui/sidebar'
import { handleLogout } from '@/lib/handleLogout'
import { PLAN_LEVEL_LABELS } from '@/types/plans'
import { UserLogoAvatar } from '@/components/shared/UserLogoAvatar'

type LogoutButtonProps = {
  user: User | null
  resellerImage?: string | null;
  resellerCompany?: string | null;
  /**
   * Nombre que le pone SU marca a este nivel de plan. Lo resuelve el servidor,
   * que es donde se sabe de qué marca es la cuenta.
   *
   * Sin él quedaba el nombre interno del nivel —"Enterprise" para el 5,
   * "Agencias" para el 6—, que no lo vende ninguna marca y hacía que el dueño
   * moviera clientes de nivel para cuadrar un nombre que nunca fue el suyo.
   */
  planLabel?: string | null;
  collapsed?: boolean
};

const LogoutButton = ({ user, resellerImage, resellerCompany, planLabel: planLabelDeLaMarca }: LogoutButtonProps) => {
  const { isMobile } = useSidebar()
  // El nombre que la marca le puso al nivel; si no hay ninguno, el número de
  // nivel ("Nivel 6"), nunca el interno "Agencias"/"Enterprise".
  const planLabel =
    planLabelDeLaMarca?.trim() ||
    (user?.plan ? PLAN_LEVEL_LABELS[user.plan as keyof typeof PLAN_LEVEL_LABELS] : '') ||
    ''
  const displayName = resellerCompany ?? user?.company ?? user?.name

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <UserLogoAvatar logoUrl={resellerImage ?? undefined} plan={user?.plan} alt={displayName ?? 'Logo'} className="h-8 w-8 rounded-lg" />
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-semibold">{displayName}</span>
                {planLabel ? (
                  <span className="mt-0.5 truncate text-xs text-sidebar-foreground/70">
                    Plan {planLabel}
                  </span>
                ) : null}
              </div>
              <ChevronsUpDown className="ml-auto size-4" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>

          <DropdownMenuContent
            className="w-40 rounded-lg"
            side={isMobile ? "top" : "right"}
            align={isMobile ? "start" : "center"}
            sideOffset={6}
          >
            <DropdownMenuLabel className="p-0 font-normal">
              <div className="flex items-center gap-2 px-2.5 py-2">
                <UserLogoAvatar
                  logoUrl={user?.image}
                  plan={user?.plan}
                  alt={user?.name ?? 'Logo'}
                  className="h-8 w-8"
                />
                <button
                  type="button"
                  onClick={handleLogout}
                  className="ml-auto inline-flex h-8 items-center justify-center gap-1.5 rounded-md px-2.5 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 hover:text-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  Salir
                </button>
              </div>
            </DropdownMenuLabel>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}

export default LogoutButton
