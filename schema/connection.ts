import { EvolutionInstance } from "@/actions/fetch-intance-action"
import { Instancia, User, PromptInstance } from "@prisma/client"
import { z } from "zod"

/**
 * Sanitiza mientras el usuario escribe (permisivo con trailing _).
 * Permite que el espacio se convierta en _ en tiempo real sin bloquearlo.
 */
export const sanitizeInstanceNameInput = (val: string): string =>
    val
        .toUpperCase()
        .replace(/\s/g, '_')           // espacio → guion_bajo (uno a uno)
        .replace(/[^A-Z0-9_\-]/g, '')  // elimina chars no permitidos

/**
 * Sanitización completa para submit/guardado en Evolution API:
 * - Convierte a mayúsculas
 * - Reemplaza espacios por guion bajo
 * - Elimina caracteres especiales (solo A-Z, 0-9, _ y -)
 * - Colapsa separadores consecutivos en uno solo
 * - Elimina separadores al inicio y al final
 */
export const sanitizeInstanceName = (val: string): string =>
    sanitizeInstanceNameInput(val)
        .replace(/[-_]{2,}/g, '_')     // colapsa separadores consecutivos
        .replace(/^[-_]+|[-_]+$/g, '') // elimina separadores al inicio/fin

export const FormInstanceConnectionSchema = z.object({
    instanceName: z
        .string()
        .min(1, "El nombre es requerido")
        .transform(sanitizeInstanceName)
        .refine(val => val.length >= 2, "El nombre debe tener al menos 2 caracteres válidos")
        .refine(val => val.length <= 30, "El nombre no puede superar los 30 caracteres"),
    instanceType: z.string().min(2, "Campo requerido"),
})

export interface ClientInstanceCardProps {
    intanceName: string
    user: User
    instanceType: string
    currentInstanceInfo?: EvolutionInstance
    prompts?: PromptInstance[] // <-- Se ha añadido esta nueva propiedad
};

export interface ConnectionMainInterface {
    user: User
    instance?: Instancia
    instanceType: string
    instanceInfo?: EvolutionInstance[]
    prompts?: PromptInstance[]
}

export type FormInstanceConnectionValues = z.infer<typeof FormInstanceConnectionSchema>
