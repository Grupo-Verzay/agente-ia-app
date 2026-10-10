import "server-only";

import { antesDeUsarLaIa, cobrarElUsoDeIa } from "@/lib/cobro-de-ia.server";
import { laClaveDeOpenAi } from "@/lib/creditos-de-transcripcion";
import { laLineaDeWhatsappDeLaCuenta } from "@/lib/linea-de-whatsapp";
import {
    API_DE_CLAVES_DEL_MOTOR,
    MODELO_DEL_MOTOR,
    comoFrasesDelMotor,
    comoTokensDelMotor,
    elAvisoDeTranscripcion,
    type FraseDelMotor,
    laSesionDelMotor,
    lasInstruccionesDelMotor,
    losTokensQueSeCobran,
} from "@/lib/motor-de-verzay";
import {
    barrerLaSala,
    guardarLasFrases,
    laConversacionDelMotor,
    lasConversacionesQuietas,
    reclamarLaEntrega,
    sumarLosTokens,
} from "@/lib/motor-de-verzay-db";
import { esSalaPropia } from "@/lib/proveedor-de-videollamada";
import { laTranscripcionDeTavus } from "@/lib/videollamada-ia";
import { procesarElAvisoDeTavus } from "@/lib/videollamada-ia-aviso.server";
import { elContextoDeLaCitaParaElMotor } from "@/lib/videollamada-ia.server";
import { laVideollamada } from "@/lib/videollamada-ia-db";
import { DEFAULT_VOICEBOT_VOICE, VOICEBOT_VOICES } from "@/lib/voicebot-voices";

/**
 * El servidor del MOTOR PROPIO (proveedor `verzay`). Tres cosas:
 *
 * 1. **La sesión de voz** (`pedirLaSesionDelMotor`): con la clave de OpenAI de
 *    la cuenta se pide a Realtime una clave de UN uso, con las instrucciones,
 *    las herramientas y la voz ya puestas. La clave de la cuenta no sale de
 *    aquí: al navegador solo llega la de un uso, que caduca en minutos.
 * 2. **Lo que habla** (`recibirLoDelMotor`): la sala manda la transcripción
 *    mientras se habla y los tokens gastados; se guarda y se cobra a la cuenta
 *    dueña de la cita, en los MISMOS créditos que el resto de la IA.
 * 3. **La entrega** (`entregarLaTranscripcion`): al colgar (o en el barrido, si
 *    se cerró la pestaña) la transcripción entra por `procesarElAvisoDeTavus`
 *    con la forma del aviso de Tavus: el resumen y el CRM salen igual.
 */

/** Cuánto vive la clave de un uso: lo justo para conectar (la sesión sigue después). */
export const VIDA_DE_LA_CLAVE_S = 600;
/** Sin movimiento en este rato, una conversación sin colgar se da por terminada. */
export const MINUTOS_SIN_MOVIMIENTO = 3;

/**
 * ¿Puede abrirse una sala con el motor propio para esta cuenta? Lo mira la
 * página ANTES de pintar la sala: sin créditos se dice claro, en vez de una
 * sala que no logra conectar a Verzy.
 */
export async function elMotorPuedeAbrir(cuentaId: string): Promise<boolean> {
    try {
        const permiso = await antesDeUsarLaIa(cuentaId);
        if (!permiso.ok) console.warn("[motor] la sala no abre: la cuenta no tiene créditos", { cuenta: cuentaId, motivo: permiso.motivo });
        return permiso.ok;
    } catch (error) {
        // Sin poder leer el saldo no se cierra la puerta: la sesión vuelve a mirarlo.
        console.warn("[motor] no se pudo leer el saldo al abrir; se deja abrir", { cuenta: cuentaId, error: String(error) });
        return true;
    }
}

export type SesionDelMotor =
    | {
          ok: true;
          clave: string;
          modelo: string;
          conversacionId: string;
          /** Lo ya hablado en ESTA conversación (una recarga): la sala sigue la transcripción desde ahí. */
          frases: FraseDelMotor[];
      }
    | { ok: false; motivo: string };

/** La voz de la cuenta: la del asistente de llamadas de su línea, o la de fábrica. */
async function laVozDeLaCuenta(cuentaId: string): Promise<string> {
    try {
        const voz = (await laLineaDeWhatsappDeLaCuenta(cuentaId)).linea?.voicebotVoice ?? "";
        return (VOICEBOT_VOICES as readonly string[]).includes(voz) ? voz : DEFAULT_VOICEBOT_VOICE;
    } catch (error) {
        console.warn("[motor] no se pudo leer la voz de la cuenta; va la de fábrica", { cuenta: cuentaId, error: String(error) });
        return DEFAULT_VOICEBOT_VOICE;
    }
}

/** Lo ya hablado en ESTA conversación (una recarga) o en la anterior de la cita. */
async function loYaHablado(citaId: string, conversacionId: string, transcripcionAnterior: string | null): Promise<string | null> {
    const enCurso = await laConversacionDelMotor(citaId).catch(() => null);
    if (enCurso && enCurso.conversacionId === conversacionId && enCurso.frases.length) {
        return laTranscripcionDeTavus(enCurso.frases);
    }
    return transcripcionAnterior;
}

export async function pedirLaSesionDelMotor(citaId: string): Promise<SesionDelMotor> {
    const fila = await laVideollamada(citaId);
    if (!fila?.conversacionId || !esSalaPropia(fila.conversacionUrl)) return { ok: false, motivo: "sin_conversacion" };
    const clave = await laClaveDeOpenAi(fila.cuentaId);
    if (!clave) {
        console.error("[motor] la cuenta no tiene clave de OpenAI: Verzy no puede hablar", { cita: citaId, cuenta: fila.cuentaId });
        return { ok: false, motivo: "sin_clave" };
    }
    const permiso = await antesDeUsarLaIa(fila.cuentaId);
    if (!permiso.ok) {
        console.warn("[motor] la cuenta no tiene créditos: Verzy no habla", { cita: citaId, cuenta: fila.cuentaId, motivo: permiso.motivo });
        return { ok: false, motivo: "sin_creditos" };
    }
    const datos = await elContextoDeLaCitaParaElMotor(citaId, await loYaHablado(citaId, fila.conversacionId, fila.transcripcion));
    if (!datos) return { ok: false, motivo: "sin_cita" };
    const sesion = laSesionDelMotor({
        instrucciones: lasInstruccionesDelMotor(datos.negocio, datos.contexto),
        voz: await laVozDeLaCuenta(fila.cuentaId),
    });
    try {
        const respuesta = await fetch(API_DE_CLAVES_DEL_MOTOR, {
            method: "POST",
            headers: { "content-type": "application/json", authorization: `Bearer ${clave}` },
            body: JSON.stringify({ expires_after: { anchor: "created_at", seconds: VIDA_DE_LA_CLAVE_S }, session: sesion }),
            cache: "no-store",
        });
        const cuerpo = (await respuesta.json().catch(() => ({}))) as { value?: unknown; error?: { message?: unknown } };
        if (!respuesta.ok || typeof cuerpo.value !== "string" || !cuerpo.value) {
            const motivo = String(cuerpo.error?.message ?? `OpenAI contestó ${respuesta.status}`);
            console.error("[motor] OpenAI no dio la sesión de voz", { cita: citaId, cuenta: fila.cuentaId, estado: respuesta.status, motivo });
            return { ok: false, motivo: "openai" };
        }
        // Que la conversación exista desde ya: el barrido la ve aunque nadie hable.
        const enCurso = await laConversacionDelMotor(citaId).catch(() => null);
        const mismas = enCurso?.conversacionId === fila.conversacionId;
        if (!mismas) await guardarLasFrases(citaId, fila.conversacionId, []);
        console.info("[motor] sesión de voz lista", { cita: citaId, cuenta: fila.cuentaId, conversacion: fila.conversacionId });
        return { ok: true, clave: cuerpo.value, modelo: MODELO_DEL_MOTOR, conversacionId: fila.conversacionId, frases: mismas ? enCurso!.frases : [] };
    } catch (error) {
        console.error("[motor] no se pudo pedir la sesión de voz", { cita: citaId, error: error instanceof Error ? error.message : String(error) });
        return { ok: false, motivo: "openai" };
    }
}

export async function recibirLoDelMotor(
    citaId: string,
    pedido: { conversacionId?: unknown; frases?: unknown; tokens?: unknown; fin?: unknown },
): Promise<{ ok: boolean; motivo?: string; hecho?: string }> {
    const fila = await laVideollamada(citaId);
    const conversacionId = typeof pedido.conversacionId === "string" ? pedido.conversacionId : "";
    if (!fila?.conversacionId || !esSalaPropia(fila.conversacionUrl) || conversacionId !== fila.conversacionId) {
        return { ok: false, motivo: "otra_conversacion" };
    }
    const frases = comoFrasesDelMotor(pedido.frases);
    const antes = await laConversacionDelMotor(citaId);
    if (antes?.conversacionId === conversacionId && antes.entregadaEn) return { ok: true, hecho: "ya_entregada" };
    // Una transcripción más corta que la guardada es de una pestaña recargada
    // que aún no sabe lo anterior: no pisa lo que ya había.
    const guardadas = antes?.conversacionId === conversacionId ? antes.frases : [];
    if (frases.length >= guardadas.length || antes?.conversacionId !== conversacionId) {
        await guardarLasFrases(citaId, conversacionId, frases);
    }
    const ahora = await laConversacionDelMotor(citaId);
    const tokens = losTokensQueSeCobran({
        pedidos: comoTokensDelMotor(pedido.tokens),
        yaCobrados: ahora?.tokens ?? 0,
        empezoEn: ahora?.empezoEn ?? new Date(),
        ahora: new Date(),
    });
    if (tokens > 0) {
        const permiso = await antesDeUsarLaIa(fila.cuentaId);
        // Se cobra lo gastado aunque el saldo se haya acabado a mitad: la voz ya se usó.
        await cobrarElUsoDeIa(fila.cuentaId, permiso.saldo, { tokens }, "videollamada-motor");
        await sumarLosTokens(citaId, tokens);
    }
    if (pedido.fin === true) {
        const hecho = await entregarLaTranscripcion(citaId, conversacionId);
        return { ok: true, hecho };
    }
    return { ok: true, hecho: "guardada" };
}

/** Entrega la transcripción al CRM UNA vez (el colgar y el barrido pueden coincidir). Nunca lanza. */
export async function entregarLaTranscripcion(citaId: string, conversacionId: string): Promise<string> {
    try {
        if (!(await reclamarLaEntrega(citaId, conversacionId))) return "ya_entregada";
        const conversacion = await laConversacionDelMotor(citaId);
        const frases = conversacion?.conversacionId === conversacionId ? conversacion.frases : [];
        const r = await procesarElAvisoDeTavus(citaId, elAvisoDeTranscripcion(conversacionId, frases));
        console.info("[motor] transcripción entregada", { cita: citaId, conversacion: conversacionId, frases: frases.length, hecho: r.hecho });
        return r.hecho;
    } catch (error) {
        console.error("[motor] no se pudo entregar la transcripción", { cita: citaId, error: error instanceof Error ? error.message : String(error) });
        return "fallo";
    }
}

/**
 * El barrido: las conversaciones que llevan `MINUTOS_SIN_MOVIMIENTO` sin
 * moverse y sin entregar (se cerró la pestaña sin colgar) se entregan. Lo
 * corren el cron y, de paso, la propia ruta del motor. Nunca lanza.
 */
let ultimoBarrido = 0;
export async function recogerLasConversacionesDelMotor(opciones: { siHaceFalta?: boolean } = {}): Promise<{ entregadas: number }> {
    if (opciones.siHaceFalta && Date.now() - ultimoBarrido < 60_000) return { entregadas: 0 };
    ultimoBarrido = Date.now();
    let entregadas = 0;
    try {
        for (const q of await lasConversacionesQuietas(MINUTOS_SIN_MOVIMIENTO)) {
            const hecho = await entregarLaTranscripcion(q.citaId, q.conversacionId);
            if (hecho !== "ya_entregada" && hecho !== "fallo") entregadas++;
        }
        await barrerLaSala();
    } catch (error) {
        console.warn("[motor] el barrido de conversaciones falló", { error: error instanceof Error ? error.message : String(error) });
    }
    if (entregadas) console.info("[motor] barrido: conversaciones entregadas", { entregadas });
    return { entregadas };
}
