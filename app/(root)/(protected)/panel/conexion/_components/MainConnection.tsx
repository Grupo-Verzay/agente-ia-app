'use client';

import { useState } from "react";
import { useRouter } from "next/navigation";
import { agregarApi, editarApiKey, eliminarApiKey } from "@/actions/api-action";
import { DialogApiKeyType } from "../connection-types";
import { ApiKey, User } from "@prisma/client";
import { getColumns, DataGrid, CreateDialog, EditDialog, DeleteDialog } from "./";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { MetricCard } from "@/components/custom/MetricCard";
import { TooltipProvider } from "@/components/ui/tooltip";
import { PlusCircle, Link2, KeyRound } from "lucide-react";
import { toast } from "sonner";

interface Props {
    searchParams: { [key: string]: string | undefined },
    user: User
    apiKeys: ApiKey[]
};

export const MainConnection = ({ searchParams, user, apiKeys }: Props) => {
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

    return (
        <TooltipProvider delayDuration={120}>
            <div className="flex h-full min-w-0 flex-col gap-2">
                {/* MetricCards */}
                <div className="flex flex-wrap gap-3">
                    <div className="flex-1">
                        <MetricCard
                            icon={<Link2 className="h-4 w-4" />}
                            label="Total conexiones"
                            value={apiKeys.length}
                            helper="Todas las API Keys registradas"
                            color="#3B82F6"
                        />
                    </div>
                    <div className="flex-1">
                        <MetricCard
                            icon={<KeyRound className="h-4 w-4" />}
                            label="APIs únicas"
                            value={new Set(apiKeys.map(k => k.url)).size}
                            helper="Servidores Evolution distintos"
                            color="#8B5CF6"
                        />
                    </div>
                </div>

                {/* Actions */}
                <div className="flex items-center justify-end">
                    <Button
                        onClick={() => handleDialogAction('null', 'create')}
                        className="bg-blue-600 hover:bg-blue-700 text-white shadow-sm"
                    >
                        <PlusCircle className="h-4 w-4" />
                        Crear conexión
                    </Button>
                </div>

                {/* Table */}
                <Card className="flex-1 min-h-0 border border-border/60 shadow-sm">
                    <CardContent className="p-0 h-full">
                        <DataGrid<ApiKey, unknown> columns={columns} data={apiKeys} />
                    </CardContent>
                </Card>

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
