'use client'

import { Button } from '@/components/ui/button'
import { MoreHorizontal } from 'lucide-react'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { DialogType } from './clients-manager'
import { ClientInterface } from '@/lib/types'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { impersonateUser, loginAction } from '@/actions/auth-action'
import { toast } from 'sonner'

interface propsActionsMenu {
    currentUserRol: string
    user: ClientInterface
    openDialogGetUserId: (userId: string, dialog: DialogType, state: boolean) => void
}

/* El user es el usuario seleccionado de la tabla y el currentUserRol es el usuario logueado */
export const UserActionsMenu = ({ user, openDialogGetUserId, currentUserRol }: propsActionsMenu) => {
    const router = useRouter()
    const [isPending, startTransition] = useTransition()

    const handleUserDashboard = () => {
        if (!user.email || !user.password) {
            toast.error('No se puede iniciar sesión: el usuario no tiene credenciales válidas')
            return
        }

        startTransition(async () => {
            const res = await impersonateUser(user.id);
            if (res.success) {
                toast.success(`Entraste como ${user.email}`);
                router.refresh();
                router.push("/");
            } else {
                toast.error(res.message);
            }
        });
    }

    return (
        <>
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button variant="ghost" className="h-8 w-8 p-0">
                        <MoreHorizontal className="w-4 h-4" />
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                    <DropdownMenuLabel>Acciones</DropdownMenuLabel>
                    <DropdownMenuItem
                        onClick={() => openDialogGetUserId(user.id, 'editar', true)}
                    >
                        Editar
                    </DropdownMenuItem>
                    <DropdownMenuItem
                        onClick={() => router.push(`/admin/password?userId=${user.id}`)}
                    >
                        Contraseña
                    </DropdownMenuItem>
                    {(currentUserRol === 'admin' || currentUserRol === 'super_admin') &&
                        <DropdownMenuItem
                            onClick={() => openDialogGetUserId(user.id, 'tools', true,)}
                        >
                            Herramientas
                        </DropdownMenuItem>
                    }
                    <DropdownMenuItem
                        onClick={() => openDialogGetUserId(user.id, 'backup', true)}
                    >
                        Backup
                    </DropdownMenuItem>

                    <DropdownMenuItem
                        onClick={() => router.push(`/admin/credits?userId=${user.id}`)}
                    >
                        Créditos
                    </DropdownMenuItem>
                    <DropdownMenuItem
                        onClick={() => handleUserDashboard()}
                    >
                        Ingresar
                    </DropdownMenuItem>
                    {(currentUserRol === 'admin' || currentUserRol === 'super_admin') &&
                        <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                                onClick={() => openDialogGetUserId(user.id, 'delete', true)}
                                className="text-red-600"
                            >
                                Eliminar
                            </DropdownMenuItem>
                        </>
                    }
                </DropdownMenuContent>
            </DropdownMenu>
        </>
    )
}
