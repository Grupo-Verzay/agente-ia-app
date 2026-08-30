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
import { useTransition } from 'react'
import { impersonateUser } from '@/actions/auth-action'
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

    /**
     * Quién manda sobre la cuenta del cliente. Un colaborador del equipo con
     * clientes asignados no está en esta lista: a él se le pasa una cuenta para
     * que entre a arreglarla, no para que la administre, así que solo le queda
     * "Ingresar".
     */
    const puedeGestionar =
        currentUserRol === 'admin' || currentUserRol === 'super_admin' || currentUserRol === 'reseller'

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
                    {puedeGestionar &&
                        <DropdownMenuItem
                            onClick={() => openDialogGetUserId(user.id, 'editar', true)}
                        >
                            Editar
                        </DropdownMenuItem>
                    }
                    {puedeGestionar &&
                        <DropdownMenuItem
                            onClick={() => openDialogGetUserId(user.id, 'modules', true)}
                        >
                            Módulos
                        </DropdownMenuItem>
                    }
                    {/* Pasarle la cuenta a alguien del equipo. Se decide aquí,
                        que es donde uno está mirando al cliente. */}
                    {puedeGestionar &&
                        <DropdownMenuItem
                            onClick={() => openDialogGetUserId(user.id, 'asignar', true)}
                        >
                            Asignar a
                        </DropdownMenuItem>
                    }
                    {/* Mover un cliente de una licencia a otra. Solo tiene sentido
                        para el reseller: es quien tiene bolsas de licencias, y la
                        pantalla no hace nada con un cliente que no es suyo. */}
                    {currentUserRol === 'reseller' &&
                        <DropdownMenuItem
                            onClick={() => openDialogGetUserId(user.id, 'plan', true)}
                        >
                            Cambiar plan
                        </DropdownMenuItem>
                    }
                    <DropdownMenuItem
                        onClick={() => handleUserDashboard()}
                    >
                        Ingresar
                    </DropdownMenuItem>
                    {puedeGestionar &&
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
