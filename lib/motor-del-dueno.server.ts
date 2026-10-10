import "server-only";

import { createHash } from "crypto";
import type { LeadStatus } from "@prisma/client";

import { db } from "@/lib/db";
import {
  apuntarAccion,
  cerrarAccion,
  decidirPendiente,
  laAccion,
  laPendiente,
  lasUltimasEjecutadas,
  marcarRevertida,
  MINUTOS_PARA_CONFIRMAR,
  podarFotos,
  reemplazarPendientes,
  type FilaDeAccion,
} from "@/lib/acciones-del-dueno-db";
import { quienesAlcanzanLaRuta } from "@/lib/alcance-de-modulo.server";
import { queDiceLaRespuesta } from "@/lib/confirmacion-del-dueno";
import { laHerramienta, porQueEsIrreversible, textoDeConfirmacion } from "@/lib/herramientas-del-dueno";
import { esCodigoDeVerificacion, soloDigitos } from "@/lib/identidad-del-dueno";
import { estaVerificado, verificarCodigo } from "@/lib/identidad-del-dueno.server";
import { cambiarElEstadoDelLead } from "@/lib/estado-del-lead.server";
import {
  aplicarAsesor,
  borrarTareaDelDueno,
  contactLabel,
  createOwnerTask,
  elAsesorDeLaSesion,
  elEstadoDelLead,
  laSesionTieneLaEtiqueta,
  moveOwnerLeadStatus,
  quitarEtiquetaDelContacto,
  resolverAsesor,
  resolveTargetSession,
  sendOwnerMessage,
  tagOwnerContact,
} from "@/lib/owner-commands";
import {
  appendOwnerTrainingInstruction,
  deleteOwnerTrainingInstruction,
  devolverLasSecciones,
  devolverLosPasos,
  laFotoDelEntrenamiento,
  listOwnerTrainingRevisions,
  restoreOwnerTraining,
  updateOwnerTrainingInstruction,
} from "@/lib/owner-training";
import { parseOwnerPeople } from "@/lib/owner-contacts";

/**
 * El motor del Modo Dueño: TODA orden pasa por aquí, venga del canal que venga.
 *
 * Las cinco reglas de gobernanza viven en este fichero, en el servidor, y no
 * en el prompt de la IA ni en el backend:
 *
 * 1. **Confirmación obligatoria.** Ninguna acción se ejecuta al pedirla: se
 *    PREPARA (fila `pendiente` en `owner_acciones`, con los datos ya resueltos)
 *    y solo se ejecuta cuando la MISMA persona contesta un «sí» limpio
 *    (`queDiceLaRespuesta`). Se ejecuta lo que se mostró, no lo que la IA
 *    vuelva a decir. Cualquier otra respuesta la descarta y lo AVISA.
 * 2. **Historial y reversión.** Cada acción guarda la foto de antes/después de
 *    los campos que cambia; `owner_revertir_accion` la deshace (también
 *    confirmada). Lo irreversible se dice ANTES de confirmar.
 * 3. **Bitácora.** Persona, número, canal, texto pedido, texto mostrado, texto
 *    de la respuesta, horas y resultado. Las consultas también.
 * 4. **Plan.** Antes de consultar o preparar, la cuenta tiene que alcanzar el
 *    módulo de la herramienta (`herramientas-del-dueno.ts`) con la misma regla
 *    que los candados del menú.
 * 5. **Alcance.** Todo filtra por la cuenta de quien ordena.
 *
 * Y el segundo factor: sin verificar el número con el código del panel, se
 * puede consultar pero no preparar nada.
 */

export type QuienOrdena = {
  cuentaId: string;
  /** Teléfono de la PERSONA autorizada (como está guardado), no el del JID. */
  personaTelefono: string;
  personaNombre: string | null;
  canal: string;
  /** El texto exacto de la orden (o la transcripción de la nota de voz). */
  pedido: string | null;
};

export type Fallo = {
  ok: false;
  status: number;
  message: string;
  fueraDelPlan?: boolean;
  requiereVerificacion?: boolean;
};

// ── Plan ─────────────────────────────────────────────────────────────────────

export async function elPlanLoPermite(
  cuentaId: string,
  herramienta: string,
): Promise<{ ok: true; ruta: string | null } | { ok: false; modulo: string }> {
  const h = laHerramienta(herramienta);
  if (!h) return { ok: false, modulo: herramienta };
  if (!h.rutas) return { ok: true, ruta: null };
  for (const ruta of h.rutas) {
    const alcanzan = await quienesAlcanzanLaRuta([cuentaId], ruta);
    if (alcanzan.has(cuentaId)) return { ok: true, ruta };
  }
  return { ok: false, modulo: h.modulo };
}

function fueraDelPlan(modulo: string): Fallo {
  return {
    ok: false,
    status: 403,
    fueraDelPlan: true,
    message: `Esa función (${modulo}) no está incluida en el plan actual de la cuenta, así que no la puedo hacer. Si la necesitas, se puede activar cambiando de plan.`,
  };
}

// ── Contexto ─────────────────────────────────────────────────────────────────

type Contexto = { cuentaId: string; zona: string; persona: string };

async function elContexto(quien: { cuentaId: string; personaNombre: string | null }): Promise<Contexto> {
  const cuenta = await db.user.findUnique({ where: { id: quien.cuentaId }, select: { timezone: true } });
  return {
    cuentaId: quien.cuentaId,
    zona: cuenta?.timezone?.trim() || "America/Bogota",
    persona: quien.personaNombre?.trim() || "Dueño",
  };
}

function fecha(valor: Date | string, zona: string): string {
  const d = new Date(valor);
  try {
    return new Intl.DateTimeFormat("es", { dateStyle: "medium", timeStyle: "short", timeZone: zona }).format(d);
  } catch {
    return d.toISOString();
  }
}

function huellaDe(valor: unknown): string {
  return createHash("sha1").update(JSON.stringify(valor ?? null)).digest("hex");
}

// ── Las acciones ────────────────────────────────────────────────────────────

type Preparado = { ok: true; resumen: string; args: Record<string, unknown> } | Fallo;

type Hecho =
  | {
      ok: true;
      mensaje: string;
      entidadTipo?: string | null;
      entidadId?: string | null;
      antes?: Record<string, unknown> | null;
      despues?: Record<string, unknown> | null;
      /** `false` si, aunque la herramienta sepa deshacer, ESTA vez no hay nada que deshacer. */
      sePuedeDeshacer?: boolean;
      datos?: Record<string, unknown>;
    }
  | { ok: false; mensaje: string };

type Accion = {
  preparar(ctx: Contexto, args: Record<string, unknown>): Promise<Preparado>;
  ejecutar(ctx: Contexto, args: Record<string, unknown>, fila: FilaDeAccion): Promise<Hecho>;
  revertir?(ctx: Contexto, fila: FilaDeAccion): Promise<{ ok: boolean; mensaje: string }>;
};

const noEncontrado: Fallo = { ok: false, status: 404, message: "No encontré ese contacto en esta cuenta." };

async function elContacto(cuentaId: string, args: Record<string, unknown>) {
  const sessionId = Number(args.sessionId) > 0 ? Number(args.sessionId) : undefined;
  const phone = typeof args.phone === "string" ? args.phone : undefined;
  const s = await resolveTargetSession(cuentaId, { sessionId, phone });
  if (!s) return null;
  const numero = soloDigitos(String(s.remoteJid).split("@")[0]);
  return { sessionId: s.id, nombre: contactLabel(s), numero };
}

function tareaORecordatorio(tipoFijo: string | null): Accion {
  return {
    async preparar(ctx, args) {
      const title = String(args.title ?? "").trim();
      const d = new Date(String(args.dueDate ?? ""));
      if (!title) return { ok: false, status: 422, message: "Falta qué hay que hacer." };
      if (Number.isNaN(d.getTime())) return { ok: false, status: 422, message: "La fecha no es válida." };
      const type = tipoFijo ?? (String(args.type ?? "").trim() || "Seguimiento");
      const que = tipoFijo ? "crear el recordatorio" : `crear la tarea (${type})`;
      return {
        ok: true,
        resumen: `${que} «${title}» para el *${fecha(d, ctx.zona)}*`,
        args: { title, dueDate: d.toISOString(), type },
      };
    },
    async ejecutar(ctx, args) {
      const tarea = await createOwnerTask({
        ownerId: ctx.cuentaId,
        ownerName: ctx.persona,
        title: String(args.title),
        type: String(args.type),
        dueDate: new Date(String(args.dueDate)),
      });
      return {
        ok: true,
        mensaje: `${tipoFijo ? "Recordatorio creado" : "Tarea creada"}: «${tarea.title}».`,
        entidadTipo: "tarea",
        entidadId: String(tarea.id),
        antes: { existia: false },
        despues: { taskId: Number(tarea.id) },
      };
    },
    async revertir(ctx, fila) {
      const id = Number((fila.despues as any)?.taskId);
      const borrada = await borrarTareaDelDueno(ctx.cuentaId, id);
      return borrada
        ? { ok: true, mensaje: "Listo, borré esa tarea." }
        : { ok: false, mensaje: "Esa tarea ya no existe (alguien la borró antes)." };
    },
  };
}

const ACCIONES: Record<string, Accion> = {
  owner_crear_tarea: tareaORecordatorio(null),
  owner_crear_recordatorio: tareaORecordatorio("Recordatorio"),

  owner_enviar_mensaje: {
    async preparar(ctx, args) {
      const text = String(args.text ?? "").trim();
      if (!text) return { ok: false, status: 422, message: "Falta el texto del mensaje." };
      const c = await elContacto(ctx.cuentaId, args);
      if (!c) return noEncontrado;
      return {
        ok: true,
        resumen: `enviar a *${c.nombre}* (+${c.numero}) este mensaje:\n«${text}»`,
        args: { sessionId: c.sessionId, text, contact: c.nombre },
      };
    },
    async ejecutar(ctx, args) {
      const r = await sendOwnerMessage({ ownerId: ctx.cuentaId, sessionId: Number(args.sessionId), text: String(args.text) });
      if (!r.ok) return { ok: false, mensaje: r.message };
      return { ok: true, mensaje: `Mensaje enviado a ${r.data.contact}.`, entidadTipo: "conversacion", entidadId: String(r.data.sessionId) };
    },
  },

  owner_mover_lead: {
    async preparar(ctx, args) {
      const status = String(args.status ?? "");
      if (!["FRIO", "TIBIO", "CALIENTE", "FINALIZADO", "DESCARTADO"].includes(status)) {
        return { ok: false, status: 422, message: "Ese estado no existe." };
      }
      const c = await elContacto(ctx.cuentaId, args);
      if (!c) return noEncontrado;
      const ahora = await elEstadoDelLead(c.sessionId);
      return {
        ok: true,
        resumen: `mover a *${c.nombre}* (+${c.numero}) de *${ahora ?? "sin estado"}* a *${status}*`,
        args: { sessionId: c.sessionId, status, contact: c.nombre },
      };
    },
    async ejecutar(ctx, args) {
      const sessionId = Number(args.sessionId);
      const antes = await elEstadoDelLead(sessionId);
      const r = await moveOwnerLeadStatus({ ownerId: ctx.cuentaId, sessionId, status: args.status as LeadStatus });
      if (!r.ok) return { ok: false, mensaje: r.message };
      return {
        ok: true,
        mensaje: `${r.data.contact} quedó en *${r.data.status}*.`,
        entidadTipo: "lead",
        entidadId: String(sessionId),
        antes: { leadStatus: antes },
        despues: { leadStatus: r.data.status },
      };
    },
    async revertir(ctx, fila) {
      const sessionId = Number(fila.entidad_id);
      const s = await resolveTargetSession(ctx.cuentaId, { sessionId });
      if (!s) return { ok: false, mensaje: "Ese contacto ya no está en la cuenta." };
      const ahora = await elEstadoDelLead(sessionId);
      if (ahora !== (fila.despues as any)?.leadStatus) {
        return { ok: false, mensaje: `Su estado cambió después (ahora está en ${ahora ?? "sin estado"}); no lo toco para no pisar ese cambio.` };
      }
      const volver = ((fila.antes as any)?.leadStatus ?? null) as LeadStatus | null;
      const r = await cambiarElEstadoDelLead(sessionId, volver);
      return r.success
        ? { ok: true, mensaje: `Listo, ${contactLabel(s)} volvió a *${volver ?? "sin estado"}*.` }
        : { ok: false, mensaje: r.message };
    },
  },

  owner_etiquetar_contacto: {
    async preparar(ctx, args) {
      const tag = String(args.tag ?? "").trim();
      if (!tag) return { ok: false, status: 422, message: "Falta la etiqueta." };
      const c = await elContacto(ctx.cuentaId, args);
      if (!c) return noEncontrado;
      return {
        ok: true,
        resumen: `poner la etiqueta «${tag}» a *${c.nombre}* (+${c.numero})`,
        args: { sessionId: c.sessionId, tag, contact: c.nombre },
      };
    },
    async ejecutar(ctx, args) {
      const sessionId = Number(args.sessionId);
      const tenia = await laSesionTieneLaEtiqueta(sessionId, String(args.tag), ctx.cuentaId);
      const r = await tagOwnerContact({ ownerId: ctx.cuentaId, sessionId, tagName: String(args.tag) });
      if (!r.ok) return { ok: false, mensaje: r.message };
      return {
        ok: true,
        mensaje: `Etiqueta «${r.data.tag}» puesta a ${r.data.contact}.`,
        entidadTipo: "etiquetas",
        entidadId: String(sessionId),
        antes: { tenia },
        despues: { tagId: r.data.tagId },
        sePuedeDeshacer: !tenia,
      };
    },
    async revertir(ctx, fila) {
      await quitarEtiquetaDelContacto(ctx.cuentaId, Number(fila.entidad_id), Number((fila.despues as any)?.tagId));
      return { ok: true, mensaje: "Listo, le quité esa etiqueta." };
    },
  },

  owner_asignar_asesor: {
    async preparar(ctx, args) {
      const c = await elContacto(ctx.cuentaId, args);
      if (!c) return noEncontrado;
      const a = await resolverAsesor(ctx.cuentaId, String(args.advisorName ?? ""));
      if (!a.ok) return { ok: false, status: a.status, message: a.message };
      return {
        ok: true,
        resumen: a.data.advisorId
          ? `asignar a *${c.nombre}* (+${c.numero}) al asesor *${a.data.advisor}*`
          : `dejar a *${c.nombre}* (+${c.numero}) sin asesor`,
        args: { sessionId: c.sessionId, advisorId: a.data.advisorId, advisor: a.data.advisor, contact: c.nombre },
      };
    },
    async ejecutar(ctx, args) {
      const sessionId = Number(args.sessionId);
      const antes = await elAsesorDeLaSesion(sessionId);
      const advisorId = (args.advisorId as string | null) ?? null;
      await aplicarAsesor({
        ownerId: ctx.cuentaId,
        sessionId,
        advisorId,
        advisor: (args.advisor as string | null) ?? null,
        contact: String(args.contact ?? "contacto"),
      });
      return {
        ok: true,
        mensaje: advisorId ? `${args.contact} quedó con ${args.advisor}.` : `${args.contact} quedó sin asesor.`,
        entidadTipo: "asesor",
        entidadId: String(sessionId),
        antes: { advisorId: antes },
        despues: { advisorId },
      };
    },
    async revertir(ctx, fila) {
      const sessionId = Number(fila.entidad_id);
      const s = await resolveTargetSession(ctx.cuentaId, { sessionId });
      if (!s) return { ok: false, mensaje: "Ese contacto ya no está en la cuenta." };
      if ((await elAsesorDeLaSesion(sessionId)) !== ((fila.despues as any)?.advisorId ?? null)) {
        return { ok: false, mensaje: "Su asesor cambió después; no lo toco para no pisar ese cambio." };
      }
      const volver = ((fila.antes as any)?.advisorId ?? null) as string | null;
      const nombre = volver
        ? (await db.user.findUnique({ where: { id: volver }, select: { name: true, email: true } }))
        : null;
      await aplicarAsesor({
        ownerId: ctx.cuentaId,
        sessionId,
        advisorId: volver,
        advisor: nombre?.name || nombre?.email || null,
        contact: contactLabel(s),
      });
      return { ok: true, mensaje: volver ? `Listo, volvió con ${nombre?.name || nombre?.email}.` : "Listo, volvió a quedar sin asesor." };
    },
  },

  owner_agregar_instruccion_entrenamiento: cambioDeEntrenamiento({
    async preparar(_ctx, args, foto) {
      const instruction = String(args.instruction ?? "").trim();
      if (!instruction) return { ok: false, status: 422, message: "Falta la instrucción." };
      if (!foto) return sinEntrenamiento;
      const title = String(args.title ?? "").trim() || null;
      return {
        ok: true,
        resumen: `agregar al entrenamiento del agente la instrucción${title ? ` «${title}»` : ""}:\n«${instruction}»`,
        args: { instruction, title },
      };
    },
    async ejecutar(ctx, args) {
      const r = await appendOwnerTrainingInstruction({
        ownerId: ctx.cuentaId,
        instruction: String(args.instruction),
        title: (args.title as string | null) ?? undefined,
      });
      return r.ok ? { ok: true, mensaje: "Instrucción agregada y publicada." } : { ok: false, mensaje: r.message };
    },
  }),

  owner_editar_instruccion_entrenamiento: cambioDeEntrenamiento({
    async preparar(_ctx, args, foto) {
      if (!foto) return sinEntrenamiento;
      const paso = foto.steps.find((s: any) => String(s.id) === String(args.stepId ?? ""));
      if (!paso) return { ok: false, status: 404, message: "No encontré esa instrucción. Pídeme la lista para ver cuáles hay." };
      const instruction = typeof args.instruction === "string" ? args.instruction.trim() : undefined;
      const title = typeof args.title === "string" ? args.title.trim() : undefined;
      if (!instruction && !title) return { ok: false, status: 422, message: "Falta el texto nuevo." };
      return {
        ok: true,
        resumen: `cambiar la instrucción «${paso.title ?? "sin título"}»:\nantes: «${paso.mainMessage ?? ""}»\nahora: «${instruction ?? paso.mainMessage ?? ""}»`,
        args: { stepId: String(paso.id), instruction: instruction ?? null, title: title ?? null },
      };
    },
    async ejecutar(ctx, args) {
      const r = await updateOwnerTrainingInstruction({
        ownerId: ctx.cuentaId,
        stepId: String(args.stepId),
        instruction: (args.instruction as string | null) ?? undefined,
        title: (args.title as string | null) ?? undefined,
      });
      return r.ok ? { ok: true, mensaje: "Instrucción editada y publicada." } : { ok: false, mensaje: r.message };
    },
  }),

  owner_eliminar_instruccion_entrenamiento: cambioDeEntrenamiento({
    async preparar(_ctx, args, foto) {
      if (!foto) return sinEntrenamiento;
      const paso = foto.steps.find((s: any) => String(s.id) === String(args.stepId ?? ""));
      if (!paso) return { ok: false, status: 404, message: "No encontré esa instrucción. Pídeme la lista para ver cuáles hay." };
      return {
        ok: true,
        resumen: `eliminar del entrenamiento la instrucción «${paso.title ?? "sin título"}»:\n«${paso.mainMessage ?? ""}»`,
        args: { stepId: String(paso.id) },
      };
    },
    async ejecutar(ctx, args) {
      const r = await deleteOwnerTrainingInstruction({ ownerId: ctx.cuentaId, stepId: String(args.stepId) });
      return r.ok ? { ok: true, mensaje: "Instrucción eliminada y publicada." } : { ok: false, mensaje: r.message };
    },
  }),

  owner_restaurar_entrenamiento: {
    async preparar(ctx, args) {
      const n = Number(args.revisionNumber);
      const lista = await listOwnerTrainingRevisions(ctx.cuentaId);
      if (!lista.ok) return { ok: false, status: lista.status, message: lista.message };
      const rev = lista.data.revisions.find((r) => r.revisionNumber === n);
      if (!rev) return { ok: false, status: 404, message: `No existe la versión ${n} (se guardan las últimas 5).` };
      return {
        ok: true,
        resumen: `volver el entrenamiento del agente a la *versión ${n}* (guardada el ${fecha(rev.publishedAt, ctx.zona)})`,
        args: { revisionNumber: n },
      };
    },
    async ejecutar(ctx, args) {
      const antes = await laFotoDelEntrenamiento(ctx.cuentaId);
      if (!antes) return { ok: false, mensaje: "Esta cuenta no tiene entrenamiento configurado." };
      const r = await restoreOwnerTraining({ ownerId: ctx.cuentaId, revisionNumber: Number(args.revisionNumber) });
      if (!r.ok) return { ok: false, mensaje: r.message };
      const despues = await laFotoDelEntrenamiento(ctx.cuentaId);
      return {
        ok: true,
        mensaje: `Entrenamiento devuelto a la versión ${args.revisionNumber} y publicado.`,
        entidadTipo: "entrenamiento",
        entidadId: antes.promptId,
        antes: { sections: antes.sections as any },
        despues: { huella: huellaDe(despues?.sections) },
      };
    },
    async revertir(ctx, fila) {
      const ahora = await laFotoDelEntrenamiento(ctx.cuentaId);
      if (!ahora || huellaDe(ahora.sections) !== (fila.despues as any)?.huella) {
        return { ok: false, mensaje: "El entrenamiento cambió después; no lo toco para no pisar ese cambio." };
      }
      const r = await devolverLasSecciones({
        ownerId: ctx.cuentaId,
        sections: (fila.antes as any)?.sections,
        note: "Deshecho desde WhatsApp (modo dueño)",
      });
      return r.ok ? { ok: true, mensaje: "Listo, el entrenamiento volvió a como estaba." } : { ok: false, mensaje: r.message };
    },
  },

  owner_revertir_accion: {
    async preparar(ctx, args) {
      const orig = await laAccion(ctx.cuentaId, String(args.accionId ?? ""));
      if (!orig) return { ok: false, status: 404, message: "No encontré esa acción en el historial. Pídeme el historial para ver los códigos." };
      if (orig.estado !== "ejecutada") return { ok: false, status: 409, message: "Esa acción no llegó a hacerse: no hay nada que deshacer." };
      if (orig.revertida_por) return { ok: false, status: 409, message: "Esa acción ya se deshizo." };
      if (orig.herramienta === "owner_revertir_accion") return { ok: false, status: 409, message: "Un «deshacer» no se deshace: pide la acción otra vez." };
      if (orig.irreversible) return { ok: false, status: 409, message: `Esa acción no se puede deshacer: ${orig.irreversible}.` };
      if (!orig.reversible || !ACCIONES[orig.herramienta]?.revertir) {
        return { ok: false, status: 409, message: "Esa acción ya no se puede deshacer (se guardan las 5 últimas de cada cosa, o no había nada que deshacer)." };
      }
      const plan = await elPlanLoPermite(ctx.cuentaId, orig.herramienta);
      if (!plan.ok) return fueraDelPlan(plan.modulo);
      return {
        ok: true,
        resumen: `DESHACER lo que se hizo el ${fecha(orig.ejecutada_en ?? orig.creada_en, ctx.zona)} (lo pidió ${orig.persona_nombre ?? "el dueño"}): ${orig.resumen ?? orig.herramienta}`,
        args: { accionId: orig.id, herramientaOriginal: orig.herramienta },
      };
    },
    async ejecutar(ctx, args, fila) {
      const orig = await laAccion(ctx.cuentaId, String(args.accionId));
      if (!orig || orig.revertida_por || !orig.reversible) return { ok: false, mensaje: "Esa acción ya no se puede deshacer." };
      const r = await ACCIONES[orig.herramienta].revertir!(ctx, orig);
      if (!r.ok) return { ok: false, mensaje: r.mensaje };
      await marcarRevertida(orig.id, fila.id);
      return { ok: true, mensaje: r.mensaje, entidadTipo: orig.entidad_tipo, entidadId: orig.entidad_id };
    },
  },
};

const sinEntrenamiento: Fallo = { ok: false, status: 404, message: "Esta cuenta no tiene entrenamiento configurado." };

/** Un cambio de instrucciones: la foto es la lista de pasos de antes. */
function cambioDeEntrenamiento(def: {
  preparar(ctx: Contexto, args: Record<string, unknown>, foto: Awaited<ReturnType<typeof laFotoDelEntrenamiento>>): Promise<Preparado>;
  ejecutar(ctx: Contexto, args: Record<string, unknown>): Promise<Hecho>;
}): Accion {
  return {
    async preparar(ctx, args) {
      return def.preparar(ctx, args, await laFotoDelEntrenamiento(ctx.cuentaId));
    },
    async ejecutar(ctx, args, fila) {
      const antes = await laFotoDelEntrenamiento(ctx.cuentaId);
      const r = await def.ejecutar(ctx, args);
      if (!r.ok || !antes) return r;
      const despues = await laFotoDelEntrenamiento(ctx.cuentaId);
      return {
        ...r,
        entidadTipo: "entrenamiento",
        entidadId: antes.promptId,
        antes: { steps: antes.steps },
        despues: { huella: huellaDe(despues?.steps) },
      };
    },
    async revertir(ctx, fila) {
      const ahora = await laFotoDelEntrenamiento(ctx.cuentaId);
      if (!ahora || huellaDe(ahora.steps) !== (fila.despues as any)?.huella) {
        return { ok: false, mensaje: "El entrenamiento cambió después; no lo toco para no pisar ese cambio." };
      }
      const r = await devolverLosPasos({
        ownerId: ctx.cuentaId,
        steps: ((fila.antes as any)?.steps ?? []) as any[],
        note: "Deshecho desde WhatsApp (modo dueño)",
      });
      return r.ok ? { ok: true, mensaje: "Listo, las instrucciones volvieron a como estaban." } : { ok: false, mensaje: r.message };
    },
  };
}

// ── Consultar ────────────────────────────────────────────────────────────────

/**
 * Una consulta: plan, y queda en la bitácora (quién preguntó qué y cuándo).
 * No pide confirmación ni código: no cambia nada.
 */
export async function consultar<T>(
  quien: QuienOrdena,
  herramienta: string,
  args: Record<string, unknown>,
  hacer: () => Promise<T>,
): Promise<{ ok: true; datos: T } | Fallo> {
  const plan = await elPlanLoPermite(quien.cuentaId, herramienta);
  if (!plan.ok) {
    await apuntarAccion({ ...base(quien, herramienta, null), args, estado: "rechazada", resultado: { motivo: "plan" } });
    return fueraDelPlan(plan.modulo);
  }
  const datos = await hacer();
  await apuntarAccion({ ...base(quien, herramienta, plan.ruta), args, estado: "consulta" });
  return { ok: true, datos };
}

function base(quien: QuienOrdena, herramienta: string, modulo: string | null) {
  return {
    cuentaId: quien.cuentaId,
    personaTelefono: quien.personaTelefono,
    personaNombre: quien.personaNombre,
    canal: quien.canal,
    herramienta,
    modulo,
    pedido: quien.pedido,
  };
}

// ── Preparar ─────────────────────────────────────────────────────────────────

export type Preparada = { ok: true; accionId: string; confirmacion: string; irreversible: string | null };

/** Prepara una acción: NO la ejecuta. Devuelve el texto exacto a confirmar. */
export async function preparar(
  quien: QuienOrdena,
  herramienta: string,
  args: Record<string, unknown>,
): Promise<Preparada | Fallo> {
  const accion = ACCIONES[herramienta];
  if (!accion || laHerramienta(herramienta)?.tipo !== "accion") {
    return { ok: false, status: 400, message: "Esa acción no existe." };
  }

  if (!(await estaVerificado(quien.cuentaId, quien.personaTelefono))) {
    await apuntarAccion({ ...base(quien, herramienta, null), args, estado: "rechazada", resultado: { motivo: "sin_verificar" } });
    return {
      ok: false,
      status: 403,
      requiereVerificacion: true,
      message:
        "Antes de hacer cambios necesito verificar que este número es tuyo. Entra al panel (Perfil › Comportamiento › Modo Dueño por WhatsApp), pulsa la llave («Generar código de verificación») junto a tu número y envíame aquí los 6 dígitos. Mientras tanto puedo responderte consultas.",
    };
  }

  const plan = await elPlanLoPermite(quien.cuentaId, herramienta);
  if (!plan.ok) {
    await apuntarAccion({ ...base(quien, herramienta, null), args, estado: "rechazada", resultado: { motivo: "plan" } });
    return fueraDelPlan(plan.modulo);
  }

  const ctx = await elContexto(quien);
  const p = await accion.preparar(ctx, args);
  if (!p.ok) {
    await apuntarAccion({
      ...base(quien, herramienta, plan.ruta),
      args,
      estado: "rechazada",
      resultado: { motivo: "datos", mensaje: p.message },
    });
    return p;
  }

  const irreversible = porQueEsIrreversible(herramienta, p.args);
  const confirmacion = textoDeConfirmacion(p.resumen, irreversible);
  await reemplazarPendientes(quien.cuentaId, quien.personaTelefono);
  const accionId = await apuntarAccion({
    ...base(quien, herramienta, plan.ruta),
    resumen: p.resumen,
    args: p.args,
    irreversible,
    estado: "pendiente",
    expiraEn: new Date(Date.now() + MINUTOS_PARA_CONFIRMAR * 60_000),
  });
  return { ok: true, accionId, confirmacion, irreversible };
}

// ── El turno: lo primero que se mira cuando la persona escribe ──────────────

export type Turno =
  | { atendido: true; respuesta: string }
  | { atendido: false; aviso?: string; contexto?: string };

/**
 * Antes de que la IA lea nada:
 * 1. ¿Es el código de verificación? → se comprueba y se contesta.
 * 2. ¿Hay una acción esperando su confirmación? → «sí» limpio la ejecuta,
 *    «no» la cancela, cualquier otra cosa la DESCARTA y se avisa (y el mensaje
 *    sigue hacia la IA, que puede ser la corrección).
 */
export async function atenderTurno(quien: QuienOrdena, texto: string): Promise<Turno> {
  if (esCodigoDeVerificacion(texto)) {
    const cuenta = await db.user.findUnique({
      where: { id: quien.cuentaId },
      select: { ownerModePhone: true, notificationNumber: true },
    });
    const personas = parseOwnerPeople(cuenta?.ownerModePhone);
    const autorizados = personas.length ? personas.map((p) => p.phone) : [soloDigitos(cuenta?.notificationNumber)];
    const r = await verificarCodigo({
      cuentaId: quien.cuentaId,
      telefono: quien.personaTelefono,
      texto,
      telefonosAutorizados: autorizados,
    });
    if (r.ok) {
      return {
        atendido: true,
        respuesta: `✅ Listo${quien.personaNombre ? `, *${quien.personaNombre}*` : ""}: tu número quedó verificado. Ya puedes pedirme cambios; antes de hacer cada uno te pediré que lo confirmes.`,
      };
    }
    if (r.motivo !== "sin_codigo") {
      const porque = {
        caducado: "ese código ya caducó (vale 15 minutos). Genera otro en el panel.",
        incorrecto: "ese código no es correcto. Revísalo o genera otro en el panel.",
        bloqueado: "ese código se bloqueó por demasiados intentos. Genera otro en el panel.",
      }[r.motivo];
      return { atendido: true, respuesta: `⚠️ No pude verificar tu número: ${porque}` };
    }
    // Sin código pendiente: son seis dígitos y nada más (un dato, una respuesta).
  }

  const pend = await laPendiente(quien.cuentaId, quien.personaTelefono);
  if (!pend) return { atendido: false };

  const dice = queDiceLaRespuesta(texto);
  const que = pend.resumen ?? pend.herramienta;

  if (!pend.expira_en || pend.expira_en.getTime() <= Date.now()) {
    await decidirPendiente(pend.id, "expirada", texto);
    const aviso = `⌛ Lo que tenías pendiente de confirmar caducó (hay ${MINUTOS_PARA_CONFIRMAR} minutos) y *no se hizo*: ${que}.`;
    if (dice === "si") return { atendido: true, respuesta: `${aviso}\n\nSi todavía lo quieres, pídemelo otra vez.` };
    return { atendido: false, aviso };
  }

  if (dice === "si") return { atendido: true, respuesta: await ejecutarPendiente(pend, texto) };

  if (dice === "no") {
    const ganada = await decidirPendiente(pend.id, "cancelada", texto);
    return {
      atendido: true,
      respuesta: ganada ? `Listo, *no lo hago*: ${que}. ¿Algo más?` : "Esa acción ya se había atendido.",
    };
  }

  await decidirPendiente(pend.id, "descartada", texto);
  return {
    atendido: false,
    aviso: `⚠️ *Descarté* lo que tenías pendiente (${que}) porque tu respuesta no fue un *sí* o un *no* claro. *No se hizo nada.*`,
    contexto: `Tenía pendiente de confirmar: «${que}». Respondió algo que no es un sí ni un no limpio, así que esa acción quedó DESCARTADA y NO se ejecutó. Si su mensaje corrige datos de esa acción, prepárala de nuevo con los datos corregidos (volverá a pedir confirmación). No digas que se hizo.`,
  };
}

async function ejecutarPendiente(pend: FilaDeAccion, texto: string): Promise<string> {
  const fila = await decidirPendiente(pend.id, "ejecutando", texto);
  if (!fila) return "Esa acción ya se había atendido.";

  const quien = { cuentaId: fila.cuenta_id, personaNombre: fila.persona_nombre };
  const fallar = async (motivo: string, mensaje: string) => {
    await cerrarAccion(fila.id, { estado: "fallida", resultado: { motivo, mensaje }, reversible: false });
    return mensaje;
  };

  // Lo que se comprobó al preparar se vuelve a comprobar: en diez minutos
  // pueden haber quitado el módulo o la verificación.
  if (!(await estaVerificado(fila.cuenta_id, fila.persona_telefono))) {
    return fallar("sin_verificar", "No lo hice: tu número dejó de estar verificado. Genera un código nuevo en el panel.");
  }
  const herramientaDelPlan = String((fila.args as any)?.herramientaOriginal ?? fila.herramienta);
  const plan = await elPlanLoPermite(fila.cuenta_id, herramientaDelPlan);
  if (!plan.ok) return fallar("plan", `No lo hice: ${fueraDelPlan(plan.modulo).message}`);

  const accion = ACCIONES[fila.herramienta];
  let hecho: Hecho;
  try {
    hecho = await accion.ejecutar(await elContexto(quien), fila.args ?? {}, fila);
  } catch (error) {
    console.warn("[modo-dueno] la acción falló al ejecutarse", { id: fila.id, herramienta: fila.herramienta, error });
    hecho = { ok: false, mensaje: error instanceof Error ? error.message : "error inesperado" };
  }

  if (!hecho.ok) return fallar("ejecucion", `No se pudo completar: ${hecho.mensaje}`);

  const reversible =
    !fila.irreversible && !!accion.revertir && hecho.antes !== undefined && hecho.sePuedeDeshacer !== false;
  await cerrarAccion(fila.id, {
    estado: "ejecutada",
    resultado: { mensaje: hecho.mensaje, ...(hecho.datos ?? {}) },
    entidadTipo: hecho.entidadTipo ?? null,
    entidadId: hecho.entidadId ?? null,
    antes: hecho.antes ?? null,
    despues: hecho.despues ?? null,
    reversible,
  });
  if (hecho.entidadTipo && hecho.entidadId) {
    await podarFotos(fila.cuenta_id, hecho.entidadTipo, hecho.entidadId).catch((e) =>
      console.warn("[modo-dueno] no se pudieron podar las fotos viejas", e),
    );
  }
  const codigo = fila.id.slice(0, 8);
  return `✅ ${hecho.mensaje}${reversible ? `\n\n_Si te equivocaste, dime «deshaz ${codigo}»._` : ""}`;
}

// ── Historial ────────────────────────────────────────────────────────────────

export type LineaDelHistorial = {
  codigo: string;
  cuando: string;
  quien: string | null;
  canal: string;
  que: string;
  deshacer: "se puede" | "no se puede" | "ya no se puede" | "ya se deshizo";
};

export async function elHistorial(quien: QuienOrdena, limite = 10): Promise<LineaDelHistorial[]> {
  const ctx = await elContexto(quien);
  const filas = await lasUltimasEjecutadas(quien.cuentaId, limite);
  return filas.map((f) => ({
    codigo: f.id.slice(0, 8),
    cuando: fecha(f.ejecutada_en ?? f.creada_en, ctx.zona),
    quien: f.persona_nombre,
    canal: f.canal,
    que: f.resumen ?? f.herramienta,
    deshacer: f.revertida_por
      ? "ya se deshizo"
      : f.irreversible
        ? "no se puede"
        : f.reversible
          ? "se puede"
          : "ya no se puede",
  }));
}
