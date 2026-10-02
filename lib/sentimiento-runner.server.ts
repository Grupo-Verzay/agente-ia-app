import "server-only";

import { laIaDeLaCuenta, type ResultadoDelClienteDeIa } from "@/lib/cliente-de-ia.server";
import { createAiClient } from "@/app/(root)/ai-chat/helpers/createAiClient";
import {
    INSTRUCCION_DEL_SENTIMIENTO,
    MENSAJES_DE_CONTEXTO,
    elTextoParaAnalizar,
    leerElSentimiento,
    type Sentimiento,
} from "@/lib/sentimiento";
import {
    guardarElAnalisis,
    losMensajesDeContexto,
    losPendientes,
    reclamarElAnalisis,
    soltarElReclamo,
    type Pendiente,
} from "@/lib/sentimiento-db";
import { antesDeUsarLaIa, cobrarElUsoDeIa } from "@/lib/cobro-de-ia.server";
import { losTokensDelUso } from "@/lib/cobro-de-ia";

/**
 * Quien analiza el sentimiento de los mensajes entrantes de Chats.
 *
 * # Cuándo: SOLO al abrir Chats
 *
 * Nada corre de fondo con un reloj ni en un barrido diario. El análisis se
 * dispara cuando alguien ABRE la pantalla de Chats (la página del servidor lo
 * lanza con `void`, sin hacerla esperar) y en ese momento cubre TODAS las
 * conversaciones pendientes de las cuentas de esa bandeja: las que tienen un
 * mensaje del cliente posterior a su último análisis. Lo ya analizado sin
 * mensajes nuevos no se vuelve a pagar y conserva su color. **Si nadie abre
 * Chats, no se analiza nada y no se consume nada.**
 *
 * Antes lo lanzaba cada vuelta de la lista (cada 20 s por pestaña abierta) y un
 * barrido diario del cron recogía lo demás, sin descontar ni un crédito: eso era
 * consumo de IA que pagaba la plataforma.
 *
 * # Con la IA de la cuenta, y lo PAGA la cuenta dueña de la conversación
 *
 * La misma IA que procesa sus conversaciones (`laIaDeLaCuenta`), y cada
 * análisis descuenta sus tokens de la cuenta DUEÑA de la línea (`p.userId`),
 * nunca de quien abrió Chats ni de otra cuenta de la familia. Es la regla de
 * `lib/cobro-de-ia.ts`, la misma de la sugerencia de respuesta. Una cuenta sin
 * créditos no se analiza (sus conversaciones siguen pendientes para cuando
 * recargue), y se dice.
 *
 * # Lo que no puede pasar
 *
 * - **Hacer esperar a la pantalla.** Se lanza con `void` y con su `catch`.
 * - **Analizar dos veces lo mismo.** Con dos réplicas y varias pestañas el mismo
 *   mensaje puede pedirse a la vez; lo decide la base (`reclamarElAnalisis`).
 * - **Ser mudo.** Un fallo de la IA se dice y el reclamo se suelta para que la
 *   apertura siguiente lo reintente.
 */

/** Cuántas conversaciones se piden por página; se siguen pidiendo hasta vaciar lo pendiente. */
export const POR_PAGINA = 100;
/** Red de seguridad: páginas como mucho por apertura (100 × 200 = 20.000 conversaciones). */
export const PAGINAS_MAXIMAS = 200;
/** Obreros que tiran de la cola a la vez (una cola, no lotes: ver CLAUDE.md). */
export const OBREROS = 3;
/** Lo que se espera a la IA antes de soltar el reclamo y seguir. */
export const PLAZO_DE_LA_IA_MS = 20_000;
/** Cuánto se recuerda la IA de una cuenta (o que no tiene). */
const RECUERDO_DE_LA_IA_MS = 5 * 60_000;

export type ResultadoDelBarrido = {
    pendientes: number;
    analizados: number;
    cayeron: number;
    sinIa: number;
    /** Conversaciones que no se analizaron porque su cuenta dueña no tiene créditos. */
    sinCreditos: number;
    fallidos: number;
    /** Tokens descontados, sumando todas las cuentas dueñas. */
    tokens: number;
    /** Las cuentas que se quedaron sin analizar por créditos. */
    cuentasSinCreditos: string[];
};

/**
 * Lo que devuelve la IA: el sentimiento y los tokens que costó. Admite también
 * el sentimiento suelto (los analizadores fingidos del banco); entonces los
 * tokens se estiman por el largo del texto, como manda `losTokensDelUso`.
 */
type Analizador = (args: {
    cuenta: string;
    texto: string;
}) => Promise<{ sentimiento: Sentimiento | null; tokens?: number } | Sentimiento | null>;

const iaRecordada = new Map<string, { hasta: number; resultado: Promise<ResultadoDelClienteDeIa> }>();

function laIaRecordada(cuenta: string): Promise<ResultadoDelClienteDeIa> {
    const ahora = Date.now();
    const r = iaRecordada.get(cuenta);
    if (r && r.hasta > ahora) return r.resultado;
    const resultado = laIaDeLaCuenta(cuenta).catch(
        (e): ResultadoDelClienteDeIa => ({ success: false, message: (e as Error)?.message || "error" }),
    );
    iaRecordada.set(cuenta, { hasta: ahora + RECUERDO_DE_LA_IA_MS, resultado });
    return resultado;
}

/** El analizador de verdad: la IA de la cuenta con la instrucción de siempre. */
export const analizarConLaIa: Analizador = async ({ cuenta, texto }) => {
    const ia = await laIaRecordada(cuenta);
    if (!ia.success || !ia.data) throw new SinIa(ia.message);
    const { provider, model, apiKey } = ia.data;
    const r = await createAiClient(provider).complete({
        apiKey,
        model,
        system: INSTRUCCION_DEL_SENTIMIENTO,
        messages: [{ role: "user", content: texto }],
    });
    return {
        sentimiento: leerElSentimiento(r.content),
        tokens: losTokensDelUso({
            tokens: r.tokens,
            entrada: INSTRUCCION_DEL_SENTIMIENTO + texto,
            salida: r.content,
        }),
    };
};

export class SinIa extends Error {}

function conPlazo<T>(p: Promise<T>, ms: number): Promise<T> {
    let t: ReturnType<typeof setTimeout>;
    return Promise.race([
        p,
        new Promise<T>((_, rechazar) => {
            t = setTimeout(() => rechazar(new Error(`la IA no contestó en ${ms} ms`)), ms);
        }),
    ]).finally(() => clearTimeout(t));
}

/** Analiza UNA conversación pendiente y la cobra a su cuenta dueña. Nunca lanza. */
export async function analizarUnaConversacion(
    p: Pendiente,
    analizar: Analizador = analizarConLaIa,
): Promise<{
    resultado: "analizado" | "cayo" | "ocupado" | "sin_ia" | "sin_creditos" | "fallido";
    tokens: number;
}> {
    let reclamado = false;
    try {
        // Antes de reclamar nada: si la cuenta dueña no puede pagar, la
        // conversación se queda pendiente para cuando recargue.
        // Paga la dueña de la LÍNEA (`p.pagador`), que es la dueña de la
        // conversación; casi siempre coincide con `p.userId`.
        const pagador = p.pagador || p.userId;
        const permiso = await antesDeUsarLaIa(pagador);
        if (!permiso.ok) return { resultado: "sin_creditos", tokens: 0 };

        const antes = await reclamarElAnalisis(p);
        if (!antes) return { resultado: "ocupado", tokens: 0 };
        reclamado = true;
        // Lo que se conserva cuando no hay nada nuevo que decir. Un «molesto»
        // de la calibración vieja (`recalibrando`) NO se conserva: era justo
        // lo que estaba mal, y quedaría sellado con la versión nueva.
        const loDeAntes: Sentimiento = antes.recalibrando ? "neutro" : antes.sentimiento ?? "neutro";
        const mensajes = await losMensajesDeContexto(p, MENSAJES_DE_CONTEXTO);
        const texto = elTextoParaAnalizar(mensajes);

        let ahora: Sentimiento | null;
        let tokens = 0;
        if (!texto) {
            // Sin texto del cliente (un audio sin transcribir, una imagen) no
            // hay nada que juzgar: se da por leído, se conserva lo que había y
            // no se le pregunta nada a la IA, así que no se cobra nada.
            ahora = loDeAntes;
        } else {
            let respuesta: Awaited<ReturnType<Analizador>>;
            try {
                respuesta = await conPlazo(analizar({ cuenta: pagador, texto }), PLAZO_DE_LA_IA_MS);
            } catch (error) {
                if (error instanceof SinIa) {
                    // Una cuenta sin IA configurada: no se reintenta en bucle.
                    // Se da por leído conservando lo que había. Sin IA no hubo uso.
                    await guardarElAnalisis(p, antes, loDeAntes);
                    return { resultado: "sin_ia", tokens: 0 };
                }
                throw error;
            }
            const leido =
                respuesta === null || typeof respuesta === "string"
                    ? { sentimiento: respuesta, tokens: undefined }
                    : respuesta;
            ahora = leido.sentimiento;
            // La IA contestó (entendible o no): ese uso se cobra a la cuenta dueña.
            tokens = await cobrarElUsoDeIa(
                pagador,
                permiso.saldo,
                {
                    tokens: leido.tokens,
                    entrada: INSTRUCCION_DEL_SENTIMIENTO + texto,
                    salida: ahora ?? "",
                },
                "sentimiento",
            );
        }
        if (!ahora) {
            // La IA contestó algo que no se entiende: NO se inventa un neutro
            // —borraría un negativo que sí estaba—; se conserva lo de antes.
            console.warn("[sentimiento] la IA contestó algo que no es un sentimiento", {
                linea: p.instanceName,
            });
            ahora = loDeAntes;
        }
        const { cayo } = await guardarElAnalisis(p, antes, ahora);
        return { resultado: cayo ? "cayo" : "analizado", tokens };
    } catch (error) {
        console.warn("[sentimiento] no se pudo analizar un mensaje; se reintentará", {
            linea: p.instanceName,
            motivo: (error as Error)?.message,
        });
        if (reclamado) await soltarElReclamo(p).catch((e) => {
            console.warn("[sentimiento] no se pudo soltar el reclamo", (e as Error)?.message);
        });
        return { resultado: "fallido", tokens: 0 };
    }
}

function llaveDelPendiente(p: Pendiente): string {
    return `${p.userId}|${p.instanceName}|${p.remoteJid}`;
}

function resultadoVacio(): ResultadoDelBarrido {
    return { pendientes: 0, analizados: 0, cayeron: 0, sinIa: 0, sinCreditos: 0, fallidos: 0, tokens: 0, cuentasSinCreditos: [] };
}

/** Una cola común con N obreros: el que se queda pillado no retiene a los demás. */
async function vaciarLaCola(
    pendientes: Pendiente[],
    analizar: Analizador,
    r: ResultadoDelBarrido,
    sinCreditos: Set<string>,
    yaFallaron: Set<string>,
): Promise<number> {
    r.pendientes += pendientes.length;
    let hechos = 0;
    let siguiente = 0;
    const obrero = async () => {
        while (siguiente < pendientes.length) {
            const p = pendientes[siguiente++];
            const pagador = p.pagador || p.userId;
            if (sinCreditos.has(pagador)) { r.sinCreditos++; continue; }
            const { resultado, tokens } = await analizarUnaConversacion(p, analizar);
            r.tokens += tokens;
            if (resultado === "analizado") { r.analizados++; hechos++; }
            else if (resultado === "cayo") { r.analizados++; r.cayeron++; hechos++; }
            else if (resultado === "sin_ia") { r.sinIa++; hechos++; }
            else if (resultado === "sin_creditos") { r.sinCreditos++; sinCreditos.add(pagador); }
            else if (resultado === "fallido") { r.fallidos++; yaFallaron.add(llaveDelPendiente(p)); }
        }
    };
    await Promise.all(Array.from({ length: Math.min(OBREROS, pendientes.length) }, obrero));
    return hechos;
}

const enCurso = new Map<string, Promise<ResultadoDelBarrido>>();

/**
 * El análisis que lanza la pantalla de Chats al abrirse: TODO lo pendiente de
 * esas cuentas y líneas, página a página hasta que no quede nada.
 *
 * - Uno a la vez por cuentas+líneas y por proceso: abrir Chats en dos pestañas
 *   no repite el trabajo, la segunda se suma al que ya corre.
 * - Una cuenta que se queda sin créditos sale de las páginas siguientes: sus
 *   conversaciones siguen pendientes y se analizan cuando recargue y alguien
 *   vuelva a abrir Chats. Sin eso, la misma página volvería a salir en bucle.
 * - Y se para si una página entera no avanza (todo falló u otro lo tenía
 *   reclamado): la próxima apertura lo reintenta.
 */
export function analizarElSentimientoAlAbrirChats(
    cuentas: readonly string[],
    lineas: readonly string[],
    analizar: Analizador = analizarConLaIa,
): Promise<ResultadoDelBarrido> | null {
    if (!cuentas.length || !lineas.length) return null;
    const llave = `${[...cuentas].sort().join(",")}|${[...lineas].sort().join(",")}`;
    const ya = enCurso.get(llave);
    if (ya) return ya;
    const vuelta = (async () => {
        const r = resultadoVacio();
        const sinCreditos = new Set<string>();
        // Lo que ya falló en esta apertura no se vuelve a pedir en la página
        // siguiente: se reintenta en la próxima apertura, no en bucle.
        const yaFallaron = new Set<string>();
        for (let pagina = 0; pagina < PAGINAS_MAXIMAS; pagina++) {
            // Las cuentas sin créditos salen de la consulta por PAGADOR (la
            // dueña de la línea), no por la fila de la conversación: así sus
            // pendientes no tapan la página de las demás.
            const pagina_ = await losPendientes({
                cuentas,
                lineas,
                tope: POR_PAGINA,
                excluirPagadores: [...sinCreditos],
            });
            const pendientes = pagina_.filter((p) => !yaFallaron.has(llaveDelPendiente(p)));
            if (!pendientes.length) break;
            const antesFallidos = r.fallidos;
            const hechos = await vaciarLaCola(pendientes, analizar, r, sinCreditos, yaFallaron);
            // Una página que no avanzó (todo falló u otro lo tenía reclamado) y
            // en la que no cayó ninguna cuenta por créditos: se para aquí.
            const soloCreditos = pendientes.every((p) => sinCreditos.has(p.pagador || p.userId));
            if (hechos === 0 && !soloCreditos && r.fallidos === antesFallidos) break;
        }
        r.cuentasSinCreditos = [...sinCreditos];
        if (r.pendientes) {
            console.info("[sentimiento] análisis al abrir Chats", {
                cuentas: cuentas.length,
                pendientes: r.pendientes,
                analizados: r.analizados,
                cayeron: r.cayeron,
                sinCreditos: r.sinCreditos,
                fallidos: r.fallidos,
                tokens: r.tokens,
            });
        }
        if (sinCreditos.size) {
            console.warn("[sentimiento] cuentas sin créditos: sus conversaciones quedan pendientes", {
                cuentas: [...sinCreditos],
            });
        }
        return r;
    })().finally(() => enCurso.delete(llave));
    enCurso.set(llave, vuelta);
    return vuelta;
}

/** Para el banco: olvida lo recordado entre pruebas. */
export function olvidarLoRecordado(): void {
    iaRecordada.clear();
    enCurso.clear();
}
