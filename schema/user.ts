import { PLAN_VALUES } from '@/types/plans';
import { z, string } from 'zod';

export const userSchema = z.object({
    name: z.string().min(2, "Debe tener al menos 2 caracteres"),
    email: z.string().email("Correo inválido"),
    password: z.string().min(6, "Debe tener al menos 6 caracteres"),
    company: z.string().min(2, "Nombre de empresa inválido"),
    timezone: z.string().min(2, "Zona horaria obligatoria"),
    notificationNumber: z
        .string()
        .min(2, "Número inválido (mínimo 8 dígitos)"),
    delSeguimiento: z
        .string()
        .min(2, "Frase de seguimiento muy corta")
        .max(100, "Frase demasiado larga"),
    webhookUrl: z
        .string()
        .url("URL del webhook inválida")
        .min(20, "Debe tener al menos 20 caracteres"),
    apiUrl: z
        .string()
        .min(30, "URL demasiado corta"),
    role: z.enum(["user", "admin", "reseller", "super_admin"], {
        required_error: "Debes seleccionar un rol",
    }),
    plan: z.enum(PLAN_VALUES),
    apiKeyId: z.string().min(1, "Selecciona una API Key"),


    mapsUrl: z.string().url().optional(),
    lat: z.string().optional(),
    lng: z.string().optional(),
});

export type UserFormValues = z.infer<typeof userSchema>;
