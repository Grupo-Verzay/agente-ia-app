import "server-only";

import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { crearLosAvisos } from "@/lib/avisos-de-tarea";
import { quienesAlcanzanLaRuta } from "@/lib/alcance-de-modulo.server";
import {
  RUTA_DE_TICKETS,
  aQuienAvisaUnTicket,
  elEnlaceDelTicket,
  tituloDelAvisoDeTicket,
} from "@/lib/aviso-de-ticket";

/**
 * El aviso de un ticket: a quién le toca y cómo se manda.
 *
 * Vive aparte de `lib/tickets-db.ts` —que es el acceso a las tablas— y de las
 * acciones —que son `'use server'` y publican como POST todo lo que exportan—
 * por el mismo motivo que `lib/avisar-de-la-tarea.ts`: lo llaman **los dos
 * caminos por los que entra un ticket** (la ficha pública y el formulario de
 * dentro) y el trabajo diario de los vencimientos. Con la lista de
 * destinatarios escrita en cada uno, el tercero se olvidaría de alguien — y eso
 * no se ve como un error: se ve como que «a mí los tickets no me llegan».
 */

/**
 * La gente de la cuenta que atiende los tickets.
 *
 * El MISMO universo con el que se elige responsable (`getTeamAdvisorInfos`):
 * la propia cuenta de destino, su equipo (`owner_id`) y las cuentas vinculadas
 * a ella. **Tiene que ser el mismo**, y esa es la razón de que esta función
 * exista y no haya dos consultas: a quien se puede asignar un ticket es a quien
 * le llega su aviso. Con dos universos, se asigna a alguien que nunca recibió
 * nada y nadie sabe por qué.
 *
 * **La cuenta de destino entra**, y no es un detalle: su fila no cuelga de
 * nadie, así que `owner_id = destino` no la devuelve — es el mismo agujero que
 * ya costó una vuelta en los directos del chat de equipo, donde al dueño no se
 * le podía escribir.
 */
export async function laGenteQueAtiende(destinoId: string): Promise<string[]> {
  const cuenta = (destinoId ?? "").trim();
  if (!cuenta) return [];

  const filas = await db.$queryRaw<Array<{ id: string }>>`
    SELECT u."id" FROM "User" u WHERE u."id" = ${cuenta}
    UNION
    SELECT u."id" FROM "User" u WHERE u."owner_id" = ${cuenta}
    UNION
    SELECT la."linked_user_id" AS "id" FROM "linked_accounts" la
    WHERE la."master_user_id" = ${cuenta}
  `;
  return filas.map((f) => f.id);
}

/**
 * Los de esa cuenta que además **alcanzan el módulo de Tickets**.
 *
 * Se pregunta por cada PERSONA y no por la cuenta: alguien del equipo tiene sus
 * propios `_UserModules`, sus apartados negados y sus concedidos, así que el
 * alcance se pregunta a **su** fila efectiva — la regla de siempre. La decide
 * `quienesAlcanzanLaRuta`, o sea exactamente lo que cada uno vería en su menú.
 */
export async function quienesAtiendenYLoVen(destinoId: string): Promise<string[]> {
  const gente = await laGenteQueAtiende(destinoId);
  if (!gente.length) return [];
  const alcanzan = await quienesAlcanzanLaRuta(gente, RUTA_DE_TICKETS);
  // Se conserva el orden de la consulta y no el del `Set`: así dos vueltas
  // seguidas mandan la misma lista y el banco puede compararla.
  return gente.filter((id) => alcanzan.has(id));
}

export type TicketQueAvisa = {
  id: string;
  /** La cuenta que lo recibe. De ella sale la gente a la que se avisa. */
  destinoId: string;
  titulo: string;
  /** Quién lo atiende. Con responsable, el aviso es **suyo y de nadie más**. */
  responsableId?: string | null;
  /** Cómo se llamó quien lo abrió por el enlace. Nulo = lo abrió alguien con cuenta. */
  contactoNombre?: string | null;
};

/**
 * Salta la MISMA ventana que una mención del chat del equipo.
 *
 * La misma tabla (`task_alerts`), la misma campanita y el mismo clic
 * obligatorio; lo único propio es el `tipo` y que **no cuelga de ninguna
 * tarea**, así que el clic aterriza por el `enlace` y abre el ticket.
 *
 * **Nunca lanza.** El ticket ya está guardado cuando se llama, y un fallo del
 * aviso no puede deshacerlo — es la misma regla que `crearLosAvisos`. Pero
 * **tampoco es mudo**: un aviso que no sale sin decirlo se lee como «a mí no me
 * llega nada», que es justo lo que esto viene a arreglar.
 *
 * Devuelve cuántos se escribieron, que es lo que el banco mira.
 */
export async function avisarDelTicketNuevo(input: {
  ticket: TicketQueAvisa;
  /**
   * Quién lo abrió, cuando tiene fila en `User`. **Nulo en la ficha pública**:
   * ahí lo escribe un cliente final que no tiene cuenta, así que no hay persona
   * que firmar — y por eso nadie queda descontado de la lista.
   */
  actorId?: string | null;
}): Promise<number> {
  try {
    const { ticket } = input;
    const conAcceso = await quienesAtiendenYLoVen(ticket.destinoId);
    const aQuien = aQuienAvisaUnTicket({
      responsableId: ticket.responsableId,
      conAcceso,
    });

    if (aQuien.elResponsableNoAlcanza) {
      // No es un fallo del aviso: es una cuenta mal configurada. Y callarlo se
      // lee como «a esta persona no le llega nada».
      console.warn("[tickets] el responsable no alcanza el modulo; nadie recibe el aviso", {
        ticket: ticket.id,
        responsable: ticket.responsableId,
        cuenta: ticket.destinoId,
      });
    } else if (!aQuien.destinatarios.length) {
      console.warn("[tickets] nadie de la cuenta alcanza el modulo de Tickets", {
        ticket: ticket.id,
        cuenta: ticket.destinoId,
        gente: conAcceso.length,
      });
    }

    if (!aQuien.destinatarios.length) return 0;

    const titulo = tituloDelAvisoDeTicket(ticket.contactoNombre);
    return await crearLosAvisos(
      aQuien.destinatarios.map((destinatarioId) => ({
        id: randomUUID(),
        // Un ticket NO es una tarea: `taskId` en nulo, como los avisos del chat
        // del equipo. De ahí sale que el clic aterrice por el `enlace`.
        taskId: null,
        projectId: null,
        // Contabilidad, no permiso: la ventana y la campanita leen por
        // `destinatarioId`, así que el aviso llega a su persona esté en la
        // cuenta que esté.
        ownerId: ticket.destinoId,
        destinatarioId,
        actorId: input.actorId ?? null,
        // Quien lo abrió por el enlace no tiene fila en `User`, así que su
        // nombre es lo único que lo identifica — y por eso se copia aquí.
        actorNombre: ticket.contactoNombre?.trim() || null,
        tipo: "ticket" as const,
        titulo,
        texto: ticket.titulo,
        enlace: elEnlaceDelTicket(ticket.id),
      })),
    );
  } catch (error) {
    console.warn("[tickets] no se pudo avisar de un ticket nuevo", {
      ticket: input.ticket.id,
      error: error instanceof Error ? error.message : String(error),
    });
    return 0;
  }
}
