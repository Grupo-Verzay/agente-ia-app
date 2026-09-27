import "server-only";

import { db } from "@/lib/db";
import {
    calcularPuntaje,
    DIAS_QUE_SE_EVALUAN,
    esEjemploAMejorar,
    INSTRUCCION_DE_LA_RUBRICA,
    laLlaveDeLaEvaluacion,
    laTranscripcionParaEvaluar,
    leerLaEvaluacionDeLaIa,
    medirTiempos,
    REPOSO_ANTES_DE_EVALUAR_MS,
    sePuedeEvaluar,
    TOPE_POR_CUENTA_Y_VUELTA,
    type MensajeParaMedir,
} from "@/lib/calidad-de-conversaciones";
import { guardarLaEvaluacion, lasConversacionesPorEvaluar } from "@/lib/calidad-db";
import { elCuerpoDelMensaje } from "@/lib/conversacion-legible";
import { descontarLaTranscripcion, elSaldoDeLaCuenta } from "@/lib/creditos-de-transcripcion";
import { leerLaConversacion, losNombresDeLaConversacion, resolveInstanceOwner } from "@/lib/exportar-conversaciones.server";
import { TOKENS_POR_CREDITO } from "@/lib/saldo-de-la-cuenta";
import { obtenerResueltas } from "@/lib/session-resolved";

/**
 * El QA automático: evaluar las conversaciones de una cuenta con la rúbrica.
 *
 * ## Por qué vive aquí y no en una acción
 *
 * Lo llama el cron diario, y **desde un cron no hay sesión**: con la guarda de
 * siempre se apagaría en silencio. Y como gasta créditos de IA de la cuenta,
 * exportarlo desde un fichero `'use server'` lo convertiría en un endpoint con
 * el que cualquiera gastaría los créditos de otra. Es la regla de
 * `lib/weekly-report-runner.server.ts`: un runner de sistema no es una acción.
 * El botón «Evaluar ahora» del CRM pasa por su acción, que comprueba el
 * alcance y después llama aquí con la cuenta ya decidida.
 *
 * ## Lo que cuesta, y quién lo paga
 *
 * Una evaluación son unos pocos miles de tokens de un modelo barato
 * (`MODELO_DE_LA_CALIDAD`), menos de un crédito. Paga **la cuenta dueña de la
 * conversación** —la misma bolsa que su agente—, se cobra **después** de tener
 * la evaluación, y solo si la cuenta no paga su propia IA. Sin bolsa o sin
 * créditos no se evalúa nada, y se dice.
 *
 * Y va acotado: `TOPE_POR_CUENTA_Y_VUELTA` conversaciones por vuelta, solo las
 * que están EN REPOSO y solo las que tienen mensajes nuevos desde su última
 * evaluación. Una conversación no se paga dos veces por lo mismo.
 */

/** Modelos baratos a propósito: esto corre solo, todos los días, en todas las cuentas. */
export const MODELO_DE_LA_CALIDAD = { openai: "gpt-4o-mini", google: "gemini-2.0-flash" } as const;

export interface IaDeLaCuenta {
    proveedor: "openai" | "google";
    clave: string;
}

/**
 * La IA de la cuenta, elegida IGUAL que la elige el motor: su proveedor por
 * defecto activo, luego cualquiera activo, luego la primera. Es el mismo
 * criterio con el que `pagaElClienteSuIa` decide quién paga.
 */
export async function laIaDeLaCuenta(cuentaId: string): Promise<IaDeLaCuenta | null> {
    const cuenta = await db.user.findUnique({
        where: { id: cuentaId },
        select: {
            defaultProviderId: true,
            aiConfigs: { select: { providerId: true, apiKey: true, isActive: true, provider: { select: { name: true } } } },
        },
    });
    if (!cuenta) return null;
    const elegida =
        (cuenta.defaultProviderId
            ? cuenta.aiConfigs.find((c) => c.providerId === cuenta.defaultProviderId && c.isActive) ??
              cuenta.aiConfigs.find((c) => c.providerId === cuenta.defaultProviderId)
            : undefined) ??
        cuenta.aiConfigs.find((c) => c.isActive) ??
        cuenta.aiConfigs[0];
    const clave = elegida?.apiKey?.trim();
    const nombre = (elegida?.provider?.name ?? "").toLowerCase();
    if (!clave) return null;
    if (nombre !== "openai" && nombre !== "google") return null;
    return { proveedor: nombre, clave };
}

export type PedirALaIa = (args: {
    ia: IaDeLaCuenta;
    sistema: string;
    texto: string;
}) => Promise<{ texto: string; tokens: number }>;

/** El pedido de verdad. Se inyecta para que el banco lo finja sin tocar la red. */
export const pedirALaIaDeVerdad: PedirALaIa = async ({ ia, sistema, texto }) => {
    if (ia.proveedor === "google") {
        const { GoogleGenAI } = await import("@google/genai");
        const cliente = new GoogleGenAI({ apiKey: ia.clave });
        const r = await cliente.models.generateContent({
            model: MODELO_DE_LA_CALIDAD.google,
            contents: [{ role: "user", parts: [{ text: texto }] }],
            config: { temperature: 0, systemInstruction: sistema },
        });
        const salida = r.text ?? "";
        const tokens = r.usageMetadata?.totalTokenCount ?? Math.ceil((sistema.length + texto.length + salida.length) / 4);
        return { texto: salida, tokens };
    }
    const OpenAI = (await import("openai")).default;
    const cliente = new OpenAI({ apiKey: ia.clave });
    const r = await cliente.chat.completions.create({
        model: MODELO_DE_LA_CALIDAD.openai,
        temperature: 0,
        max_tokens: 300,
        messages: [
            { role: "system", content: sistema },
            { role: "user", content: texto },
        ],
    });
    const salida = r.choices?.[0]?.message?.content ?? "";
    const tokens = r.usage?.total_tokens ?? Math.ceil((sistema.length + texto.length + salida.length) / 4);
    return { texto: salida, tokens };
};

export type MotivoSinEvaluar = "sin_ia" | "sin_bolsa" | "sin_creditos" | "en_curso";

export interface ResultadoDeLaCuenta {
    cuentaId: string;
    evaluadas: number;
    sinRespuesta: number;
    fallos: number;
    tokens: number;
    motivo: MotivoSinEvaluar | null;
}

/**
 * Si una cuenta tiene con qué evaluarse: una IA configurada y créditos. Es la
 * misma comprobación con la que arranca el recorrido, sacada aparte para que
 * el botón «Evaluar ahora» pueda DECIR por qué no va a pasar nada.
 */
export async function porQueNoSePuedeEvaluar(cuentaId: string): Promise<MotivoSinEvaluar | null> {
    if (!(await laIaDeLaCuenta(cuentaId))) return "sin_ia";
    const saldo = await elSaldoDeLaCuenta(cuentaId);
    if (saldo.estado === "sin_bolsa") return "sin_bolsa";
    if (saldo.estado === "quedan" && saldo.creditos < 1) return "sin_creditos";
    return null;
}

/** Un solo recorrido por cuenta y proceso: el botón y el cron no se pisan. */
const enCurso = new Set<string>();

/** Tras estos fallos seguidos de la IA la cuenta se deja para la vuelta siguiente. */
const FALLOS_SEGUIDOS_PARA_PARAR = 3;

export async function evaluarLaCalidadDeLaCuenta(
    cuentaId: string,
    opciones: { tope?: number; ahora?: Date; pedir?: PedirALaIa } = {},
): Promise<ResultadoDeLaCuenta> {
    const resultado: ResultadoDeLaCuenta = { cuentaId, evaluadas: 0, sinRespuesta: 0, fallos: 0, tokens: 0, motivo: null };
    if (enCurso.has(cuentaId)) return { ...resultado, motivo: "en_curso" };
    enCurso.add(cuentaId);
    try {
        const ia = await laIaDeLaCuenta(cuentaId);
        if (!ia) return { ...resultado, motivo: "sin_ia" };
        const saldo = await elSaldoDeLaCuenta(cuentaId);
        if (saldo.estado === "sin_bolsa") return { ...resultado, motivo: "sin_bolsa" };
        if (saldo.estado === "quedan" && saldo.creditos < 1) return { ...resultado, motivo: "sin_creditos" };
        const presupuestoTokens = saldo.estado === "quedan" ? saldo.creditos * TOKENS_POR_CREDITO : Infinity;

        const ahora = opciones.ahora ?? new Date();
        const candidatas = await lasConversacionesPorEvaluar({
            cuentaId,
            desde: new Date(ahora.getTime() - DIAS_QUE_SE_EVALUAN * 24 * 60 * 60 * 1000),
            hasta: new Date(ahora.getTime() - REPOSO_ANTES_DE_EVALUAR_MS),
            tope: Math.max(1, Math.min(opciones.tope ?? TOPE_POR_CUENTA_Y_VUELTA, 100)),
        });
        const pedir = opciones.pedir ?? pedirALaIaDeVerdad;
        let fallosSeguidos = 0;

        // En serie: son llamadas a la IA con la clave de la cuenta y lecturas de
        // `chat_messages`; en paralelo robarían turnos a la bandeja.
        for (const c of candidatas) {
            if (resultado.tokens >= presupuestoTokens) {
                resultado.motivo = "sin_creditos";
                break;
            }
            const aliases = [c.remoteJidAlt, c.senderPn].filter((x): x is string => Boolean(x));
            const linea = await resolveInstanceOwner(c.instanceName);
            const [lectura, nombres] = await Promise.all([
                leerLaConversacion({ userIds: [cuentaId], instanceName: c.instanceName, remoteJid: c.remoteJid, aliases, tope: 200 }),
                losNombresDeLaConversacion({
                    duenoId: cuentaId,
                    instanceName: c.instanceName,
                    instanceId: linea?.instanceId ?? null,
                    remoteJid: c.remoteJid,
                    aliases,
                }),
            ]);
            const resueltas = nombres.sessionId ? await obtenerResueltas([nombres.sessionId]) : new Map<number, number>();
            const resueltaMs = nombres.sessionId ? resueltas.get(nombres.sessionId) ?? null : null;
            const mensajes: MensajeParaMedir[] = lectura.mensajes
                .filter((m) => !m.notaInterna && !m.eliminado)
                .map((m) => ({ ts: m.ts, deLaCuenta: m.quien !== "contacto", porIa: m.quien === "ia", texto: elCuerpoDelMensaje(m) }));
            const base = {
                id: laLlaveDeLaEvaluacion(cuentaId, c.instanceName, c.remoteJid),
                cuentaId,
                instanceName: c.instanceName,
                remoteJid: c.remoteJid,
                sessionId: nombres.sessionId,
                contacto: nombres.contacto || c.pushName || null,
                asesorId: nombres.asesorId,
                mensajes: mensajes.length,
                ultimoMensajeEn: c.ultimoMensajeEn,
            };
            const opcionesDeTiempo = { tieneAsesor: Boolean(nombres.asesorId), resueltaEnTs: resueltaMs ? resueltaMs / 1000 : null };
            const previa = medirTiempos(mensajes, opcionesDeTiempo);

            if (!sePuedeEvaluar(previa)) {
                // Se APUNTA igual, sin puntaje: si no, esta conversación volvería a
                // salir como candidata en cada vuelta hasta que alguien contestara.
                await guardarLaEvaluacion({
                    ...base, responsable: previa.responsable, puntaje: null, saludo: null, tono: null, resolvio: null,
                    primeraRespuestaSeg: null, resolucionSeg: null, mejora: "", ejemplo: false,
                    motivo: previa.mensajesDeLaCuenta === 0 ? "sin_respuesta" : "sin_mensajes_del_cliente", tokens: 0,
                });
                resultado.sinRespuesta++;
                continue;
            }

            let respuesta: { texto: string; tokens: number };
            try {
                respuesta = await pedir({ ia, sistema: INSTRUCCION_DE_LA_RUBRICA, texto: laTranscripcionParaEvaluar(mensajes) });
            } catch (error) {
                // No se apunta nada: sin fila, la conversación vuelve a salir en la
                // vuelta siguiente. Pero no es mudo.
                resultado.fallos++;
                fallosSeguidos++;
                console.warn("[calidad] la IA no contestó", {
                    cuentaId,
                    instanceName: c.instanceName,
                    error: error instanceof Error ? error.message : String(error),
                });
                if (fallosSeguidos >= FALLOS_SEGUIDOS_PARA_PARAR) break;
                continue;
            }
            fallosSeguidos = 0;

            const evaluacion = leerLaEvaluacionDeLaIa(respuesta.texto);
            const tiempos = medirTiempos(mensajes, { ...opcionesDeTiempo, resolvioSegunLaIa: evaluacion.resolvio });
            const puntaje = calcularPuntaje(evaluacion, tiempos);
            await guardarLaEvaluacion({
                ...base,
                responsable: tiempos.responsable,
                puntaje,
                saludo: evaluacion.saludo,
                tono: evaluacion.tono,
                resolvio: evaluacion.resolvio,
                primeraRespuestaSeg: tiempos.primeraRespuestaSeg,
                resolucionSeg: tiempos.resolucionSeg,
                mejora: evaluacion.mejora,
                ejemplo: esEjemploAMejorar(puntaje),
                motivo: puntaje === null ? "ia_ilegible" : null,
                tokens: respuesta.tokens,
            });
            // Se cobra DESPUÉS de tener la evaluación guardada, y solo si la
            // cuenta no paga su propia IA.
            if (saldo.estado === "quedan" && respuesta.tokens > 0) {
                await descontarLaTranscripcion(cuentaId, respuesta.tokens);
            }
            resultado.tokens += respuesta.tokens;
            resultado.evaluadas++;
        }
        return resultado;
    } finally {
        enCurso.delete(cuentaId);
    }
}

/** Cuánto puede durar el barrido diario antes de dejar el resto para mañana. */
export const TIEMPO_MAXIMO_DEL_BARRIDO_MS = 30 * 60 * 1000;

/** Cuántas cuentas mira el barrido diario por vuelta. */
export const TOPE_DE_CUENTAS_POR_VUELTA = 300;

/**
 * El barrido diario: las cuentas con conversaciones en la ventana, en serie.
 * Lo llama el cron de facturación dentro de su propio `try`: un fallo aquí no
 * puede tumbar el cobro de la plataforma.
 */
export async function evaluarLaCalidadDeTodas(opciones: { ahora?: Date; pedir?: PedirALaIa; tiempoMaximoMs?: number } = {}) {
    const ahora = opciones.ahora ?? new Date();
    const limite = Date.now() + (opciones.tiempoMaximoMs ?? TIEMPO_MAXIMO_DEL_BARRIDO_MS);
    const desde = new Date(ahora.getTime() - DIAS_QUE_SE_EVALUAN * 24 * 60 * 60 * 1000);
    const cuentas = await db.$queryRaw<{ userId: string }[]>`
        SELECT DISTINCT "userId" FROM "chat_conversations"
        WHERE "lastMessageTimestamp" >= ${desde}
        LIMIT ${TOPE_DE_CUENTAS_POR_VUELTA}
    `;
    const resumen = { cuentas: cuentas.length, evaluadas: 0, sinRespuesta: 0, fallos: 0, sinIa: 0, sinCreditos: 0, cortadoPorTiempo: false };
    for (const { userId } of cuentas) {
        if (Date.now() > limite) {
            // Lo que queda sigue sin fila: la vuelta de mañana lo recoge.
            resumen.cortadoPorTiempo = true;
            break;
        }
        try {
            const r = await evaluarLaCalidadDeLaCuenta(userId, { ahora, pedir: opciones.pedir });
            resumen.evaluadas += r.evaluadas;
            resumen.sinRespuesta += r.sinRespuesta;
            resumen.fallos += r.fallos;
            if (r.motivo === "sin_ia") resumen.sinIa++;
            if (r.motivo === "sin_bolsa" || r.motivo === "sin_creditos") resumen.sinCreditos++;
        } catch (error) {
            resumen.fallos++;
            console.error("[calidad] no se pudo evaluar una cuenta", userId, error);
        }
    }
    return resumen;
}

let barridoEnMarcha = false;

/**
 * Arrancar el barrido de fondo, una sola vez por proceso. Devuelve si arrancó.
 * Su resultado va al registro y no a quien lo lanzó: nadie lo espera.
 */
export function lanzarElBarridoDeCalidad(): { arrancado: boolean } {
    if (barridoEnMarcha) return { arrancado: false };
    barridoEnMarcha = true;
    void evaluarLaCalidadDeTodas()
        .then((r) => console.info("[calidad] barrido diario terminado", r))
        .catch((error) => console.error("[calidad] el barrido diario falló", error))
        .finally(() => {
            barridoEnMarcha = false;
        });
    return { arrancado: true };
}
