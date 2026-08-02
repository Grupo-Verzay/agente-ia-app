'use server';

import { db } from '@/lib/db';
import { UserWithPausar } from '@/lib/types';
import { IaCredit, Pausar, Prisma, User } from '@prisma/client';
import { ClientInterface } from "@/lib/types";
import { revalidatePath } from 'next/cache';
import { getIaCreditByUser } from './actions-ia-credits';
import { inheritResellerAiConfig } from './userAiconfig-actions';
import { currentUser } from '@/lib/auth';
import { isAdminLike, isAdminOrReseller } from '@/lib/rbac';
import { purgarCuentaEliminada } from '@/lib/purge-account.server';
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
  userIds?: string[];
  // Excluye clientes asignados a un reseller (demoResellerId != null). Para que
  // el panel de Verzay no liste los clientes de los resellers.
  excludeResellerClients?: boolean;
};
const RESTRICTED_FIELDS = new Set<string>(['openMsg', 'passPlainTxt']);
const BOOLEAN_FIELDS = [
  'muteAgentResponses',
  'onFacebook',
  'onInstagram',
  'onTelegram',
  'onWhatsappCloud',
  'onCalls',
  'enabledSynthesizer',
  'enabledLeadStatusClassifier',
  'enabledCrmFollowUps',
  'enableVoiceResponses',
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
  const effectiveId = me.effectiveId ?? me.id;
  if (me.id !== targetUserId && effectiveId !== targetUserId && !isAdminOrReseller(me.role)) {
    throw new Error("No autorizado.");
  }
  return me;
};

export async function getEnrichedClients(filter?: FilterOptions): Promise<ClientResponse<ClientInterface[]>> {
  try {
    await ensureAdminOrResellerUser();

    let userIds: string[] | undefined;

    if (filter?.userIds) {
      userIds = filter.userIds;
      if (!userIds.length) return { success: true, message: "Sin clientes.", data: [] };
    } else if (filter?.resellerId) {
      // Los clientes de un reseller llegan por dos caminos: la tabla `reseller`
      // (el método viejo, asignación manual) y `demoResellerId` en el propio
      // usuario (el que usa el registro desde la landing). Mirando solo el
      // primero, todo el que se registraba por el enlace del reseller quedaba
      // fuera de la lista — y como el panel de la plataforma excluye a los que
      // tienen reseller, no aparecía en ningún sitio.
      const [assignments, propios] = await Promise.all([
        db.reseller.findMany({
          where: { resellerid: filter.resellerId },
          select: { userId: true },
        }),
        db.user.findMany({
          where: { demoResellerId: filter.resellerId },
          select: { id: true },
        }),
      ]);
      userIds = Array.from(new Set([
        ...(assignments.map(a => a.userId).filter(Boolean) as string[]),
        ...propios.map(u => u.id),
      ]));

      if (!userIds.length) {
        return {
          success: true,
          message: "No hay usuarios asignados.",
          data: [],
        };
      }
    }

    // Para el panel de admin: excluir clientes asignados a CUALQUIER reseller,
    // tanto por el método nuevo (demoResellerId) como por el viejo (tabla reseller).
    let resellerAssignedIds: string[] = [];
    if (!userIds && filter?.excludeResellerClients) {
      const oldAssigned = await db.reseller.findMany({
        where: { userId: { not: null } },
        select: { userId: true },
      });
      resellerAssignedIds = oldAssigned.map(a => a.userId).filter(Boolean) as string[];
    }

    const users = await db.user.findMany({
      // Excluir asesores (sub-cuentas con ownerId): no son clientes, se
      // gestionan dentro del equipo de su cuenta padre.
      // Opcionalmente excluir clientes de resellers (demoResellerId != null
      // y/o asignados por la tabla reseller vieja).
      // `deletedAt: null` deja fuera las cuentas ya eliminadas: siguen en la
      // base unos segundos mientras se purgan sus datos, y sin esto reaparecían
      // en la lista después de borrarlas.
      where: userIds
        ? { id: { in: userIds }, ownerId: null, deletedAt: null }
        : {
            ownerId: null,
            deletedAt: null,
            ...(filter?.excludeResellerClients ? { demoResellerId: null } : {}),
            ...(resellerAssignedIds.length ? { id: { notIn: resellerAssignedIds } } : {}),
          },
      include: {
        pausar: true,
        aiConfigs: true,
        // TODAS las instancias, con su token. El estado se comprueba sobre estas
        // y no sobre la que devuelve getDataApi: aquella usa findFirst sin orden
        // ni filtro de tipo, así que con más de una fila podía devolver la de
        // Telegram, o una vieja, cuyo nombre no existe en Evolution — y una
        // consulta a un nombre inexistente es indistinguible de una línea caída.
        instancias: { select: { instanceName: true, instanceType: true, instanceId: true } },
        // Credenciales de Evolution de la CUENTA. La clave hace falta aparte del
        // token de la instancia: no todas las rutas aceptan el mismo.
        apiKey: { select: { url: true, key: true } },
      },
      orderBy: { name: "asc" },
    });

    const enrichedUsers: ClientInterface[] = await Promise.all(
      users.map(async (user): Promise<ClientInterface> => {
        // qrStatus === true significa DESCONECTADO (así lo leen la tabla, los
        // contadores y el filtro).
        let isEvoEnabled = false;
        let reseller: User | null = null;
        let credits: IaCredit | null = null;

        // Solo las líneas que se comprueban contra Evolution. Baileys mantiene la
        // sesión dentro del backend y Meta/Telegram no son QR: preguntarle a
        // Evolution por ellas devuelve "no existe", que aquí se leería como línea
        // caída. Lo que no se puede comprobar no se marca en rojo.
        const lineasEvolution = user.instancias.filter((i) => {
          const tipo = String(i.instanceType ?? 'Whatsapp').trim().toLowerCase();
          return Boolean(i.instanceName) && (tipo === 'whatsapp' || tipo === 'evolution');
        });

        // Un cliente que aún NO ha creado su línea no está conectado. Salía en
        // verde porque, al no haber nada que consultar, se saltaba la
        // comprobación y se quedaba con el valor inicial: contaba como conectado
        // sin tener siquiera instancia. Y es justo a quien hay que escribirle,
        // porque no ha terminado de configurarse.
        //
        // Los que sí tienen línea pero de otro canal (Baileys, Meta, Telegram) se
        // quedan fuera de la cuenta: no son QR y no se pueden comprobar desde
        // aquí, así que ni verde ni rojo — no inventamos un estado.
        const tieneOtroCanal = user.instancias.length > lineasEvolution.length;
        let qrStatus = lineasEvolution.length === 0 ? !tieneOtroCanal : true;

        const baseEvolution = (() => {
          const url = (user.apiKey?.url ?? '').trim().replace(/\/+$/, '');
          if (!url) return '';
          return /^https?:\/\//i.test(url) ? url : `https://${url}`;
        })();

        if (baseEvolution && lineasEvolution.length > 0) {
          // Hay algo que comprobar, y hasta comprobarlo se da por DESCONECTADO:
          // si la consulta falla, el cliente aparece en la lista de revisar en
          // vez de darse por bueno sin haber mirado.
          qrStatus = true;
          try {
            // El estado se consulta SIEMPRE. Antes solo se miraba con el robot
            // apagado, así que con el robot encendido la columna salía verde sin
            // haber comprobado nada: clientes caídos quedaban fuera del filtro,
            // que es justo para lo que sirve esa columna.
            //
            // Se pregunta por el estado de la conexión en vez de pedir un QR:
            // pedirlo es una operación de conexión, no una consulta, y hacerla
            // contra todas las líneas sanas cada vez que se abre la pantalla es
            // tocar lo que no está roto.
            //
            // Se prueban DOS credenciales: la clave de la cuenta y el token de la
            // instancia. `/webhook/find` acepta el token, pero las rutas
            // `/instance/*` pueden exigir la de la cuenta, y usar la equivocada
            // devuelve un rechazo indistinguible de "línea caída".
            const consultar = async (ruta: string, tokenInstancia: string) => {
              const credenciales = Array.from(
                new Set([user.apiKey?.key, tokenInstancia].filter(Boolean) as string[]),
              );
              for (const credencial of credenciales) {
                const resp = await fetch(`${baseEvolution}${ruta}`, {
                  method: 'GET',
                  headers: { apikey: credencial },
                  cache: 'no-store',
                }).catch(() => null);
                if (resp?.ok) return resp.json().catch(() => null);
              }
              return null;
            };

            const resultados = await Promise.all(
              lineasEvolution.map(async (linea) => {
                const nombre = encodeURIComponent(linea.instanceName as string);
                const [webhook, estado] = await Promise.all([
                  consultar(`/webhook/find/${nombre}`, linea.instanceId),
                  consultar(`/instance/connectionState/${nombre}`, linea.instanceId),
                ]);
                const conexion = String(
                  estado?.instance?.state ?? estado?.state ?? estado?.connectionState ?? '',
                ).toLowerCase();
                return { conectada: conexion === 'open', robot: webhook?.enabled === true };
              }),
            );

            // Con varias líneas basta con que UNA esté bien: el cliente está
            // operando. Marcarlo en rojo por una instancia vieja que quedó suelta
            // lo metería en la lista de a quién escribirle sin motivo.
            qrStatus = !resultados.some((r) => r.conectada);
            isEvoEnabled = resultados.some((r) => r.robot);
          } catch (error) {
            console.warn(`No se pudo comprobar el estado de las líneas del usuario ${user.id}`, error);
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
          credits,
          instancias: user.instancias,
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

    if (!formData.has('password')) delete dataToUpdate.password;

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
  meetingUrl?: string,
  minNoticeMinutes?: number
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

    // 3) Buscar recordatorio con field === "minutes-1" (el que entrega los detalles de ingreso)
    const reminderMinutes1 = remindersRes.data.find((r) => r.time === "minutes-1");

    if (!reminderMinutes1) {
      return {
        success: false,
        message: 'No se encontró el recordatorio con field "minutes-1".',
      };
    }

    // 4) Actualizar duración + meetingUrl + minNoticeMinutes del usuario
    await db.user.update({
      where: { id: userId },
      data: {
        meetingDuration,
        meetingUrl: url,
        ...(minNoticeMinutes !== undefined && { minNoticeMinutes: Math.max(0, minNoticeMinutes) }),
      },
    });

    // 5) Si hay URL, concatenarla al final del description del recordatorio minutes-1
    if (url) {
      const newDesc = `${DEFAULT_REMINDERS_TEMPLATES[4].description} Este es el link de acceso.\n\n👉 ${url}`;

      await db.reminders.update({
        where: { id: reminderMinutes1.id },
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
    subscriptionPlanId?: string;
  }
): Promise<ClientResponse<UserWithPausar>> => {
  try {
    const me = await ensureAdminOrResellerUser();

    const { openingPhrase, subscriptionPlanId, ...userFields } = userData;

    // Si el creador es reseller, vincular el cliente a su pool y heredar su
    // configuración de Evolution/IA cuando el formulario no la trae (esos
    // campos están ocultos para resellers).
    let pool: {
      id: string;
      usedLicenses: number;
      totalLicenses: number;
      subscriptionPlan: { credits: number };
    } | null = null;
    if (me.role === 'reseller') {
      if (!userFields.demoResellerId) userFields.demoResellerId = me.id;
      if (!userFields.apiKeyId) userFields.apiKeyId = me.apiKeyId ?? null;
      if (!userFields.apiUrl) userFields.apiUrl = me.apiUrl;

      // Validar la licencia del plan elegido ANTES de crear (consume 1 cupo).
      // El uso se calcula DINÁMICAMENTE = clientes activos reales de ese pool,
      // así eliminar un cliente libera el cupo automáticamente (modelo A).
      if (subscriptionPlanId) {
        pool = await db.resellerLicensePool.findUnique({
          where: { resellerUserId_subscriptionPlanId: { resellerUserId: me.id, subscriptionPlanId } },
          include: { subscriptionPlan: true },
        });
        if (!pool) return { success: false, message: 'No tienes licencias de ese plan.' };
        const used = await db.user.count({
          where: { demoResellerId: me.id, isDemo: false, resellerSubscriptionPlanId: subscriptionPlanId },
        });
        if (used >= pool.totalLicenses) {
          return {
            success: false,
            message: `Sin licencias disponibles para ese plan. Tienes ${pool.totalLicenses - used} disponibles.`,
          };
        }
        // Etiquetar al cliente con el pool que consume (clave para contar y liberar).
        userFields.resellerSubscriptionPlanId = subscriptionPlanId;
      }
    }

    // apiKeyId vacío ("") no es una FK válida → normalizar a null.
    if (!userFields.apiKeyId) userFields.apiKeyId = null;
    // apiUrl no puede ir vacío (columna con default de plataforma).
    if (!userFields.apiUrl) userFields.apiUrl = 'https://api.openAI.co';

    // 1. Crear el usuario
    const user = await db.user.create({
      data: userFields,
    });

    // 1b. Si se consumió un pool de licencias, crear los créditos IA del plan.
    // (El uso del pool se cuenta dinámicamente; no se toca usedLicenses.)
    if (pool) {
      const renewalDate = new Date();
      renewalDate.setMonth(renewalDate.getMonth() + 1);
      await db.iaCredit.create({
        data: { userId: user.id, total: pool.subscriptionPlan.credits, used: 0, renewalDate },
      });
    }

    // 1c. Heredar la config de IA (proveedor + API Key + modelo) del RESELLER
    // dueño: el consumo de IA de los clientes de un reseller lo cubre EL RESELLER
    // con su propia key (no Verzay). Solo aplica a clientes NUEVOS con reseller.
    // Best-effort: nunca rompe la creación del cliente.
    let resellerKeyMissing = false;
    if (userFields.demoResellerId) {
      const inh = await inheritResellerAiConfig(user.id, userFields.demoResellerId);
      if (inh.success && inh.data && !inh.data.inherited) resellerKeyMissing = true;
    }

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
      message: resellerKeyMissing
        ? 'Cliente creado. ⚠️ Configura tu API Key de OpenAI en tu Perfil para que el agente de tus clientes funcione (tú cubres su consumo).'
        : 'User and Pausar data created successfully',
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
    if (!me || !isAdminOrReseller(me.role)) {
      return { success: false, message: "No autorizado." };
    }
    // Resellers solo pueden eliminar a SUS propios clientes.
    if (!isAdminLike(me.role)) {
      const target = await db.user.findUnique({ where: { id }, select: { demoResellerId: true } });
      if (!target || target.demoResellerId !== me.id) {
        return { success: false, message: "No autorizado." };
      }
    }

    // FASE 1 — apagar y marcar. Transacción corta: solo toca la cuenta.
    //
    // Lo que de verdad importa al pulsar Eliminar es que la cuenta deje de
    // funcionar YA: sin acceso, sin agente contestando y fuera de las listas.
    // Eso son tres UPDATE. Borrar sus datos es otra cosa, y es lo que tardaba.
    currentStep = "marcar_eliminada";
    await db.$transaction(async (tx) => {
      await tx.user.updateMany({
        where: { id },
        data: { deletedAt: new Date(), status: false },
      });
      // Los asesores caen con la cuenta madre: sin ella no tienen servicio.
      await tx.user.updateMany({
        where: { ownerId: id },
        data: { deletedAt: new Date(), status: false },
      });
      await tx.userBilling.updateMany({
        where: { userId: id },
        data: { accessStatus: "SUSPENDED", suspendedAt: new Date(), suspendedReason: "Cuenta eliminada" },
      });
    });

    // FASE 2 — purgar los datos, por lotes y fuera de transacción.
    //
    // No se espera a que termine: la pantalla ya puede seguir, la cuenta ya está
    // apagada y lo que queda es limpieza. Si el proceso se reinicia a medias, el
    // barrido diario retoma lo que falte.
    void purgarCuentaEliminada(id).catch((e) => {
      console.error("[deleteUser] purga en segundo plano falló", { userId: id, error: e });
    });

    revalidatePath("/admin/clientes");
    revalidatePath("/panel/clientes");

    return {
      success: true,
      message: "Cuenta eliminada. Sus datos se están borrando en segundo plano.",
      debugStep: currentStep,
    };
  } catch (error) {
    const errMsg = (error as { message?: string })?.message || String(error);
    console.error("[deleteUser] ERROR", { userId: id, step: currentStep, error: errMsg });
    return {
      success: false,
      message: `No se pudo eliminar la cuenta (paso: ${currentStep}). ${errMsg}`,
      debugStep: currentStep,
    };
  }
}

export async function getUserAppointmentUrl() {
  const user = await currentUser();
  return `https://agente.ia-app.com/schedule/${user.id}`
}

export async function updateUserVoiceSettings(
  userId: string,
  enableVoiceResponses: boolean,
  voiceId: string,
  voiceModel?: string,
  voiceInstructions?: string,
  ttsProvider?: string,
  elevenLabsApiKey?: string,
  elevenLabsVoiceId?: string,
): Promise<ClientResponse> {
  try {
    await ensureSelfOrAdmin(userId);

    const validVoices = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'];
    if (ttsProvider !== 'elevenlabs' && !validVoices.includes(voiceId)) {
      return { success: false, message: 'Voz no válida.' };
    }

    const validModels = ['tts-1', 'tts-1-hd', 'gpt-4o-mini-tts'];
    if (voiceModel && !validModels.includes(voiceModel)) {
      return { success: false, message: 'Modelo de voz no válido.' };
    }

    await db.user.update({
      where: { id: userId },
      data: {
        enableVoiceResponses,
        voiceId,
        ...(voiceModel ? { voiceModel } : {}),
        ...(voiceInstructions !== undefined ? { voiceInstructions } : {}),
        ...(ttsProvider ? { ttsProvider } : {}),
        ...(elevenLabsApiKey !== undefined ? { elevenLabsApiKey } : {}),
        ...(elevenLabsVoiceId !== undefined ? { elevenLabsVoiceId } : {}),
      } as Prisma.UserUpdateInput,
    });

    return { success: true, message: 'Configuración de voz actualizada.' };
  } catch (error) {
    console.error('[UPDATE_VOICE_SETTINGS]', error);
    return { success: false, message: 'Error al actualizar la configuración de voz.' };
  }
}

export type UserVoiceSettings = {
  enableVoiceResponses: boolean;
  voiceId: string;
  voiceModel: string;
  voiceInstructions: string;
  ttsProvider: string;
  elevenLabsApiKey: string;
  elevenLabsVoiceId: string;
};

/** Lee la configuración de voz del agente (global por cuenta) para inicializar el panel. */
export async function getUserVoiceSettings(
  userId: string,
): Promise<ClientResponse<UserVoiceSettings>> {
  try {
    await ensureSelfOrAdmin(userId);
    const row = await db.user.findUnique({
      where: { id: userId },
      select: {
        enableVoiceResponses: true,
        voiceId: true,
        voiceModel: true,
        voiceInstructions: true,
        ttsProvider: true,
        elevenLabsApiKey: true,
        elevenLabsVoiceId: true,
      } as Prisma.UserSelect,
    }) as {
      enableVoiceResponses?: boolean | null;
      voiceId?: string | null;
      voiceModel?: string | null;
      voiceInstructions?: string | null;
      ttsProvider?: string | null;
      elevenLabsApiKey?: string | null;
      elevenLabsVoiceId?: string | null;
    } | null;

    if (!row) return { success: false, message: 'Usuario no encontrado.' };

    return {
      success: true,
      message: 'OK',
      data: {
        enableVoiceResponses: !!row.enableVoiceResponses,
        voiceId: row.voiceId ?? 'nova',
        voiceModel: row.voiceModel ?? 'gpt-4o-mini-tts',
        voiceInstructions: row.voiceInstructions ?? '',
        ttsProvider: row.ttsProvider ?? 'openai',
        elevenLabsApiKey: row.elevenLabsApiKey ?? '',
        elevenLabsVoiceId: row.elevenLabsVoiceId ?? '',
      },
    };
  } catch (error) {
    console.error('[GET_USER_VOICE_SETTINGS]', error);
    return { success: false, message: 'Error al cargar la configuración de voz.' };
  }
}

export async function getElevenLabsVoices(
  apiKey: string,
): Promise<ClientResponse<{ voice_id: string; name: string; category: string }[]>> {
  try {
    const trimmedKey = apiKey.trim();

    const res = await fetch('https://api.elevenlabs.io/v1/voices', {
      headers: { 'xi-api-key': trimmedKey },
      cache: 'no-store',
    });

    if (!res.ok) {
      await res.text();
      const msg = res.status === 401
        ? 'API key inválido o expirado. Cópialo desde elevenlabs.io → Profile → API Key.'
        : `Error ElevenLabs: ${res.status} ${res.statusText}`;
      return { success: false, message: msg };
    }

    const data = await res.json();
    type ElevenLabsVoiceRaw = { voice_id: string; name: string; category?: string };
    const voices = ((data.voices ?? []) as ElevenLabsVoiceRaw[]).map((v) => ({
      voice_id: v.voice_id,
      name: v.name,
      category: v.category ?? 'premade',
    }));

    return { success: true, message: 'Voces cargadas.', data: voices };
  } catch (error) {
    console.error('[GET_ELEVENLABS_VOICES]', error);
    return { success: false, message: 'No se pudo conectar con ElevenLabs. Verifica el API key.' };
  }
}
