import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

/**
 * Desde cuándo espera una conversación a una persona.
 *
 * Cuando la IA escala, deja la conversación en manos de un asesor y se calla.
 * En la bandeja eso no se veía por ninguna parte: una conversación escalada
 * hace veinte minutos se ve igual que cualquier otra, así que nadie sabe cuál
 * corre prisa ni cuánto lleva esperando el cliente.
 *
 * La columna (`Session.escalated_at`) la crea el BACKEND con su migración, que
 * es quien las aplica aquí. A propósito NO se declara en `schema.prisma`: una
 * columna declarada aquí y ausente en la base revienta en caliente cada
 * consulta que no liste columnas, que es como se cayó el panel de facturación
 * en el #360. Se lee y se escribe con SQL en crudo, como `resolved_at`.
 *
 * Y por eso todo lo de aquí es a prueba de que la columna no exista todavía
 * —App desplegada antes que el backend—: se anota y se sigue. Un sello que no
 * se puede pintar no puede dejar la bandeja sin nombres ni etiquetas.
 */

/** Cuándo se escaló cada conversación de estas cuentas, por id de sesión. */
export async function obtenerEscaladasDeCuentas(
  userIds: string[],
): Promise<Map<number, number>> {
  const salida = new Map<number, number>();
  if (userIds.length === 0) return salida;

  try {
    const filas = await db.$queryRaw<{ id: number; escalated_at: Date | null }[]>(
      Prisma.sql`
        SELECT id, escalated_at
        FROM "Session"
        WHERE "userId" IN (${Prisma.join(userIds)}) AND escalated_at IS NOT NULL
      `,
    );
    for (const fila of filas) {
      if (fila.escalated_at) salida.set(fila.id, fila.escalated_at.getTime());
    }
  } catch (error) {
    console.warn("[escalado] no se pudo leer el sello de escalado", String(error));
  }

  return salida;
}

/**
 * Quita el sello: esta conversación ya no está esperando.
 *
 * Se llama cuando alguien de carne y hueso contesta —desde
 * `pausarIaPorIntervencionHumana`, que es el único sitio por el que pasan los
 * cuatro caminos de envío—, cuando se devuelve a la IA y cuando se resuelve.
 *
 * Por las identidades del contacto, no solo por la pedida: es la misma regla de
 * siempre, y aquí quitar el sello de menos deja una conversación atendida
 * marcada como si nadie la hubiera mirado.
 */
export async function quitarSelloDeEscalado(
  userId: string | null | undefined,
  formas: string[],
): Promise<void> {
  if (!userId || formas.length === 0) return;
  try {
    await db.$executeRaw(
      Prisma.sql`
        UPDATE "Session"
        SET escalated_at = NULL
        WHERE "userId" = ${userId}
          AND escalated_at IS NOT NULL
          AND ("remoteJid" IN (${Prisma.join(formas)})
               OR "remoteJidAlt" IN (${Prisma.join(formas)}))
      `,
    );
  } catch (error) {
    console.warn("[escalado] no se pudo quitar el sello", String(error));
  }
}

/** El mismo, por id de sesión: para los botones que ya saben cuál es. */
export async function quitarSelloDeEscaladoPorSesion(sessionId: number): Promise<void> {
  try {
    await db.$executeRaw`UPDATE "Session" SET escalated_at = NULL WHERE id = ${sessionId}`;
  } catch (error) {
    console.warn("[escalado] no se pudo quitar el sello", String(error));
  }
}
