"use server";

import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { assertCanAccessTargetUser } from "@/actions/billing/helpers/app-access-guard";
import { cuentaQueManda } from "@/lib/cuenta-que-manda";
import {
  agruparLasPreguntas,
  elResumenDelInforme,
  type FilaDelInforme,
  type PreguntaAgrupada,
} from "@/lib/lo-que-la-ia-no-supo";

/**
 * Lo que la IA no supo responder, para el informe de Informes.
 *
 * Las filas las escribe el backend cada vez que el agente se queda sin
 * respuesta, ya agrupadas por significado (`grupoId`, calculado con un
 * embedding **al guardar**). Aquí no se agrupa nada ni se llama a ningún
 * modelo: abrir el informe no puede gastar IA.
 *
 * La tabla es del BACKEND —él es dueño de su migración— así que se lee con SQL
 * en crudo y no se declara en `schema.prisma`. Declararla aquí es lo que
 * reventó el #360: si la App despliega antes que la migración, una columna
 * declarada y ausente tira **todas** las consultas a esa tabla. Leyéndola en
 * crudo, lo peor que pasa es que el informe salga vacío hasta que el backend
 * despliegue, y se dice en la consola.
 */

/** Cuánto se lee de una vez. Ver la nota de abajo. */
const TOPE_DEL_INFORME = 5000;

export type InformeSinRespuesta = {
  success: true;
  grupos: PreguntaAgrupada[];
  resumen: { veces: number; preguntas: number; porEscalado: number };
  /** La consulta llegó al tope: hay más de las que se están contando. */
  alTope: boolean;
};

export type InformeSinRespuestaFallo = { success: false; msg: string };

/**
 * Quién puede ver este informe.
 *
 * `assertCanAccessTargetUser` es la puerta de siempre —uno mismo, el asesor
 * sobre su dueño, cuentas vinculadas, admin, super admin, y el reseller solo
 * sobre sus clientes— y es la que hace que Carlos vea las cuentas que gestiona
 * sin escribir aquí ninguna lista.
 *
 * Y encima una condición propia, como en borrar chats: **un `agente` no pasa**.
 * Este informe no son sus conversaciones, es dónde falla el entrenamiento de la
 * cuenta entera; quien decide sobre eso es quien manda en ella. El
 * `administrador` sí, porque actúa POR la cuenta (`lib/cuenta-que-manda.ts`).
 */
async function puertaDelInforme(userId: string) {
  const actor = await assertCanAccessTargetUser(userId);
  if (actor.ownerId && actor.ownerId !== actor.id && actor.advisorRole !== "administrador") {
    throw new Error("No autorizado.");
  }
  return actor;
}

export async function getInformeSinRespuesta(input: {
  userId: string;
  /** Desde cuándo. Sin ella, todo lo que haya. */
  desde?: string | null;
  hasta?: string | null;
}): Promise<InformeSinRespuesta | InformeSinRespuestaFallo> {
  try {
    const me = await currentUser();
    if (!me) return { success: false, msg: "No autorizado." };

    const userId = String(input?.userId ?? "").trim();
    if (!userId) return { success: false, msg: "Falta la cuenta." };

    await puertaDelInforme(userId);

    // La cuenta de la que son los datos: la que MANDA sobre el id que llega.
    // Pedir el informe con el id de un asesor devolvería vacío y parecería que
    // su IA lo sabe todo, que es el caso típico de «se arregla la pantalla que
    // manda el id equivocado».
    const cuenta = await cuentaQueManda({ id: userId });
    const dueno = cuenta.id || userId;

    const desde = input?.desde ? new Date(input.desde) : null;
    const hasta = input?.hasta ? new Date(input.hasta) : null;

    // Los filtros de fecha se montan como TROZOS, no como
    // `${desde} IS NULL OR "createdAt" >= ${desde}`. Con esa forma el parámetro
    // nulo se queda dentro de la comparación: hay que decirle a Postgres de qué
    // tipo es con un cast, y la condición se evalúa fila a fila aunque no se
    // esté filtrando por nada. Con trozos, no filtrar es no tener condición.
    const entreFechas = [
      desde ? Prisma.sql`AND "createdAt" >= ${desde}` : Prisma.empty,
      hasta ? Prisma.sql`AND "createdAt" <= ${hasta}` : Prisma.empty,
    ];

    const filas = await db.$queryRaw<FilaDelInforme[]>(
      Prisma.sql`
        SELECT "grupoId", "pregunta", "caso", "createdAt"
          FROM "ia_sin_respuesta"
         WHERE "userId" = ${dueno}
           ${Prisma.join(entreFechas, " ")}
         ORDER BY "createdAt" DESC
         LIMIT ${TOPE_DEL_INFORME}
      `,
    );

    const grupos = agruparLasPreguntas(filas);
    // El tope existe porque agrupar se hace en memoria: son cadenas cortas y
    // una pasada, pero traer cien mil filas para contar dos números no lo paga
    // nadie. Y **se dice cuando se alcanza**: un informe recortado en silencio
    // es el fallo de la bandeja topada en 300 otra vez.
    const alTope = filas.length >= TOPE_DEL_INFORME;
    if (alTope) {
      console.info("[informe] lo que la IA no supo viene al tope", {
        cuenta: dueno,
        filas: filas.length,
        tope: TOPE_DEL_INFORME,
      });
    }

    return { success: true, grupos, resumen: elResumenDelInforme(grupos), alTope };
  } catch (error) {
    const texto = String(error);
    // La tabla la crea la migración del backend. Mientras no haya desplegado,
    // el informe sale vacío — pero no mudo, que un informe vacío se lee como
    // «la IA lo sabe todo», la conclusión contraria a la verdadera.
    if (texto.includes("ia_sin_respuesta") || texto.includes("42P01")) {
      console.warn("[informe] la tabla ia_sin_respuesta todavia no existe", { error: texto });
      return {
        success: true,
        grupos: [],
        resumen: { veces: 0, preguntas: 0, porEscalado: 0 },
        alTope: false,
      };
    }
    console.warn("[informe] no se pudo leer lo que la IA no supo", { error: texto });
    return { success: false, msg: texto.includes("No autorizado") ? "No autorizado." : "No se pudo cargar el informe." };
  }
}
