import { ApiKey, Instancia, Reminders, Session, User, Workflow } from "@prisma/client";
import { z } from "zod";
import { UserWithApiKeys } from "./schema";

export const repeatTypes = [
    { value: "NONE", label: "No se repite" },
    { value: "DAILY", label: "Cada día" },
    { value: "WEEKLY", label: "Cada semana" },
    { value: "MONTHLY", label: "Cada mes" },
    { value: "YEARLY", label: "Cada año" },
    { value: "WEEKDAYS", label: "Días laborables (L-V)" },
    { value: "EVERYDAY", label: "Todos los días" }
] as const;

export const reminderSchema = z.object({
    title: z.string({
        required_error: "El título es obligatorio.",
        invalid_type_error: "El título debe ser un texto.",
    }).min(1, { message: "El título no puede estar vacío." }),

    description: z.string().optional(),

    time: z.string({
        required_error: "La fecha y hora son obligatorias.",
        invalid_type_error: "Selecciona una fecha y hora válidas.",
    }).min(1),

    repeatType: z.enum(repeatTypes.map(r => r.value) as [string, ...string[]], { errorMap: () => ({ message: "Selecciona un tipo de repetición válido." }) }).optional(),

    repeatEvery: z.coerce.number()
        .min(1, { message: "Debe ser un número mayor a 0." })
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

    isSchedule: z.boolean().optional()
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
    dateSchedule?: string,
    instanceId?: string,
    forceCreate?: boolean,
};

export interface MainReminderInterface {
    isCampaignPage: boolean,
    user: UserWithApiKeys,
    apiKey: ApiKey,
    reminders: Reminders[],
    leads: Session[],
    workflows: Workflow[]
    instancia: Instancia
    isScheduleView?: boolean,
    isSchedule?: boolean,
}

export interface ReminderListInterface {
    reminder: Reminders
    workflow?: Workflow
}
export interface ReminderListClientInterface {
    filteredReminders: Reminders[]
    workflows: Workflow[]
    isScheduleView?: boolean
}