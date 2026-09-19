'use client';

import { useState } from "react";
import type { CurrentUser } from '@/lib/auth';
import { useRouter } from "next/navigation";
import { agregarApi, editarApiKey, eliminarApiKey } from "@/actions/api-action";
import { DialogApiKeyType } from "../connection-types";
import { ApiKey, User } from "@prisma/client";
import { getColumns, DataGrid, CreateDialog, EditDialog, DeleteDialog } from "./";
import { WahaServerCard } from "./WahaServerCard";
import type { WahaServerData } from "@/actions/admin/waha-server-actions";
import { PastillasDeMetricas } from "@/components/shared/PastillasDeMetricas";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Link2, KeyRound, CalendarCheck, Clock } from "lucide-react";
import { toast } from "sonner";

interface Props {
    searchParams: { [key: string]: string | undefined },
    user: CurrentUser
    apiKeys: ApiKey[]
    servidorWaha: WahaServerData
};

export const MainConnection = ({ searchParams, user, apiKeys, servidorWaha }: Props) => {
    const router = useRouter();
    const [apiKeyId, setApiKeyId] = useState<string>();
    const [openCreateDialog, setOpenCreateDialog] = useState(false);
    const [openEditDialog, setOpenEditDialog] = useState(false);
    const [openDeleteDialog, setOpenDeleteDialog] = useState(false);

    const currentApiKey = apiKeys.find(ak => ak.id === apiKeyId);

    const handleEdit = async (id: string, formData: FormData) => {
        const toastId = 'edit-apikey';
        toast.loading('Editando API Key...', { id: toastId });
        formData.append('id', id);
        const result = await editarApiKey(formData);
        if (result.success) {
            toast.success(result.message, { id: toastId });
            router.refresh();
        } else {
            toast.error(result.message || 'Error al editar API Key', { id: toastId });
        }
        setOpenEditDialog(false);
    };

    const handleCreate = async (formData: FormData) => {
        const toastId = 'create-apikey';
        toast.loading('Creando API Key...', { id: toastId });
        const result = await agregarApi(formData);
        if (result.success) {
            toast.success(result.message, { id: toastId });
            router.refresh();
        } else {
            toast.error(result.message || 'Error al crear API Key', { id: toastId });
        }
        setOpenCreateDialog(false);
    };

    const handleDelete = async (id: string) => {
        const toastId = 'delete-apikey';
        toast.loading('Eliminando API Key...', { id: toastId });
        const result = await eliminarApiKey(id);
        if (result.success) {
            toast.success(result.message, { id: toastId });
            router.refresh();
        } else {
            toast.error(result.message || 'Error al eliminar API Key', { id: toastId });
        }
        setOpenDeleteDialog(false);
    };

    const handleDialogAction = (apiKeyId: string, dialogType: DialogApiKeyType) => {
        setApiKeyId(apiKeyId);
        if (dialogType === 'create') return setOpenCreateDialog(true);
        if (dialogType === 'edit') return setOpenEditDialog(true);
        if (dialogType === 'delete') return setOpenDeleteDialog(true);
    };

    const columns = getColumns(handleDialogAction);

    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const recentCount = apiKeys.filter(k => new Date(k.createdAt) >= thirtyDaysAgo).length;
    const oldCount = apiKeys.length - recentCount;

    return (
        <TooltipProvider delayDuration={120}>
            <div className="flex h-full min-w-0 w-full flex-col gap-2">
                {/* Servidor de Waha. Es otro proveedor con url + API key, igual que
                    Evolution, asi que se configura en la misma pantalla. */}
                <WahaServerCard servidor={servidorWaha} />

                {/* Table */}
                <div className="flex-1 min-h-0">
                    <DataGrid<ApiKey, unknown>
                        columns={columns}
                        data={apiKeys}
                        onCreateClick={() => handleDialogAction('null', 'create')}
                        metricas={[
                            { clave: 'total', icono: <Link2 />, etiqueta: 'Total conexiones', valor: apiKeys.length, color: '#3B82F6', ayuda: 'Todas las API Keys registradas' },
                            { clave: 'servidores', icono: <KeyRound />, etiqueta: 'Servidores únicos', valor: new Set(apiKeys.map(k => k.url)).size, color: '#8B5CF6', ayuda: 'Servidores Evolution distintos' },
                            { clave: 'recientes', icono: <CalendarCheck />, etiqueta: 'Recientes (30d)', valor: recentCount, color: '#22C55E', ayuda: 'Agregadas en los últimos 30 días' },
                            { clave: 'antiguas', icono: <Clock />, etiqueta: 'Antiguas', valor: oldCount, color: '#F59E0B', ayuda: 'Con más de 30 días de antigüedad' },
                        ]}
                    />
                </div>

                <CreateDialog
                    handleCreate={handleCreate}
                    setOpenCreateDialog={setOpenCreateDialog}
                    openCreateDialog={openCreateDialog}
                />
                {currentApiKey && (
                    <EditDialog
                        handleEdit={handleEdit}
                        setOpenEditDialog={setOpenEditDialog}
                        openEditDialog={openEditDialog}
                        apikey={currentApiKey}
                    />
                )}
                {currentApiKey && (
                    <DeleteDialog
                        handleDelete={handleDelete}
                        setOpenDeleteDialog={setOpenDeleteDialog}
                        openDeleteDialog={openDeleteDialog}
                        apikey={currentApiKey}
                    />
                )}
            </div>
        </TooltipProvider>
    );
};
