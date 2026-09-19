import "server-only";

import { randomUUID } from "crypto";

import { db } from "@/lib/db";
import { apuntarElAvisoDeVencimiento, crearLosAvisos } from "@/lib/avisos-de-tarea";
import { elHitoDeHoy, tituloDelVencimiento, type HitoDeAviso } from "@/lib/vencimiento";

/**
 * Los dos avisos de vencimiento: uno la víspera y otro el mismo día.
 *
 * Corre **una vez al día**, desde el mismo trabajo diario que ya manda los
 * recordatorios de Cobros (`/api/cron/billing`). Ni un reloj nuevo ni una ruta
 * nueva: un segundo cron es un segundo sitio que puede dejar de dispararse sin
 * que nadie se entere.
 *
 * # A quién le llega
 *
 * **Al responsable de la tarjeta; si no tiene, a quien la creó.** Eso es lo
 * pedido, y la segunda mitad es la que importa: sin ella una tarjeta sin
 * asignar no avisaría a nadie, que es justo la que más fácil se olvida.
 *
 * Y el destinatario es la **PERSONA**, con el mismo patrón que el resto de los
 * avisos (`elDestinatarioDeLosAvisos`): `task_alerts` se lee por
 * `destinatarioId` contra la persona, así que escribiendo la fila efectiva el
 * aviso quedaría a nombre de una cuenta y **no le aparecería a nadie** — ni la
 * campanita, ni marcarlo como leído. Aquí los ids salen ya de columnas que
 * guardan personas (`assignedToId`, `createdById`, `responsableId`,
 * `creadoPorId`), así que no hay ninguna sesión que resolver: lo que hay que
 * mantener es que sigan siendo esas y no las de alcance (`ownerId`,
 * `clienteId`, `destinoId`).
 *
 * # Y no se repite
 *
 * Lo decide `apuntarElAvisoDeVencimiento` con un `ON CONFLICT DO NOTHING`
 * sobre la clave `(qué, cuál, hito, día, destinatario)`. **Se apunta ANTES de
 * crear el aviso**: al revés, dos vueltas solapadas crearían los dos avisos y
 * solo después se darían cuenta. Lo que se arriesga con este orden es perder un
 * aviso si la creación falla justo después; lo que se arriesga con el otro es
 * mandarlo dos veces, y de los dos ese es el que se nota.
 */

/** Cuántas tarjetas mira una vuelta. Con más, algo va mal y hay que verlo. */
const TOPE_POR_VUELTA = 2000;

export type ResumenDeVencimientos = {
  tareas: number;
  tickets: number;
  avisos: number;
  saltados: number;
  error?: string;
};

export async function runAvisosDeVencimiento(
  ahora: Date = new Date(),
): Promise<ResumenDeVencimientos> {
  const resumen: ResumenDeVencimientos = { tareas: 0, tickets: 0, avisos: 0, saltados: 0 };
  try {
    const deTareas = await lasTareasQueVencen(ahora);
    resumen.tareas = deTareas.length;
    const deTickets = await losTicketsQueVencen(ahora);
    resumen.tickets = deTickets.length;

    for (const c of [...deTareas, ...deTickets]) {
      const nuevo = await avisar(c);
      if (nuevo) resumen.avisos += 1;
      else resumen.saltados += 1;
    }
  } catch (error) {
    // No puede tumbar el trabajo diario —cobrar y suspender es lo que importa—
    // pero tampoco es mudo: unos avisos que dejan de salir en silencio no se
    // ven como un error, se ven como «a mí nunca me llega nada».
    resumen.error = error instanceof Error ? error.message : String(error);
    console.warn("[vencimientos] no se pudieron mandar los avisos", resumen);
  }
  return resumen;
}

/** Una tarjeta que vence, ya resuelta a quién hay que avisar. */
type PorAvisar = {
  que: "tarea" | "ticket";
  refId: string;
  hito: HitoDeAviso;
  /** El día que vence, `YYYY-MM-DD`, que es lo que entra en la clave. */
  dia: string;
  destinatarioId: string;
  ownerId: string;
  titulo: string;
  /** Para el clic de la campanita. */
  taskId: number | null;
  projectId: number | null;
  enlace: string | null;
};

/**
 * Las tareas que vencen hoy o mañana y siguen abiertas.
 *
 * `status NOT IN ('done','cancelled')` es lo que apaga el aviso de una tarjeta
 * terminada, que es la otra mitad de «al marcarla como terminada deja de
 * avisar»: el distintivo se apaga en la pantalla y aquí no se llega a mirar.
 *
 * La ventana va en SQL y no filtrando en memoria: `tasks` tiene índice por
 * `dueDate` y la tabla es de todas las cuentas de la plataforma.
 */
async function lasTareasQueVencen(ahora: Date): Promise<PorAvisar[]> {
  const filas = await db.$queryRaw<
    Array<{
      id: number;
      ownerId: string;
      projectId: number | null;
      title: string;
      dueDate: Date;
      assignedToId: string | null;
      createdById: string | null;
    }>
  >`
    SELECT "id", "ownerId", "project_id" AS "projectId", "title", "dueDate",
           "assignedToId", "createdById"
    FROM "tasks"
    WHERE "status" NOT IN ('done', 'cancelled')
      AND "dueDate" >= CURRENT_DATE
      AND "dueDate" < CURRENT_DATE + INTERVAL '2 days'
    ORDER BY "dueDate" ASC
    LIMIT ${TOPE_POR_VUELTA}
  `;

  return filas.flatMap((f) => {
    const hito = elHitoDeHoy(f.dueDate, ahora);
    if (!hito) return [];
    // El responsable; si no hay, quien la creó. Sin ninguno de los dos no hay a
    // quién avisar y la tarjeta se queda solo con su distintivo.
    const destinatarioId = f.assignedToId?.trim() || f.createdById?.trim() || "";
    if (!destinatarioId) return [];
    return [
      {
        que: "tarea" as const,
        refId: String(f.id),
        hito,
        dia: elDia(f.dueDate),
        destinatarioId,
        ownerId: f.ownerId,
        titulo: f.title,
        taskId: f.id,
        projectId: f.projectId,
        enlace: null,
      },
    ];
  });
}

/**
 * Los tickets que vencen hoy o mañana y siguen abiertos.
 *
 * `estado NOT IN ('resuelto','descartado')` es el `esEstadoFinal` de
 * `lib/tickets.ts` escrito en SQL — es lo único que no se puede compartir con
 * el módulo puro, y por eso va con su nombre al lado: si allí se añade un
 * tercer estado final, aquí hay que añadirlo.
 */
async function losTicketsQueVencen(ahora: Date): Promise<PorAvisar[]> {
  const filas = await db.$queryRaw<
    Array<{
      id: string;
      destinoId: string;
      titulo: string;
      venceEl: Date;
      responsableId: string | null;
      creadoPorId: string | null;
    }>
  >`
    SELECT "id", "destinoId", "titulo", "venceEl", "responsableId", "creadoPorId"
    FROM "tickets_de_soporte"
    WHERE "estado" NOT IN ('resuelto', 'descartado')
      AND "venceEl" IS NOT NULL
      AND "venceEl" >= CURRENT_DATE
      AND "venceEl" < CURRENT_DATE + INTERVAL '2 days'
    ORDER BY "venceEl" ASC
    LIMIT ${TOPE_POR_VUELTA}
  `;

  return filas.flatMap((f) => {
    const hito = elHitoDeHoy(f.venceEl, ahora);
    if (!hito) return [];
    const destinatarioId = f.responsableId?.trim() || f.creadoPorId?.trim() || "";
    if (!destinatarioId) return [];
    return [
      {
        que: "ticket" as const,
        refId: f.id,
        hito,
        dia: elDia(f.venceEl),
        destinatarioId,
        ownerId: f.destinoId,
        titulo: f.titulo,
        // Un ticket no es una tarea: `taskId` va en nulo, como los avisos del
        // chat del equipo, y el clic aterriza por el `enlace`.
        taskId: null,
        projectId: null,
        enlace: `/tickets?ticket=${encodeURIComponent(f.id)}`,
      },
    ];
  });
}

/** Apunta primero y avisa después. Devuelve si el aviso era nuevo. */
async function avisar(c: PorAvisar): Promise<boolean> {
  const esNuevo = await apuntarElAvisoDeVencimiento({
    que: c.que,
    refId: c.refId,
    hito: c.hito,
    vence: c.dia,
    destinatarioId: c.destinatarioId,
  });
  if (!esNuevo) return false;

  await crearLosAvisos([
    {
      id: randomUUID(),
      taskId: c.taskId,
      projectId: c.projectId,
      ownerId: c.ownerId,
      destinatarioId: c.destinatarioId,
      // Sin actor: no lo hizo nadie, lo dispara el calendario. Y va en nulo a
      // propósito, porque `crearLosAvisos` descuenta al actor de los
      // destinatarios: con el propio destinatario ahí, el aviso no saldría.
      actorId: null,
      actorNombre: null,
      tipo: "vence",
      titulo: tituloDelVencimiento(c.hito, c.titulo),
      texto: c.titulo,
      enlace: c.enlace,
    },
  ]);
  return true;
}

/**
 * El día de una fecha, `YYYY-MM-DD`, en la zona del SERVIDOR.
 *
 * No con `toISOString()`, que pasa a UTC antes de cortar: un vencimiento del
 * día 20 a las 19:00 en Colombia saldría como el 21, así que la clave sería de
 * otro día y el aviso podría salir dos veces. Es la misma decisión que
 * `diaDelCierre` en el reparto del trabajo.
 */
function elDia(fecha: Date): string {
  const mes = String(fecha.getMonth() + 1).padStart(2, "0");
  const dia = String(fecha.getDate()).padStart(2, "0");
  return `${fecha.getFullYear()}-${mes}-${dia}`;
}
