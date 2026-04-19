'use client'

import { Plan, User } from '@prisma/client'

import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import { ChevronsUpDown, LogOut } from 'lucide-react'
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar } from './ui/sidebar'
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar'
import { handleLogout } from '@/lib/handleLogout'
// import { PLAN_COLORS } from '@/types/plans'

type LogoutButtonProps = {
  user: User | null
  collapsed?: boolean
};

const LogoutButton = ({ user }: LogoutButtonProps) => {
  const { isMobile } = useSidebar()

  const userInitial = user?.name?.charAt(0).toUpperCase() ?? '?'

  const PLAN_COLORS: Record<Plan, string> = {
    enterprise: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-300',
    lite: 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300',              // Básico reducido
    unico: 'bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-300',             // Singular / especial
    basico: 'bg-zinc-100 text-zinc-800 dark:bg-zinc-900 dark:text-zinc-300',            // Igual que "standard"
    intermedio: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300',// Similar a "intermediate"
    avanzado: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-300',  // Similar a "advanced"
    personalizado: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-300',
  };

  const customStyles = PLAN_COLORS[user?.plan ?? 'basico'];
  
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <Avatar className="h-8 w-8 rounded-lg">
                {user?.image && <AvatarImage src={user?.image} alt={user?.name ?? ''} />}
                <AvatarFallback className="rounded-lg">
                  {userInitial}
                </AvatarFallback>
              </Avatar>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-semibold">{user?.name}</span>
                <span className={`truncate text-xs capitalize p-1 rounded-sm  ${customStyles}`}>
                  {user?.plan}
                </span>
              </div>
              <ChevronsUpDown className="ml-auto size-4" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>

          <DropdownMenuContent
            className="w-[--radix-dropdown-menu-trigger-width] min-w-56 rounded-lg"
            side={isMobile ? "bottom" : "right"}
            align="start"
            sideOffset={4}
          >
            <DropdownMenuLabel className="p-0 font-normal">
              <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                <Avatar className="h-8 w-8 rounded-lg">
                  {user?.image && <AvatarImage src={user?.image} alt={user?.name ?? ''} />}
                  <AvatarFallback className="rounded-lg">
                    {userInitial}
                  </AvatarFallback>
                </Avatar>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-semibold">{user?.name}</span>
                  <span className="truncate text-xs">{user?.email}</span>
                </div>
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
