"use server";

import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { isSuperAdmin } from "@/lib/rbac";
import { cuentaQueManda } from "@/lib/cuenta-que-manda";
import {
    claveDeMes,
    esCohorteParcial,
    extremosDelMes,
    ultimoMesCerrado,
    type ClaveDeMes,
    type CuentaDeLaCohorte,
    type VistaDeLaRenovacion,
} from "@/lib/renovacion-mensual";

/**
 * La tabla que guarda la cohorte de cada mes.
 *
 * Es de la App y se crea con `CREATE TABLE IF NOT EXISTS`, como `flows` o
 * `chat_messages`. **Ni una columna nueva en `UserBilling`**: esa tabla es del
 * backend y añadirle columnas desde aquí es lo que reventó el #360.
 *
 * Tres decisiones dentro:
 *
 * 1. **Sin clave foránea, y con el nombre y el correo COPIADOS.** Una cuenta
 *    morosa se elimina al mes (`billing-job`), y si la fila se fuera con ella
 *    el mes pasado perdería justo a los que se fueron — que son los que la
 *    tarjeta viene a enseñar. La fila tiene que sobrevivir a la cuenta.
 * 2. **`renovoEn` se SELLA, no se deduce al leer.** Se podría mirar el
 *    `dueDate` de hoy y ver si pasó del mes; pero de una cuenta ya borrada no
 *    hay `dueDate` que mirar, y entonces alguien que renovó y luego se dio de
 *    baja por otra cosa contaría como fuga. Sellado queda dicho para siempre.
 * 3. **Una fila por mes y cuenta**, con índice único: el trabajo diario pasa
 *    todos los días sobre el mismo mes y tiene que poder reescribir sin
 *    duplicar.
 */
async function conLaTabla<T>(hacer: () => Promise<T>): Promise<T> {
    try {
        return await hacer();
    } catch (error) {
        if (!esTablaQueFalta(error)) throw error;
        // El recuerdo de «ya la creé» es del proceso, no de la base: si la
        // tabla desaparece por debajo hay que poder recuperarse. Una vez, no
        // en bucle: si tampoco va la segunda, el problema no era que faltara.
        laTablaEstaHecha = null;
        await asegurarLaTabla();
        return hacer();
    }
}

/**
 * El `42P01` de Postgres NO está donde parece.
 *
 * En una consulta en crudo, el `code` de primer nivel es el de Prisma
 * (`P2010`) y el de Postgres viaja dentro, en `meta.code`. Preguntando por
 * `error.code` el reintento no se dispara nunca.
 */
function esTablaQueFalta(error: unknown): boolean {
    const meta = (error as { meta?: { code?: string } } | null)?.meta;
    if (meta?.code === "42P01") return true;
    const texto = error instanceof Error ? error.message : String(error);
    return texto.includes("42P01");
}

let laTablaEstaHecha: Promise<void> | null = null;

function asegurarLaTabla(): Promise<void> {
    laTablaEstaHecha ??= (async () => {
        await db.$executeRaw`
            CREATE TABLE IF NOT EXISTS "renovaciones_mensuales" (
                "id" BIGSERIAL PRIMARY KEY,
                "mes" TEXT NOT NULL,
                "userId" TEXT NOT NULL,
                "nombre" TEXT,
                "correo" TEXT,
                "fechaDeVencimiento" TIMESTAMP(3) NOT NULL,
                "renovoEn" TIMESTAMP(3),
                "anotadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
                "actualizadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
        `;
        await db.$executeRaw`
            CREATE UNIQUE INDEX IF NOT EXISTS "renovaciones_mensuales_mes_user_unique"
            ON "renovaciones_mensuales" ("mes", "userId")
        `;
        await db.$executeRaw`
            CREATE INDEX IF NOT EXISTS "renovaciones_mensuales_mes_idx"
            ON "renovaciones_mensuales" ("mes")
        `;
    })();
    return laTablaEstaHecha;
}

/**
 * Anota la cohorte del mes en curso y sella a quien ya renovó.
 *
 * La llama el trabajo diario de facturación, que es el único sitio que corre
 * **todos los días**. Eso importa más de lo que parece: la cohorte de un mes
 * hay que cogerla mientras sus cuentas todavía tienen el vencimiento en él. Si
 * esto solo corriera al abrir la pantalla, un mes en que nadie entrara al
 * panel se perdería entero y no habría forma de recuperarlo.
 *
 * Son dos pasos y el orden no importa, pero los dos tienen que estar:
 *
 * 1. **Anotar** a todo el que vence este mes. Se repite cada día porque a lo
 *    largo del mes entran cuentas nuevas y renovaciones que caen dentro.
 * 2. **Sellar** a quien ya movió su vencimiento más allá del mes: ese renovó.
 *    Se mira el mes en curso y el anterior, porque quien vence el 31 puede
 *    pagar el 2 del siguiente y sigue siendo una renovación de su mes.
 */
export async function anotarLaCohorteDelMes(): Promise<{
    mes: ClaveDeMes;
    anotadas: number;
    selladas: number;
}> {
    const ahora = new Date();
    const mes = claveDeMes(ahora);
    const anterior = ultimoMesCerrado(ahora);

    return conLaTabla(async () => {
        await asegurarLaTabla();

        const { desde, hasta } = extremosDelMes(mes);

        // ON CONFLICT: se refresca el vencimiento y los datos de contacto, pero
        // `renovoEn` NO se toca. Una vez sellado, sellado: reescribirlo cada
        // día borraría la renovación de quien ya volvió a mover su fecha.
        const anotadas = await db.$executeRaw`
            INSERT INTO "renovaciones_mensuales"
                ("mes", "userId", "nombre", "correo", "fechaDeVencimiento")
            SELECT ${mes}, b."userId", u."name", u."email", b."dueDate"
            FROM "UserBilling" b
            JOIN "User" u ON u."id" = b."userId"
            WHERE b."dueDate" >= ${desde} AND b."dueDate" < ${hasta}
            ON CONFLICT ("mes", "userId") DO UPDATE
            SET "nombre" = EXCLUDED."nombre",
                "correo" = EXCLUDED."correo",
                "fechaDeVencimiento" = EXCLUDED."fechaDeVencimiento",
                "actualizadoEn" = CURRENT_TIMESTAMP
        `;

        // Sellar: su vencimiento de hoy ya pasó del mes al que pertenece la
        // fila, así que renovó.
        const selladas = await db.$executeRaw`
            UPDATE "renovaciones_mensuales" r
            SET "renovoEn" = CURRENT_TIMESTAMP, "actualizadoEn" = CURRENT_TIMESTAMP
            FROM "UserBilling" b
            WHERE b."userId" = r."userId"
              AND r."renovoEn" IS NULL
              AND r."mes" IN (${mes}, ${anterior})
              AND b."dueDate" >= (r."mes" || '-01')::timestamp + interval '1 month'
        `;

        console.info("[renovacion] cohorte anotada", { mes, anotadas, selladas });
        return { mes, anotadas, selladas };
    });
}

/**
 * Lo que enseña la tarjeta: el último mes CERRADO.
 *
 * Solo para el superadministrador, y la puerta está **aquí** y no en la
 * pantalla: devuelve `null` a quien no sea y entonces el bloque ni se pinta.
 * Y «superadministrador» es la CUENTA por la que se actúa, no la persona.
 */
export async function leerLaRenovacionMensual(): Promise<VistaDeLaRenovacion | null> {
    const user = await currentUser();
    if (!user?.id) return null;
    const cuenta = await cuentaQueManda(user);
    if (!isSuperAdmin(cuenta.role)) return null;

    const mes = ultimoMesCerrado(new Date());

    try {
        return await conLaTabla(async () => {
            const filas = await db.$queryRaw<
                { userId: string; nombre: string | null; correo: string | null;
                  fechaDeVencimiento: Date; renovoEn: Date | null }[]
            >`
                SELECT "userId", "nombre", "correo", "fechaDeVencimiento", "renovoEn"
                FROM "renovaciones_mensuales"
                WHERE "mes" = ${mes}
            `;

            // Desde cuándo se anota. Es lo que distingue «este mes no venció
            // nadie» de «este mes no lo vimos», que es la distincion entera de
            // esta tarjeta.
            const [inicio] = await db.$queryRaw<{ empezo: Date | null }[]>`
                SELECT MIN("anotadoEn") AS empezo FROM "renovaciones_mensuales"
            `;

            const cuentas: CuentaDeLaCohorte[] = filas.map((f) => ({
                userId: f.userId,
                nombre: f.nombre,
                correo: f.correo,
                fechaDeVencimiento: f.fechaDeVencimiento.toISOString(),
                renovoEn: f.renovoEn ? f.renovoEn.toISOString() : null,
            }));

            return {
                mes: {
                    mes,
                    cuentas,
                    parcial: esCohorteParcial(mes, inicio?.empezo ?? null),
                },
            };
        });
    } catch (error) {
        // Un fallo aquí sin decirlo se ve como una tarjeta que no está.
        console.warn("[renovacion] no se pudo leer la renovación mensual", {
            error: error instanceof Error ? error.message : String(error),
        });
        return null;
    }
}
