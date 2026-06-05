import { ApiKey, Instancia, Reminders, Session, User, Workflow } from "@prisma/client";
import { z } from "zod";
import { UserWithApiKeys } from "./schema";

export const repeatTypes = [
    { value: "NONE", label: "No se repite" },
    { value: "DAILY", label: "Cada dia" },
    { value: "WEEKLY", label: "Cada semana" },
    { value: "MONTHLY", label: "Cada mes" },
    { value: "YEARLY", label: "Cada ano" },
    { value: "WEEKDAYS", label: "Dias laborables (L-V)" },
    { value: "EVERYDAY", label: "Todos los dias" }
] as const;

export const reminderSchema = z.object({
    title: z.string({
        required_error: "El titulo es obligatorio.",
        invalid_type_error: "El titulo debe ser un texto.",
    }).min(1, { message: "El titulo no puede estar vacio." }),

    description: z.string().optional(),

    time: z.string({
        required_error: "La fecha y hora son obligatorias.",
        invalid_type_error: "Selecciona una fecha y hora validas.",
    }).min(1),

    repeatType: z.enum(repeatTypes.map(r => r.value) as [string, ...string[]], { errorMap: () => ({ message: "Selecciona un tipo de repeticion valido." }) }).optional(),

    repeatEvery: z.coerce.number()
        .min(1, { message: "Debe ser un numero mayor a 0." })
        .optional(),

    userId: z.string({
        required_error: "El ID de usuario es obligatorio.",
    }).min(1, "El ID de usuario es obligatorio."),

    remoteJid: z.string().optional(),

    instanceName: z.string().optional(),

    pushName: z.string().optional(),

    workflowId: z.string().optional(),

    serverUrl: z.string().optional(),

    apikey: z.string().optional(),

    isSchedule: z.boolean().optional(),

    media: z.string().optional(),

    mediaType: z.enum(["image", "video", "audio", "document"]).optional(),

    nameFile: z.string().optional(),

    campaignMinDelay: z.coerce.number()
        .min(30, { message: "El minimo debe ser de al menos 30 segundos." })
        .max(600, { message: "El minimo no puede superar 600 segundos." })
        .optional(),
    campaignMaxDelay: z.coerce.number()
        .min(30, { message: "El maximo debe ser de al menos 30 segundos." })
        .max(600, { message: "El maximo no puede superar 600 segundos." })
        .optional(),
}).refine((data) => {
    if (data.campaignMinDelay === undefined || data.campaignMaxDelay === undefined) return true;
    return data.campaignMaxDelay >= data.campaignMinDelay;
}, {
    path: ["campaignMaxDelay"],
    message: "El maximo debe ser mayor o igual al minimo.",
})

export type formValuesReminderSchema = z.infer<typeof reminderSchema>

export interface ReminderInterface {
    userId: string,
    serverUrl: string,
    apikey: string,
    workflows?: Workflow[],
    instanceNameReminder: string,
    leads?: Session[],
    initialData?: formValuesReminderSchema | null;
    isSchedule?: boolean
    onSuccess?: () => void,
    onCancel?: () => void,
    dateSchedule?: string,
    instanceId?: string,
    forceCreate?: boolean,
};

export interface MainReminderInterface {
    isCampaignPage: boolean,
    user: UserWithApiKeys,
    apiKey: ApiKey | null,
    reminders: Reminders[],
    deliverySummaries?: Record<string, ReminderDeliverySummary>,
    leads: Session[],
    workflows: Workflow[]
    instancia: Instancia
    isScheduleView?: boolean,
    isSchedule?: boolean,
}

export interface ReminderListInterface {
    reminder: Reminders
    workflow?: Workflow
    deliverySummary?: ReminderDeliverySummary
    compact?: boolean
}
export interface ReminderListClientInterface {
    filteredReminders: Reminders[]
    workflows: Workflow[]
    deliverySummaries?: Record<string, ReminderDeliverySummary>
    isScheduleView?: boolean
}

export type ReminderDeliveryItem = {
    id: number
    remoteJid: string | null
    mensaje: string | null
    tipo: string | null
    time: string | null
    followUpStatus: string
    followUpAttempt: number
    followUpMaxAttempts: number
    errorReason: string | null
    media: string | null
    nameFile: string | null
    createdAt: string
    updatedAt: string
}

export type ReminderDeliverySummary = {
    total: number
    pending: number
    sent: number
    failed: number
    canceled: number
    items: ReminderDeliveryItem[]
}
