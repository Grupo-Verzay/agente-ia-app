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
import { createIaCreditForUser, rechargeIaCredit } from '@/actions/actions-ia-credits';
import { onCreditsToTokens } from '@/utils/onTokensToCredits';
import { CreateDialog, DeleteDialog, ToolsDialog, EvoDialog, EditDialog, ClientStatusPanel, StatusKey, UserBackupDialog } from './';
import { ApiKey } from '@prisma/client';
import { UserFormValues } from '@/schema/user';
import { Country } from '@/components/custom/CountryCodeSelect';
import bcrypt from "bcryptjs";
import { LENGTH_PASSWORD_HASH } from '@/types/generic';
import { ModuleWithItems } from '@/schema/module';
import { setUserModules } from '@/actions/user-module-actions';
import { ModulesDialog } from '@/components/shared/ModulesDialog';


export type DialogType = 'editar' | 'tools' | 'evo' | 'delete' | 'backup' | 'modules'

interface Props {
    users: ClientInterface[],
    apikeys: ApiKey[],
    availableApikeys: ApiKey[],
    currentUserRol: string,
    countries: Country[],
    allModules: ModuleWithItems[],
};

export const ClientsManager = ({ users, apikeys, availableApikeys, currentUserRol, countries, allModules }: Props) => {
    const router = useRouter();
    const [openDeleteDialog, setOpenDeleteDialog] = useState(false);
    const [openCreateDialog, setOpenCreateDialog] = useState(false);
    const [openToolsDialog, setOpenToolsDialog] = useState(false);
    const [openEvoDialog, setOpenEvoDialog] = useState(false);
    const [openEditDialog, setOpenEditDialog] = useState(false);
    const [openBackupDialog, setOpenBackupDialog] = useState(false);
    const [openModulesDialog, setOpenModulesDialog] = useState(false);
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
            status: formData.status ?? true,
            passPlainTxt: password,
            meetingDuration: 60,//tiempo en minutos
            meetingUrl: null,//tiempo en minutos
            delayTimeGpt: '12',//tiempo en minutos
            muteAgentResponses: false,
            enabledSynthesizer: formData.enabledSynthesizer ?? false,
            enabledLeadStatusClassifier: formData.enabledLeadStatusClassifier ?? false,
            enabledCrmFollowUps: formData.enabledCrmFollowUps ?? false,
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
            tokenVersion: 0,
            enableVoiceResponses: false,
            voiceId: 'nova',
        } as Parameters<typeof createUserWithPausar>[0]);

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

        // === Rehash de contraseña si cambió ===
        const newPass = formData.get('passPlainTxt') as string;
        const currentUser = users.find(u => u.id === userId);
        if (newPass?.trim() && newPass !== currentUser?.passPlainTxt) {
            const hashed = await bcrypt.hash(newPass, LENGTH_PASSWORD_HASH);
            formData.set('password', hashed);
        }

        // === Actualización de créditos ===
        const creditTotalRaw = formData.get('creditTotal');
        const creditUsedRaw = formData.get('creditUsed');
        const creditHasRecord = formData.get('creditHasRecord') === 'true';
        formData.delete('creditTotal');
        formData.delete('creditUsed');
        formData.delete('creditHasRecord');

        if (creditTotalRaw !== null) {
            const total = parseInt(creditTotalRaw as string) || 0;
            const used = parseInt(creditUsedRaw as string) || 0;
            const creditRes = creditHasRecord
                ? await rechargeIaCredit(userId, total, new Date(), onCreditsToTokens(used))
                : await createIaCreditForUser(userId, total, new Date(), onCreditsToTokens(used));
            if (!creditRes.success) {
                console.error('Error al guardar créditos:', creditRes.message);
            }
        }

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

    const handleModules = async (userId: string, moduleIds: string[]) => {
        const toastId = 'modules-client';
        toast.loading('Guardando módulos...', { id: toastId });
        try {
            await setUserModules(userId, moduleIds);
            toast.success('Módulos actualizados', { id: toastId });
            router.refresh();
            setOpenModulesDialog(false);
        } catch {
            toast.error('Error al guardar módulos', { id: toastId });
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
        if (dialog === 'evo') return setOpenEvoDialog(state);
        if (dialog === 'delete') return setOpenDeleteDialog(state);
        if (dialog === 'editar') return setOpenEditDialog(state);
        if (dialog === 'backup') return setOpenBackupDialog(state);
        if (dialog === 'modules') return setOpenModulesDialog(state);
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
        <div className="flex h-full min-w-0 w-full flex-col overflow-hidden">

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
            {/* Dialog editar */}
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
            {/* EVO */}
            {user && (
                <EvoDialog
                    openEvoDialog={openEvoDialog}
                    setOpenEvoDialog={setOpenEvoDialog}
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
            {/* Módulos */}
            {user && (
                <ModulesDialog
                    open={openModulesDialog}
                    setOpen={setOpenModulesDialog}
                    handleModules={handleModules}
                    user={user}
                    allModules={allModules}
                />
            )}
        </div>
    );
};
