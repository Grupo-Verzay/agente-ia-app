'use client';

import { useState } from "react";
import { useRouter } from "next/navigation";
import { agregarApi, editarApiKey, eliminarApiKey } from "@/actions/api-action";
import { DialogApiKeyType } from "../connection-types";
import { ApiKey, User } from "@prisma/client";
import { getColumns, DataGrid, CreateDialog, EditDialog, DeleteDialog } from "./";
import { Button } from "@/components/ui/button";

import { PlusCircle } from "lucide-react";
import { toast } from "sonner";

interface Props {
    searchParams: { [key: string]: string | undefined },
    user: User
    apiKeys: ApiKey[]
};

export const MainConnection = ({ searchParams, user, apiKeys }: Props) => {
    const router = useRouter();
    const [apiKeyId, setApiKeyId] = useState<string>();
    /* Dialog actions */
    const [openCreateDialog, setOpenCreateDialog] = useState(false);
    const [openEditDialog, setOpenEditDialog] = useState(false);
    const [openDeleteDialog, setOpenDeleteDialog] = useState(false);

    const currentApiKey = apiKeys.filter(ak => ak.id === apiKeyId)[0];

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
        toast.loading('Elimando API Key...', { id: toastId });

        const result = await eliminarApiKey(id);

        if (result.success) {
            toast.success(result.message, { id: toastId });
            router.refresh();
        } else {
            toast.error(result.message || 'Error al eliminar API Key', { id: toastId });
        }

        setOpenCreateDialog(false);
    };

    const handleDialogAction = (apiKeyId: string, dialogType: DialogApiKeyType) => {
        setApiKeyId(apiKeyId);

        if (dialogType === 'create') return setOpenCreateDialog(true);
        if (dialogType === 'edit') return setOpenEditDialog(true);
        if (dialogType === 'delete') return setOpenDeleteDialog(true);

    };

    const columns = getColumns(handleDialogAction);

    return (
        <>
            {/* button-create-client */}
            <div className='absolute top-3 right-2'>
                <Button
                    onClick={() => handleDialogAction('null', 'create')}
                    variant="default"
                    className="bg-blue-600 hover:bg-blue-700 text-white shadow-sm transition-all"
                >
                    Crear
                    <PlusCircle />
                </Button>
            </div>
            <DataGrid<ApiKey, unknown> columns={columns} data={apiKeys} />


            {/* Dialog create */}
            <CreateDialog
                handleCreate={handleCreate}
                setOpenCreateDialog={setOpenCreateDialog}
                openCreateDialog={openCreateDialog}
            />
            {/* Dialog delete */}
            {currentApiKey && (
                <EditDialog
                    handleEdit={handleEdit}
                    setOpenEditDialog={setOpenEditDialog}
                    openEditDialog={openEditDialog}
                    apikey={currentApiKey}
                />
            )}
            {/* Dialog delete */}
            {currentApiKey && (
                <DeleteDialog
                    handleDelete={handleDelete}
                    setOpenDeleteDialog={setOpenDeleteDialog}
                    openDeleteDialog={openDeleteDialog}
                    apikey={currentApiKey}
                />
            )}
        </>
    )
};
