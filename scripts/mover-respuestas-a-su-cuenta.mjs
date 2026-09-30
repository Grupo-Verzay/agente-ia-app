/**
 * Devuelve a su CUENTA las respuestas rápidas que quedaron guardadas a nombre
 * de una PERSONA del equipo.
 *
 * `createRR` guardaba la fila con el id que le llegaba del navegador, y la
 * pantalla mandaba el de quien estaba sentado delante. Para alguien del equipo
 * ese id es SU fila, no la de la cuenta, así que la respuesta se creaba bien…
 * y no salía en la lista de nadie: `/auto-replies` lee las de la cuenta. En
 * producción había 14 así. Desde que `createRR` resuelve la cuenta
 * (`laCuentaDeLaFila`) ya no nacen más; esto recoge las que ya estaban.
 *
 * Tres cosas, y las tres a propósito:
 *
 * 1. **Solo se mueve lo que sigue donde estaba.** El `UPDATE` va condicionado
 *    al `userId` que se vio al planear: si alguien la movió mientras tanto, no
 *    se toca.
 * 2. **Van al FINAL de la lista de la cuenta**, en el orden en que se crearon.
 *    Metidas delante empujarían el orden que la cuenta ya tiene colocado.
 * 3. **Lo que creó un `agente` queda como SUYO** (marca en
 *    `respuestas_personales`), que es la regla de hoy para lo que crea quien
 *    no manda (`naceSuya`). Aquí no hay que adivinar quién la creó: la fila
 *    lleva su id dentro. Lo de un administrador o de alguien sin papel queda
 *    de la cuenta.
 *
 * Uso (dentro del contenedor de la App, con `DATABASE_URL` puesta):
 *
 *     node mover-respuestas-a-su-cuenta.mjs            # solo dice qué haría
 *     node mover-respuestas-a-su-cuenta.mjs --aplicar  # lo hace
 *
 * Imprime antes y después para poder deshacerlo a mano.
 */

import { pathToFileURL } from "node:url";

/**
 * El plan, puro: de las filas huérfanas y del orden más alto de cada cuenta
 * sale qué se mueve, adónde, con qué orden y si queda marcada como personal.
 *
 * `huerfanas`: `{ id, userId (la persona), cuentaId (su owner_id), rol, createdAt }`.
 * `maximos`: `Map<cuentaId, orden más alto>` (sin entrada = la cuenta no tiene ninguna).
 */
export function elPlanDeLaMudanza(huerfanas, maximos) {
    const siguiente = new Map();
    const ordenadas = [...huerfanas].sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime() || a.id - b.id,
    );
    return ordenadas
        .filter((f) => f.cuentaId && f.cuentaId !== f.userId)
        .map((f) => {
            const base = siguiente.has(f.cuentaId)
                ? siguiente.get(f.cuentaId)
                : (maximos.get(f.cuentaId) ?? -1) + 1;
            siguiente.set(f.cuentaId, base + 1);
            return {
                id: f.id,
                de: f.userId,
                a: f.cuentaId,
                orden: base,
                personal: f.rol === "agente" ? f.userId : null,
            };
        });
}

async function main() {
    const aplicar = process.argv.includes("--aplicar");
    const { PrismaClient } = await import("@prisma/client");
    const db = new PrismaClient();
    try {
        const huerfanas = await db.$queryRaw`
            SELECT r."id", r."userId", u."owner_id" AS "cuentaId", u."advisor_role" AS "rol", r."createdAt"
            FROM "rr" r JOIN "User" u ON u."id" = r."userId"
            WHERE u."owner_id" IS NOT NULL
        `;
        const cuentas = [...new Set(huerfanas.map((f) => f.cuentaId))];
        const maximos = new Map();
        if (cuentas.length > 0) {
            const filas = await db.$queryRaw`
                SELECT "userId", max("order")::int AS "max" FROM "rr"
                WHERE "userId" = ANY(${cuentas}::text[]) GROUP BY "userId"
            `;
            for (const f of filas) maximos.set(f.userId, Number(f.max));
        }
        const plan = elPlanDeLaMudanza(huerfanas, maximos);
        console.log(JSON.stringify({ aplicar, huerfanas: huerfanas.length, plan }, null, 1));
        if (!aplicar || plan.length === 0) return;

        let movidas = 0;
        await db.$executeRaw`
            CREATE TABLE IF NOT EXISTS "respuestas_personales" (
                "rrId" INTEGER PRIMARY KEY,
                "personaId" TEXT NOT NULL,
                "cuentaId" TEXT NOT NULL,
                "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
        `;
        for (const paso of plan) {
            await db.$transaction(async (tx) => {
                const n = await tx.$executeRaw`
                    UPDATE "rr" SET "userId" = ${paso.a}, "order" = ${paso.orden}
                    WHERE "id" = ${paso.id} AND "userId" = ${paso.de}
                `;
                if (n !== 1) {
                    console.warn("[mudanza] esta ya no estaba donde se vio; no se toca", paso);
                    return;
                }
                if (paso.personal) {
                    await tx.$executeRaw`
                        INSERT INTO "respuestas_personales" ("rrId", "personaId", "cuentaId")
                        VALUES (${paso.id}, ${paso.personal}, ${paso.a})
                        ON CONFLICT ("rrId") DO NOTHING
                    `;
                }
                movidas += 1;
            });
        }
        const despues = await db.$queryRaw`
            SELECT r."id", r."userId", r."order" FROM "rr" r
            WHERE r."id" = ANY(${plan.map((p) => p.id)}::int[]) ORDER BY r."id"
        `;
        console.log(JSON.stringify({ movidas, despues }, null, 1));
    } finally {
        await db.$disconnect();
    }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
    main().catch((error) => {
        console.error("[mudanza] falló", error);
        process.exit(1);
    });
}
