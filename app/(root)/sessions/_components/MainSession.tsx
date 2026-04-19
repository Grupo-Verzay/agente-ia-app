'use client';
import { useRouter } from 'next/navigation';
import { Session } from '@prisma/client';
// import { getColumns } from './Columns';
import { DataGrid } from './DataGrid';
import { toast } from 'sonner';
import { useState } from 'react';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { deleteSession } from '@/actions/session-action';
import { deleteConversationN8N } from '@/actions/n8n-chat-historial-action';

interface SessionData {
    sessionId: number, remoteJid: string, userId: string
}

export type DialogSessionType = 'deleteClient' | 'deleteConversation'
interface OperationResult {
    success: boolean;
    message: string;
}
export function MainSession({ sessions }: { sessions: Session[] }) {
    const router = useRouter();
    const [showConfirmDeleteClient, setShowConfirmDeleteClient] = useState(false);
    const [showConfirmDeleteConversation, setShowConfirmDeleteConversation] = useState(false);
    const [sessionToDelete, setSessionToDelete] = useState<SessionData | null>(null);


    const handleDeleteClient = (sessionId: number, remoteJid: string, userId: string, dialog: DialogSessionType) => {
        if (!remoteJid) {
            toast.error('Sesión no encontrada.');
            return;
        }
        setSessionToDelete({ sessionId, remoteJid, userId });
        if (dialog === 'deleteClient') return setShowConfirmDeleteClient(true);
        if (dialog === 'deleteConversation') return setShowConfirmDeleteConversation(true);
    };

    const confirmDelete = async (dialogType: DialogSessionType) => {
        if (!sessionToDelete) {
            console.error('No session selected for deletion');
            return;
        }

        const isDeleteClient = dialogType === 'deleteClient';
        const operationName = isDeleteClient ? 'cliente' : 'conversación';
        const toastId = `delete-${dialogType}`;

        toast.loading(`Eliminando ${operationName}...`, { id: toastId });

        try {
            const { userId, sessionId, remoteJid } = sessionToDelete;
            let result: OperationResult;

            if (isDeleteClient) {
                result = await deleteSession(userId, sessionId, remoteJid);
            } else {
                result = await deleteConversationN8N(userId, sessionId, remoteJid);
            }

            if (result.success) {
                toast.success(result.message, { id: toastId });
                router.refresh();
            } else {
                toast.error(result.message || `Error al eliminar ${operationName}`, { id: toastId });
            }
        } catch (error) {
            console.error(`Error deleting ${operationName}:`, error);
            toast.error(
                `Error inesperado al eliminar ${operationName}. Por favor intente nuevamente.`,
                { id: toastId }
            );
        } finally {
            setSessionToDelete(null);
            setShowConfirmDeleteClient(false);
            setShowConfirmDeleteConversation(false);
        }
    };

    // const columns = getColumns(handleDeleteClient);

    return (
        <div className='min-h-screen'>
            {/* <DataGrid<Session, unknown> columns={columns} data={sessions} /> */}
            {/* Delete client */}
            <AlertDialog open={showConfirmDeleteClient} onOpenChange={(open) => {
                if (!open) {
                    setSessionToDelete(null);
                }
                setShowConfirmDeleteClient(open);
            }}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Eliminar cliente - ¿Estás absolutamente seguro?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Esta acción no puede deshacerse. Esto eliminará permanentemente los datos
                            del cliente de nuestros servidores.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={() => confirmDelete('deleteClient')}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                            Eliminar cliente
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
            {/* Delete conversation*/}
            <AlertDialog open={showConfirmDeleteConversation} onOpenChange={(open) => {
                if (!open) {
                    setSessionToDelete(null);
                }
                setShowConfirmDeleteConversation(open);
            }}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Eliminar conversación - ¿Estás absolutamente seguro?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Esta acción no puede deshacerse. Esto eliminará permanentemente el <strong>HISTORIAL de CONVERSACIÓN</strong>&nbsp;
                            del cliente de nuestros servidores.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={() => confirmDelete('deleteConversation')}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                            Eliminar conversación
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}