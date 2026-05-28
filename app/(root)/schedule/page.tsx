import { ApiKey, Instancia, Reminders, Session, Workflow } from "@prisma/client"

import { currentUser } from '@/lib/auth';

import { getApiKeyById } from "@/actions/api-action"
import { getRemindersByUserId } from "@/actions/reminders-actions"
import { getSessionsByUserId } from "@/actions/session-action"
import { getWorkFlowByUser } from "@/actions/workflow-actions"
import { getInstancesByUserId } from "@/actions/instances-actions"

import { MainSchedule } from './_components';

function hasApiKey(result: { data?: ApiKey | null }): result is { data: ApiKey } {
    return !!result.data
}

function hasReminder(result: { data?: Reminders[] }): result is { data: Reminders[] } {
    return !!result.data
}

function hasSession(result: { data?: Session[] }): result is { data: Session[] } {
    return !!result.data
}

function hasWorkflow(result: { data?: Workflow[] }): result is { data: Workflow[] } {
    return !!result.data
}

function hasInstancia(result: { data?: Instancia[] }): result is { data: Instancia[] } {
    return !!result.data && result.data.length > 0
}

// Puedes precargar el asesor para mostrar info contextual
const SchedulePage = async ({ params }: { params: { userId: string } }) => {
    const user = await currentUser()
    if (!user) return null;

    const effectiveId: string = user.effectiveId;

    // Obtener API Key (opcional — sin ella el módulo de recordatorios no puede enviar mensajes)
    const resApikey = user.apiKeyId ? await getApiKeyById(user.apiKeyId) : { data: null };
    const apiKey = hasApiKey(resApikey) ? resApikey.data : null;

    // Obtener recordatorios, sesiones, workflows e instancia en paralelo
    const [resReminder, resSession, resWorkflow, resInstancia] = await Promise.all([
        getRemindersByUserId(effectiveId),
        getSessionsByUserId(effectiveId),
        getWorkFlowByUser(effectiveId),
        getInstancesByUserId(effectiveId),
    ]);

    if (!resReminder.success) {
        console.error("[REMINDERS_PAGE] Error al obtener recordatorios:", resReminder.message)
        return <strong>404</strong>
    }
    if (!resSession.success) {
        console.error("[REMINDERS_PAGE] Error al obtener sesiones:", resSession.message)
        return <strong>404</strong>
    }
    if (!resWorkflow.success) {
        console.error("[REMINDERS_PAGE] Error al obtener flujos de trabajo:", resWorkflow.message)
        return <strong>404</strong>
    }
    if (!resInstancia.success || !hasInstancia(resInstancia)) {
        console.error("[REMINDERS_PAGE] No se encontraron instancias activas para el usuario.")
        return <strong className="text-red-500">No se encontró ninguna instancia activa. Crea una instancia en la página de Conexión.</strong>
    }

    const reminders = Array.isArray(resReminder.data) ? (resReminder.data as Reminders[]) : []
    const sessions = hasSession(resSession) ? resSession.data : []
    const workflows = hasWorkflow(resWorkflow) ? resWorkflow.data : []

    /* Flag para comportamiento especifico del módulo de campañas */
    const isCampaignPage = false;

    return (
        <MainSchedule
            isCampaignPage={isCampaignPage}
            user={user}
            apiKey={apiKey}
            reminders={reminders}
            leads={sessions}
            workflows={workflows}
            instancia={resInstancia.data[0]}
        />
    );
};

export default SchedulePage;