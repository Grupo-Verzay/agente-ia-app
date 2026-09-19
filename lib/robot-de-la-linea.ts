import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

/**
 * La marca `bot_enabled` de una línea, y los eventos con los que se registra su
 * webhook. **En un solo sitio**, porque ahora la tocan dos frentes.
 *
 * Hasta ahora esto vivía dentro de `actions/robot-actions.ts`, que es un módulo
 * `'use server'` y **no puede exportar constantes** —una constante exportada
 * desde ahí compila y luego da 500 en producción en cada llamada del fichero,
 * que es la regla escrita de `carpetas-actions`—. Así que facturación no podía
 * importar ni la lista de eventos ni la marca, y acabó con las suyas: escribía
 * el webhook con `["MESSAGES_UPSERT", "CALL"]`, o sea **sin los acuses y sin
 * «escribiendo…»**, y cada cambio de estado de facturación se los quitaba a esa
 * línea sin que nadie lo notara.
 *
 * La columna la crea el BACKEND (`docs/db-migrations-ownership.md`) y aquí se
 * lee y escribe con SQL en crudo a propósito: declararla en `schema.prisma` y
 * que no exista todavía reventaría cada consulta a `Instancias` (el #360).
 */

/** El webhook de Evolution, cuando la cuenta no tiene el suyo. */
export const WEBHOOK_POR_DEFECTO = "https://backend.ia-app.com/webhook";

/**
 * Los eventos que Evolution nos manda.
 *
 * `MESSAGES_UPDATE` son los acuses y `PRESENCE_UPDATE` es «escribiendo…». El
 * porqué de cada uno está en `actions/robot-actions.ts`, que es quien los
 * registra; lo que importa aquí es que **la lista es UNA**. Con una copia en
 * facturación, cualquier cambio de estado de cobro reescribía el webhook con
 * la lista corta y esa línea se quedaba sin acuses hasta que alguien apagara y
 * encendiera el Robot a mano.
 */
export const EVENTOS_DEL_WEBHOOK = [
    "MESSAGES_UPSERT",
    "MESSAGES_UPDATE",
    "CALL",
    "PRESENCE_UPDATE",
];

/** `null` = la fila no está. `"sin-columna"` = el backend no ha migrado aún. */
export type MarcaDelRobot = boolean | null | "sin-columna";

export async function leerMarcaDelRobot(instanceName: string): Promise<MarcaDelRobot> {
    try {
        const filas = await db.$queryRaw<{ bot_enabled: boolean }[]>(
            Prisma.sql`SELECT "bot_enabled" FROM "Instancias" WHERE "instanceName" = ${instanceName} LIMIT 1`,
        );
        return filas[0]?.bot_enabled ?? null;
    } catch (error) {
        console.warn(
            "[robot] la base no tiene bot_enabled; se usa el webhook como antes.",
            (error as Error)?.message,
        );
        return "sin-columna";
    }
}

export async function escribirMarcaDelRobot(
    instanceName: string,
    encendido: boolean,
): Promise<boolean> {
    try {
        await db.$executeRaw(
            Prisma.sql`UPDATE "Instancias" SET "bot_enabled" = ${encendido} WHERE "instanceName" = ${instanceName}`,
        );
        return true;
    } catch (error) {
        console.warn("[robot] no se pudo escribir bot_enabled:", (error as Error)?.message);
        return false;
    }
}

/**
 * Las líneas de WhatsApp por QR de una cuenta, **de los dos proveedores**.
 *
 * `Whatsapp` es Evolution y `waha` es WhatsApp Mensajería, y son la misma cosa:
 * un número conectado por QR. Buscar solo una deja al otro proveedor fuera de
 * cualquier cosa que se haga por cuenta — que es exactamente lo que pasaba al
 * suspender.
 */
export async function lasLineasDeWhatsApp(
    userId: string,
): Promise<Array<{ instanceName: string; instanceType: string }>> {
    const filas = await db.instancia.findMany({
        where: { userId, instanceType: { in: ["Whatsapp", "waha"] } },
        select: { instanceName: true, instanceType: true },
    });
    return filas
        .filter((f) => Boolean(f.instanceName))
        .map((f) => ({ instanceName: f.instanceName, instanceType: f.instanceType ?? "Whatsapp" }));
}
