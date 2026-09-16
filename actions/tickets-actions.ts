"use server";

import { z } from "zod";
import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { cuentaQueManda } from "@/lib/cuenta-que-manda";
import { laCuentaQueConfigura } from "@/lib/cuenta-que-configura";
import { isAdminLike } from "@/lib/rbac";
import {
  ESTADOS_DE_TICKET,
  avisaAlCliente,
  avisoDeResuelto,
  comoEstadoDeTicket,
  exigeMotivo,
  queLeFaltaAlTicket,
  soloDigitos,
  TOPE_DEL_TITULO,
  TOPE_DE_LA_DESCRIPCION,
  TOPE_DEL_MOTIVO,
  type EstadoDeTicket,
  type Ticket,
} from "@/lib/tickets";
import {
  cambiarElEstado,
  contarPorEstado,
  crearElTicket,
  elDestinoDeLosTickets,
  elTicket,
  guardarElDestino,
  losAdjuntos,
  losTicketsDelCliente,
  losTicketsDelDestino,
  sellarElAviso,
  TOPE_DE_ADJUNTOS_POR_TICKET,
  type AdjuntoDeTicket,
} from "@/lib/tickets-db";
import { TIPOS_DE_ADJUNTO } from "@/lib/adjuntos-de-tarea-tipos";
import {
  resolveWhatsAppDispatcherLine,
  sendViaWhatsAppDispatcher,
} from "@/actions/whatsapp-dispatcher";
import { normalizeChatHistoryRemoteJid } from "@/lib/chat-history/build-session-id";

/**
 * Los tickets de soporte: abrirlos, verlos y moverlos.
 *
 * ## Dos puertas distintas, y no se pueden confundir
 *
 * - **El cliente** abre tickets y ve los SUYOS. Cualquiera con sesión puede,
 *   incluido un `agente`: pedir ayuda no es administrar nada.
 * - **El administrador de destino** ve los que le caen y les cambia el estado.
 *   Esa puerta es la cuenta: `cuentaQueManda(...).id === destino`, no un rol.
 *
 * Escribir aquí una condición de rol propia es como se acabó teniendo un chat
 * que se podía anclar y no se podía borrar. La del destino se pregunta **por la
 * cuenta**, que es lo que se configura.
 *
 * ## Y el WhatsApp sale una sola vez
 *
 * Solo al PASAR a resuelto (`avisaAlCliente`), y solo si el `UPDATE`
 * condicionado cambió de verdad la fila. Sin eso, dos administradores
 * resolviendo el mismo ticket a la vez mandan dos avisos por un solo cierre.
 */

type Result<T> = { success: boolean; message: string; data?: T };

/** Un ticket con lo que cuelga de él, que es como lo pintan las pantallas. */
export type TicketConAdjuntos = Ticket & { adjuntos: AdjuntoDeTicket[] };

const adjuntoSchema = z.object({
  url: z.string().trim().url("La dirección del archivo no es válida."),
  nombre: z.string().trim().min(1).max(300),
  tipo: z.enum(TIPOS_DE_ADJUNTO),
  mimeType: z.string().trim().max(200).optional(),
  tamanoBytes: z.number().int().nonnegative().optional(),
});

const abrirSchema = z.object({
  titulo: z.string().trim().min(1).max(TOPE_DEL_TITULO),
  descripcion: z.string().trim().min(1).max(TOPE_DE_LA_DESCRIPCION),
  whatsapp: z.string().trim().max(40),
  adjuntos: z.array(adjuntoSchema).max(TOPE_DE_ADJUNTOS_POR_TICKET).default([]),
});

/** La cuenta del cliente: la CUENTA, no la persona. Un ticket es de la cuenta. */
async function laCuentaDeQuienPide() {
  const user = await currentUser();
  if (!user?.id) throw new Error("No autorizado.");
  return { user, clienteId: user.ownerId ?? user.id };
}

/**
 * ¿Se puede abrir un ticket desde aquí?
 *
 * Lo que decide es que **haya destino configurado**. Sin él no hay a dónde
 * mandarlo, y un botón que guarda en la nada es peor que no tener botón: el
 * cliente se queda esperando una respuesta que nadie va a ver.
 *
 * Y la cuenta de destino **no se pide a sí misma**: ahí los tickets se
 * gestionan, no se abren.
 */
export async function puedoAbrirTicketsAction(): Promise<{
  puede: boolean;
  /** La cuenta que los recibe, si soy yo: entonces el boton lleva al tablero. */
  soyElDestino: boolean;
  /** Quien sube los archivos. Lo pide `/api/upload`. */
  userId: string | null;
  /** El numero de la cuenta, para no teclearlo cada vez. */
  whatsapp: string | null;
}> {
  const nada = { puede: false, soyElDestino: false, userId: null, whatsapp: null };
  try {
    const user = await currentUser();
    if (!user?.id) return nada;
    const destino = await elDestinoDeLosTickets();
    if (!destino) return { ...nada, userId: user.id };
    // La comparacion es con la CUENTA (`ownerId ?? id`), no con `cuentaQueManda`:
    // un `agente` de la cuenta de destino no actua por ella, asi que
    // `cuentaQueManda` devuelve su propio id y el boton le ofrecia abrir un
    // ticket... que `abrirTicketAction` rechaza, porque el ticket se archiva
    // bajo su cuenta, que ES la de destino. Un boton que al pulsarlo da error es
    // peor que no tenerlo.
    const laCuenta = user.ownerId ?? user.id;
    const esDeLaCuentaDestino = laCuenta === destino;
    // Ver el tablero si ademas manda en ella: el `agente` de la cuenta de
    // destino ni abre tickets ni los administra, asi que no ve boton ninguno.
    const soyElDestino =
      esDeLaCuentaDestino && (!user.ownerId || user.advisorRole === "administrador");
    return {
      puede: !esDeLaCuentaDestino,
      soyElDestino,
      userId: user.id,
      whatsapp: await elNumeroDeLaCuenta(laCuenta),
    };
  } catch (error) {
    console.warn("[tickets] no se pudo decidir si se puede abrir un ticket", {
      error: error instanceof Error ? error.message : String(error),
    });
    return nada;
  }
}

/**
 * El numero con el que nace el formulario.
 *
 * `notificationNumber` no es nulo nunca —tiene `@default("0000000000")`—, asi
 * que «sin numero» es ese relleno y no un nulo. Devolverlo tal cual metia un
 * numero imposible en el campo, y el aviso de resuelto saldria hacia el.
 */
const NUMERO_DE_RELLENO = "0000000000";

async function elNumeroDeLaCuenta(cuentaId: string): Promise<string | null> {
  try {
    const fila = await db.user.findUnique({
      where: { id: cuentaId },
      select: { notificationNumber: true },
    });
    const numero = soloDigitos(fila?.notificationNumber);
    return numero && numero !== NUMERO_DE_RELLENO ? numero : null;
  } catch {
    // Sin numero el campo sale vacio y se teclea. No vale la pena avisar.
    return null;
  }
}

export async function abrirTicketAction(
  input: z.infer<typeof abrirSchema>,
): Promise<Result<{ id: string }>> {
  try {
    const parsed = abrirSchema.parse(input);

    // La MISMA comprobación que el formulario. Un formulario es una comodidad,
    // no una puerta: aquí llega lo que el navegador quiera mandar.
    const falta = queLeFaltaAlTicket(parsed);
    if (falta) throw new Error(falta);

    const destino = await elDestinoDeLosTickets();
    if (!destino) {
      throw new Error("Todavía no hay a dónde enviar los tickets. Avísale a tu proveedor.");
    }

    const { user, clienteId } = await laCuentaDeQuienPide();
    if (clienteId === destino) {
      throw new Error("Esta cuenta recibe los tickets; no abre los suyos propios.");
    }

    const id = randomUUID();
    await crearElTicket({
      id,
      clienteId,
      creadoPorId: user.id,
      destinoId: destino,
      titulo: parsed.titulo,
      descripcion: parsed.descripcion,
      whatsapp: soloDigitos(parsed.whatsapp),
      adjuntos: parsed.adjuntos.map((a) => ({
        id: randomUUID(),
        url: a.url,
        nombre: a.nombre,
        tipo: a.tipo,
        mimeType: a.mimeType ?? null,
        tamanoBytes: a.tamanoBytes ?? null,
      })),
    });

    revalidatePath("/mis-tickets");
    revalidatePath("/panel/tickets");
    return { success: true, message: "Listo, ya lo recibimos.", data: { id } };
  } catch (error) {
    console.error("[abrirTicketAction]", error);
    return {
      success: false,
      message: error instanceof Error ? error.message : "No se pudo enviar tu solicitud.",
    };
  }
}

/** Lo que el cliente ve en «Mis tickets»: los de SU cuenta y nada más. */
export async function misTicketsAction(): Promise<Result<TicketConAdjuntos[]>> {
  try {
    const { clienteId } = await laCuentaDeQuienPide();
    const tickets = await losTicketsDelCliente(clienteId);
    return { success: true, message: "", data: await conSusAdjuntos(tickets) };
  } catch (error) {
    console.error("[misTicketsAction]", error);
    return {
      success: false,
      message: error instanceof Error ? error.message : "No se pudieron cargar tus tickets.",
    };
  }
}

/**
 * La cuenta de destino, comprobada.
 *
 * Devuelve el id de la cuenta que recibe los tickets **si es la de quien
 * pregunta**. La puerta es la cuenta configurada, no un rol: quien la
 * administra actúa por ella (`cuentaQueManda`), y un `agente` de esa cuenta no
 * pasa — es la misma condición de `laCuentaQueConfigura`.
 */
async function laCuentaQueLosRecibe(): Promise<string> {
  const cuenta = await laCuentaQueConfigura();
  if (!cuenta?.id) throw new Error("No autorizado.");
  const destino = await elDestinoDeLosTickets();
  if (!destino || destino !== cuenta.id) throw new Error("No autorizado.");
  return destino;
}

export async function ticketsDeSoporteAction(
  estado?: string | null,
): Promise<Result<{ tickets: TicketConAdjuntos[]; porEstado: Record<string, number> }>> {
  try {
    const destino = await laCuentaQueLosRecibe();
    const filtro = estado ? comoEstadoDeTicket(estado) : null;
    const [tickets, porEstado] = await Promise.all([
      losTicketsDelDestino(destino, filtro),
      contarPorEstado(destino),
    ]);
    return {
      success: true,
      message: "",
      data: { tickets: await conSusAdjuntos(tickets), porEstado },
    };
  } catch (error) {
    console.error("[ticketsDeSoporteAction]", error);
    return {
      success: false,
      message: error instanceof Error ? error.message : "No se pudieron cargar los tickets.",
    };
  }
}

const moverSchema = z.object({
  id: z.string().trim().min(1),
  estado: z.enum(ESTADOS_DE_TICKET),
  motivo: z.string().trim().max(TOPE_DEL_MOTIVO).optional(),
});

export async function moverTicketAction(
  input: z.infer<typeof moverSchema>,
): Promise<Result<{ avisado: boolean }>> {
  try {
    const parsed = moverSchema.parse(input);
    const destino = await laCuentaQueLosRecibe();

    const ticket = await elTicket(parsed.id);
    if (!ticket || ticket.destinoId !== destino) throw new Error("Ese ticket no está aquí.");

    const motivo = (parsed.motivo ?? "").trim();
    if (exigeMotivo(parsed.estado) && !motivo) {
      throw new Error("Escribe por qué se descarta: el cliente lo va a leer.");
    }

    if (ticket.estado === parsed.estado && !exigeMotivo(parsed.estado)) {
      return { success: true, message: "Ya estaba así.", data: { avisado: false } };
    }

    // El aviso se decide ANTES del `UPDATE`, sobre el estado que de verdad
    // había en la base: preguntarlo después leería el que acabamos de escribir
    // y `avisaAlCliente` diría siempre que no.
    const hayQueAvisar = avisaAlCliente(ticket.estado, parsed.estado);

    const cambio = await cambiarElEstado({
      id: parsed.id,
      destinoId: destino,
      antes: ticket.estado,
      despues: parsed.estado,
      // Solo descartado guarda motivo: dejarlo puesto al volver a «en proceso»
      // enseñaría al cliente una razón de descarte de un ticket que sigue vivo.
      motivoDescarte: exigeMotivo(parsed.estado) ? motivo : null,
    });

    if (!cambio) {
      // Alguien lo movió mientras tanto. Ni se avisa ni se dice que se hizo.
      return {
        success: false,
        message: "Alguien acaba de cambiarlo. Actualiza y vuelve a intentarlo.",
      };
    }

    let avisado = false;
    if (hayQueAvisar) avisado = await avisarAlCliente(ticket, parsed.id);

    revalidatePath("/panel/tickets");
    revalidatePath("/mis-tickets");
    return { success: true, message: "Estado actualizado.", data: { avisado } };
  } catch (error) {
    console.error("[moverTicketAction]", error);
    return {
      success: false,
      message: error instanceof Error ? error.message : "No se pudo cambiar el estado.",
    };
  }
}

/**
 * El WhatsApp de «resuelto».
 *
 * **Nunca lanza**: el estado ya está guardado y eso es lo que manda; un fallo
 * de la línea no puede deshacer el cierre. Pero **tampoco es mudo** — un aviso
 * que no sale sin decirlo se lee como «al cliente nunca le llega nada», que es
 * de lo más difícil de diagnosticar después.
 */
async function avisarAlCliente(ticket: Ticket, id: string): Promise<boolean> {
  try {
    const numero = soloDigitos(ticket.whatsapp);
    if (!numero) {
      console.warn("[tickets] resuelto y sin numero al que avisar", { id });
      return false;
    }

    // Sale por la línea de la cuenta que lo atiende, con la oficial de respaldo:
    // el mismo camino que la vigilancia.
    const linea = await resolveWhatsAppDispatcherLine({
      ownerUserId: ticket.destinoId,
      includeAdminFallback: true,
    });
    if (!linea) {
      console.warn("[tickets] resuelto y sin linea por donde avisar", { id, numero });
      return false;
    }

    const res = await sendViaWhatsAppDispatcher({
      dispatcher: linea,
      remoteJid: normalizeChatHistoryRemoteJid(numero),
      text: avisoDeResuelto(ticket.titulo),
      history: {
        instanceName: linea.instanceName,
        type: "notification",
        additionalKwargs: { kind: "ticket-resuelto", ticketId: id },
      },
    });

    if (!res.success) {
      console.warn("[tickets] no se pudo avisar de un ticket resuelto", {
        id,
        message: res.message,
      });
      return false;
    }

    await sellarElAviso(id);
    console.info("[tickets] aviso de resuelto enviado", { id });
    return true;
  } catch (error) {
    console.warn("[tickets] reventó el aviso de un ticket resuelto", {
      id,
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

// ── El destino, en Panel › Notificaciones ────────────────────────────────────

/**
 * Quién puede decidir a dónde caen los tickets de toda la plataforma.
 *
 * Es un ajuste **de la plataforma**, no de una cuenta: lo toca quien manda en
 * ella. Se pregunta por la CUENTA (`cuentaQueManda`), como el resto del panel —
 * el administrador de la casa se creó con rol `user` y preguntando por la
 * persona se quedaría fuera de su propia configuración.
 */
async function puedeElegirElDestino(): Promise<boolean> {
  const user = await currentUser();
  if (!user?.id) return false;
  const cuenta = await cuentaQueManda(user);
  return isAdminLike(cuenta.role);
}

export async function leerElDestinoAction(): Promise<
  Result<{ destinoId: string | null; nombre: string | null }>
> {
  try {
    if (!(await puedeElegirElDestino())) throw new Error("No autorizado.");
    const destinoId = await elDestinoDeLosTickets();
    if (!destinoId) return { success: true, message: "", data: { destinoId: null, nombre: null } };

    const fila = await db.user.findUnique({
      where: { id: destinoId },
      select: { name: true, email: true },
    });
    return {
      success: true,
      message: "",
      data: {
        destinoId,
        // Con el id se entiende igual, pero mal: si la cuenta se eliminó hay que
        // notarlo aquí y no cuando un cliente abra un ticket que no llega.
        nombre: fila ? fila.name?.trim() || fila.email : null,
      },
    };
  } catch (error) {
    console.error("[leerElDestinoAction]", error);
    return {
      success: false,
      message: error instanceof Error ? error.message : "No se pudo leer el destino.",
    };
  }
}

export async function guardarElDestinoAction(
  destinoId: string | null,
): Promise<Result<null>> {
  try {
    if (!(await puedeElegirElDestino())) throw new Error("No autorizado.");
    const limpio = (destinoId ?? "").trim() || null;

    if (limpio) {
      // Que exista de verdad. Un id tecleado a medias dejaría los tickets
      // cayendo en una cuenta que no existe, y eso no se nota hasta que alguien
      // abre uno.
      const fila = await db.user.findUnique({ where: { id: limpio }, select: { id: true } });
      if (!fila) throw new Error("Esa cuenta no existe.");
    }

    await guardarElDestino(limpio);
    revalidatePath("/panel/notificaciones");
    revalidatePath("/panel/tickets");
    return {
      success: true,
      message: limpio ? "Destino de los tickets guardado." : "Se quitó el destino: nadie podrá abrir tickets.",
      data: null,
    };
  } catch (error) {
    console.error("[guardarElDestinoAction]", error);
    return {
      success: false,
      message: error instanceof Error ? error.message : "No se pudo guardar el destino.",
    };
  }
}

/** Las cuentas entre las que se puede elegir destino: las que administran. */
export async function cuentasParaDestinoAction(): Promise<
  Result<Array<{ id: string; nombre: string }>>
> {
  try {
    if (!(await puedeElegirElDestino())) throw new Error("No autorizado.");
    const filas = await db.user.findMany({
      where: { role: { in: ["admin", "super_admin", "reseller"] } },
      select: { id: true, name: true, email: true, role: true },
      orderBy: { createdAt: "asc" },
      take: 200,
    });
    return {
      success: true,
      message: "",
      data: filas.map((f) => ({
        id: f.id,
        nombre: `${f.name?.trim() || f.email} · ${f.role}`,
      })),
    };
  } catch (error) {
    console.error("[cuentasParaDestinoAction]", error);
    return {
      success: false,
      message: error instanceof Error ? error.message : "No se pudieron cargar las cuentas.",
    };
  }
}

/** Le pega a cada ticket sus archivos. Una consulta para todos, no una por uno. */
async function conSusAdjuntos(tickets: Ticket[]): Promise<TicketConAdjuntos[]> {
  const porTicket = await losAdjuntos(tickets.map((t) => t.id));
  return tickets.map((t) => ({ ...t, adjuntos: porTicket.get(t.id) ?? [] }));
}

export type { EstadoDeTicket };
