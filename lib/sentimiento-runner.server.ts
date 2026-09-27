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

/**
 * Quien analiza el sentimiento de los mensajes entrantes de Chats.
 *
 * # Por qué corre en la App y cuándo
 *
 * Los webhooks de WhatsApp los recibe el backend, no la App. Lo que la App sí
 * tiene es `chat_messages` —donde el webhook deja cada mensaje con todas sus
 * identidades— y un reloj que ya corre: la lista de Chats se pide cada 20 s por
 * cada pestaña abierta. De ahí sale el barrido: cada vuelta de la lista lanza,
 * DE FONDO y sin hacerla esperar, el análisis de los mensajes del cliente que
 * todavía no se leyeron en esas líneas. El resultado viaja en la vuelta
 * siguiente. Y un barrido diario (`/api/cron/billing`) recoge lo que entró sin
 * nadie mirando, para que el reporte del CRM no dependa de que alguien tuviera
 * Chats abierto.
 *
 * # Con la IA de la cuenta
 *
 * La misma que procesa sus conversaciones: su proveedor y su modelo por
 * defecto (`laIaDeLaCuenta`). La cuenta sale de la FILA del mensaje —el dueño
 * de la línea—, nunca del navegador.
 *
 * # Lo que no puede pasar
 *
 * - **Hacer esperar a la lista.** Se lanza con `void` y con su `catch`.
 * - **Analizar dos veces lo mismo.** Con dos réplicas y varias pestañas el mismo
 *   mensaje puede pedirse a la vez; lo decide la base (`reclamarElAnalisis`).
 * - **Ser mudo.** Un fallo de la IA se dice y el reclamo se suelta para que la
 *   vuelta siguiente lo reintente.
 */

/** Ventana del barrido de la lista: lo que entró en la última media hora. */
export const MINUTOS_DE_LA_LISTA = 30;
/** Cuántas conversaciones como mucho por vuelta de la lista. */
export const TOPE_DE_LA_LISTA = 25;
/** Una vuelta por las mismas cuentas y líneas, como mucho cada tanto. */
export const ESPERA_ENTRE_VUELTAS_MS = 8_000;
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
    fallidos: number;
};

type Analizador = (args: {
    cuenta: string;
    texto: string;
}) => Promise<Sentimiento | null>;

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
    return leerElSentimiento(r.content);
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

/** Analiza UNA conversación pendiente. Nunca lanza. */
export async function analizarUnaConversacion(
    p: Pendiente,
    analizar: Analizador = analizarConLaIa,
): Promise<"analizado" | "cayo" | "ocupado" | "sin_ia" | "fallido"> {
    let reclamado = false;
    try {
        const antes = await reclamarElAnalisis(p);
        if (!antes) return "ocupado";
        reclamado = true;
        const mensajes = await losMensajesDeContexto(p, MENSAJES_DE_CONTEXTO);
        const texto = elTextoParaAnalizar(mensajes);

        let ahora: Sentimiento | null;
        if (!texto) {
            // Sin texto del cliente (un audio sin transcribir, una imagen) no
            // hay nada que juzgar: se da por leído y se conserva lo que había.
            ahora = antes.sentimiento ?? "neutro";
        } else {
            try {
                ahora = await conPlazo(analizar({ cuenta: p.userId, texto }), PLAZO_DE_LA_IA_MS);
            } catch (error) {
                if (error instanceof SinIa) {
                    // Una cuenta sin IA configurada: no se reintenta en bucle.
                    // Se da por leído conservando lo que había.
                    await guardarElAnalisis(p, antes, antes.sentimiento ?? "neutro");
                    return "sin_ia";
                }
                throw error;
            }
        }
        if (!ahora) {
            // La IA contestó algo que no se entiende: NO se inventa un neutro
            // —borraría un negativo que sí estaba—; se conserva lo de antes.
            console.warn("[sentimiento] la IA contestó algo que no es un sentimiento", {
                linea: p.instanceName,
            });
            ahora = antes.sentimiento ?? "neutro";
        }
        const { cayo } = await guardarElAnalisis(p, antes, ahora);
        return cayo ? "cayo" : "analizado";
    } catch (error) {
        console.warn("[sentimiento] no se pudo analizar un mensaje; se reintentará", {
            linea: p.instanceName,
            motivo: (error as Error)?.message,
        });
        if (reclamado) await soltarElReclamo(p).catch(() => {});
        return "fallido";
    }
}

/** Una cola común con N obreros: el que se queda pillado no retiene a los demás. */
async function vaciarLaCola(
    pendientes: Pendiente[],
    analizar: Analizador,
): Promise<ResultadoDelBarrido> {
    const r: ResultadoDelBarrido = { pendientes: pendientes.length, analizados: 0, cayeron: 0, sinIa: 0, fallidos: 0 };
    let siguiente = 0;
    const obrero = async () => {
        while (siguiente < pendientes.length) {
            const p = pendientes[siguiente++];
            const res = await analizarUnaConversacion(p, analizar);
            if (res === "analizado") r.analizados++;
            else if (res === "cayo") { r.analizados++; r.cayeron++; }
            else if (res === "sin_ia") r.sinIa++;
            else if (res === "fallido") r.fallidos++;
        }
    };
    await Promise.all(Array.from({ length: Math.min(OBREROS, pendientes.length) }, obrero));
    return r;
}

const enCurso = new Map<string, Promise<ResultadoDelBarrido>>();
const ultimaVuelta = new Map<string, number>();

/**
 * El barrido que lanza la lista de Chats. Uno a la vez por cuentas+líneas y
 * por proceso, y no más de uno cada `ESPERA_ENTRE_VUELTAS_MS`: con varias
 * pestañas abiertas sobre la misma bandeja, la segunda no repite el trabajo.
 */
export function barrerElSentimientoDeLaBandeja(
    cuentas: readonly string[],
    lineas: readonly string[],
    analizar: Analizador = analizarConLaIa,
): Promise<ResultadoDelBarrido> | null {
    if (!cuentas.length || !lineas.length) return null;
    const llave = `${[...cuentas].sort().join(",")}|${[...lineas].sort().join(",")}`;
    const ya = enCurso.get(llave);
    if (ya) return ya;
    const ahora = Date.now();
    if (ahora - (ultimaVuelta.get(llave) ?? 0) < ESPERA_ENTRE_VUELTAS_MS) return null;
    ultimaVuelta.set(llave, ahora);
    const vuelta = (async () => {
        const pendientes = await losPendientes({
            cuentas,
            lineas,
            minutos: MINUTOS_DE_LA_LISTA,
            tope: TOPE_DE_LA_LISTA,
        });
        return vaciarLaCola(pendientes, analizar);
    })().finally(() => enCurso.delete(llave));
    enCurso.set(llave, vuelta);
    return vuelta;
}

/**
 * El barrido diario de toda la plataforma: recoge lo que entró sin nadie con
 * Chats abierto, para que el reporte del CRM cuente también esas caídas. Con
 * tope, y a su propio ritmo.
 */
export async function barrerElSentimientoDeLaPlataforma(
    opciones: { horas?: number; tope?: number } = {},
    analizar: Analizador = analizarConLaIa,
): Promise<ResultadoDelBarrido> {
    const pendientes = await losPendientes({
        cuentas: null,
        minutos: (opciones.horas ?? 26) * 60,
        tope: opciones.tope ?? 200,
    });
    return vaciarLaCola(pendientes, analizar);
}

/** Para el banco: olvida lo recordado entre pruebas. */
export function olvidarLoRecordado(): void {
    iaRecordada.clear();
    enCurso.clear();
    ultimaVuelta.clear();
}
