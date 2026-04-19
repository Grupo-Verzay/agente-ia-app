'use server'

import { db } from '@/lib/db'
import { Service } from '@prisma/client';
import { z } from 'zod'

import { getRemindersByUserId } from "@/actions/reminders-actions";
import { createReminder } from "@/actions/reminders-actions";
import { DEFAULT_REMINDERS_TEMPLATES } from '@/types/reminder';
import { currentUser } from '@/lib/auth';


interface ServiceOperationResponse {
    success: boolean;
    message: string;
    data?: Service[];
}

type Ok<T> = { success: true; message: string; data: T };
type Err = { success: false; message: string };

// Por acción:
export type CreateServiceResp = Ok<Service> | Err;
export type UpdateServiceResp = Ok<Service> | Err;
export type ListServicesResp = Ok<Service[]> | Err;
export type DeleteServiceResp = Ok<null> | Err;

/**
 * Esquema de validación para crear o actualizar un servicio
 */
const baseSchema = z.object({
    userId: z.string().min(1),
    name: z.string().min(2, 'El nombre es obligatorio'),
    messageText: z.string().min(5, 'El mensaje debe ser más descriptivo'),
})

/**
 * Esquema extendido que incluye el ID (para update)
 */
const updateSchema = baseSchema.extend({
    id: z.string().min(1, 'El ID es obligatorio'),
})

/**
 * Crea un nuevo servicio asociado a un usuario
 */
export async function createService(
    values: z.infer<typeof baseSchema>
): Promise<CreateServiceResp> {
    const validated = baseSchema.safeParse(values);
    if (!validated.success) {
        return { success: false, message: validated.error.errors[0].message };
    }

    try {
        const data = await db.service.create({ data: validated.data });

        if (data.userId) {
            const remindersRes = await getRemindersByUserId(data.userId);
            const hasReminders =
                remindersRes.success && remindersRes.data && remindersRes.data.length > 0;
            if (!hasReminders) {
                const user = await currentUser();

                const reminderResults = [];

                for (const tpl of DEFAULT_REMINDERS_TEMPLATES) {
                    const res = await createReminder({
                        title: tpl.title,
                        description: tpl.description,
                        time: tpl.time,
                        isSchedule: true,
                        instanceName: user.instancias[0].instanceName,
                        serverUrl: user.apiKey.url,
                        apikey: user.apiKey.key,
                        userId: user.id,
                    });

                    // opcional: guardar junto al id lógico de la plantilla
                    reminderResults.push({ templateId: tpl.id, ...res });
                }

                const allOk = reminderResults.every((r) => r.success);
                const failed = reminderResults.filter((r) => !r.success);

                if (!allOk) {
                    console.error(
                        "[CREATE_SERVICE_REMINDERS] Algunos recordatorios fallaron:",
                        failed
                    );
                    return {
                        success: true,
                        message:
                            "Servicio creado correctamente, pero hubo errores al crear algunos recordatorios.",
                        data,
                    };
                }

                return {
                    success: true,
                    message: "Servicio creado correctamente + recordatorios",
                    data,
                };
            }
        }

        return { success: true, message: "Servicio creado correctamente", data };
    } catch (error) {
        console.error("Error al crear servicio:", error);
        return { success: false, message: "Error al crear el servicio" };
    }
}

/**
 * Obtiene todos los servicios asociados a un usuario específico
 */
export async function getServicesByUser(userId: string): Promise<ListServicesResp> {
    if (!userId) return { success: false, message: 'Falta el userId' }

    try {
        const services = await db.service.findMany({
            where: { userId },
            orderBy: { createdAt: 'desc' },
        })

        return { success: true, message: 'Petición realizada con ', data: services }
    } catch (error) {
        console.error('Error al obtener servicios:', error)
        return { success: false, message: 'Error al obtener servicios' }
    }
}

/**
 * Elimina un servicio por su ID
 */
export async function deleteService(serviceId: string): Promise<DeleteServiceResp> {
    if (!serviceId) return { success: false, message: 'Falta el ID del servicio' }

    try {
        await db.service.delete({
            where: { id: serviceId },
        })

        return { success: true, message: 'Servicio eliminado correctamente', data: null }
    } catch (error) {
        console.error('Error al eliminar servicio:', error)
        return { success: false, message: 'Error al eliminar el servicio' }
    }
}

/**
 * Actualiza un servicio existente usando su ID
 */
export async function updateService(values: z.infer<typeof updateSchema>): Promise<UpdateServiceResp> {
    const validated = updateSchema.safeParse(values)
    if (!validated.success) {
        return { success: false, message: validated.error.errors[0].message }
    }

    try {
        const { id, ...data } = validated.data;
        const updated = await db.service.update({ where: { id }, data });

        return { success: true, message: "Servicio actualizado correctamente", data: updated };

    } catch (error) {
        console.error('Error al actualizar servicio:', error)
        return { success: false, message: 'Error al actualizar el servicio' }
    }
}


