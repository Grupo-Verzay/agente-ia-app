"use server";

import { revalidatePath } from "next/cache";
import { currentUser } from "@/lib/auth";
import { laPersonaQueActua as laPersona } from "@/lib/chat-de-equipo";
import { marcarSesionResuelta, reabrirSesion } from "@/lib/session-resolved";
import { getAssociatedAccountIds } from "@/lib/cuentas-asociadas";
import { db } from "@/lib/db";
import { quitarSelloDeEscaladoPorSesion } from "@/lib/escalado";
import { generateConversationIntelligence } from "@/actions/conversation-intelligence-actions";
import { autoSyncContactIfEnabled } from "@/actions/google-sheets-actions";
import {
  borrarUnaAUna,
  comoListaDeIdsNumericos,
  type ResumenDelBorrado,
} from "@/lib/borrado-en-bloque";

type Result = { success: true; warning?: string } | { success: false; message: string };

type AutoAssignOptions = {
  assignedBy: string | null;
  onlyIfEnabled?: boolean;
};

export type AssignmentLogEntry = {
  id: number;
  advisorId: string | null;
  assignedBy: string | null;
  action: string;
  createdAt: Date;
};

/**
 * Quién llama y por qué cuenta, con las DOS preguntas separadas.
 *
 * `personaId` **firma** —quién hizo la asignación— y `ownerId` **alcanza** —de
 * qué cuenta son los chats y de dónde sale el tope de la cuenta—. Son dos
 * respuestas distintas y confundirlas rompe por las dos puntas: con la persona
 * en el alcance, un administrador que llega por `linked_accounts` se queda sin
 * cuenta; con la fila efectiva en la firma, el registro queda a nombre del
 * cliente en el que se está metido.
 */
async function requireOwnerOrAdmin(): Promise<{
  personaId: string;
  ownerId: string;
} | null> {
  const user = await currentUser();
  if (!user?.id) return null;
  const { ownerId, advisorRole } = user;
  if (!ownerId || advisorRole === "administrador") {
    return { personaId: laPersona(user).id, ownerId: ownerId ?? user.id };
  }
  return null;
}

/**
 * Pipeline de asesores: dispara (fire-and-forget) las automatizaciones
 * configuradas para el asesor recién asignado. Sólo cuando hay un asesor
 * (no en liberaciones). Espeja triggerStageAutomations de session-action.
 */
async function triggerAdvisorAutomations(sessionId: number, advisorId: string | null): Promise<void> {
  if (!advisorId) return;
  const backendUrl = (process.env.BACKEND_URL ?? "").replace(/\/$/, "");
  if (!backendUrl) return;
  const key = process.env.CRM_FOLLOW_UP_RUNNER_KEY ?? "";
  try {
    await fetch(`${backendUrl}/advisor-automations/execute`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-internal-secret": key },
      body: JSON.stringify({ sessionId, advisorId }),
    });
  } catch (error) {
    console.error("[triggerAdvisorAutomations]", error);
  }
}

/**
 * El registro de quién asignó qué a quién.
 *
 * **`assignedBy` es la PERSONA**, igual que `advisorId`. Las dos columnas de
 * esta misma fila guardan gente, y hasta ahora escribían cosas distintas: en
 * `takeSession` el mismo `INSERT` metía la persona en `advisorId` y la fila
 * efectiva en `assignedBy`, así que dentro de otra cuenta el historial decía
 * que la asignación la había hecho el cliente.
 *
 * Es la familia de `audit_logs.actor_id`, que ya firma con la persona: esto es
 * un registro de quién actuó, no un alcance. Y **no hay lector que se rompa**
 * —`getAssignmentHistory` la trae pero la pantalla solo pinta el asesor y la
 * acción—, así que el cambio es solo hacia adelante y sin backfill: lo ya
 * escrito se queda con la cuenta y de él no se puede deducir quién estaba
 * sentado delante.
 */
async function logAssignment(
  sessionId: number,
  advisorId: string | null,
  assignedBy: string | null,
  action: string,
) {
  try {
    await db.$executeRaw`
      INSERT INTO "AssignmentLog" ("sessionId", "advisorId", "assignedBy", "action", "createdAt")
      VALUES (${sessionId}, ${advisorId}, ${assignedBy}, ${action}, NOW())
    `;
  } catch (error) {
    console.error("[logAssignment]", error);
  }
}

export async function autoAssignUnassignedSessionsForOwner(
  ownerId: string,
  options: AutoAssignOptions,
): Promise<{ assigned: number; skippedReason?: string }> {
  const settings = await db.$queryRaw<{
    auto_assign_enabled: boolean;
    auto_assign_max_chats: number;
  }[]>`
    SELECT auto_assign_enabled, auto_assign_max_chats
    FROM "User"
    WHERE id = ${ownerId}
    LIMIT 1
  `;
  const setting = settings[0];

  if (options.onlyIfEnabled && !setting?.auto_assign_enabled) {
    return { assigned: 0, skippedReason: "auto_assign_disabled" };
  }

  const maxChats = setting?.auto_assign_max_chats ?? 5;
  const unassigned = await db.$queryRaw<{ id: number }[]>`
    SELECT id FROM "Session"
    WHERE "userId" = ${ownerId}
      AND assigned_advisor_id IS NULL
      AND status = true
    ORDER BY "createdAt" ASC
  `;

  let assigned = 0;
  for (const session of unassigned) {
    // Round-robin 1-1-1: mismo criterio que el backend (auto-assign.service.ts).
    // Elige al asesor que lleva MÁS tiempo sin recibir un lead de ESTA cuenta,
    // saltando a los no disponibles o llenos (chats activos >= maxChats). Todo el
    // conteo está acotado a la cuenta (s."userId" = ownerId).
    const candidates = await db.$queryRaw<{ id: string }[]>`
      WITH members AS (
        SELECT u.id, u.advisor_available
        FROM "User" u
        WHERE u.owner_id = ${ownerId}
          AND u.advisor_role IS NOT NULL

        UNION

        SELECT u.id, u.advisor_available
        FROM "linked_accounts" la
        JOIN "User" u ON u.id = la."linked_user_id"
        WHERE la."master_user_id" = ${ownerId}
      ),
      load AS (
        SELECT s.assigned_advisor_id AS id, COUNT(*)::int AS cnt
        FROM "Session" s
        WHERE s."userId" = ${ownerId}
          AND s.status = true
          AND s.assigned_advisor_id IS NOT NULL
        GROUP BY s.assigned_advisor_id
      ),
      last_assign AS (
        SELECT al."advisorId" AS id, MAX(al."createdAt") AS last_at
        FROM "AssignmentLog" al
        JOIN "Session" s ON s.id = al."sessionId"
        WHERE s."userId" = ${ownerId}
          AND al."advisorId" IS NOT NULL
          AND al.action IN ('auto_assigned', 'assigned', 'taken', 'transferred')
        GROUP BY al."advisorId"
      )
      SELECT m.id
      FROM members m
      LEFT JOIN load l ON l.id = m.id
      LEFT JOIN last_assign la ON la.id = m.id
      WHERE m.advisor_available = true
        AND (${maxChats} <= 0 OR COALESCE(l.cnt, 0) < ${maxChats})
      ORDER BY la.last_at ASC NULLS FIRST, m.id ASC
      LIMIT 1
    `;
    if (candidates.length === 0) {
      return {
        assigned,
        skippedReason: assigned === 0 ? "no_available_advisors" : "advisor_limit_reached",
      };
    }

    const advisorId = candidates[0].id;
    const updated = await db.$executeRaw`
      UPDATE "Session"
      SET assigned_advisor_id = ${advisorId}
      WHERE id = ${session.id}
        AND assigned_advisor_id IS NULL
    `;

    if (Number(updated) > 0) {
      await logAssignment(session.id, advisorId, options.assignedBy, "auto_assigned");
      void triggerAdvisorAutomations(session.id, advisorId);
      assigned++;
    }
  }

  return { assigned };
}

/**
 * Devolver la conversacion a la IA.
 *
 * Una conversacion escalada y atendida queda con tres cosas puestas: la IA
 * apagada por el escalado (`agentDisabled`), la IA apagada otra vez por el
 * asesor al contestar (`status`) y un asesor asignado. Este es el camino de
 * vuelta y tiene que deshacer las tres: si queda una, el boton parece no hacer
 * nada —el chat se queda en la pestaña «Mias» de alguien que ya no lo atiende,
 * o el cliente escribe y no le contesta nadie—.
 *
 * Lo hace quien puede tocar esa conversacion: el dueño, un administrador de la
 * cuenta, o el asesor que la tiene.
 *
 * Queda en el historial como `returned_to_ai`, que es lo que luego explica por
 * que un chat dejo de estar asignado sin que nadie lo liberara a mano.
 */
export async function devolverChatALaIaAction(sessionId: number): Promise<Result> {
  try {
    const user = await currentUser();
    if (!user?.id) return { success: false, message: "No autorizado." };

    const rows = await db.$queryRaw<{ userId: string; assignedAdvisorId: string | null }[]>`
      SELECT "userId", assigned_advisor_id AS "assignedAdvisorId"
      FROM "Session" WHERE id = ${sessionId} LIMIT 1
    `;
    if (!rows[0]) return { success: false, message: "Conversación no encontrada." };
    if (!(await puedeCerrarOReabrir(user, rows[0]))) {
      return { success: false, message: "No autorizado." };
    }

    await db.session.update({
      where: { id: sessionId },
      data: {
        agentDisabled: false,
        // Y `status`, que es el interruptor que corta ANTES.
        //
        // Aqui estaba el fallo: se devolvia el chat a la IA y la IA seguia
        // muda. `agentDisabled` no es el unico corte —el backend mira primero
        // `status` (`webhook.service.ts`, la re-verificacion de despues del
        // buffer) y solo despues `agentDisabled`—, y `status` lo habia puesto
        // en falso el propio asesor al contestar, que es lo que hace
        // `pausarIaPorIntervencionHumana`. O sea: el boton funcionaba mientras
        // nadie hubiera escrito, y dejaba de funcionar justo en el caso normal
        // —un asesor atiende, termina y se lo devuelve a la IA—.
        //
        // Desde fuera no parecia un error: parecia que la IA "ya no contesta a
        // ese contacto". Se arreglaba solo, y a medias, cuando el cliente
        // volvia a escribir Y alguien tenia la App abierta, porque es la App
        // quien reabre la sesion al persistir un entrante nuevo
        // (`lib/chat-persistence.ts`). Sin App abierta, no se arreglaba.
        //
        // Devolver a la IA tiene que deshacer TODO lo que la callo, no una
        // parte. Si se anade otro corte, va tambien aqui.
        status: true,
        // El opt-in por contacto, igual que el interruptor de la ficha: sin el,
        // una cuenta con el agente global apagado seguiria sin contestar.
        aiOptIn: true,
        assignedAdvisorId: null,
      },
    });

    // Ya no espera a nadie: fuera el sello de la fila.
    await quitarSelloDeEscaladoPorSesion(sessionId);
    await logAssignment(sessionId, rows[0].assignedAdvisorId, laPersona(user).id, "returned_to_ai");

    revalidatePath("/chats");
    return { success: true };
  } catch (error) {
    console.error("[devolverChatALaIaAction]", error);
    return {
      success: false,
      message: error instanceof Error ? error.message : "No se pudo devolver el chat a la IA.",
    };
  }
}

export async function assignSessionToAdvisor(
  sessionId: number,
  advisorId: string | null,
): Promise<Result> {
  const auth = await requireOwnerOrAdmin();
  if (!auth) return { success: false, message: "No autorizado." };

  // Check limit if assigning (not releasing). El límite (max_chats) se configura
  // en el DUEÑO (auto_assign_max_chats), no en cada asesor; el conteo es de los
  // chats activos del asesor. Antes se leía max_chats del asesor (siempre el
  // default 5) → avisaba "límite 5" aunque el dueño tuviera 100.
  let warning: string | undefined;
  if (advisorId) {
    const settings = await db.$queryRaw<{ max_chats: number; current_count: number }[]>`
      SELECT
        (SELECT auto_assign_max_chats FROM "User" WHERE id = ${auth.ownerId}) AS max_chats,
        COUNT(s.id)::int AS current_count
      FROM "Session" s
      WHERE s.assigned_advisor_id = ${advisorId}
        AND s.status = true
        AND s."userId" = ${auth.ownerId}
    `;
    const row = settings[0];
    // max_chats === 0 => capacidad ilimitada: no se avisa de límite.
    if (row && row.max_chats != null && row.max_chats > 0 && row.current_count >= row.max_chats) {
      warning = `Este asesor ya tiene ${row.current_count} chats activos (límite: ${row.max_chats}).`;
    }
  }

  await db.$executeRaw`
    UPDATE "Session" SET assigned_advisor_id = ${advisorId} WHERE id = ${sessionId}
  `;

  await logAssignment(sessionId, advisorId, auth.personaId, advisorId ? "assigned" : "released");
  void triggerAdvisorAutomations(sessionId, advisorId);

  // Auto-sync a Google Sheets (opt-in): cambió el asesor del contacto.
  const assigned = await db.session.findUnique({
    where: { id: sessionId },
    select: { userId: true, remoteJid: true },
  });
  if (assigned) await autoSyncContactIfEnabled(assigned.userId, assigned.remoteJid);

  return { success: true, ...(warning ? { warning } : {}) };
}

export async function takeSession(sessionId: number): Promise<Result> {
  const user = await currentUser();
  if (!user?.id) return { success: false, message: "No autorizado." };
  const { ownerId } = user;
  if (!ownerId) return { success: false, message: "Solo asesores pueden tomar conversaciones." };

  // El asesor es la PERSONA, no la fila efectiva. `assigned_advisor_id` se
  // compara con los ids que trae el desplegable de asesores —que son personas—
  // y con el de quien mira para el filtro «Mías», así que escribir aquí el id
  // de la cuenta dejaba una conversación tomada que su propio dueño no veía.
  const yo = laPersona(user).id;

  const rows = await db.$queryRaw<{ assigned_advisor_id: string | null }[]>`
    SELECT assigned_advisor_id FROM "Session" WHERE id = ${sessionId}
  `;
  if (!rows[0]) return { success: false, message: "Sesión no encontrada." };
  if (rows[0].assigned_advisor_id && rows[0].assigned_advisor_id !== yo) {
    return { success: false, message: "Esta conversación ya fue tomada por otro asesor." };
  }

  await db.$executeRaw`
    UPDATE "Session" SET assigned_advisor_id = ${yo} WHERE id = ${sessionId}
  `;

  // Las dos columnas, la misma identidad: quien lo tomó es quien lo hizo.
  await logAssignment(sessionId, yo, yo, "taken");
  void triggerAdvisorAutomations(sessionId, yo);

  return { success: true };
}

export async function releaseSession(sessionId: number): Promise<Result> {
  const user = await currentUser();
  if (!user?.id) return { success: false, message: "No autorizado." };
  const yo = laPersona(user).id;

  const rows = await db.$queryRaw<{ assigned_advisor_id: string | null }[]>`
    SELECT assigned_advisor_id FROM "Session" WHERE id = ${sessionId}
  `;
  if (!rows[0]) return { success: false, message: "Sesión no encontrada." };
  // Con la MISMA identidad con la que se tomó, o nadie puede soltar lo suyo.
  if (rows[0].assigned_advisor_id !== yo) {
    return { success: false, message: "Solo puedes liberar tus propias conversaciones." };
  }

  await generateConversationIntelligence({
    sessionId,
    actorId: yo,
    reason: "transferred",
  }).catch((error) => console.error("[releaseSession intelligence]", error));

  await db.$executeRaw`
    UPDATE "Session" SET assigned_advisor_id = NULL WHERE id = ${sessionId}
  `;

  await logAssignment(sessionId, null, yo, "released");

  return { success: true };
}

export async function bulkAutoAssign(): Promise<Result & { assigned?: number }> {
  const user = await currentUser();
  if (!user?.id) return { success: false, message: "No autorizado." };
  const ownerId = user.ownerId ? null : user.id;
  if (!ownerId) return { success: false, message: "Solo el dueño puede hacer asignación masiva." };

  const autoAssignResult = await autoAssignUnassignedSessionsForOwner(ownerId, {
    // El alcance es la cuenta (`ownerId`); la firma, la persona que pulsó.
    assignedBy: laPersona(user).id,
    onlyIfEnabled: false,
  });

  return { success: true, assigned: autoAssignResult.assigned };
}

export async function transferSession(
  sessionId: number,
  targetAdvisorId: string,
): Promise<Result> {
  const user = await currentUser();
  if (!user?.id) return { success: false, message: "No autorizado." };
  // La MISMA identidad con la que se tomó, igual que en `releaseSession`. Con
  // la fila efectiva, quien tomó un chat dentro de otra cuenta no podía
  // transferirlo: «Solo puedes transferir tus propias conversaciones» sobre
  // una que sí era suya.
  const yo = laPersona(user).id;

  const rows = await db.$queryRaw<{ assigned_advisor_id: string | null }[]>`
    SELECT assigned_advisor_id FROM "Session" WHERE id = ${sessionId}
  `;
  if (!rows[0]) return { success: false, message: "Sesión no encontrada." };
  if (rows[0].assigned_advisor_id !== yo) {
    return { success: false, message: "Solo puedes transferir tus propias conversaciones." };
  }

  await generateConversationIntelligence({
    sessionId,
    actorId: yo,
    reason: "transferred",
    targetAdvisorId,
  }).catch((error) => console.error("[transferSession intelligence]", error));

  await db.$executeRaw`
    UPDATE "Session" SET assigned_advisor_id = ${targetAdvisorId} WHERE id = ${sessionId}
  `;

  await logAssignment(sessionId, targetAdvisorId, yo, "transferred");
  void triggerAdvisorAutomations(sessionId, targetAdvisorId);

  return { success: true };
}

/**
 * ¿Puede esta persona cerrar o reabrir esta conversación?
 *
 * Sí cuando la sesión es de UNA DE SUS CUENTAS -la activa o cualquiera
 * vinculada- y manda en ella; o cuando es el asesor que la tiene asignada.
 *
 * Antes se exigía que la sesión fuera de la cuenta activa y de ninguna otra.
 * Pero la bandeja enseña los chats de TODAS las cuentas asociadas, así que un
 * dueño con cuentas vinculadas abría sin problema una conversación de Ventas
 * estando en Grupo Verzay y, al darle a resolver o reabrir, le salía
 * "No autorizado": la pantalla y la comprobación no medían lo mismo.
 *
 * Se alinea con lo que la bandeja ya deja leer, ni más ni menos. Y solo por el
 * lado de dueño: un agente sigue necesitando tenerla asignada, que no se toca.
 */
async function puedeCerrarOReabrir(
  user: { id: string; ownerId?: string | null; advisorRole?: string | null; sessionUserId?: string },
  sesion: { userId: string; assignedAdvisorId: string | null },
): Promise<boolean> {
  // El asesor asignado es la PERSONA: `assigned_advisor_id` lo escribe
  // `takeSession` con `laPersonaQueActua` y lo llena el desplegable de
  // asesores, que también son personas. Con la fila efectiva, quien tomó un
  // chat dentro de otra cuenta no podía resolverlo.
  if (laPersona(user).id === sesion.assignedAdvisorId) return true;

  // Un agente manda en lo suyo, no en la cuenta. Y el alcance —a qué cuentas
  // llega— se sigue preguntando a la fila EFECTIVA, más abajo: esa es la otra
  // mitad de la regla y es la que rompió el #783 al resolver la persona.
  const mandaEnLaCuenta = !user.ownerId || user.advisorRole === "administrador";
  if (!mandaEnLaCuenta) return false;

  const cuentas = await getAssociatedAccountIds(user);
  return cuentas.includes(sesion.userId);
}

export async function resolveSession(sessionId: number): Promise<{ success: boolean; message?: string }> {
  const user = await currentUser();
  if (!user?.id) return { success: false, message: "No autorizado." };

  const rows = await db.$queryRaw<{ userId: string; assignedAdvisorId: string | null }[]>`
    SELECT "userId", assigned_advisor_id AS "assignedAdvisorId"
    FROM "Session" WHERE id = ${sessionId}
  `;
  if (!rows[0]) return { success: false, message: "Sesión no encontrada." };

  const { userId: ownerId, assignedAdvisorId } = rows[0];
  if (!(await puedeCerrarOReabrir(user, { userId: ownerId, assignedAdvisorId }))) {
    return { success: false, message: "No autorizado." };
  }

  await generateConversationIntelligence({
    sessionId,
    actorId: laPersona(user).id,
    reason: "resolved",
  }).catch((error) => console.error("[resolveSession intelligence]", error));

  // status = false sigue apagando la IA (api-webhook lee ese campo y no se puede
  // tocar desde aqui). Lo NUEVO es resolved_at: es la marca que de verdad dice
  // "resuelta", porque status tambien se apaga solo con que un asesor responda.
  await db.$executeRaw`UPDATE "Session" SET status = false WHERE id = ${sessionId}`;
  await marcarSesionResuelta(sessionId);
  await quitarSelloDeEscaladoPorSesion(sessionId);
  await logAssignment(sessionId, assignedAdvisorId, laPersona(user).id, "resolved");

  return { success: true, message: "Conversación resuelta." };
}

/**
 * Resuelve VARIAS conversaciones de una vez.
 *
 * # Por qué es UNA acción y no N llamadas
 *
 * Next **serializa las acciones de servidor de una misma página** —una en
 * vuelo, la siguiente espera—, así que resolver veinte desde el navegador
 * serían veinte idas y vueltas en fila india: minutos de barra pensando con una
 * selección de verdad. Es la misma regla que ya rige el borrado en bloque.
 *
 * # Y por dentro va de una en una, a propósito
 *
 * Llama a `resolveSession`, que es **la misma puerta** que el botón de
 * «Resolver» de una conversación: comprueba quién puede cerrar cada una,
 * genera su resumen, apaga la IA, marca la fila y anota el movimiento.
 * Reescribir todo eso como un `updateMany` sería una segunda forma de resolver
 * que el día que se afine la de al lado se queda atrás — y aquí quedarse atrás
 * significa cerrar una conversación sin su resumen o sin comprobar el permiso.
 *
 * `borrarUnaAUna` es quien lo recorre: **en serie**, porque el pool de Prisma
 * es de diez por proceso y son los mismos turnos que atienden la bandeja.
 *
 * Lo que no se pudo resolver **se cuenta y se dice**. Un «listo» sobre veinte
 * de las que se cerraron dieciocho es peor que un error: nadie vuelve a mirar.
 */
export async function resolverSesionesAction(
  ids: number[],
): Promise<ResumenDelBorrado> {
  const limpios = comoListaDeIdsNumericos(ids);
  if (limpios.length === 0) {
    return { success: false, borrados: 0, fallaron: 0, message: "No hay conversaciones que resolver." };
  }

  const { borrados, fallaron } = await borrarUnaAUna(
    limpios.map(String),
    async (id) => {
      const res = await resolveSession(Number(id));
      return res.success;
    },
  );

  if (borrados === 0) {
    return { success: false, borrados, fallaron, message: "No se pudo resolver ninguna conversación." };
  }
  if (fallaron > 0) {
    return {
      success: true,
      borrados,
      fallaron,
      message: `Se resolvieron ${borrados} conversaciones; ${fallaron} no se pudieron resolver.`,
    };
  }
  return {
    success: true,
    borrados,
    fallaron,
    message: borrados === 1 ? "Conversación resuelta." : `${borrados} conversaciones resueltas.`,
  };
}

/**
 * Devuelve la conversación a la bandeja: quita la marca de resuelta.
 *
 * Quien puede resolver puede reabrir —el dueño de la cuenta o el asesor que la
 * tiene asignada—, que es la misma comprobación de `resolveSession`.
 *
 * No toca `status`: ese es el interruptor de la IA y tiene su propio mando.
 */
export async function reopenSession(sessionId: number): Promise<{ success: boolean; message?: string }> {
  const user = await currentUser();
  if (!user?.id) return { success: false, message: "No autorizado." };

  const rows = await db.$queryRaw<{ userId: string; assignedAdvisorId: string | null }[]>`
    SELECT "userId", assigned_advisor_id AS "assignedAdvisorId"
    FROM "Session" WHERE id = ${sessionId}
  `;
  if (!rows[0]) return { success: false, message: "Sesión no encontrada." };

  const { userId: ownerId, assignedAdvisorId } = rows[0];
  if (!(await puedeCerrarOReabrir(user, { userId: ownerId, assignedAdvisorId }))) {
    return { success: false, message: "No autorizado." };
  }

  await reabrirSesion(sessionId);
  await logAssignment(sessionId, assignedAdvisorId, laPersona(user).id, "reopened");

  return { success: true, message: "Conversación reabierta." };
}

/**
 * Quitar la conversación de «En espera», sin tocar nada más.
 *
 * La marca `escalated_at` dice «esto espera a una persona» —lo pone el backend
 * cuando la IA escala o el cliente pide un humano—. Hoy solo se apaga al TOMAR,
 * al RESOLVER o al DEVOLVER A LA IA, y los tres cambian algo más (el asignado,
 * el estado, la IA). Cuando la IA sigue atendiendo bien y ya no hay nada que
 * esperar, ninguno de los tres corresponde: no se quiere asignar a nadie ni
 * cerrar la conversación, solo bajarla de la bandeja de espera.
 *
 * Esto apaga SOLO ese sello. `quitarSelloDeEscaladoPorSesion` hace
 * `escalated_at = NULL` y nada más: no toca `assigned_advisor_id`, ni `status`,
 * ni `agentDisabled`, ni `resolved_at`. Y por eso, si luego entra un motivo
 * nuevo de espera —el cliente vuelve a pedir un humano—, la marca se vuelve a
 * encender por su camino de siempre (el backend), porque aquí no queda nada
 * puesto que lo impida.
 *
 * La puerta es la MISMA que resolver y reabrir (`puedeCerrarOReabrir`): el
 * dueño, un administrador de la cuenta —con el alcance de su fila efectiva— o el
 * asesor que la tiene asignada. No se escribe una condición nueva: con dos, el
 * día que se afine una la otra se queda atrás.
 */
export async function quitarDeEsperaAction(sessionId: number): Promise<Result> {
  try {
    const user = await currentUser();
    if (!user?.id) return { success: false, message: "No autorizado." };

    const rows = await db.$queryRaw<{ userId: string; assignedAdvisorId: string | null }[]>`
      SELECT "userId", assigned_advisor_id AS "assignedAdvisorId"
      FROM "Session" WHERE id = ${sessionId} LIMIT 1
    `;
    if (!rows[0]) return { success: false, message: "Conversación no encontrada." };
    if (!(await puedeCerrarOReabrir(user, rows[0]))) {
      return { success: false, message: "No autorizado." };
    }

    await quitarSelloDeEscaladoPorSesion(sessionId);

    revalidatePath("/chats");
    return { success: true };
  } catch (error) {
    console.error("[quitarDeEsperaAction]", error);
    return {
      success: false,
      message: error instanceof Error ? error.message : "No se pudo quitar de espera.",
    };
  }
}

export async function getAssignmentHistory(sessionId: number): Promise<AssignmentLogEntry[]> {
  try {
    const rows = await db.$queryRaw<AssignmentLogEntry[]>`
      SELECT id, "advisorId", "assignedBy", action, "createdAt"
      FROM "AssignmentLog"
      WHERE "sessionId" = ${sessionId}
      ORDER BY "createdAt" DESC
      LIMIT 5
    `;
    return rows;
  } catch (error) {
    console.error("[getAssignmentHistory]", error);
    return [];
  }
}
