'use server';

import { db } from '@/lib/db';
import { UserWithPausar } from '@/lib/types';
import { IaCredit, Pausar, User } from '@prisma/client';
import { generateQRCode, getDataApi } from "@/actions/api-action";
import { ClientInterface } from "@/lib/types";
import { revalidatePath } from 'next/cache';
import { getIaCreditByUser } from './actions-ia-credits';
import { currentUser } from '@/lib/auth';
import { isAdminLike, isAdminOrReseller } from '@/lib/rbac';
import { getRemindersByUserId } from './reminders-actions';
import { DEFAULT_REMINDERS_TEMPLATES } from '@/types/reminder';
import bcrypt from "bcryptjs";

interface ClientResponse<T = undefined> {
  success: boolean;
  message: string;
  data?: T;
}
type FilterOptions = {
  resellerId?: string;
};
const RESTRICTED_FIELDS = new Set<string>(['openMsg']);
const BOOLEAN_FIELDS = [
  'muteAgentResponses',
  'onFacebook',
  'onInstagram',
  'enabledSynthesizer',
  'enabledLeadStatusClassifier',
  'enabledCrmFollowUps',
  'status',
] as const;

/** Normaliza un booleano desde FormData (soporta hidden+checkbox, "true"/"on") */
const normalizeBoolean = (fd: FormData, key: string): boolean | undefined => {
  if (!fd.has(key)) return undefined; // si no vino, no actualizar
  // getAll para considerar hidden + checkbox
  const values = fd.getAll(key).map(v => String(v).toLowerCase());
  return values.includes('true') || values.includes('on');
};

/** Copia valores no booleanos de FormData respetando campos restringidos */
const assignNonBooleanFields = (fd: FormData, target: Record<string, any>) => {
  fd.forEach((value, key) => {
    if (RESTRICTED_FIELDS.has(key)) return;
    if ((BOOLEAN_FIELDS as readonly string[]).includes(key)) return; // ya procesados
    target[key] = value;
    });
};

const ensureAdminOrResellerUser = async () => {
  const me = await currentUser();
  if (!me || !isAdminOrReseller(me.role)) {
    throw new Error("No autorizado.");
  }
  return me;
};

const ensureSelfOrAdmin = async (targetUserId: string) => {
  const me = await currentUser();
  if (!me) throw new Error("No autorizado.");
  if (me.id !== targetUserId && !isAdminOrReseller(me.role)) {
    throw new Error("No autorizado.");
  }
  return me;
};

export async function getEnrichedClients(filter?: FilterOptions): Promise<ClientResponse<ClientInterface[]>> {
  try {
    await ensureAdminOrResellerUser();

    let userIds: string[] | undefined;

    if (filter?.resellerId) {
      const assignments = await db.reseller.findMany({
        where: { resellerid: filter.resellerId },
        select: { userId: true },
      });
      userIds = assignments.map(a => a.userId).filter(Boolean) as string[];

      if (!userIds.length) {
        return {
          success: true,
          message: "No hay usuarios asignados.",
          data: [],
        };
      }
    }

    const users = await db.user.findMany({
      where: userIds ? { id: { in: userIds } } : undefined,
      include: {
        pausar: true,
        aiConfigs: true,
      },
      orderBy: { name: "asc" },
    });

    const enrichedUsers: ClientInterface[] = await Promise.all(
      users.map(async (user): Promise<ClientInterface> => {
        let qrStatus = false;
        let isEvoEnabled = false;
        let reseller: User | null = null;
        let credits: IaCredit | null = null;

        if (user.apiKeyId) {
          try {
            const dataApi = await getDataApi(user.id, user.apiKeyId);
            const resDataApi = dataApi?.data;

            if (resDataApi?.url && resDataApi?.instanceName && resDataApi?.key) {
              const responseInstanceStatus = await fetch(`https://${resDataApi.url}/webhook/find/${resDataApi.instanceName}`, {
                method: "GET",
                headers: {
                  apikey: resDataApi.key,
                },
              });


              /* instance status */
              const result = await responseInstanceStatus.json();
              isEvoEnabled = result?.enabled ?? false;

              if (!isEvoEnabled) {
                const responseQrStatus = await generateQRCode({ instanceName: resDataApi?.instanceName, userId: user.id });

                /* qr status */
                const resQrStatus = !!responseQrStatus.qr; //si genera QR significa que el usuario se desconectó de whatsapp
                qrStatus = resQrStatus;
              }
            }


          } catch (error) {
            console.warn(`No se pudo obtener isEvoEnabled para el usuario ${user.id}`, error);
          }

        }

        // Buscar reseller asociado
        const assigned = await db.reseller.findFirst({
          where: { userId: user.id },
        });

        if (assigned?.resellerid !== null && assigned?.resellerid !== undefined) {
          const resellerAsUser = await db.user.findFirst({
            where: { id: assigned.resellerid },
          });

          reseller = resellerAsUser;
        }

        // Buscar créditos por usuario
        const resCredits = await getIaCreditByUser(user.id);
        if (resCredits.success && resCredits.data && resCredits.data.length > 0) {
          credits = resCredits.data[0]
        }

        return {
          ...user,
          pausar: user.pausar as Pausar[],
          isEvoEnabled,
          qrStatus,
          reseller,
          credits
        };
      })
    );

    return {
      success: true,
      message: "Datos de usuarios cargados correctamente.",
      data: enrichedUsers,
    };
  } catch (error) {
    console.error("Error obteniendo clientes:", error);
    return {
      success: false,
      message: "Error al obtener clientes.",
    };
  }
}

// ==============================
// GET CLIENTS FOR SELECTOR (lightweight — no API calls, no credits, no reseller)
// ==============================

export interface ClientSelectorItem {
  id: string;
  label: string;
  email: string;
}

export async function getClientsForSelector(
  filter?: FilterOptions,
): Promise<ClientResponse<ClientSelectorItem[]>> {
  try {
    await ensureAdminOrResellerUser();

    let userIds: string[] | undefined;

    if (filter?.resellerId) {
      const assignments = await db.reseller.findMany({
        where: { resellerid: filter.resellerId },
        select: { userId: true },
      });
      userIds = assignments.map((a) => a.userId).filter(Boolean) as string[];

      if (!userIds.length) {
        return { success: true, message: 'No hay usuarios asignados.', data: [] };
      }
    }

    const users = await db.user.findMany({
      where: userIds ? { id: { in: userIds } } : undefined,
      select: { id: true, name: true, email: true, company: true },
      orderBy: { name: 'asc' },
    });

    const data: ClientSelectorItem[] = users.map((u) => ({
      id: u.id,
      label: u.company ?? u.name ?? u.email ?? u.id,
      email: u.email ?? '',
    }));

    return { success: true, message: 'Clientes cargados.', data };
  } catch (error) {
    console.error('Error obteniendo clientes para selector:', error);
    return { success: false, message: 'Error al obtener clientes.' };
  }
}

// ==============================
// GET CLIENT DATA BY USER ID
// ==============================
export const getClientDataByUserId = async (userId: string): Promise<ClientResponse<UserWithPausar>> => {
  try {
    await ensureSelfOrAdmin(userId);

    const user = await db.user.findUnique({
      where: { id: userId },
      include: {
        pausar: true, // relación con tabla Pausar
      },
    });

    if (!user) {
      return {
        success: false,
        message: 'User not found.',
      };
    }

    return {
      success: true,
      message: 'User and Pausar data fetched successfully.',
      data: {
        ...user
      },
    };
  } catch (error) {
    console.error('Error fetching client data:', error);
    return {
      success: false,
      message: 'Error fetching client data.',
    };
  }
};
// ==============================
// UPDATE CLIENT DATA BY FIELD
// ==============================
export const updateClientDataByField = async (
  userId: string,
  field: string,
  value: string
): Promise<{ success: boolean; message: string }> => {
  try {
    await ensureSelfOrAdmin(userId);

    if (field === 'openMsg') {
      return { success: false, message: 'El campo openMsg está restringido y no puede ser actualizado aquí.' };
    }
    if (!field) {
      return { success: false, message: 'El campo no existe en este formulario.' };
    }

    const isBooleanField = (BOOLEAN_FIELDS as readonly string[]).includes(field);
    const parsedValue = isBooleanField ? (value === 'true' || value === 'on') : value;

    await db.user.update({
      where: { id: userId },
      data: { [field]: parsedValue },
    });

    return { success: true, message: `Campo "${field}" actualizado correctamente.` };
  } catch (error) {
    console.error('Error actualizando datos del cliente:', error);
    return { success: false, message: 'Error interno al actualizar los datos.' };
  }
};

// ==============================
// UPDATE CLIENT DATA
// ==============================
export const updateClientData = async (userId: string, formData: FormData) => {
  try {
    await ensureAdminOrResellerUser();

    const dataToUpdate: Record<string, any> = {};

    (BOOLEAN_FIELDS as readonly string[]).forEach((key) => {
      const b = normalizeBoolean(formData, key);
      if (b !== undefined) dataToUpdate[key] = b;
    });

    assignNonBooleanFields(formData, dataToUpdate);

    delete dataToUpdate.password;

    if (Object.keys(dataToUpdate).length === 0) {
      return { success: false, message: "No se encontraron campos válidos para actualizar." };
    }

    await db.user.update({ where: { id: userId }, data: dataToUpdate });

    return { success: true, message: "Datos del cliente actualizados correctamente." };
  } catch (error) {
    console.error("Error actualizando datos del cliente desde formData:", error);
    return { success: false, message: "Error interno al actualizar los datos." };
  }
};

// ==============================
// Función para actualizar la duración de la reunión de un usuario
// ==============================
// Función para actualizar la duración de la reunión de un usuario
export async function updateUserMeetingDuration(
  userId: string,
  meetingDuration: number,
  meetingUrl?: string
): Promise<ClientResponse> {
  try {
    await ensureSelfOrAdmin(userId);

    // 1) Validación duración
    if (meetingDuration < 1 || meetingDuration > 480) {
      return {
        success: false,
        message: "La duración debe estar entre 1 y 480 minutos.",
      };
    }

    // Normalizamos la URL (si viene vacía, queda "")
    const url = (meetingUrl ?? "").trim();

    // 2) Validar que el usuario tenga recordatorios
    const remindersRes = await getRemindersByUserId(userId);

    if (!remindersRes.success || !remindersRes.data || remindersRes.data.length === 0) {
      return {
        success: false,
        message: "Este usuario no tiene recordatorios configurados.",
      };
    }

    // 3) Buscar recordatorio con field === "minutes-5"
    const reminderMinutes5 = remindersRes.data.find((r: any) => r.time === "minutes-5");

    if (!reminderMinutes5) {
      return {
        success: false,
        message: 'No se encontró el recordatorio con field "minutes-5".',
      };
    }

    // 4) Actualizar duración + meetingUrl del usuario
    await db.user.update({
      where: { id: userId },
      data: {
        meetingDuration,
        meetingUrl: url,
      },
    });

    // 5) Si hay URL, concatenarla al final del description del recordatorio minutes-5
    if (url) {
      const newDesc = `${DEFAULT_REMINDERS_TEMPLATES[3].description} Este es el link de acceso.\n\n👉${url}`;

      await db.reminders.update({
        where: { id: reminderMinutes5.id },
        data: { description: newDesc },
      });
    }

    return {
      success: true,
      message: "Reunión actualizada correctamente.",
    };
  } catch (error) {
    console.error("Error al actualizar la duración/URL de la reunión:", error);
    return {
      success: false,
      message: "No se pudo actualizar la duración/URL de la reunión.",
    };
  }
}
// ==============================
// UPDATE PAUSA DATA
// ==============================
export const updateAbrirPhrase = async (userId: string, mensaje: string) => {
  try {
    await ensureSelfOrAdmin(userId);

    const userWithPausar = await db.user.findUnique({
      where: { id: userId },
      include: {
        pausar: true, // o filtra con where si solo te interesa tipo = 'abrir'
      },
    });

    if (!userWithPausar) return { success: false, message: 'No se encontró el usuario.' };

    const pausa = userWithPausar?.pausar.find(p => p.tipo === 'abrir');
    const pausarId = pausa?.id;

    if (!pausa) return { success: false, message: 'Debe existir una frase creada por defecto.' };

    await db.pausar.update({
      where: { id: pausarId },
      data: { mensaje },
    });

    return { success: true, message: 'Frase actualizada correctamente' };
  } catch (error) {
    console.error('Error actualizando openMsg:', error);
    return { success: false, message: 'Error actualizando la frase' };
  }
};
// ==============================
// CREATE USER + INSERT TO PAUSAR
// ==============================
export const createUserWithPausar = async (
  userData: Omit<UserWithPausar, 'id' | 'createdAt' | 'updatedAt' | 'pausar'> & {
    openingPhrase?: string;
  }
): Promise<ClientResponse<UserWithPausar>> => {
  try {
    await ensureAdminOrResellerUser();

    const { openingPhrase, ...userFields } = userData;

    // 1. Crear el usuario
    const user = await db.user.create({
      data: userFields,
    });

    let pausarRecord: Pausar | null = null;

    // 2. Crear registro Pausar si existe openingPhrase
    if (openingPhrase) {
      pausarRecord = await db.pausar.create({
        data: {
          userId: user.id,
          instanciaId: 'default-instancia-id', // Considera hacer estos parámetros opcionales
          apikeyId: 'default-apikey-id',
          tipo: 'abrir',
          mensaje: openingPhrase,
          baseurl: 'https://conexion.verzay.co',
        },
      });
    }

    // 3. Obtener el usuario con sus relaciones para devolverlo completo
    const createdUser = await db.user.findUnique({
      where: { id: user.id },
      include: { pausar: true },
    });

    if (!createdUser) {
      throw new Error('User creation failed');
    }

    return {
      success: true,
      message: 'User and Pausar data created successfully',
      data: createdUser as UserWithPausar,
    };
  } catch (error) {
    console.error('Error creating user and Pausar record:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Error creating user',
    };
  }
};
// ==============================
// DELETE USER
// ==============================
export async function deleteUserOld(id: string): Promise<ClientResponse> {
  if (!id) {
    return {
      success: false,
      message: 'User ID is required.',
    };
  }

  try {
    const me = await currentUser();
    if (!me || !isAdminLike(me.role)) {
      return {
        success: false,
        message: "No autorizado.",
      };
    }

    await db.user.delete({
      where: { id },
    });

    revalidatePath("/admin/clientes");

    return {
      success: true,
      message: 'User deleted successfully.',
    };
  } catch (error) {
    console.error('Error deleting user:', error);

    return {
      success: false,
      message: 'Failed to delete user.',
    };
  }
}

export async function deleteUser(id: string) {
  if (!id) {
    return { success: false, message: "User ID is required." };
  }

  let currentStep = "init";

  try {
    const me = await currentUser();
    if (!me || !isAdminLike(me.role)) {
      return { success: false, message: "No autorizado." };
    }

    await db.$transaction(async (tx) => {
      currentStep = "load_user";
      const user = await tx.user.findUnique({
        where: { id },
        select: { email: true, apiKeyId: true },
      });

      currentStep = "load_sessions";
      const sessions = await tx.session.findMany({
        where: { userId: id },
        select: { id: true, instanceId: true, remoteJid: true },
      });
      const instanceIds = sessions
        .map((s) => s.instanceId)
        .filter(Boolean) as string[];
      const remoteJids = sessions
        .map((s) => s.remoteJid)
        .filter(Boolean) as string[];

      currentStep = "load_instancias";
      const instancias = await tx.instancia.findMany({
        where: { userId: id },
        select: { instanceName: true },
      });
      const instanceNames = instancias
        .map((i) => i.instanceName)
        .filter(Boolean) as string[];

      // Cargar apiKey (para limpiar seguimientos + apikey huérfana)
      currentStep = "load_api_key";
      let userApiKey: { key: string } | null = null;
      if (user?.apiKeyId) {
        userApiKey = await tx.apiKey.findUnique({
          where: { id: user.apiKeyId },
          select: { key: true },
        });
      }

      // 1) reseller (no tiene onDelete: Cascade)
      currentStep = "delete_reseller_links";
      await tx.reseller.deleteMany({ where: { userId: id } });
      await tx.reseller.deleteMany({ where: { resellerid: id } });

      // 2) Workflows + rr (no hay FK, pero limpiamos por orden)
      currentStep = "cleanup_workflows_rr";
      const workflows = await tx.workflow.findMany({
        where: { userId: id },
        select: { id: true },
      });
      const workflowIds = workflows.map((w) => w.id);

      if (workflowIds.length) {
        await tx.workflowNode.deleteMany({
          where: { workflowId: { in: workflowIds } },
        });

        await tx.quickReply.deleteMany({
          where: { workflowId: { in: workflowIds } },
        });
      }

      await tx.quickReply.deleteMany({ where: { userId: id } });

      // 3) Historias n8n (tabla sin FK; usamos instanceIds como ya hacías)
      currentStep = "cleanup_n8n_chat_histories";
      if (instanceIds.length) {
        await tx.n8nChatHistory.deleteMany({
          where: { sessionId: { in: instanceIds } },
        });
      }

      // 4) Reminders (sin relación en Prisma)
      currentStep = "cleanup_reminders";
      await tx.reminders.deleteMany({ where: { userId: id } });

      // 5) VerificationToken (por email)
      if (user?.email) {
        currentStep = "cleanup_verification_tokens";
        await tx.verificationToken.deleteMany({
          where: { identifier: user.email },
        });
      }

      // 6) PromptInstance (sin onDelete: Cascade → bloquearía el delete de User)
      currentStep = "cleanup_prompt_instances";
      await tx.promptInstance.deleteMany({ where: { userId: id } });

      // 7) Appointment + Service (por FKs entre sí y sin cascade en Service.user)
      currentStep = "cleanup_appointments_services";
      await tx.appointment.deleteMany({ where: { userId: id } });
      await tx.service.deleteMany({ where: { userId: id } });

      // 8) Seguimientos (tabla sin FKs: limpiamos por señales)
      currentStep = "cleanup_seguimientos";
      const orSeguimientos: any[] = [];
      if (remoteJids.length) orSeguimientos.push({ remoteJid: { in: remoteJids } });
      if (instanceNames.length) orSeguimientos.push({ instancia: { in: instanceNames } });
      if (userApiKey?.key) orSeguimientos.push({ apikey: userApiKey.key });

      if (orSeguimientos.length) {
        await tx.seguimiento.deleteMany({ where: { OR: orSeguimientos } });
      }

      // 9) Borrar usuario (aquí se activan TODOS los onDelete: Cascade)
      currentStep = "delete_user";
      await tx.user.delete({ where: { id } });

      // 10) Limpiar ApiKey huérfana si ya no la usa nadie
      if (user?.apiKeyId) {
        currentStep = "cleanup_apikey";
        await tx.apiKey.deleteMany({
          where: {
            id: user.apiKeyId,
            users: { none: {} },
          },
        });
      }
    });

    // Log simple de éxito
    await db.log.create({
      data: {
        level: "info",
        message: "deleteUser completed",
        context: JSON.stringify({ userId: id }),
      },
    });

    revalidatePath("/admin/clientes");

    return {
      success: true,
      message: "User and related data deleted successfully.",
      debugStep: currentStep,
    };
  } catch (error: any) {
    const errMsg = error?.message || String(error);
    console.error("[deleteUser] ERROR", { userId: id, step: currentStep, error: errMsg });

    // Intentar dejar constancia del error
    try {
      await db.log.create({
        data: {
          level: "error",
          message: `deleteUser failed at step ${currentStep}: ${errMsg}`,
          context: JSON.stringify({ userId: id, step: currentStep }),
        },
      });
    } catch (logErr) {
      console.error("[deleteUser] failed to persist error log", logErr);
    }

    return {
      success: false,
      message: "Failed to delete user and related data.",
      debugStep: currentStep,
    };
  }
}

export async function getUserAppointmentUrl() {
  const user = await currentUser(); // lee de sesión/cache, no del cliente


  return `https://agente.ia-app.com/schedule/${user.id}`
}
