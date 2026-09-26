import "server-only";

import { Readable } from "stream";

import { db } from "@/lib/db";
import { pagaElClienteSuIa } from "@/lib/llaves-de-verzay";
import { nombreDeLaCuenta } from "@/lib/nombre-de-la-cuenta";
import {
    elSaldoDeLaFila,
    type SaldoDeLaCuenta,
} from "@/lib/saldo-de-la-cuenta";

/**
 * Lo que comparten los DOS caminos que transcriben audio con Whisper.
 *
 * Son dos —las notas de voz que entran en Chats y las que se graban en el chat
 * del equipo— y hacen exactamente lo mismo con los créditos: leer cuántos
 * quedan, elegir la clave de OpenAI de la cuenta y descontar lo que costó. Con
 * una copia en cada sitio, el día que cambie la tarifa o la forma de leer los
 * créditos se afina en uno y el otro se queda cobrando otra cosa — y eso no se
 * ve, se nota meses después en la factura.
 *
 * La **tarifa** sigue viviendo sola en `lib/transcripcion-de-voz.ts`, que es
 * puro: aquí está lo que toca la base.
 */

/**
 * **El saldo de una cuenta**, con la MISMA regla que el motor.
 *
 * Aquí solo se leen los datos: quién decide es `elSaldoDeLaFila`
 * (`lib/saldo-de-la-cuenta.ts`, puro), que es el sitio donde está escrito el
 * porqué de cada uno de los tres estados.
 *
 * Esto devolvía un `number | null` y ahí estaban los dos fallos que costaron
 * el reporte de «la llamada sale y la transcripción dice que quedan 0»:
 *
 * - **un `total` negativo —el «sin tope» que se pone a mano— salía como 0**,
 *   mientras el motor lo daba por ilimitado y dejaba salir la llamada;
 * - **«no tiene fila» salía como 0**, indistinguible de «se le acabaron», así
 *   que el aviso mandaba a recargar una bolsa que nunca se asignó.
 */
export async function elSaldoDeLaCuenta(userId: string): Promise<SaldoDeLaCuenta> {
    const [pagaSuIa, fila] = await Promise.all([
        pagaElClienteSuIa(userId),
        db.iaCredit.findUnique({ where: { userId }, select: { total: true, used: true } }),
    ]);
    return elSaldoDeLaFila({ fila, pagaSuIa });
}

/**
 * El nombre con el que se le enseña a una persona la cuenta que paga.
 *
 * **Solo se pide cuando algo va a abandonar**, nunca en el camino bueno: es
 * una consulta de una fila para escribir un aviso, y el aviso solo existe
 * cuando el aviso hace falta.
 *
 * Sale de `nombreDeLaCuenta`, que es la regla de siempre —la empresa si de
 * verdad se rellenó, luego el nombre, luego el correo— y no `company` a secas,
 * que nace «Empresa Demo» y haría que todas las cuentas se llamaran igual en
 * el aviso.
 */
export async function elNombreDeLaCuentaQuePaga(userId: string): Promise<string | null> {
    try {
        const fila = await db.user.findUnique({
            where: { id: userId },
            select: { company: true, name: true, email: true },
        });
        if (!fila) return null;
        return nombreDeLaCuenta(fila) || null;
    } catch (error) {
        // Un aviso sin el nombre sigue siendo un aviso; caerse por no poder
        // leerlo sería tumbar lo que se venía a explicar.
        console.warn("[transcripcion] no se pudo leer el nombre de la cuenta que paga", {
            userId,
            error: error instanceof Error ? error.message : String(error),
        });
        return null;
    }
}

/**
 * Descontar lo que costó una transcripción.
 *
 * **Se escribe en TOKENS**, que es la unidad de `used`, y con `increment` para
 * que dos a la vez no se pisen. Es lo mismo que hace el motor en `trackTokens`.
 *
 * Va **después** de tener el texto: cobrar antes y que la llamada falle sería
 * cobrar por algo que no se entregó.
 */
export async function descontarLaTranscripcion(
    userId: string,
    tokens: number,
): Promise<void> {
    await db.iaCredit.updateMany({
        where: { userId },
        data: { used: { increment: tokens } },
    });
}

/**
 * La clave de OpenAI de la cuenta.
 *
 * Se elige **igual que la elige el motor** —su proveedor por defecto activo,
 * luego cualquiera activo, luego la primera—, que es el mismo criterio con el
 * que `pagaElClienteSuIa` decide quién paga. Decidir sobre una clave y
 * transcribir con otra sería cobrarle a quien no gasta.
 */
export async function laClaveDeOpenAi(userId: string): Promise<string | null> {
    const cuenta = await db.user.findUnique({
        where: { id: userId },
        select: {
            defaultProviderId: true,
            aiConfigs: { select: { providerId: true, apiKey: true, isActive: true } },
        },
    });
    if (!cuenta) return null;

    const elegida =
        (cuenta.defaultProviderId
            ? cuenta.aiConfigs.find(
                  (c) => c.providerId === cuenta.defaultProviderId && c.isActive,
              ) ?? cuenta.aiConfigs.find((c) => c.providerId === cuenta.defaultProviderId)
            : undefined) ??
        cuenta.aiConfigs.find((c) => c.isActive) ??
        cuenta.aiConfigs[0];

    return elegida?.apiKey?.trim() || null;
}

/**
 * Pedirle el texto a OpenAI. Devuelve cadena vacía cuando no se pudo.
 *
 * **Nunca lanza**: quien llama decide qué hacer con el vacío —marcar la fila,
 * avisar— y un `throw` desde aquí tumbaría una conversación que se está
 * sirviendo.
 *
 * Dos cosas que hay que mantener:
 *
 * 1. **El nombre del archivo es lo que le dice el formato a OpenAI.** Una nota
 *    de WhatsApp es opus dentro de ogg; una del navegador es webm. Mandarlo con
 *    la extensión equivocada es un fallo que no dice por qué.
 * 2. **Cada intento recrea el stream.** Subirlo lo consume, así que reusarlo
 *    haría que el segundo modelo mandara un archivo vacío y el respaldo no
 *    sirviera de nada.
 */
export async function pedirleElTextoAOpenAi(input: {
    audio: Buffer;
    clave: string;
    /** Cómo se llama el archivo que se sube. Su extensión ES el formato. */
    nombre: string;
}): Promise<string> {
    const OpenAI = (await import("openai")).default;
    const openai = new OpenAI({ apiKey: input.clave });

    for (const modelo of ["gpt-4o-transcribe", "whisper-1"]) {
        try {
            const stream = Readable.from(input.audio);
            (stream as unknown as { path: string }).path = input.nombre;
            const tr = await openai.audio.transcriptions.create({
                file: stream as never,
                model: modelo,
            });
            const texto = (tr.text ?? "").trim();
            if (texto) return texto;
        } catch (error) {
            console.warn("[transcripcion] un modelo no pudo transcribir", {
                modelo,
                error: error instanceof Error ? error.message : String(error),
            });
        }
    }
    return "";
}
