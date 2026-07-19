import type { LeadStatus } from "@prisma/client";

import { db } from "@/lib/db";
import { writeAuditLog } from "@/actions/audit-log-actions";
import {
  resolveWhatsAppDispatcherLine,
  sendViaWhatsAppDispatcher,
} from "@/actions/whatsapp-dispatcher";
import {
  addTagsToSessionAction,
  updateSessionLeadStatus,
} from "@/actions/session-action";

/**
 * Lógica de negocio del "Modo Dueño por WhatsApp".
 *
 * Fase 1 — acciones seguras y auto-contenidas (no afectan a terceros):
 *   crear tarea, crear recordatorio, resumen del día.
 * Fase 2 — acciones que tocan a un contacto (requieren confirmación en el
 *   agente antes de llegar aquí):
 *   buscar contacto, enviar mensaje, mover estado de lead, etiquetar.
 *
 * Toda acción de escritura queda registrada en AuditLog.
 */

export type OwnerActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; message: string };

// ── Fase 1 ──────────────────────────────────────────────────────────────────

export type CreatedOwnerTask = {
  id: string;
  title: string;
  type: string;
  dueDate: string;
  status: string;
};

/**
 * Crea una tarea/recordatorio asignada al propio dueño. Un "recordatorio" es
 * simplemente una tarea de tipo "Recordatorio" — reutiliza la misma infra de
 * tareas (estado, vencimiento, auditoría) sin duplicar modelos.
 */
export async function createOwnerTask(params: {
  ownerId: string;
  ownerName: string | null;
  title: string;
  type: string;
  dueDate: Date;
}): Promise<CreatedOwnerTask> {
  const { ownerId, ownerName, title, type, dueDate } = params;

  const task = await (db as any).task.create({
    data: {
      ownerId,
      assignedToId: ownerId,
      assignedToName: ownerName,
      title,
      type,
      dueDate,
      status: "pending",
      createdById: ownerId,
    },
  });

  await writeAuditLog({
    userId: ownerId,
    actorId: ownerId,
    entityType: "task",
    entityId: String(task.id),
    action: "created",
    summary: `Creó "${task.title}" desde WhatsApp (modo dueño)`,
    metadata: {
      source: "owner-command",
      type: task.type,
      status: task.status,
      dueDate: task.dueDate?.toISOString?.() ?? dueDate.toISOString(),
    },
  });

  return {
    id: String(task.id),
    title: task.title,
    type: task.type,
    dueDate: task.dueDate?.toISOString?.() ?? dueDate.toISOString(),
    status: task.status,
  };
}

export type OwnerSummary = {
  pendingTasks: number;
  tasksDueToday: number;
  appointmentsToday: number;
  generatedAt: string;
};

/**
 * Resumen de solo lectura del día para el dueño: tareas pendientes, tareas que
 * vencen hoy y citas de hoy. No modifica nada, por eso no se audita.
 */
export async function getOwnerSummary(ownerId: string): Promise<OwnerSummary> {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

  const [pendingTasks, tasksDueToday, appointmentsToday] = await Promise.all([
    (db as any).task.count({ where: { ownerId, status: "pending" } }),
    (db as any).task.count({
      where: { ownerId, status: "pending", dueDate: { gte: startOfDay, lte: endOfDay } },
    }),
    db.appointment.count({
      where: { userId: ownerId, startTime: { gte: startOfDay, lte: endOfDay } },
    }),
  ]);

  return {
    pendingTasks,
    tasksDueToday,
    appointmentsToday,
    generatedAt: now.toISOString(),
  };
}

// ── Fase 2 ──────────────────────────────────────────────────────────────────

/** Verifica que la sesión (contacto) exista y pertenezca a la cuenta del dueño. */
async function getOwnedSession(sessionId: number, ownerId: string) {
  const session = await db.session.findUnique({
    where: { id: sessionId },
    select: { id: true, userId: true, remoteJid: true, pushName: true, customName: true },
  });
  if (!session || session.userId !== ownerId) return null;
  return session;
}

function contactLabel(s: { pushName: string | null; customName: string | null }): string {
  return s.customName?.trim() || s.pushName?.trim() || "contacto";
}

export type OwnerContact = {
  sessionId: number;
  name: string;
  remoteJid: string;
  leadStatus: string | null;
  tags: string[];
};

/**
 * Resuelve contactos del dueño por nombre o número. Solo lectura — sirve para
 * que el agente encuentre el sessionId antes de pedir confirmación de una acción.
 *
 * Búsqueda robusta por número: normaliza a dígitos y compara por los últimos 10
 * (absorbe el prefijo de país y el "+"), buscando tanto en remoteJid como en
 * remoteJidAlt, sin excluir los @lid. Por nombre: busca en pushName/customName.
 */
export async function searchOwnerContacts(
  ownerId: string,
  query: string,
): Promise<OwnerContact[]> {
  const raw = (query ?? "").trim();
  if (!raw) return [];

  const digits = raw.replace(/\D/g, "");
  const isPhone = digits.length >= 7;

  const where: any = { userId: ownerId };
  if (isPhone) {
    // Últimos 10 dígitos → tolera "+57", "57" o el número local.
    const suffix = digits.slice(-10);
    where.OR = [
      { remoteJid: { contains: suffix } },
      { remoteJidAlt: { contains: suffix } },
    ];
  } else {
    where.NOT = { remoteJid: { endsWith: "@lid" } };
    where.OR = [
      { pushName: { contains: raw, mode: "insensitive" } },
      { customName: { contains: raw, mode: "insensitive" } },
    ];
  }

  const sessions = await db.session.findMany({
    where,
    orderBy: { updatedAt: "desc" },
    take: 20,
    select: {
      id: true,
      remoteJid: true,
      pushName: true,
      customName: true,
      leadStatus: true,
      sessionTags: { select: { tag: { select: { name: true } } } },
    },
  });

  return sessions.map((s) => ({
    sessionId: s.id,
    name: s.customName?.trim() || s.pushName?.trim() || "contacto",
    remoteJid: s.remoteJid,
    leadStatus: s.leadStatus ?? null,
    tags: (s.sessionTags ?? []).map((st: any) => st.tag?.name).filter(Boolean),
  }));
}

/**
 * Envía un mensaje de WhatsApp a un contacto del dueño, usando la instancia
 * conectada del propio dueño (sin fallback a la línea oficial de Verzay).
 */
export async function sendOwnerMessage(params: {
  ownerId: string;
  sessionId: number;
  text: string;
}): Promise<OwnerActionResult<{ sessionId: number; contact: string }>> {
  const { ownerId, sessionId, text } = params;

  const session = await getOwnedSession(sessionId, ownerId);
  if (!session) {
    return { ok: false, status: 404, message: "Contacto no encontrado en esta cuenta." };
  }

  const dispatcher = await resolveWhatsAppDispatcherLine({
    ownerUserId: ownerId,
    includeAdminFallback: false,
  });
  if (!dispatcher) {
    return {
      ok: false,
      status: 409,
      message: "No hay una instancia de WhatsApp conectada para esta cuenta.",
    };
  }

  const result = await sendViaWhatsAppDispatcher({
    dispatcher,
    remoteJid: session.remoteJid,
    text,
  });
  if (!result?.success) {
    return { ok: false, status: 502, message: result?.message ?? "No se pudo enviar el mensaje." };
  }

  await writeAuditLog({
    userId: ownerId,
    actorId: ownerId,
    entityType: "crm",
    entityId: String(sessionId),
    action: "updated",
    summary: `Envió un mensaje a ${contactLabel(session)} desde WhatsApp (modo dueño)`,
    metadata: { source: "owner-command", kind: "message", chars: text.length },
  });

  return { ok: true, data: { sessionId, contact: contactLabel(session) } };
}

/** Cambia el estado de lead (kanban) de un contacto del dueño. */
export async function moveOwnerLeadStatus(params: {
  ownerId: string;
  sessionId: number;
  status: LeadStatus;
}): Promise<OwnerActionResult<{ sessionId: number; contact: string; status: LeadStatus }>> {
  const { ownerId, sessionId, status } = params;

  const session = await getOwnedSession(sessionId, ownerId);
  if (!session) {
    return { ok: false, status: 404, message: "Contacto no encontrado en esta cuenta." };
  }

  const res = await updateSessionLeadStatus(sessionId, status);
  if (!res.success) {
    return { ok: false, status: 502, message: res.message ?? "No se pudo actualizar el estado." };
  }

  await writeAuditLog({
    userId: ownerId,
    actorId: ownerId,
    entityType: "crm",
    entityId: String(sessionId),
    action: "status_changed",
    summary: `Movió a ${contactLabel(session)} a estado ${status} desde WhatsApp (modo dueño)`,
    metadata: { source: "owner-command", kind: "lead-status", status },
  });

  return { ok: true, data: { sessionId, contact: contactLabel(session), status } };
}

function slugify(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // quita diacríticos (acentos)
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9\-]/g, "");
}

/** Busca una etiqueta del dueño por nombre; si no existe, la crea. */
async function resolveOrCreateTag(ownerId: string, tagName: string): Promise<number> {
  const slug = slugify(tagName);
  const existing = await db.tag.findFirst({ where: { userId: ownerId, slug } });
  if (existing) return existing.id;

  const lastTag = await db.tag.findFirst({
    where: { userId: ownerId },
    orderBy: { order: "desc" },
    select: { order: true },
  });
  const created = await db.tag.create({
    data: {
      userId: ownerId,
      name: tagName,
      slug,
      color: null,
      order: (lastTag?.order ?? -1) + 1,
    },
  });
  return created.id;
}

/** Aplica una etiqueta (por nombre) a un contacto del dueño; la crea si no existe. */
export async function tagOwnerContact(params: {
  ownerId: string;
  sessionId: number;
  tagName: string;
}): Promise<OwnerActionResult<{ sessionId: number; contact: string; tag: string }>> {
  const { ownerId, sessionId, tagName } = params;

  const session = await getOwnedSession(sessionId, ownerId);
  if (!session) {
    return { ok: false, status: 404, message: "Contacto no encontrado en esta cuenta." };
  }

  const tagId = await resolveOrCreateTag(ownerId, tagName);

  const res = await addTagsToSessionAction({ userId: ownerId, sessionId, tagIds: [tagId] });
  if (!res.success) {
    return { ok: false, status: 502, message: res.message ?? "No se pudo aplicar la etiqueta." };
  }

  await writeAuditLog({
    userId: ownerId,
    actorId: ownerId,
    entityType: "crm",
    entityId: String(sessionId),
    action: "updated",
    summary: `Etiquetó a ${contactLabel(session)} como "${tagName}" desde WhatsApp (modo dueño)`,
    metadata: { source: "owner-command", kind: "tag", tag: tagName, tagId },
  });

  return { ok: true, data: { sessionId, contact: contactLabel(session), tag: tagName } };
}

/**
 * Asigna un contacto del dueño a un asesor de la cuenta (resuelto por nombre),
 * o lo libera si advisorName viene vacío. Verifica que la sesión y el asesor
 * pertenezcan a la cuenta.
 */
export async function assignOwnerAdvisor(params: {
  ownerId: string;
  sessionId: number;
  advisorName: string;
}): Promise<OwnerActionResult<{ sessionId: number; contact: string; advisor: string | null }>> {
  const { ownerId, sessionId } = params;
  const advisorName = params.advisorName?.trim() ?? "";

  const session = await getOwnedSession(sessionId, ownerId);
  if (!session) {
    return { ok: false, status: 404, message: "Contacto no encontrado en esta cuenta." };
  }

  // Liberar (sin asesor) si se pide explícitamente.
  const release = /^(ninguno|nadie|quitar|liberar|sin asesor)$/i.test(advisorName);

  let advisorId: string | null = null;
  let advisorLabel: string | null = null;

  if (!release) {
    const matches = await db.user.findMany({
      where: {
        OR: [{ id: ownerId }, { ownerId }],
        name: { contains: advisorName, mode: "insensitive" },
      },
      select: { id: true, name: true, email: true },
      take: 5,
    });
    if (matches.length === 0) {
      return { ok: false, status: 404, message: `No encontré un asesor llamado "${advisorName}".` };
    }
    if (matches.length > 1) {
      const names = matches.map((m) => m.name || m.email).join(", ");
      return { ok: false, status: 409, message: `Hay varios asesores que coinciden (${names}). Sé más específico.` };
    }
    advisorId = matches[0].id;
    advisorLabel = matches[0].name || matches[0].email;
  }

  await db.$executeRaw`UPDATE "Session" SET assigned_advisor_id = ${advisorId} WHERE id = ${sessionId}`;

  await writeAuditLog({
    userId: ownerId,
    actorId: ownerId,
    entityType: "crm",
    entityId: String(sessionId),
    action: "updated",
    summary: release
      ? `Liberó a ${contactLabel(session)} (sin asesor) desde WhatsApp (modo dueño)`
      : `Asignó a ${contactLabel(session)} al asesor ${advisorLabel} desde WhatsApp (modo dueño)`,
    metadata: { source: "owner-command", kind: "assign-advisor", advisorId },
  });

  return { ok: true, data: { sessionId, contact: contactLabel(session), advisor: advisorLabel } };
}
