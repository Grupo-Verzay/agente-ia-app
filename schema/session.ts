import { z } from "zod";

export const registerSessionSchema = z.object({
    userId: z.string().min(1, "ID de usuario requerido"),
    remoteJid: z.string().min(1, "Numero requerido"),
    remoteJidAlt: z.string().trim().optional(),
    senderPn: z.string().trim().optional(),
    pushName: z.string().min(1, "Nombre requerido"),
    instanceId: z.string().min(1, "ID de instancia requerido"),
});

export type CreateLeadSchema = z.infer<typeof registerSessionSchema>

export interface registerSessionSchema {
    userId: string;
    instanceId: string;
    onCreated: (lead: CreateLeadSchema) => void;
    onCancel?: () => void;
}
