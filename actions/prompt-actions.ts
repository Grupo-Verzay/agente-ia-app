'use server';

import { db } from "@/lib/db";
import { z } from "zod";
import { PromptInstance } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { laCuentaDeLaAccion } from "@/lib/cuenta-de-la-accion";

/**
 * Este fichero es **el caso que la regla avisa**: el `userId` no está en ninguna
 * firma — llega dentro de un `FormData` y sale de un `parse` de Zod—, así que un
 * barrido por la firma no lo encuentra. Y entraba directo al `create` y al
 * `where`. Es el H02 de siempre, sobre el prompt del agente de otra cuenta.
 *
 * `deleteAgentPromptsByUserId` es el peor: un `deleteMany` que se lleva **todos**
 * los prompts y revisiones de la cuenta que se le nombre.
 */

/** El dueño sale de la FILA, no del navegador. */
async function laCuentaDelPrompt(id: number) {
  const suyo = await db.promptInstance.findUnique({ where: { id }, select: { userId: true } });
  if (!suyo?.userId) return null;
  return laCuentaDeLaAccion(suyo.userId);
}

// Esquemas de validación con Zod
const promptInstanciaSchema = z.object({
  instanceType: z.string().optional(),
  description: z.string().optional(),
  content: z.string().optional(),
  // `coercion` permite que Zod intente convertir el valor a un número.
  // Esto es más seguro que un `Number()` manual.
  instanciaId: z.coerce.number().int().optional().nullable(),
  userId: z.string().min(1, "El userId es obligatorio"),
});

const getPromptsSchema = z.object({
  userId: z.string().min(1, "El userId es obligatorio"),
});

const updatePromptSchema = promptInstanciaSchema.partial().extend({
  id: z.coerce.number().int().min(1, "El id es obligatorio"),
});

const deletePromptSchema = z.object({
  id: z.coerce.number().int().min(1, "El id es obligatorio"),
});

const deleteAgentDataByUserSchema = z.object({
  userId: z.string().min(1, 'El userId es obligatorio'),
});

// Interfaz de respuesta consistente
interface ActionResponse<T> {
  success: boolean;
  message: string;
  data?: T;
}

/**
 * **1. Crear (Create)**
 * Crea un nuevo registro de PromptInstance.
 * @param formData - Datos del formulario.
 */
export async function createPromptInstancia(formData: FormData): Promise<ActionResponse<PromptInstance>> {
  // Se obtiene el objeto de la misma manera
  const data = Object.fromEntries(formData.entries());

  const validation = promptInstanciaSchema.safeParse(data);

  if (!validation.success) {
    return {
      success: false,
      message: "Datos de entrada inválidos.",
    };
  }

  try {
    const cuenta = await laCuentaDeLaAccion(validation.data.userId);
    if (!cuenta) return { success: false, message: "No autorizado." };

    const newPrompt = await db.promptInstance.create({
      data: {
        ...validation.data,
        userId: cuenta,
      },
    });
    revalidatePath('/dashboard/prompts');
    return {
      success: true,
      message: "Prompt de instancia creado con éxito.",
      data: newPrompt,
    };
  } catch (error) {
    console.error("[CREATE_PROMPT_INSTANCIA_ERROR]", error);
    return {
      success: false,
      message: "Error al crear el prompt de instancia.",
    };
  }
}

/**
 * **2. Leer (Read)**
 * Obtiene todos los prompts de un usuario específico.
 * @param userId - ID del usuario.
 */
export async function getPromptsByUserId(userId: string): Promise<ActionResponse<PromptInstance[]>> {
  const validation = getPromptsSchema.safeParse({ userId });

  if (!validation.success) {
    return {
      success: false,
      message: "User ID inválido",
    };
  }

  try {
    const cuenta = await laCuentaDeLaAccion(userId);
    if (!cuenta) return { success: false, message: "No autorizado." };

    const prompts = await db.promptInstance.findMany({
      where: { userId: cuenta },
      orderBy: { id: "desc" },
    });
    return {
      success: true,
      message: "Prompts obtenidos correctamente.",
      data: prompts,
    };
  } catch (error) {
    console.error("[GET_PROMPTS_BY_USER_ID_ERROR]", error);
    return {
      success: false,
      message: "Error al obtener los prompts.",
    };
  }
}

/**
 * **3. Actualizar (Update)**
 * Actualiza un prompt de instancia existente.
 * @param id - ID del prompt.
 * @param formData - Datos del formulario.
 */
export async function updatePromptInstancia(id: number, formData: FormData): Promise<ActionResponse<PromptInstance>> {
  // ** Corrección aquí: Obteniendo todos los campos del formData, incluido el userId.
  const data = {
    ...Object.fromEntries(formData.entries()),
    id,
  };

  const validation = updatePromptSchema.safeParse(data);

  if (!validation.success) {
    return {
      success: false,
      message: "Datos de entrada inválidos para la actualización.",
    };
  }

  try {
    if (!(await laCuentaDelPrompt(id))) {
      return { success: false, message: "No autorizado." };
    }

    // La identidad de la fila no se copia de lo que llegue del formulario: sin
    // esto, mandar otro `userId` dentro del `FormData` le muda el prompt a otra
    // cuenta.
    const { userId: _userId, ...cambios } = validation.data;

    const updatedPrompt = await db.promptInstance.update({
      where: { id },
      data: cambios,
    });
    revalidatePath('/dashboard/prompts');
    return {
      success: true,
      message: "Prompt de instancia actualizado con éxito.",
      data: updatedPrompt,
    };
  } catch (error) {
    console.error("[UPDATE_PROMPT_INSTANCIA_ERROR]", error);
    return {
      success: false,
      message: "Error al actualizar el prompt de instancia.",
    };
  }
}

/**
 * **4. Eliminar (Delete)**
 * Elimina un prompt de instancia.
 * @param id - ID del prompt.
 */
export async function deletePromptInstancia(id: number): Promise<ActionResponse<void>> {
  const validation = deletePromptSchema.safeParse({ id });

  if (!validation.success) {
    return {
      success: false,
      message: "ID de prompt inválido.",
    };
  }

  try {
    if (!(await laCuentaDelPrompt(id))) {
      return { success: false, message: "No autorizado." };
    }

    await db.promptInstance.delete({
      where: { id },
    });
    revalidatePath('/dashboard/prompts');
    return {
      success: true,
      message: "Prompt de instancia eliminado con éxito.",
    };
  } catch (error) {
    console.error("[DELETE_PROMPT_INSTANCIA_ERROR]", error);
    return {
      success: false,
      message: "Error al eliminar el prompt de instancia.",
    };
  }
}

export async function deleteAgentPromptsByUserId(
  userId: string
): Promise<ActionResponse<{ deletedPrompts: number; deletedRevisionsAsPublisher: number }>> {
  const validation = deleteAgentDataByUserSchema.safeParse({ userId });

  if (!validation.success) {
    return {
      success: false,
      message: 'User ID inválido.',
    };
  }

  try {
    const cuenta = await laCuentaDeLaAccion(validation.data.userId);
    if (!cuenta) return { success: false, message: 'No autorizado.' };

    const result = await db.$transaction(async (tx) => {
      // 1) Revisions donde el usuario fue quien publicó (pueden ser de prompts de otros usuarios)
      const revisionsAsPublisher = await tx.agentPromptRevision.deleteMany({
        where: { publishedBy: cuenta },
      });

      // 2) AgentPrompts del usuario (sus revisiones se borran por CASCADE)
      const prompts = await tx.agentPrompt.deleteMany({
        where: { userId: cuenta },
      });

      return {
        deletedPrompts: prompts.count,
        deletedRevisionsAsPublisher: revisionsAsPublisher.count,
      };
    });

    // Ajusta la ruta que quieras refrescar según tu UI
    // revalidatePath('/dashboard/agents');

    return {
      success: true,
      message: 'Prompts y revisiones del usuario eliminados correctamente.',
      data: result,
    };
  } catch (error) {
    console.error('[DELETE_AGENT_PROMPTS_BY_USER_ERROR]', error);
    return {
      success: false,
      message: 'Error al eliminar los prompts y revisiones del usuario.',
    };
  }
}