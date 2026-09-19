import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import {
    escribirMarcaDelRobot,
    lasLineasDeWhatsApp,
    leerMarcaDelRobot,
} from "@/lib/robot-de-la-linea";

/**
 * Vencer una factura apaga el AGENTE, no la línea.
 *
 * ## Lo que se hacía, y por qué dolía
 *
 * Al suspender por impago se llamaba a `deleteInstanceInternal`: `logout` y
 * `delete` contra Evolution, y **la fila de `Instancias` borrada**. Al pagar se
 * creaba una instancia nueva con el mismo nombre, así que el cliente tenía que
 * **volver a escanear el QR** para seguir donde estaba. Todo eso por no pagar a
 * tiempo una factura que se paga al día siguiente.
 *
 * ## Y con Waha eran DOS fallos distintos, no uno
 *
 * Esto se escribió primero de memoria y el banco lo desmintió dos veces, así
 * que aquí está medido: las dos funciones de borrado **no se comportan igual**
 * con una línea de Waha, y las dos están mal de una forma distinta.
 *
 * - **`deleteInstanceInternal`** (los caminos manuales) busca la fila una
 *   segunda vez con el tipo PEDIDO —`Whatsapp`— en vez de con el de la fila que
 *   acaba de encontrar, así que con una línea `waha` no encuentra nada y se
 *   rinde. La fila sobrevive… y con ella el agente: lo ÚNICO que lo callaba era
 *   borrar la instancia de Evolution, de modo que **una cuenta con su línea en
 *   Waha quedaba suspendida con la IA contestando**. Servicio regalado, sin un
 *   solo error en ninguna parte.
 * - **`deleteInstanceEvolutionAware`** (el cron) sí borra por el id de la fila
 *   que encontró, sea del tipo que sea. Y una línea de Waha normalmente no
 *   tiene clave de Evolution, así que entra por su primera rama —«sin apiKey no
 *   se puede contactar; limpiamos el registro»— y **se lleva la fila en el
 *   acto**. La sesión de Waha se queda viva en su servidor, sin fila que la
 *   represente: la línea desaparece de Conexiones y del filtro de canales de
 *   Chats, y al pagar volvía como una línea de **Evolution** con ese nombre, o
 *   sea con QR. Un número partido en dos, que es justo lo que la regla «una
 *   línea es UNA instancia» existe para evitar.
 *
 * Los dos están en el banco, ejecutados y no descritos.
 *
 * ## Lo que se hace ahora
 *
 * **No se toca la sesión.** Se apaga el Robot, que es la marca `bot_enabled` de
 * la línea: el backend la lee en cada mensaje y, apagado, guarda y avisa y se
 * para —sin IA, sin flujos, sin disparadores—. La conversación sigue entrando,
 * el historial se sigue guardando y el asesor puede seguir escribiendo a mano;
 * lo único que se calla es el agente, que es lo que se está cobrando.
 *
 * **Y vale para los dos proveedores con una sola escritura**, que es el motivo
 * de fondo para elegir esta palanca: el backend lee la misma marca para
 * Evolution y para Waha —los mensajes de Waha pasan por el mismo
 * `processWebhook`—. Con `logout` habría dos caminos distintos que mantener a
 * la par, y el día que uno se afinara el otro se quedaría atrás.
 *
 * **El webhook no se toca tampoco.** Apagarlo es lo que ya costó una
 * investigación entera: sin webhook no hay aviso en vivo ni historial, y desde
 * fuera eso no se ve como una cuenta suspendida, se ve como una App rota.
 */

/**
 * Lo que el Robot era ANTES de suspender, para devolverlo igual.
 *
 * Es una tabla de la App con `CREATE TABLE IF NOT EXISTS` y **sin clave
 * foránea**: `Instancias` es del backend y añadirle columnas desde aquí es lo
 * que reventó el #360. Sin FK, al borrarse una línea su fila queda huérfana y
 * no estorba — `devolverElRobotAlPagar` solo mira las líneas que existen.
 */
let tablaLista: Promise<void> | null = null;

function asegurarLaTabla(): Promise<void> {
    tablaLista ??= (async () => {
        await db.$executeRaw`
            CREATE TABLE IF NOT EXISTS "robot_antes_de_suspender" (
                "instanceName" TEXT PRIMARY KEY,
                "cuentaId" TEXT NOT NULL,
                "estabaEncendido" BOOLEAN NOT NULL,
                "anotadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
        `;
        await db.$executeRaw`
            CREATE INDEX IF NOT EXISTS "robot_antes_de_suspender_cuenta_idx"
            ON "robot_antes_de_suspender" ("cuentaId")
        `;
    })().catch((error) => {
        // El recuerdo de «ya la creé» es del PROCESO, no de la base. Si la
        // creación falla hay que olvidarlo, o todas las llamadas de después dan
        // por hecho que la tabla está y se caen con `42P01`.
        tablaLista = null;
        throw error;
    });
    return tablaLista;
}

/** `42P01` de Postgres: «relation does not exist». */
function esTablaQueFalta(error: unknown): boolean {
    // En una consulta en crudo el `code` de primer nivel es el de PRISMA
    // (`P2010`) y el de Postgres viaja dentro, en `meta.code`. Preguntando solo
    // por `code` el reintento no se dispara nunca — ya costó una vez.
    const conMeta = error as { code?: string; meta?: { code?: string } };
    if (conMeta?.meta?.code === "42P01") return true;
    const texto = error instanceof Error ? error.message : String(error);
    return texto.includes("42P01") || texto.includes("does not exist");
}

async function conLaTabla<T>(hacer: () => Promise<T>): Promise<T> {
    await asegurarLaTabla();
    try {
        return await hacer();
    } catch (error) {
        if (!esTablaQueFalta(error)) throw error;
        console.warn("[facturacion] la tabla del robot no estaba; se crea y se reintenta");
        tablaLista = null;
        await asegurarLaTabla();
        return hacer();
    }
}

export type ResultadoDelRobot = {
    /** Las líneas sobre las que se actuó, con su proveedor. */
    lineas: Array<{ instanceName: string; instanceType: string }>;
    /** Cuántas quedaron con el Robot como se pedía. */
    cambiadas: number;
    /** La columna `bot_enabled` no existe todavía: no se tocó nada. */
    sinColumna: boolean;
};

/**
 * Apaga el agente de todas las líneas de WhatsApp de la cuenta, recordando cómo
 * estaba cada una.
 *
 * **Nunca lanza.** Suspender por impago es lo que importa y un fallo aquí no
 * puede tumbar el cron ni el guardado del estado de facturación. Pero **tampoco
 * es mudo**: un agente que se queda hablando en una cuenta que no paga no se ve
 * como un error, se ve como que la plataforma regala el servicio.
 */
export async function apagarElRobotPorImpago(userId: string): Promise<ResultadoDelRobot> {
    const vacio: ResultadoDelRobot = { lineas: [], cambiadas: 0, sinColumna: false };
    try {
        const lineas = await lasLineasDeWhatsApp(userId);
        if (lineas.length === 0) return vacio;

        let cambiadas = 0;
        let sinColumna = false;

        for (const linea of lineas) {
            const marca = await leerMarcaDelRobot(linea.instanceName);
            if (marca === "sin-columna") {
                // Sin la marca no hay forma de callar al agente sin tocar la
                // sesión, y tocarla es justo lo que esto viene a quitar. Se deja
                // la línea como está y se dice: es preferible un agente que
                // responde de más a un cliente que tiene que reescanear el QR.
                sinColumna = true;
                break;
            }

            // **`DO NOTHING`, no `DO UPDATE`.** Suspender dos veces seguidas
            // —el cron reintenta, y la suspensión manual puede caer encima—
            // guardaría la segunda vez el `false` que acabamos de escribir, y
            // entonces al pagar se le devolvería el agente APAGADO para
            // siempre. El primer recuerdo es el bueno.
            await conLaTabla(() =>
                db.$executeRaw(
                    Prisma.sql`
                        INSERT INTO "robot_antes_de_suspender"
                            ("instanceName", "cuentaId", "estabaEncendido")
                        VALUES (${linea.instanceName}, ${userId}, ${marca ?? true})
                        ON CONFLICT ("instanceName") DO NOTHING
                    `,
                ),
            );

            if (await escribirMarcaDelRobot(linea.instanceName, false)) cambiadas++;
        }

        console.info("[facturacion] agente apagado por impago", {
            userId,
            lineas: lineas.map((l) => `${l.instanceName} (${l.instanceType})`),
            cambiadas,
            sinColumna,
        });

        return { lineas, cambiadas, sinColumna };
    } catch (error) {
        console.warn("[facturacion] no se pudo apagar el agente por impago", {
            userId,
            error: error instanceof Error ? error.message : String(error),
        });
        return vacio;
    }
}

/**
 * Devuelve el agente a como estaba antes de suspender. Sin QR y sin crear nada.
 *
 * **Se restaura lo recordado, nunca se enciende a ciegas.** Hay líneas que se
 * atienden a mano y tienen el Robot apagado a propósito —son las que más se
 * apagan—; encenderlo al confirmar un pago le pondría la IA a contestar a un
 * cliente que decidió que no la quería, y eso se descubre por lo que el agente
 * le escribió a alguien.
 *
 * Sin nada recordado no se toca nada: significa que esa línea no se apagó por
 * impago.
 */
export async function devolverElRobotAlPagar(userId: string): Promise<ResultadoDelRobot> {
    const vacio: ResultadoDelRobot = { lineas: [], cambiadas: 0, sinColumna: false };
    try {
        const lineas = await lasLineasDeWhatsApp(userId);
        if (lineas.length === 0) return vacio;

        const recordado = await conLaTabla(() =>
            db.$queryRaw<{ instanceName: string; estabaEncendido: boolean }[]>(
                Prisma.sql`
                    SELECT "instanceName", "estabaEncendido"
                    FROM "robot_antes_de_suspender"
                    WHERE "cuentaId" = ${userId}
                `,
            ),
        );
        if (recordado.length === 0) return { lineas: [], cambiadas: 0, sinColumna: false };

        const comoEstaba = new Map(recordado.map((r) => [r.instanceName, r.estabaEncendido]));
        const devueltas: Array<{ instanceName: string; instanceType: string }> = [];
        let cambiadas = 0;

        for (const linea of lineas) {
            if (!comoEstaba.has(linea.instanceName)) continue;
            devueltas.push(linea);
            if (await escribirMarcaDelRobot(linea.instanceName, comoEstaba.get(linea.instanceName)!)) {
                cambiadas++;
            }
        }

        // El recuerdo se borra en cuanto se usa: dejarlo haría que la siguiente
        // suspensión encontrara una fila vieja y `DO NOTHING` la conservara, o
        // sea que se devolvería un estado de hace tres ciclos.
        await conLaTabla(() =>
            db.$executeRaw(
                Prisma.sql`DELETE FROM "robot_antes_de_suspender" WHERE "cuentaId" = ${userId}`,
            ),
        );

        console.info("[facturacion] agente devuelto al confirmarse el pago", {
            userId,
            devueltas: devueltas.map(
                (l) => `${l.instanceName} (${l.instanceType}) → ${comoEstaba.get(l.instanceName)}`,
            ),
            cambiadas,
        });

        return { lineas: devueltas, cambiadas, sinColumna: false };
    } catch (error) {
        console.warn("[facturacion] no se pudo devolver el agente al pagar", {
            userId,
            error: error instanceof Error ? error.message : String(error),
        });
        return vacio;
    }
}

/**
 * Olvida el recuerdo de una cuenta, sin tocar el Robot.
 *
 * Lo usa el borrado de la cuenta a los 30 días: ahí la fila de `User` se va y
 * las líneas se borran de verdad, así que el recuerdo sobraría — y al no haber
 * clave foránea nadie lo limpia solo.
 */
export async function olvidarElRobotDe(userId: string): Promise<void> {
    try {
        await conLaTabla(() =>
            db.$executeRaw(
                Prisma.sql`DELETE FROM "robot_antes_de_suspender" WHERE "cuentaId" = ${userId}`,
            ),
        );
    } catch (error) {
        console.warn("[facturacion] no se pudo olvidar el robot de la cuenta", {
            userId,
            error: error instanceof Error ? error.message : String(error),
        });
    }
}
