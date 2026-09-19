// app/actions/seguimiento-actions.ts
'use server'

import { db } from "@/lib/db"
import { currentUser } from "@/lib/auth"
import { laCuentaDeLaAccion } from "@/lib/cuenta-de-la-accion"
import { resolveInstanceOwner } from "@/lib/chat-persistence"

/**
 * Un seguimiento **no tiene `userId`**: cuelga de su línea (`instancia`). Así
 * que de quién es se resuelve por ahí, con `resolveInstanceOwner`, y se
 * comprueba como cualquier otra cuenta.
 *
 * Y de ahí sale lo de los tres que van por `remoteJid`: el mismo número puede
 * estar en las líneas de **dos cuentas distintas** —le escribe a Ventas y a
 * Atención—, así que sin acotar por línea se leía y se borraba lo de la otra.
 * No se rechaza la petición entera: se **filtra**, que es lo que devuelve lo
 * suyo a quien pregunta.
 */
async function alcanzoLaLinea(instancia: string | null | undefined) {
  if (!instancia) return false
  const dueno = await resolveInstanceOwner(instancia)
  if (!dueno?.userId) return false
  return Boolean(await laCuentaDeLaAccion(dueno.userId))
}

async function alcanzoElSeguimiento(id: number) {
  const suyo = await db.seguimiento.findUnique({ where: { id }, select: { instancia: true } })
  return alcanzoLaLinea(suyo?.instancia)
}
import { apuntarLoQueHizo } from "@/lib/apuntar-actividad"
import { whereSeguimientosDelLead } from "@/lib/registros-del-lead"
import { seguimientosSchema } from "@/schema/seguimientos"

export interface SeguimientosResponse {
  success: boolean
  message: string
  data?: any
}

export const createSeguimiento = async (input: unknown) => {
  const validated = seguimientosSchema.safeParse(input)

  if (!validated.success) {
    return {
      success: false,
      message: "Datos inválidos",
      error: validated.error.flatten(),
    }
  }

  try {
    const seguimiento = await db.seguimiento.create({
      data: validated.data,
    })

    // Actividad del equipo. Con `refId`, para poder cerrar el círculo el día
    // que el cliente conteste: esa es justo la pareja que la tercera capa viene
    // a poder medir. No lanza — el seguimiento ya está creado.
    const quien = await currentUser()
    if (quien) {
      await apuntarLoQueHizo(quien, "seguimiento_hecho", String(seguimiento.id))
    }

    return {
      success: true,
      message: "Seguimiento creado correctamente",
      data: seguimiento,
    }
  } catch (error) {
    console.error("Error al crear seguimiento:", error)
    return {
      success: false,
      message: "Ocurrió un error al guardar el seguimiento",
    }
  }
}


/**
 * 1) Eliminar TODOS los recordatorios asociados a un instanceName
 */
export async function deleteSeguimientosByInstanceName(userId: string): Promise<SeguimientosResponse> {
  if (!userId) {
    return {
      success: false,
      message: "El userId es obligatorio.",
    }
  }

  try {
    // El `userId` llegaba del navegador y entraba directo al `where` de un
    // borrado. Comprobar que la instancia es de ESE id no es una guarda: el id
    // también lo elige quien llama.
    const cuenta = await laCuentaDeLaAccion(userId)
    if (!cuenta) return { success: false, message: "No autorizado." }

    // Buscar la instancia del usuario con instanceType = "Whatsapp"
    const instancia = await db.instancia.findMany({
      where: {
        userId: cuenta,
        instanceType: "Whatsapp",
      },
      orderBy: {
        id: "desc", // por si tiene varias, toma la más reciente
      },
    })

    if (!instancia.length) {
      return {
        success: false,
        message: "No se encontró ninguna instancia Whatsapp para este usuario.",
      }
    }

    const posiblesInstancias = [
      ...instancia.map(i => i.instanceName),
      ...instancia.map(i => i.instanceId),
    ]

    const result = await db.seguimiento.deleteMany({
      where: {
        instancia: { in: posiblesInstancias },
      },
    })

    return {
      success: true,
      message:
        result.count > 0
          ? `Se eliminaron ${result.count} seguimiento.`
          : "No se encontraron seguimiento para esa instancia.",
      data: {
        count: result.count,
        instanceNames: instancia.map(i => i.instanceName),
      },
    }
  } catch (error) {
    console.error("[DELETE_REMINDERS_BY_INSTANCE_NAME]", error)
    return {
      success: false,
      message: "Error al eliminar los recordatorios por instancia del usuario.",
    }
  }
}

export type LegacySeguimientoItem = {
  id: number;
  remoteJid: string | null;
  instancia: string | null;
  mensaje: string | null;
  generatedMessage: string | null;
  tipo: string | null;
  time: string | null;
  followUpStatus: string;
  followUpAttempt: number;
  followUpMaxAttempts: number;
  followUpGoal: string | null;
  followUpMode: string;
  errorReason: string | null;
  createdAt: string;
  updatedAt: string;
};

export async function updateSeguimientoById(
  id: number,
  data: { mensaje?: string; time?: string }
): Promise<SeguimientosResponse> {
  try {
    if (!(await alcanzoElSeguimiento(id))) {
      return { success: false, message: "No autorizado." }
    }

    const updated = await db.seguimiento.update({ where: { id }, data });
    return { success: true, message: "Seguimiento actualizado correctamente.", data: updated };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : "Error al actualizar el seguimiento.",
    };
  }
}

export async function deleteSeguimientoById(id: number): Promise<SeguimientosResponse> {
  try {
    if (!(await alcanzoElSeguimiento(id))) {
      return { success: false, message: "No autorizado." }
    }

    await db.seguimiento.delete({ where: { id } });
    return { success: true, message: "Seguimiento eliminado correctamente." };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : "Error al eliminar el seguimiento.",
    };
  }
}

const PROTECTED_PREFIXES = ["reminder-", "appt-confirm-", "appt-reminder-", "camping-"];

function isProtectedSeguimiento(idNodo: string | null): boolean {
  // null = idNodo vacío (records viejos sin clasificar) → proteger del borrado masivo
  if (!idNodo) return true;
  return PROTECTED_PREFIXES.some((p) => idNodo.startsWith(p));
}

export async function deleteAllSeguimientosByRemoteJid(remoteJid: string): Promise<SeguimientosResponse> {
  try {
    // NOT:[] en Prisma con columnas nullable es poco confiable; filtramos en JS.
    const all = await db.seguimiento.findMany({
      where: { remoteJid },
      select: { id: true, idNodo: true, instancia: true },
    });

    const mias: typeof all = [];
    const yaMiradas = new Map<string, boolean>();
    for (const fila of all) {
      const llave = fila.instancia ?? "";
      if (!yaMiradas.has(llave)) yaMiradas.set(llave, await alcanzoLaLinea(fila.instancia));
      if (yaMiradas.get(llave)) mias.push(fila);
    }

    const idsToDelete = mias
      .filter((s) => !isProtectedSeguimiento(s.idNodo))
      .map((s) => s.id);

    if (idsToDelete.length === 0) {
      return { success: true, message: "No había seguimientos de flujo para eliminar.", data: { count: 0 } };
    }

    const result = await db.seguimiento.deleteMany({ where: { id: { in: idsToDelete } } });
    return {
      success: true,
      message: `Se eliminaron ${result.count} seguimiento(s).`,
      data: { count: result.count },
    };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : "Error al eliminar los seguimientos.",
    };
  }
}

export async function getSessionLegacySeguimientos(
  remoteJid: string
): Promise<{ success: boolean; message: string; data?: LegacySeguimientoItem[] }> {
  try {
    const seguimientos = await db.seguimiento.findMany({
      // La condicion vive en `lib/registros-del-lead`: el contador del globo la
      // usa tambien, y si se separan dicen numeros distintos.
      where: whereSeguimientosDelLead(remoteJid),
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        remoteJid: true,
        instancia: true,
        mensaje: true,
        generatedMessage: true,
        tipo: true,
        time: true,
        followUpStatus: true,
        followUpAttempt: true,
        followUpMaxAttempts: true,
        followUpGoal: true,
        followUpMode: true,
        errorReason: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    // Se filtra por línea, no se rechaza: el mismo número puede estar en dos
    // cuentas y lo que se devuelve es lo de la que pregunta.
    const yaMiradas = new Map<string, boolean>();
    const mios: typeof seguimientos = [];
    for (const fila of seguimientos) {
      const llave = fila.instancia ?? "";
      if (!yaMiradas.has(llave)) yaMiradas.set(llave, await alcanzoLaLinea(fila.instancia));
      if (yaMiradas.get(llave)) mios.push(fila);
    }

    return {
      success: true,
      message: "Seguimientos obtenidos correctamente",
      data: mios.map((s) => ({
        ...s,
        createdAt: s.createdAt.toISOString(),
        updatedAt: s.updatedAt.toISOString(),
      })),
    };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : "Error al obtener los seguimientos.",
    };
  }
}

export type AppointmentSeguimientoItem = {
  id: number;
  idNodo: string | null;
  mensaje: string | null;
  generatedMessage: string | null;
  time: string | null;
  followUpStatus: string;
  tipo: string | null;
};

export async function getAppointmentSeguimientos(
  remoteJid: string,
  instancia: string | null
): Promise<{ success: boolean; message: string; data?: AppointmentSeguimientoItem[] }> {
  try {
    const items = await db.seguimiento.findMany({
      where: {
        remoteJid,
        ...(instancia ? { instancia } : {}),
        OR: [
          { idNodo: null },
          { idNodo: "" },
          { idNodo: { startsWith: "appt-confirm-" } },
          { idNodo: { startsWith: "appt-reminder-" } },
          { idNodo: { startsWith: "reminder-" } },
        ],
      },
      orderBy: { time: "asc" },
      select: {
        id: true,
        idNodo: true,
        mensaje: true,
        generatedMessage: true,
        time: true,
        followUpStatus: true,
        tipo: true,
        instancia: true,
      },
    });

    const yaMiradas = new Map<string, boolean>();
    const mios: typeof items = [];
    for (const fila of items) {
      const llave = fila.instancia ?? "";
      if (!yaMiradas.has(llave)) yaMiradas.set(llave, await alcanzoLaLinea(fila.instancia));
      if (yaMiradas.get(llave)) mios.push(fila);
    }

    return {
      success: true,
      message: "OK",
      data: mios.map(({ instancia: _instancia, ...resto }) => resto),
    };
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : "Error al obtener recordatorios de cita." };
  }
}

/**
 * 2) Eliminar SOLO el/los recordatorio(s) que coincidan con:
 *    instanceName && userId && remoteJid
 */
export async function deleteReminderByInstanceUserRemote(
  instanceName: string,
  userId: string,
  remoteJid: string
): Promise<SeguimientosResponse> {
  if (!instanceName || !userId || !remoteJid) {
    return {
      success: false,
      message: "instanceName, userId y remoteJid son obligatorios.",
    }
  }

  try {
    const cuenta = await laCuentaDeLaAccion(userId)
    if (!cuenta) return { success: false, message: "No autorizado." }

    // 1) Verificar que esa instancia pertenezca a ese userId
    const instancia = await db.instancia.findFirst({
      where: {
        userId: cuenta,
        instanceName,
        instanceType: "Whatsapp",
      },
    })

    if (!instancia) {
      return {
        success: false,
        message: "No se encontró una instancia Whatsapp con ese nombre para este usuario.",
      }
    }

    // 2) Eliminar seguimiento SOLO de esa instancia y ese remoteJid
    const result = await db.seguimiento.deleteMany({
      where: {
        instancia: instancia.instanceName,
        remoteJid,
      },
    })

    return {
      success: true,
      message:
        result.count > 0
          ? `seguimiento(s) eliminado(s) correctamente. Total: ${result.count}.`
          : "No se encontró ningún recordatorio con esos datos.",
      data: { count: result.count },
    }
  } catch (error) {
    console.error("[DELETE_REMINDER_BY_INSTANCE_USER_REMOTE]", error)
    return {
      success: false,
      message: "Error al eliminar el recordatorio por instanceName, userId y remoteJid.",
    }
  }
}
