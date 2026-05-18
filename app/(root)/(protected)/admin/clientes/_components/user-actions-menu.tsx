'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { MoreHorizontal, Loader2, ArrowLeftRight } from 'lucide-react'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import { DialogType } from './clients-manager'
import { ClientInterface } from '@/lib/types'
import { useRouter } from 'next/navigation'
import { impersonateUser } from '@/actions/auth-action'
import { setUserConnectionType } from '@/actions/instances-actions'
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

    // Estado local para el diálogo Canal
    const [showCanal, setShowCanal] = useState(false)
    const [applyingCanal, setApplyingCanal] = useState(false)
    const waInstance = (user.instancias ?? []).find(
        (i: any) => i.instanceType !== 'Instagram' && i.instanceType !== 'Facebook'
    )
    const [connectionType, setConnectionType] = useState<'baileys' | 'Whatsapp'>(
        waInstance?.instanceType === 'baileys' ? 'baileys' : 'Whatsapp'
    )

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

    const handleApplyCanal = async () => {
        setApplyingCanal(true)
        const res = await setUserConnectionType(user.id, connectionType, user.company ?? undefined)
        setApplyingCanal(false)
        if (res.success) {
            toast.success(res.message)
            setShowCanal(false)
        } else {
            toast.error(res.message)
        }
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
                    {(currentUserRol === 'admin' || currentUserRol === 'super_admin') &&
                        <DropdownMenuItem
                            onClick={() => openDialogGetUserId(user.id, 'tools', true,)}
                        >
                            Tools
                        </DropdownMenuItem>
                    }
                    <DropdownMenuItem
                        onClick={() => openDialogGetUserId(user.id, 'modules', true)}
                    >
                        Módulos
                    </DropdownMenuItem>
                    <DropdownMenuItem
                        onClick={() => openDialogGetUserId(user.id, 'backup', true)}
                    >
                        Backup
                    </DropdownMenuItem>
                    <DropdownMenuItem
                        onClick={() => setShowCanal(true)}
                    >
                        Canal
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

            {/* Diálogo Canal — completamente local, sin pasar por clients-manager */}
            <Dialog open={showCanal} onOpenChange={setShowCanal}>
                <DialogContent className="max-w-sm">
                    <DialogHeader>
                        <DialogTitle>Canal WhatsApp</DialogTitle>
                        <DialogDescription>
                            {user.company ?? user.name} — cambia el tipo de conexión WhatsApp.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="flex flex-col gap-4 py-2">
                        <div className="flex flex-col gap-2">
                            <Label>Tipo de canal</Label>
                            <Select
                                value={connectionType}
                                onValueChange={(v) => setConnectionType(v as 'baileys' | 'Whatsapp')}
                            >
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="Whatsapp">Evolution API</SelectItem>
                                    <SelectItem value="baileys">Baileys</SelectItem>
                                </SelectContent>
                            </Select>
                            {waInstance && (
                                <p className="text-xs text-muted-foreground">
                                    Instancia actual: {waInstance.instanceName} ({waInstance.instanceType})
                                </p>
                            )}
                        </div>
                        <div className="flex justify-end gap-2">
                            <Button variant="outline" onClick={() => setShowCanal(false)}>
                                Cancelar
                            </Button>
                            <Button onClick={handleApplyCanal} disabled={applyingCanal}>
                                {applyingCanal && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                                Aplicar
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </>
    )
}
