'use client'

import { exportToExcel } from '@/helpers/exportToExcel'
import {
    DropdownMenu,
    DropdownMenuTrigger,
    DropdownMenuContent,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuItem,
} from '@/components/ui/dropdown-menu'
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import { useState } from 'react'

import {
    FileDown,
    UserCheck,
    UserX,
    Trash2,
    History,
    MoreHorizontal
} from 'lucide-react'

type BulkActionType = 'activate' | 'deactivate' | 'deleteAll' | 'clearHistory' | 'clearSeguimientos'
// type BulkActionType = 'activate' | 'deactivate' | 'deleteAll'

interface BulkActionsDropdownProps {
    userId: string
    onActivateAll: (userId: string) => Promise<any>
    onDeactivateAll: (userId: string) => Promise<any>
    onDeleteAll: (userId: string) => Promise<any>
    onClearHistory: (userId: string) => Promise<any>
    onClearSeguimientos: (userId: string) => Promise<any>
    onSuccess?: () => void
}

export const BulkActionsDropdown: React.FC<BulkActionsDropdownProps> = ({
    userId,
    onActivateAll,
    onDeactivateAll,
    onDeleteAll,
    onClearHistory,
    onClearSeguimientos,
    onSuccess,
}) => {
    const [dialogOpen, setDialogOpen] = useState(false)
    const [actionType, setActionType] = useState<BulkActionType | null>(null)
    const [confirmationText, setConfirmationText] = useState('')

    const actionMap: Record<BulkActionType, {
        label: string
        confirmPhrase: string
        handler: (userId: string) => Promise<any>
        toastId: string
    }> = {
        activate: {
            label: 'Activar clientes',
            // confirmPhrase: 'Activar clientes',
            confirmPhrase: 'si',
            handler: onActivateAll,
            toastId: 'activate-all',
        },
        deactivate: {
            label: 'Desactivar clientes',
            // confirmPhrase: 'Desactivar clientes',
            confirmPhrase: 'si',
            handler: onDeactivateAll,
            toastId: 'deactivate-all',
        },
        deleteAll: {
            label: 'Eliminar clientes',
            // confirmPhrase: 'Eliminar clientes',
            confirmPhrase: 'si',
            handler: onDeleteAll,
            toastId: 'delete-all',
        },
        clearHistory: {
            label: 'Borrar historial de todos',
            // confirmPhrase: 'Borrar historial de todos',
            confirmPhrase: 'si',
            handler: onClearHistory,
            toastId: 'clear-history',
        },
        clearSeguimientos: {
            label: 'Borrar seguimientos de todos',
            // confirmPhrase: 'Borrar historial de todos',
            confirmPhrase: 'si',
            handler: onClearSeguimientos,
            toastId: 'clear-reminders',
        },
    };

    const openDialog = (type: BulkActionType) => {
        setActionType(type)
        setConfirmationText('')
        setDialogOpen(true)
    };

    const confirmAction = async () => {
        if (!actionType) return

        const { handler, label, toastId, confirmPhrase } = actionMap[actionType]

        toast.loading(`${label}...`, { id: toastId })

        try {
            const result = await handler(userId)
            if (result.success) {
                toast.success(result.message || `${label} completado`, { id: toastId })
                onSuccess?.()
            } else {
                toast.error(result.message || `Error al ejecutar ${label}`, { id: toastId })
            }
        } catch (error) {
            console.error(`Error en ${label}:`, error)
            toast.error(`Error inesperado al ejecutar ${label}`, { id: toastId })
        } finally {
            setDialogOpen(false)
        }
    };

    const isConfirmValid = actionType
        ? confirmationText.trim() === actionMap[actionType].confirmPhrase
        : false;

    return (
        <>
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="icon" className="ml-2">
                        <MoreHorizontal className="h-4 w-4" />
                    </Button>
                </DropdownMenuTrigger>

                <DropdownMenuContent align="end" className="w-56">
                    <DropdownMenuLabel className="flex flex-row gap-2 justify-start items-center">
                        {/* <FileArchive className="h-4 w-4" /> */}
                        Exportar
                    </DropdownMenuLabel>
                    <DropdownMenuItem
                        onClick={() => exportToExcel({
                            // data: table.getFilteredRowModel().rows.map(row => row.original),
                            filename: 'clientes.xlsx',
                            sheetName: 'Clientes'
                        })}
                        className="text-green-600 hover:bg-green-50 dark:hover:bg-green-900/40"
                    >
                        <FileDown className="mr-2 h-4 w-4" />
                        Exportar a Excel
                    </DropdownMenuItem>

                    <DropdownMenuSeparator />

                    <DropdownMenuLabel className="flex flex-row gap-2 justify-start items-center">
                        {/* <Cog className="h-4 w-4" /> */}
                        Gestión masiva
                    </DropdownMenuLabel>
                    <DropdownMenuItem
                        onClick={() => openDialog('activate')}
                        className="text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/40"
                    >
                        <UserCheck className="mr-2 h-4 w-4" />
                        Activar clientes
                    </DropdownMenuItem>
                    <DropdownMenuItem
                        onClick={() => openDialog('deactivate')}
                        className="text-red-600 hover:bg-orange-50 dark:hover:bg-orange-900/40"
                    >
                        <UserX className="mr-2 h-4 w-4" />
                        Desactivar clientes
                    </DropdownMenuItem>

                    <DropdownMenuSeparator />

                    <DropdownMenuLabel className="flex flex-row gap-2 justify-start items-center">
                        Riesgo alto
                    </DropdownMenuLabel>
                    <DropdownMenuItem
                        onClick={() => openDialog('clearHistory')}
                        className="text-yellow-600 hover:bg-yellow-50 dark:hover:bg-yellow-900/40"
                    >
                        <History className="mr-2 h-4 w-4" />
                        Borrar historial
                    </DropdownMenuItem>
                    <DropdownMenuItem
                        onClick={() => openDialog('deleteAll')}
                        className="text-red-600 hover:bg-red-50 dark:hover:bg-red-900/40"
                    >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Eliminar clientes
                    </DropdownMenuItem>
                    <DropdownMenuItem
                        onClick={() => openDialog('clearSeguimientos')}
                        className="text-red-600 hover:bg-red-50 dark:hover:bg-red-900/40"
                    >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Eliminar seguimientos
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>

            <AlertDialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <AlertDialogContent className="text-center space-y-4">
                    <AlertDialogHeader className="space-y-2">
                        <AlertDialogTitle className="text-destructive text-xl font-bold">
                            ¿Estás completamente seguro?
                        </AlertDialogTitle>

                        <AlertDialogDescription className="text-sm text-muted-foreground">
                            Vas a ejecutar:
                            <span className="block text-base font-semibold mt-1 text-foreground">
                                {actionType ? actionMap[actionType].label : ''}
                            </span>

                            <span className="block mt-3 text-destructive font-semibold">
                                Esta acción no se puede deshacer.
                            </span>
                        </AlertDialogDescription>
                    </AlertDialogHeader>

                    <AlertDialogFooter className="flex justify-center gap-4 pt-2">
                        <AlertDialogCancel className="font-medium">Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={confirmAction}
                            // disabled={!isConfirmValid}
                            className="bg-red-600 hover:bg-red-700 text-white font-semibold px-6"
                        >
                            Confirmar
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* 
            <AlertDialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            ¿Estás seguro de que quieres ejecutar esta acción masiva?
                        </AlertDialogTitle>
                        <AlertDialogDescription className="space-y-2">
                            Esta acción : "{actionType ? `"${actionMap[actionType].label}"` : ''}" <strong className="text-red-600">NO</strong> se puede deshacer.
                            ¿Estás seguro?
                            <Input
                                placeholder="Escribe aquí..."
                                value={confirmationText}
                                onChange={(e) => setConfirmationText(e.target.value)}
                            /> 
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={confirmAction}
                        // disabled={!isConfirmValid}
                        >
                            Confirmar
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog> */}
        </>
    )
}
