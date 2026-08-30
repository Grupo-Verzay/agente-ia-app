import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

/**
 * Marca de "conversación resuelta", aparte del interruptor `status`.
 *
 * Hasta ahora resuelta se leía como `Session.status === false`. El problema es
 * que ese mismo campo lo apaga `pausarIaPorIntervencionHumana` cada vez que un
 * asesor responde -para que la IA no conteste encima-, así que responderle a un
 * cliente marcaba el chat como resuelto y lo sacaba de la lista. Nadie le había
 * dado a resolver.
 *
 * No se puede arreglar por el otro lado: quien decide si la IA responde es
 * api-webhook, que vive en otro repositorio y sigue mirando `status`. Cambiar
 * aquí lo que se escribe dejaría a la IA contestando encima de los asesores, que
 * es peor que el síntoma.
 *
 * Así que resuelta pasa a tener su propia marca y `status` se queda como lo que
 * de verdad es: la IA encendida o apagada.
 *
 * La columna se crea en caliente, como `purgedAt` en las preferencias de chat:
 * esta App NO corre migraciones al desplegar (el esquema lo gobierna
 * api-webhook, ver docs/db-migrations-ownership.md). Y a propósito NO se declara
 * en schema.prisma: una columna declarada aquí y ausente en la base revienta en
 * caliente cada consulta que no liste columnas, que es justo como se cayó el
 * panel de facturación en el #360. Se escribe y se lee con SQL en crudo.
 */
let asegurarColumnaResolvedAt: Promise<void> | null = null;

async function ensureResolvedAtColumn(): Promise<void> {
    asegurarColumnaResolvedAt ??= (async () => {
        await db.$executeRawUnsafe(
            'ALTER TABLE "Session" ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMP(3)',
        );
    })().catch((error) => {
        // Se olvida la promesa para que el siguiente intento lo reintente en vez
        // de arrastrar el error para siempre.
        asegurarColumnaResolvedAt = null;
        throw error;
    });

    return asegurarColumnaResolvedAt;
}

/** Deja la conversación marcada como resuelta, con la hora. */
export async function marcarSesionResuelta(sessionId: number): Promise<void> {
    await ensureResolvedAtColumn();
    await db.$executeRaw`UPDATE "Session" SET resolved_at = NOW() WHERE id = ${sessionId}`;
}

/**
 * La hora en que se resolvió cada sesión, solo para las que tengan marca.
 *
 * Un fallo aquí no puede tumbar la lista de chats: si no se puede leer se
 * devuelve vacío y no se ve ninguna como resuelta. Es el lado seguro —mejor una
 * conversación de más en la bandeja que una escondida sin querer—, y es
 * justamente el error que se pagó caro al vaciar los eliminados.
 */
export async function obtenerResueltas(
    sessionIds: number[],
): Promise<Map<number, number>> {
    const salida = new Map<number, number>();
    if (sessionIds.length === 0) return salida;

    try {
        await ensureResolvedAtColumn();
        const filas = await db.$queryRaw<{ id: number; resolved_at: Date | null }[]>(
            Prisma.sql`
                SELECT id, resolved_at
                FROM "Session"
                WHERE id IN (${Prisma.join(sessionIds)}) AND resolved_at IS NOT NULL
            `,
        );
        for (const fila of filas) {
            if (fila.resolved_at) salida.set(fila.id, fila.resolved_at.getTime());
        }
    } catch (error) {
        console.error("[obtenerResueltas]", error);
    }

    return salida;
}

/**
 * Deshace la marca: la conversación vuelve a la bandeja.
 *
 * Hace falta un camino de vuelta. Antes, una vez resuelta, la conversación se
 * quedaba en "Resueltos" para siempre salvo que el cliente volviera a escribir,
 * y "Liberar conversación" no servía para sacarla de ahí: eso solo quita el
 * asesor asignado, no la marca de resuelta. Son dos cosas distintas y se
 * confundían por no haber botón para la segunda.
 *
 * A propósito NO se toca `status`. Ese es el interruptor de la IA, tiene su
 * propio mando en la cabecera del chat, y reabrir para revisar algo no debería
 * poner a la IA a contestar sin que nadie lo haya pedido.
 */
export async function reabrirSesion(sessionId: number): Promise<void> {
    await ensureResolvedAtColumn();
    await db.$executeRaw`UPDATE "Session" SET resolved_at = NULL WHERE id = ${sessionId}`;
}
