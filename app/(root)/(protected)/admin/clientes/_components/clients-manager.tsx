'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { DataTable } from './data-table';
import { getColumns } from './columns';
import { ClientInterface } from '@/lib/types';
import {
    createUserWithPausar,
    deleteUser,
    updateAbrirPhrase,
    updateClientData
} from '@/actions/userClientDataActions';
import { autoConfigureUserAi } from '@/actions/userAiconfig-actions';
import { CreateDialog, DeleteDialog, ToolsDialog, EditDialog, ClientStatusPanel, StatusKey, UserBackupDialog } from './';
import { ApiKey } from '@prisma/client';
import { UserFormValues } from '@/schema/user';
import { Country } from '@/components/custom/CountryCodeSelect';
import bcrypt from "bcryptjs";
import { LENGTH_PASSWORD_HASH } from '@/types/generic';


export type DialogType = 'editar' | 'tools' | 'delete' | 'backup'

interface Props {
    users: ClientInterface[],
    apikeys: ApiKey[],
    availableApikeys: ApiKey[],
    currentUserRol: string,
    countries: Country[]
};

export const ClientsManager = ({ users, apikeys, availableApikeys, currentUserRol, countries }: Props) => {
    const router = useRouter();
    const [openDeleteDialog, setOpenDeleteDialog] = useState(false);
    const [openCreateDialog, setOpenCreateDialog] = useState(false);
    const [openToolsDialog, setOpenToolsDialog] = useState(false);
    const [openEditDialog, setOpenEditDialog] = useState(false);
    const [openBackupDialog, setOpenBackupDialog] = useState(false);
    const [user, setCurrentUser] = useState<ClientInterface>();
    const [statusFilter, setStatusFilter] = useState<StatusKey | null>(null);


    const handleCreate = async (formData: UserFormValues) => {
        const toastId = 'create-client';
        toast.loading('Creando cliente...', { id: toastId });

        const {
            name,
            email,
            password,
            company,
            notificationNumber,
            role,
            plan,
            apiKeyId,
            delSeguimiento,
            webhookUrl,
            apiUrl,
            timezone
        } = formData;

        const passwordHash = await bcrypt.hash(password, LENGTH_PASSWORD_HASH);

        const result = await createUserWithPausar({
            name,
            email,
            password: passwordHash,
            company,
            notificationNumber,
            role,
            plan,
            apiKeyId,
            delSeguimiento,
            webhookUrl: 'https://backend.ia-app.com/webhook',
            apiUrl,
            timezone,
            status: true,
            passPlainTxt: password,
            meetingDuration: 60,//tiempo en minutos
            meetingUrl: null,//tiempo en minutos
            delayTimeGpt: '12',//tiempo en minutos
            muteAgentResponses: false,
            enabledSynthesizer: false,
            enabledLeadStatusClassifier: false,
            enabledCrmFollowUps: false,
            onFacebook: false,
            onInstagram: false,
            preferredCurrencyCode: 'COP',
            lat: '0.0000',
            lng: '0.0000',
            mapsUrl: 'https://maps.google.com/?q=0,0',
            openingPhrase: 'Fue un gusto ayudarle.',
            theme: 'Default',
            image: null,
            emailVerified: null,
            autoReactivate: '30',
            aiModelId: null,
            defaultAiModelId: null,
            defaultProviderId: null,
            tokenVersion: 0
        });

        if (result.success) {
            if (result.data?.id && apiUrl) {
                await autoConfigureUserAi(result.data.id, apiUrl);
            }
            toast.success('Cliente creado', { id: toastId });
            router.refresh();
        } else {
            toast.error(result.message || 'Error al crear cliente', { id: toastId });
        }

        setOpenCreateDialog(false);
    };

    const handleEdit = async (userId: string, formData: FormData) => {
        const toastId = 'edit-client';
        toast.loading('Actualizando...', { id: toastId });

        // === Validación y actualización de openMsg ===
        if (formData.has('openMsg')) {
            const currentValue = String(formData.get('openMsg') ?? '');

            const currentUser = users.find(user => user.id === userId);
            const savedMsg = currentUser?.pausar.find(p => p.tipo === 'abrir')?.mensaje ?? '';
            if (savedMsg !== currentValue) {
                const result = await updateAbrirPhrase(userId, currentValue);
                if (!result.success) {
                    toast.error(result.message || 'Error al actualizar abrirPhrase', { id: toastId });
                    return;
                }
            }
        }
        formData.delete('openMsg');

        // === Actualización del cliente ===
        const result = await updateClientData(userId, formData)

        if (result.success) {
            toast.success(result.message, { id: toastId });
            router.refresh();
            setOpenEditDialog(false);
        } else {
            toast.error(result.message || 'Error al editar cliente', { id: toastId });
        }
    };

    const handleDelete = async (userId: string) => {
        if (!userId || userId === '' || !openDeleteDialog) return toast.error('Faltan parametros para completar la ejecución.');;

        const toastId = 'delete-client';
        toast.loading('Eliminando cliente...', { id: toastId });
        const result = await deleteUser(userId);

        if (result.success) {
            toast.success('Cliente eliminado', { id: toastId });
            router.refresh();
        } else {
            toast.error('Error al eliminar cliente', { id: toastId });
        }
    };

    const openDialogGetUserId = (userId: string, dialog: DialogType, state: boolean) => {
        const currentUser = users.filter(user => user.id === userId)[0];
        setCurrentUser(currentUser);

        if (dialog === 'tools') return setOpenToolsDialog(state);
        if (dialog === 'delete') return setOpenDeleteDialog(state);
        if (dialog === 'editar') return setOpenEditDialog(state);
        if (dialog === 'backup') return setOpenBackupDialog(state);
    };

    const openCreateDialogUser = () => {
        setOpenCreateDialog(true);
    };

    const filteredUsers = statusFilter
        ? users.filter((user) => {
            if (statusFilter === "qrDisconnected") return user.qrStatus === true;
            if (statusFilter === "qrConnected") return user.qrStatus === false;
            if (statusFilter === "evoOn") return user.isEvoEnabled === true;
            if (statusFilter === "evoOff") return user.isEvoEnabled === false;
            return true;
        })
        : users;

    const columns = getColumns(openDialogGetUserId, currentUserRol);

    return (
        <>

            {/* Gestión de clients */}
            <DataTable
                columns={columns}
                data={filteredUsers}
                currentUserRol={currentUserRol}
                openCreateDialogUser={openCreateDialogUser}
                setStatusFilter={setStatusFilter}
            />



            {/* Dialog create */}
            {availableApikeys && (
                <CreateDialog
                    countries={countries}
                    handleCreate={handleCreate}
                    setOpenCreateDialog={setOpenCreateDialog}
                    openCreateDialog={openCreateDialog}
                    apikeys={availableApikeys}
                />
            )}
            {/* Dialog delete */}
            {user && apikeys && (
                <EditDialog
                    openEditDialog={openEditDialog}
                    setOpenEditDialog={setOpenEditDialog}
                    handleEdit={handleEdit}
                    user={user}
                    apikeys={apikeys}
                    currentUserRol={currentUserRol}
                />
            )}
            {/* Dialog delete */}
            {user && (
                <DeleteDialog
                    handleDelete={handleDelete}
                    openDeleteDialog={openDeleteDialog}
                    setOpenDeleteDialog={setOpenDeleteDialog}
                    user={user}
                />
            )}
            {/* Tools */}
            {user && (
                <ToolsDialog
                    openToolsDialog={openToolsDialog}
                    setOpenToolsDialog={setOpenToolsDialog}
                    user={user}
                />
            )}
            {user && (
                <UserBackupDialog
                    openBackupDialog={openBackupDialog}
                    setOpenBackupDialog={setOpenBackupDialog}
                    user={user}
                />
            )}
        </>
    );
};
