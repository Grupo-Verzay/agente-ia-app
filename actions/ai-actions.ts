'use server'

import { db } from '@/lib/db'
import { SystemMessage } from '@prisma/client'
import { PromptAiFormValues, PromptAiSchema } from '@/schema/ai'
import { ADMIN_USER_ID } from '@/types/generic'
import { laCuentaDeLaAccion } from '@/lib/cuenta-de-la-accion'

/**
 * El entrenamiento maestro (`SystemMessage`): los mensajes del sistema que la
 * pantalla /ai edita para la cuenta —y, en la de la plataforma, el prompt
 * maestro que el backend pone delante del entrenamiento de todas—.
 *
 * **Ninguna de estas acciones preguntaba de quién era el dato.** Con la sesión
 * de cualquier cuenta y otro `userId` se leían, creaban o borraban los mensajes
 * de otra; y con el id de un mensaje ajeno se reescribía o se borraba — el de
 * la plataforma incluido, que es el que leen todos los agentes.
 *
 * Ahora las que reciben una cuenta pasan por `laCuentaDeLaAccion`, y las que
 * reciben el id de un mensaje sacan el dueño de la FILA y lo preguntan con la
 * misma puerta (`laCuentaDelMensaje`). «No existe» y «no es tuyo» se contestan
 * igual.
 */
async function laCuentaDelMensaje(id: unknown): Promise<string | null> {
    const limpio = String(id ?? '').trim()
    if (!limpio) return null
    const suyo = await db.systemMessage.findUnique({ where: { id: limpio }, select: { userId: true } })
    if (!suyo?.userId) return null
    return laCuentaDeLaAccion(suyo.userId)
}

const NO_AUTORIZADO: PromptAiResponse = { success: false, message: 'No autorizado.' }

export interface PromptAiResponse<> {
    success: boolean
    message: string
    data?: SystemMessage[]
}

export async function getPromptAiByUserId(userId: string): Promise<PromptAiResponse> {
    if (!userId) {
        return {
            success: false,
            message: 'Datos incompletos o invalidos.',
        }
    }
    try {
        const cuenta = await laCuentaDeLaAccion(userId)
        if (!cuenta) return NO_AUTORIZADO
        const data = await db.systemMessage.findMany({
            where: { userId: cuenta },
            orderBy: { createdAt: 'desc' },
        })

        if (!data || data.length === 0) {
            return {
                success: true,
                message: 'No se encontraron mensajes para este usuario.',
            }
        }

        return {
            success: true,
            message: 'Mensajes cargados exitosamente.',
            data,
        }
    } catch (error: any) {
        return {
            success: false,
            message: error.message || 'Error al obtener los mensajes.',
        }
    }
}

export async function createPromptAi(formData: PromptAiFormValues): Promise<PromptAiResponse> {
    try {
        const parse = PromptAiSchema.safeParse(formData);

        if (!parse.success) {
            return {
                success: false,
                message: "Datos inválidos. Corrige los campos requeridos.",
            };
        }

        const data = parse.data;
        const cuenta = await laCuentaDeLaAccion(data.userId)
        if (!cuenta || !String(data.userId ?? '').trim()) return NO_AUTORIZADO

        const message = await db.systemMessage.create({
            data: {
                title: data.title,
                message: data.message,
                typePrompt: data.typePrompt,
                user: {
                    connect: { id: cuenta },
                },
            },
        })

        return {
            success: true,
            message: 'Mensaje del sistema agregado exitosamente.',
            data: [message],
        }
    } catch (error: any) {
        return {
            success: false,
            message: error.message || 'Error al agregar el mensaje del sistema.',
        }
    }
}

export async function updatePromptAi(formData: PromptAiFormValues): Promise<PromptAiResponse> {
    try {
        const parse = PromptAiSchema.safeParse(formData);

        if (!parse.success) {
            return {
                success: false,
                message: "Datos inválidos. Corrige los campos requeridos.",
            };
        }

        const data = parse.data;
        // El dueño sale de la FILA, no del formulario.
        if (!(await laCuentaDelMensaje(data.id))) return NO_AUTORIZADO

        const message = await db.systemMessage.update({
            where: { id: data.id },
            data: {
                title: data.title,
                message: data.message,
                typePrompt: data.typePrompt,
            },
        })

        return {
            success: true,
            message: 'Mensaje actualizado exitosamente.',
            data: [message],
        }
    } catch (error: any) {
        return {
            success: false,
            message: error.message || 'Error al actualizar el mensaje.',
        }
    }
}

export async function deletePromptAi(id: string): Promise<PromptAiResponse> {
    try {
        if (!(await laCuentaDelMensaje(id))) return NO_AUTORIZADO
        await db.systemMessage.delete({ where: { id } })
        return {
            success: true,
            message: 'Mensaje eliminado exitosamente.',
        }
    } catch (error: any) {
        return {
            success: false,
            message: error.message || 'Error al eliminar el mensaje.',
        }
    }
}

export async function deletePromptAiByUserId(userId: string): Promise<PromptAiResponse> {
    try {
        const cuenta = await laCuentaDeLaAccion(userId)
        if (!cuenta || !String(userId ?? '').trim()) return NO_AUTORIZADO
        userId = cuenta
        // Verificar si el usuario tiene mensajes antes de intentar eliminarlos
        const messages = await db.systemMessage.findMany({ where: { userId } });

        if (messages.length === 0) {
            return {
                success: false,
                message: 'No se encontraron registros para este usuario.',
            };
        }

        // Eliminar los mensajes asociados al usuario
        await db.systemMessage.deleteMany({ where: { userId } });

        return {
            success: true,
            message: 'Mensaje(s) eliminado(s) exitosamente.',
            // data: messages,
        };
    } catch (error) {
        let errorMessage = 'Error desconocido al eliminar los mensajes.';

        if (error instanceof Error) {
            errorMessage = error.message;
        }

        return {
            success: false,
            message: `Error al eliminar los mensajes, ${errorMessage}`,
        };
    }
}

export async function getPromptAssistence() {
    const prompt = await db.systemMessage.findFirst({
        where: {
            userId: ADMIN_USER_ID,
            typePrompt: "FAQs",
        },
        orderBy: { updatedAt: "desc" }, // por si existieran varios, toma el más reciente
        select: {
            id: true,
            title: true,
            message: true,
            updatedAt: true,
        },
    });

    return prompt?.message ?? "";
}