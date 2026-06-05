import { MainReminders } from "./_components"
import { currentUser } from "@/lib/auth"
import { redirect } from "next/navigation"
import { getApiKeyById } from "@/actions/api-action"
import { ApiKey, Instancia, Reminders, Session, Workflow } from "@prisma/client"
import { getReminderDeliverySummaries, getRemindersByUserId } from "@/actions/reminders-actions"
import { getSessionsByUserId } from "@/actions/session-action"
import { getWorkFlowByUser } from "@/actions/workflow-actions"
import { getInstancesByUserId } from "@/actions/instances-actions"

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

const RemindersPage = async () => {
    const user = await currentUser()
    if (!user) redirect("/login")

    const effectiveId: string = user.effectiveId;

    // Obtener API Key
    const resApikey = user.apiKeyId ? await getApiKeyById(user.apiKeyId) : { success: false, data: null };
    if (!resApikey.success || !hasApiKey(resApikey)) {
        console.error("[REMINDERS_PAGE] No se encontró una API Key válida para el usuario.")
        return <strong className="text-red-500">No se encontró una API Key válida.</strong>
    }

    // Obtener recordatorios
    const resReminder = await getRemindersByUserId(effectiveId)
    if (!resReminder.success) {
        console.error("[REMINDERS_PAGE] Error al obtener recordatorios:", resReminder.message)
        return <strong>404</strong>
    }
    const reminders = Array.isArray(resReminder.data) ? (resReminder.data as Reminders[]) : []
    const deliveryRes = await getReminderDeliverySummaries(reminders.map((reminder) => reminder.id))
    const deliverySummaries = deliveryRes.success ? deliveryRes.data ?? {} : {}

    // Obtener sesiones
    const resSession = await getSessionsByUserId(effectiveId, 0, 1000)
    if (!resSession.success) {
        console.error("[REMINDERS_PAGE] Error al obtener sesiones:", resSession.message)
        return <strong>404</strong>
    }
    const sessions = hasSession(resSession) ? resSession.data : []

    // Obtener workflows
    const resWorkflow = await getWorkFlowByUser(effectiveId)
    if (!resWorkflow.success) {
        console.error("[REMINDERS_PAGE] Error al obtener flujos de trabajo:", resWorkflow.message)
        return <strong>404</strong>
    }
    const workflows = hasWorkflow(resWorkflow) ? resWorkflow.data : []


    const resInstancia = await getInstancesByUserId(effectiveId)
    if (!resInstancia.success || !hasInstancia(resInstancia)) {
        console.error("[REMINDERS_PAGE] No se encontró una API Key válida para el usuario.")
        return <strong className="text-red-500">No se encontró una API Key válida.</strong>
    }

    /* Flag para comportamiento especifico del módulo de campañas */
    const isCampaignPage = false;

    return (
        <MainReminders
            isCampaignPage={isCampaignPage}
            user={user}
            apiKey={resApikey.data}
            reminders={reminders}
            deliverySummaries={deliverySummaries}
            leads={sessions}
            workflows={workflows}
            instancia={resInstancia.data[0]}
        />
    )

}

export default RemindersPage
