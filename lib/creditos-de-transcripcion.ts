import "server-only";

import { Readable } from "stream";

import { db } from "@/lib/db";
import {
    esLlaveDeVerzay,
    hayRegistroDeLlaves,
    pagaElClienteSuIa,
} from "@/lib/llaves-de-verzay";
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
 * **Solo de su configuración de OpenAI.** Antes se elegía «la del proveedor
 * por defecto, luego cualquiera activa», que es como el motor elige la clave
 * del AGENTE, y eso no vale aquí: la transcripción va SIEMPRE a OpenAI. Una
 * cuenta con Google por defecto le mandaba a Whisper la clave de Gemini, y
 * OpenAI contestaba 401; la pantalla decía «el servicio de transcripción no
 * respondió» y quien lo leía volvía a pulsar sin entender nada.
 *
 * Dentro de las de OpenAI: la activa primero, y si no hay activa, la que haya.
 */
export async function laClaveDeOpenAi(userId: string): Promise<string | null> {
    const cuenta = await db.user.findUnique({
        where: { id: userId },
        select: {
            aiConfigs: {
                select: {
                    apiKey: true,
                    isActive: true,
                    provider: { select: { name: true } },
                },
            },
        },
    });
    if (!cuenta) return null;
    return laClaveDeOpenAiEntre(cuenta.aiConfigs);
}

/** Puro: la regla de arriba sobre las filas ya leídas. */
export function laClaveDeOpenAiEntre(
    configs: Array<{ apiKey: string | null; isActive: boolean; provider: { name: string } | null }>,
): string | null {
    const deOpenAi = configs.filter(
        (c) => (c.provider?.name ?? "").trim().toLowerCase() === "openai" && c.apiKey?.trim(),
    );
    const elegida = deOpenAi.find((c) => c.isActive) ?? deOpenAi[0];
    return elegida?.apiKey?.trim() || null;
}

/**
 * La clave con la que se transcribe y el saldo que se mira, juntos.
 *
 * **El saldo se juzga sobre la clave que DE VERDAD se usa.** `pagaElClienteSuIa`
 * mira la clave del agente (la del proveedor por defecto), que puede no ser la
 * de OpenAI: una cuenta con su clave de OpenAI y Google por defecto con la de
 * la casa se cobraba como si transcribiera con la de la casa. Si la clave de
 * OpenAI es del cliente (no está en el registro de Verzay), no se cobra.
 *
 * `propia` dice si la clave es del cliente: solo entonces un «clave inválida» o
 * «sin saldo en OpenAI» es asunto suyo y se le dice. Si es de la casa, el
 * cliente no puede hacer nada y se queda en «no respondió».
 */
export async function laClaveYElSaldo(userId: string): Promise<{
    clave: string | null;
    saldo: SaldoDeLaCuenta;
    propia: boolean;
}> {
    const [clave, fila, hayRegistro] = await Promise.all([
        laClaveDeOpenAi(userId),
        db.iaCredit.findUnique({ where: { userId }, select: { total: true, used: true } }),
        hayRegistroDeLlaves().catch(() => false),
    ]);
    if (!clave) {
        const pagaSuIa = await pagaElClienteSuIa(userId);
        return { clave: null, saldo: elSaldoDeLaFila({ fila, pagaSuIa }), propia: false };
    }
    const deLaCasa = await esLlaveDeVerzay(clave).catch(() => true);
    const propia = hayRegistro && !deLaCasa;
    return { clave, saldo: elSaldoDeLaFila({ fila, pagaSuIa: propia }), propia };
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
    const r = await transcribirConOpenAi({ ...input, propia: false });
    return "texto" in r ? r.texto : "";
}

/**
 * Por qué una clave PROPIA no transcribe. Con la de la plataforma esto nunca se
 * le enseña al cliente (no es suya, no la puede arreglar): sale `no_transcribio`.
 */
export type FalloDeLaClave = "clave_invalida" | "clave_sin_saldo";

/**
 * **Lo que OpenAI dijo, clasificado.** Antes cualquier rechazo —una clave mal
 * pegada, una cuenta de OpenAI sin saldo— se tragaba en el `catch` y salía
 * «el servicio no respondió, inténtalo otra vez», que manda a reintentar algo
 * que no se arregla reintentando. Pura para poder probarla sin red.
 */
export function elFalloDeOpenAi(error: unknown): FalloDeLaClave | null {
    const e = error as { status?: number; code?: string; error?: { code?: string; type?: string } } | null;
    const status = e?.status;
    const code = e?.code ?? e?.error?.code ?? e?.error?.type;
    if (status === 401 || status === 403 || code === "invalid_api_key") return "clave_invalida";
    if (code === "insufficient_quota" || code === "billing_hard_limit_reached") return "clave_sin_saldo";
    return null;
}

/**
 * Una clave que ni tiene forma de clave: enmascarada (`••••`, `…`), una
 * dirección, con espacios dentro. Se descarta sin llamar a nadie.
 */
export function noTieneFormaDeClave(clave: string): boolean {
    const c = clave.trim();
    return !/^[A-Za-z0-9_\-.]{20,}$/.test(c) || !/[A-Za-z]/.test(c);
}

export async function transcribirConOpenAi(input: {
    audio: Buffer;
    clave: string;
    nombre: string;
    /** La clave es del cliente: los fallos de la clave se le dicen. */
    propia: boolean;
}): Promise<{ texto: string } | { motivo: FalloDeLaClave | "no_transcribio" }> {
    const conMotivo = (m: FalloDeLaClave) => ({ motivo: input.propia ? m : ("no_transcribio" as const) });
    if (noTieneFormaDeClave(input.clave)) {
        console.warn("[transcripcion] la clave de OpenAI no tiene forma de clave", { propia: input.propia });
        return conMotivo("clave_invalida");
    }
    const OpenAI = (await import("openai")).default;
    const openai = new OpenAI({ apiKey: input.clave.trim() });

    for (const modelo of ["gpt-4o-transcribe", "whisper-1"]) {
        try {
            const stream = Readable.from(input.audio);
            (stream as unknown as { path: string }).path = input.nombre;
            const tr = await openai.audio.transcriptions.create({
                file: stream as never,
                model: modelo,
            });
            const texto = (tr.text ?? "").trim();
            if (texto) return { texto };
        } catch (error) {
            const fallo = elFalloDeOpenAi(error);
            console.warn("[transcripcion] un modelo no pudo transcribir", {
                modelo,
                fallo,
                propia: input.propia,
                error: error instanceof Error ? error.message : String(error),
            });
            // Un rechazo de la CLAVE no cambia con otro modelo: se para.
            if (fallo) return conMotivo(fallo);
        }
    }
    return { motivo: "no_transcribio" };
}
