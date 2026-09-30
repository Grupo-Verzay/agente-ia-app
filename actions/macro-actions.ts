"use server";

import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { getAssociatedAccountIds } from "@/lib/cuentas-asociadas";

import {
  sendManualChatPayloadAction,
  sendManualQuickReplyAction,
  sendManualWorkflowAction,
} from "@/actions/chat-manual-actions";
import {
  sendChannelTextAction,
  sendChannelQuickReplyAction,
  sendChannelWorkflowAction,
  sendMetaTemplate,
  type MetaTemplateOption,
} from "@/actions/channel-chat-actions";
import { sendWahaTextAction, sendWahaQuickReplyAction, sendWahaWorkflowAction } from "@/actions/waha-chat-actions";
import { nombreDeLaCuenta } from "@/lib/nombre-de-la-cuenta";
import {
  ACCIONES_QUE_ENVIAN,
  elProveedorDeLaLinea,
  elResumenDeLaEjecucion,
  losProblemasDeLaMacro,
  losSegundosDeLaEspera,
  porQueNoEstaLista,
  seOfreceParaEnviarPorOtraLinea,
  SEGUNDOS_MAXIMOS_DE_ESPERA,
  type MacroActionItem,
  type ResultadoDeAccion,
} from "@/lib/macros";
import { assignTagToSessionAction, removeTagFromSessionAction } from "@/actions/tag-actions";
import { updateSessionLeadStatus, toggleAgentDisabled } from "@/actions/session-action";
import { assignSessionToAdvisor, resolveSession } from "@/actions/advisor-assign-actions";
import { createInternalNoteAction } from "@/actions/internal-notes-actions";
import { createTaskAction } from "@/actions/task-actions";

// Los tipos viven en `lib/macros.ts`, que es puro y lo usan también la
// pantalla, el botón de Chats y la guía.
export type { MacroActionItem, MacroActionType } from "@/lib/macros";

/** Línea/instancia disponible para enviar mensajes (para el selector "por otra línea"). */
export type MacroLine = { instanceName: string; label: string; type: string };

export type MacroData = {
  id: string;
  name: string;
  description: string | null;
  color: string | null;
  actions: MacroActionItem[];
  order: number;
  enabled: boolean;
  runCount: number;
  lastRunAt: string | null;
};

type ChatCtx = { apiKeyData: { url: string; key: string } | null; instanceName: string };

async function requireUser() {
  const user = await currentUser();
  if (!user?.id) throw new Error("No autorizado.");
  return user;
}

function ownerOf(user: { id: string; ownerId?: string | null }) {
  return user.ownerId ?? user.id;
}

/* ─────────────── LÍNEAS / ENVÍO POR OTRA LÍNEA ─────────────── */

/**
 * Las cuentas cuyas líneas se ofrecen en «Enviar por otra línea»: las MISMAS
 * que la bandeja de Chats (`getAssociatedAccountIds`) — la propia y las que
 * cuelgan de ella hacia abajo, nunca la madre ni las hermanas.
 *
 * Antes tenía su propia consulta en los dos sentidos, así que el selector
 * ofrecía las líneas de la cuenta madre. Con una lista propia aquí, el día que
 * se afine la de la bandeja esta se queda atrás.
 */
async function authorizedAccountIds(
  user: Parameters<typeof getAssociatedAccountIds>[0],
): Promise<string[]> {
  return getAssociatedAccountIds(user);
}

/**
 * Las líneas que se ofrecen en «Enviar por otra línea»: las de WhatsApp de las
 * cuentas que alcanza quien mira (las mismas que la bandeja de Chats). Las de
 * otra cuenta llevan delante el nombre de la cuenta.
 *
 * Dejaba fuera las líneas de WhatsApp Mensajería (`waha`), que es como nacen
 * hoy las nuevas: en una cuenta que ya se pasó, el selector salía vacío con la
 * línea conectada. Qué línea se ofrece lo decide `seOfreceParaEnviarPorOtraLinea`.
 * Y el nombre de la cuenta es `nombreDeLaCuenta`, no `company` a secas, que
 * nace «Empresa Demo».
 */
export async function getAccountLinesAction(): Promise<{ success: boolean; data: MacroLine[] }> {
  try {
    const user = await requireUser();
    const accountIds = await authorizedAccountIds(user);
    const rows = await db.instancia.findMany({
      where: { userId: { in: accountIds } },
      orderBy: { id: "desc" },
    });
    const whatsappRows = rows.filter((i) => seOfreceParaEnviarPorOtraLinea(i.instanceType));
    const ownerIds = Array.from(new Set(whatsappRows.map((i) => i.userId)));
    const owners = ownerIds.length
      ? await db.user.findMany({
          where: { id: { in: ownerIds } },
          select: { id: true, company: true, name: true, email: true },
        })
      : [];
    const nombreById = new Map(owners.map((u) => [u.id, nombreDeLaCuenta(u)]));
    const activeId = user.effectiveId;

    const seen = new Set<string>();
    const data: MacroLine[] = [];
    for (const i of whatsappRows) {
      if (seen.has(i.instanceName)) continue;
      seen.add(i.instanceName);
      const nombreDeLinea = i.displayName?.trim() || i.instanceName;
      // Solo se antepone la cuenta cuando la línea es de OTRA.
      const cuenta = i.userId !== activeId ? nombreById.get(i.userId) : null;
      data.push({
        instanceName: i.instanceName,
        label: cuenta ? `${cuenta} · ${nombreDeLinea}` : nombreDeLinea,
        type: i.instanceType ?? "Whatsapp",
      });
    }
    return { success: true, data };
  } catch (e) {
    console.error("[getAccountLinesAction]", e);
    return { success: false, data: [] };
  }
}

/**
 * Lo que devuelven las acciones de envío y de la conversación. Todas contestan
 * `{ success, message }` y ninguna lanza cuando algo no sale: por eso el
 * resultado se MIRA, o un envío rechazado se contaba como hecho.
 */
type Respuesta = { success?: boolean; message?: string } | null | undefined;

function exigir(res: Respuesta, porDefecto: string): void {
  if (res && res.success === false) throw new Error(res.message || porDefecto);
}

/**
 * Envía algo al contacto por UNA línea, hablando con ella por su proveedor.
 *
 * Es la misma partición con la que la página de Chats arma el juego de
 * acciones de cada línea (`elProveedorDeLaLinea`): WhatsApp Mensajería por sus
 * acciones de Waha, Meta y Telegram por las de canales, y el resto por las de
 * Evolution, con la clave de la cuenta dueña de la línea puesta en el servidor.
 * Antes todo salía por Evolution, y en una línea de Waha eso contestaba «no hay
 * instancia o API key» sin lanzar: la macro decía «aplicada» y al cliente no le
 * llegaba nada. Cada acción de abajo comprueba además que quien corre la macro
 * alcanza esa línea.
 */
type Envio =
  | { kind: "text"; text: string }
  | {
      kind: "media";
      mediatype: "image" | "video" | "audio" | "document";
      mediaUrl: string;
      mimetype?: string;
      fileName?: string;
      caption?: string;
    };

async function enviarPorLaLinea(
  instanceName: string,
  instanceType: string | null | undefined,
  remoteJid: string,
  envio: Envio,
): Promise<void> {
  const proveedor = elProveedorDeLaLinea(instanceType);
  if (proveedor === "waha") {
    exigir(await sendWahaTextAction(instanceName, remoteJid, envio as any), "No se pudo enviar por WhatsApp Mensajería.");
    return;
  }
  if (proveedor === "canal") {
    exigir(await sendChannelTextAction(instanceName, remoteJid, envio as any), "No se pudo enviar por el canal.");
    return;
  }
  exigir(
    await sendManualChatPayloadAction({ apiKeyData: null, instanceName }, remoteJid, envio as any),
    "No se pudo enviar.",
  );
}

async function laLineaAlcanzable(accountIds: string[], instanceName: string) {
  const inst = await db.instancia.findFirst({
    where: { instanceName, userId: { in: accountIds } },
    select: { instanceName: true, instanceType: true, userId: true },
  });
  if (!inst) throw new Error(`La línea «${instanceName}» no es de tu cuenta o ya no existe.`);
  return inst;
}

/**
 * Envía un texto al contacto por una línea distinta a la de la conversación
 * (puede ser de otra cuenta que se administra).
 */
async function sendTextViaLine(
  accountIds: string[],
  instanceName: string,
  remoteJid: string,
  text: string,
): Promise<void> {
  const inst = await laLineaAlcanzable(accountIds, instanceName);
  await enviarPorLaLinea(inst.instanceName, inst.instanceType, remoteJid, { kind: "text", text });
}

/**
 * Envía una PLANTILLA de WhatsApp Cloud (Meta) al contacto por una línea Meta
 * distinta a la actual (para SEND_TEXT_VIA en modo plantilla). Valida que la línea
 * pertenezca a una cuenta autorizada y sea de tipo Meta antes de enviar.
 */
async function sendTemplateViaLine(
  accountIds: string[],
  instanceName: string,
  remoteJid: string,
  cfg: NonNullable<MacroActionItem["config"]>,
): Promise<void> {
  const inst = await db.instancia.findFirst({
    where: { instanceName, userId: { in: accountIds } },
  });
  if (!inst) throw new Error(`Línea "${instanceName}" no encontrada o no autorizada.`);
  if (inst.instanceType !== "meta") {
    throw new Error("Las plantillas solo se pueden enviar por líneas de WhatsApp Cloud (Meta).");
  }
  const template: MetaTemplateOption = {
    name: cfg.templateName ?? "",
    language: cfg.templateLanguage || "es",
    category: "",
    bodyText: cfg.templateBody ?? "",
    paramCount: (cfg.templateParams ?? []).length,
  };
  const res = await sendMetaTemplate(instanceName, remoteJid, template, cfg.templateParams ?? []);
  if (!res.success) throw new Error(res.message || "No se pudo enviar la plantilla.");
}

/* ─────────────── CRUD ─────────────── */

export async function getMacrosAction(): Promise<{ success: boolean; data: MacroData[] }> {
  try {
    const user = await requireUser();
    const rows = await (db as any).macro.findMany({
      where: { userId: ownerOf(user) },
      orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    });
    return {
      success: true,
      data: rows.map((m: any) => ({
        id: m.id,
        name: m.name,
        description: m.description ?? null,
        color: m.color ?? null,
        actions: Array.isArray(m.actions) ? (m.actions as MacroActionItem[]) : [],
        order: m.order,
        enabled: m.enabled,
        runCount: m.runCount ?? 0,
        lastRunAt: m.lastRunAt ? m.lastRunAt.toISOString() : null,
      })),
    };
  } catch (e) {
    console.error("[getMacrosAction]", e);
    return { success: false, data: [] };
  }
}

export async function createMacroAction(input: {
  name: string;
  description?: string;
  color?: string;
  actions: MacroActionItem[];
}): Promise<{ success: boolean; message: string; id?: string }> {
  try {
    const user = await requireUser();
    if (!input.name?.trim()) return { success: false, message: "El nombre es obligatorio." };
    // La MISMA regla que el editor: una acción a medias no se guarda. Esconder
    // el botón de guardar no cierra la petición directa.
    const problemas = losProblemasDeLaMacro({ name: input.name, actions: input.actions ?? [] });
    if (problemas.length) return { success: false, message: problemas[0] };
    const count = await (db as any).macro.count({ where: { userId: ownerOf(user) } });
    const macro = await (db as any).macro.create({
      data: {
        userId: ownerOf(user),
        name: input.name.trim(),
        description: input.description?.trim() || null,
        color: input.color || null,
        actions: input.actions ?? [],
        order: count,
      },
    });
    return { success: true, message: "Macro creada.", id: macro.id };
  } catch (e) {
    console.error("[createMacroAction]", e);
    return { success: false, message: "Error al crear la macro." };
  }
}

export async function updateMacroAction(
  id: string,
  input: {
    name?: string;
    description?: string | null;
    color?: string | null;
    actions?: MacroActionItem[];
    enabled?: boolean;
  },
): Promise<{ success: boolean; message: string }> {
  try {
    const user = await requireUser();
    // Solo se comprueba lo que llega: activar o desactivar una macro vieja que
    // tenga una acción a medias no puede fallar por eso (al correrla se cuenta
    // como fallida y se dice por qué).
    if (input.name !== undefined && !input.name.trim()) return { success: false, message: "El nombre es obligatorio." };
    if (input.actions !== undefined) {
      const problemas = losProblemasDeLaMacro({ name: input.name ?? "·", actions: input.actions });
      if (problemas.length) return { success: false, message: problemas[0] };
    }
    const data: any = {};
    if (input.name !== undefined) data.name = input.name.trim();
    if (input.description !== undefined) data.description = input.description?.trim() || null;
    if (input.color !== undefined) data.color = input.color || null;
    if (input.actions !== undefined) data.actions = input.actions;
    if (input.enabled !== undefined) data.enabled = input.enabled;

    const res = await (db as any).macro.updateMany({
      where: { id, userId: ownerOf(user) },
      data,
    });
    if (res.count === 0) return { success: false, message: "Macro no encontrada." };
    return { success: true, message: "Macro actualizada." };
  } catch (e) {
    console.error("[updateMacroAction]", e);
    return { success: false, message: "Error al actualizar la macro." };
  }
}

export async function reorderMacrosAction(ids: string[]): Promise<{ success: boolean }> {
  try {
    const user = await requireUser();
    const ownerId = ownerOf(user);
    await db.$transaction(
      ids.map((id, i) =>
        (db as any).macro.updateMany({ where: { id, userId: ownerId }, data: { order: i } }),
      ),
    );
    return { success: true };
  } catch (e) {
    console.error("[reorderMacrosAction]", e);
    return { success: false };
  }
}

export async function deleteMacroAction(id: string): Promise<{ success: boolean; message: string }> {
  try {
    const user = await requireUser();
    await (db as any).macro.deleteMany({ where: { id, userId: ownerOf(user) } });
    return { success: true, message: "Macro eliminada." };
  } catch (e) {
    console.error("[deleteMacroAction]", e);
    return { success: false, message: "Error al eliminar la macro." };
  }
}

export async function duplicateMacroAction(
  id: string,
): Promise<{ success: boolean; message: string; id?: string }> {
  try {
    const user = await requireUser();
    const ownerId = ownerOf(user);
    const src = await (db as any).macro.findFirst({ where: { id, userId: ownerId } });
    if (!src) return { success: false, message: "Macro no encontrada." };
    const count = await (db as any).macro.count({ where: { userId: ownerId } });
    const copy = await (db as any).macro.create({
      data: {
        userId: ownerId,
        name: `${src.name} (copia)`,
        description: src.description,
        color: src.color,
        actions: src.actions,
        order: count,
        enabled: src.enabled,
      },
    });
    return { success: true, message: "Macro duplicada.", id: copy.id };
  } catch (e) {
    console.error("[duplicateMacroAction]", e);
    return { success: false, message: "Error al duplicar la macro." };
  }
}

export async function deleteMacrosAction(ids: string[]): Promise<{ success: boolean; message: string }> {
  try {
    const user = await requireUser();
    await (db as any).macro.deleteMany({ where: { id: { in: ids }, userId: ownerOf(user) } });
    return { success: true, message: "Macros eliminadas." };
  } catch (e) {
    console.error("[deleteMacrosAction]", e);
    return { success: false, message: "Error al eliminar las macros." };
  }
}

export async function deleteAllMacrosAction(): Promise<{ success: boolean; message: string }> {
  try {
    const user = await requireUser();
    await (db as any).macro.deleteMany({ where: { userId: ownerOf(user) } });
    return { success: true, message: "Todas las macros fueron eliminadas." };
  } catch (e) {
    console.error("[deleteAllMacrosAction]", e);
    return { success: false, message: "Error al eliminar las macros." };
  }
}

/* ─────────────── EJECUCIÓN ─────────────── */

/**
 * Corre una macro sobre una conversación, encadenando las acciones de siempre.
 *
 * Tres cosas que no se pueden aflojar:
 *
 * 1. **Lo que envía sale por la línea de la conversación y por SU proveedor**
 *    (`enviarPorLaLinea`). La línea la da el chat (`instanceName`); el
 *    `context` viejo se sigue aceptando y de él solo se lee el nombre.
 * 2. **Cada acción cuenta lo que devolvió.** Una acción que contesta
 *    `success: false`, o que está a medias (`porQueNoEstaLista`), es un fallo
 *    con su motivo, no una acción hecha. El aviso lo arma
 *    `elResumenDeLaEjecucion`, que nombra lo que no salió.
 * 3. **Lo que toca la conversación va con la cuenta DUEÑA de la conversación**
 *    (el Agente IA), no con la de quien pulsa: desde la madre, una
 *    conversación de una línea de la hija es de la hija.
 */
export async function executeMacroAction(input: {
  macroId: string;
  sessionId: number;
  remoteJid?: string;
  instanceName?: string | null;
  context?: ChatCtx | null;
}): Promise<{
  success: boolean;
  message: string;
  tono: "ok" | "parcial" | "error";
  applied: number;
  failed: number;
  resultados: ResultadoDeAccion[];
}> {
  const vacio = (message: string) => ({
    success: false,
    message,
    tono: "error" as const,
    applied: 0,
    failed: 0,
    resultados: [] as ResultadoDeAccion[],
  });
  try {
    const user = await requireUser();
    const ownerId = ownerOf(user);

    const macro = await (db as any).macro.findFirst({
      where: { id: input.macroId, userId: ownerId, enabled: true },
    });
    if (!macro) return vacio("Macro no encontrada o desactivada.");

    const actions: MacroActionItem[] = Array.isArray(macro.actions) ? macro.actions : [];
    const { sessionId, remoteJid } = input;
    const lineaDelChat = input.instanceName ?? input.context?.instanceName ?? null;

    // «Enviar por otra línea» elige su propia línea; las demás que envían van
    // por la de la conversación, que se resuelve UNA vez: de ella sale el
    // proveedor.
    const porLaDelChat = actions.some((a) => a.type !== "SEND_TEXT_VIA" && ACCIONES_QUE_ENVIAN.includes(a.type));
    const accountIds = actions.some((a) => ACCIONES_QUE_ENVIAN.includes(a.type)) ? await authorizedAccountIds(user) : [];
    let linea: { instanceName: string; instanceType: string | null } | null = null;
    let porQueNoHayLinea: string | null = null;
    if (porLaDelChat) {
      if (!lineaDelChat) porQueNoHayLinea = "Esta conversación no dice por qué línea responder.";
      else if (!remoteJid) porQueNoHayLinea = "Falta el contacto de la conversación.";
      else {
        try {
          linea = await laLineaAlcanzable(accountIds, lineaDelChat);
        } catch (e) {
          porQueNoHayLinea = e instanceof Error ? e.message : "La línea de la conversación no está disponible.";
        }
      }
    }

    // La cuenta dueña de la conversación: es con la que se toca el Agente IA.
    const duenaDeLaConversacion = actions.some((a) => a.type === "TOGGLE_AI")
      ? (await db.session.findUnique({ where: { id: sessionId }, select: { userId: true } }))?.userId ?? null
      : null;

    const resultados: ResultadoDeAccion[] = [];

    for (const a of actions) {
      const falta = porQueNoEstaLista(a);
      if (falta) {
        resultados.push({ tipo: a.type, ok: false, motivo: `está a medias (${falta})` });
        continue;
      }
      try {
        const cfg = a.config ?? {};
        const necesitaLinea = () => {
          if (!linea || !remoteJid) throw new Error(porQueNoHayLinea ?? "No hay línea para responder.");
          return linea;
        };
        switch (a.type) {
          case "SEND_TEXT": {
            const l = necesitaLinea();
            await enviarPorLaLinea(l.instanceName, l.instanceType, remoteJid!, { kind: "text", text: cfg.text! });
            break;
          }
          case "SEND_FILE": {
            const l = necesitaLinea();
            await enviarPorLaLinea(l.instanceName, l.instanceType, remoteJid!, {
              kind: "media",
              mediatype: (cfg.mediatype ?? "document") as any,
              mediaUrl: cfg.mediaUrl!,
              mimetype: cfg.mimetype,
              fileName: cfg.fileName,
              caption: cfg.caption || undefined,
            });
            break;
          }
          case "SEND_QUICK_REPLY": {
            const l = necesitaLinea();
            const id = Number(cfg.quickReplyId);
            const p = elProveedorDeLaLinea(l.instanceType);
            const res =
              p === "waha"
                ? await sendWahaQuickReplyAction(l.instanceName, remoteJid!, id)
                : p === "canal"
                  ? await sendChannelQuickReplyAction(l.instanceName, remoteJid!, id)
                  : await sendManualQuickReplyAction({ apiKeyData: null, instanceName: l.instanceName }, remoteJid!, id);
            exigir(res, "No se pudo enviar la respuesta rápida.");
            break;
          }
          case "EXECUTE_FLOW": {
            const l = necesitaLinea();
            const p = elProveedorDeLaLinea(l.instanceType);
            const res =
              p === "waha"
                ? await sendWahaWorkflowAction(l.instanceName, remoteJid!, cfg.workflowId!)
                : p === "canal"
                  ? await sendChannelWorkflowAction(l.instanceName, remoteJid!, cfg.workflowId!)
                  : await sendManualWorkflowAction({ apiKeyData: null, instanceName: l.instanceName }, remoteJid!, cfg.workflowId!);
            exigir(res, "No se pudo ejecutar el flujo.");
            break;
          }
          case "SEND_TEXT_VIA":
            if (!remoteJid) throw new Error("Falta el contacto de la conversación.");
            if (cfg.viaMode === "template") {
              await sendTemplateViaLine(accountIds, cfg.instanceName!, remoteJid, cfg);
            } else {
              await sendTextViaLine(accountIds, cfg.instanceName!, remoteJid, cfg.text!);
            }
            break;
          case "ADD_TAG":
            exigir(
              await assignTagToSessionAction({ userId: ownerId, sessionId, tagId: Number(cfg.tagId) }),
              "No se pudo agregar la etiqueta.",
            );
            break;
          case "REMOVE_TAG":
            exigir(
              await removeTagFromSessionAction({ userId: ownerId, sessionId, tagId: Number(cfg.tagId) }),
              "No se pudo quitar la etiqueta.",
            );
            break;
          case "CHANGE_STAGE":
            exigir(await updateSessionLeadStatus(sessionId, cfg.stage as any), "No se pudo cambiar la calificación.");
            break;
          case "ASSIGN_ADVISOR":
          case "TRANSFER_ADVISOR":
            // Las dos reasignan la conversación al asesor elegido.
            // `assignSessionToAdvisor` valida dueño o administrador, registra y
            // dispara las automatizaciones; `transferSession` exige ser el
            // asesor actual y rompería en una macro corrida por el dueño.
            exigir(await assignSessionToAdvisor(sessionId, cfg.advisorId!), "No se pudo asignar el asesor.");
            break;
          case "CREATE_TASK": {
            const days = Number.isFinite(cfg.taskDays) ? Number(cfg.taskDays) : 0;
            const due = new Date(Date.now() + Math.max(0, days) * 86400000);
            exigir(
              await createTaskAction({
                assignedToId: cfg.advisorId!,
                sessionId,
                title: cfg.taskTitle!,
                type: cfg.taskType || "Seguimiento",
                dueDate: due.toISOString(),
              }),
              "No se pudo crear la tarea.",
            );
            break;
          }
          case "INTERNAL_NOTE":
            exigir(await createInternalNoteAction({ sessionId, content: cfg.content! }), "No se pudo agregar la nota.");
            break;
          case "TOGGLE_AI":
            if (!duenaDeLaConversacion) throw new Error("La conversación no tiene ficha.");
            exigir(
              await toggleAgentDisabled(duenaDeLaConversacion, sessionId, Boolean(cfg.disabled)),
              "No se pudo cambiar el Agente IA.",
            );
            break;
          case "WAIT": {
            // Pausa entre acciones, con tope: la macro corre dentro de una
            // petición y no puede colgarla.
            const secs = Math.min(SEGUNDOS_MAXIMOS_DE_ESPERA, Math.max(0, losSegundosDeLaEspera(cfg)));
            if (secs > 0) await new Promise((r) => setTimeout(r, secs * 1000));
            break;
          }
          case "RESOLVE":
            exigir(await resolveSession(sessionId), "No se pudo resolver la conversación.");
            break;
          default:
            throw new Error("Esta acción no existe.");
        }
        resultados.push({ tipo: a.type, ok: true });
      } catch (err) {
        const motivo = err instanceof Error ? err.message : "error desconocido";
        resultados.push({ tipo: a.type, ok: false, motivo });
        console.warn(`[macros] la acción ${a.type} no salió`, { macro: input.macroId, sessionId, motivo });
      }
    }

    // Contador de ejecuciones (un UPDATE por corrida).
    try {
      await (db as any).macro.update({
        where: { id: input.macroId },
        data: { runCount: { increment: 1 }, lastRunAt: new Date() },
      });
    } catch (e) {
      console.warn("[macros] no se pudo contar la ejecución", e);
    }

    const { tono, mensaje } = elResumenDeLaEjecucion(resultados);
    const failed = resultados.filter((r) => !r.ok).length;
    return {
      success: tono !== "error",
      message: mensaje,
      tono,
      applied: resultados.length - failed,
      failed,
      resultados,
    };
  } catch (e) {
    console.error("[executeMacroAction]", e);
    return vacio("Error al ejecutar la macro.");
  }
}
