"use client";

import { leerTrazaConfigAction } from "@/actions/traza-actions";
import type { TrazaConfigPanel } from "@/lib/traza-panel-tipos";

/**
 * La traza del PANEL: cuanto tarda cada consulta de Chats, cuanto tarda un
 * mensaje en aparecer en pantalla, y que le pasa a la conexion en vivo.
 *
 * Tres decisiones que conviene no deshacer:
 *
 * 1. **Sale por `console.info`, no por `log`.** El build borra `log` y `debug`
 *    (ver la regla de `removeConsole` en CLAUDE.md): un aviso en `log` no es
 *    que no se vea, es que no existe en produccion. Esa regla ya costo dos
 *    dias de pedir capturas de una consola que no podia decir nada.
 *
 * 2. **No cuesta NADA en el servidor.** Todo esto vive en el navegador del
 *    asesor. La unica ida al servidor es leer el interruptor, una vez por
 *    carga de la pantalla. `.144` tiene 11 GB y es el unico irreemplazable:
 *    la traza del panel no le escribe ni una linea.
 *
 * 3. **El interruptor es el MISMO que el del motor** (`traza_config`). Cruzar
 *    lo que ve el navegador con lo que ve el motor es justamente lo que
 *    permite decir donde se fue el tiempo; con dos interruptores separados
 *    acabarian encendidos en momentos distintos y no habria nada que cruzar.
 */

let configuracion: TrazaConfigPanel = { activa: false, muestreo: 0 };
let pedida = false;
/**
 * Si ESTA pestaña traza. Se decide una vez al cargar y no cambia.
 *
 * Por pestaña y no por evento: media traza no reconstruye ningun camino, y lo
 * que se quiere ver es la sesion entera de un asesor -sus consultas, sus
 * avisos, sus cortes de conexion-.
 */
let estaPestanaTraza = false;

/** Arranca la traza. Se llama una vez, al montar la pantalla de Chats. */
export async function iniciarTrazaDelPanel(): Promise<void> {
  if (pedida) return;
  pedida = true;
  try {
    configuracion = await leerTrazaConfigAction();
  } catch {
    configuracion = { activa: false, muestreo: 0 };
  }
  estaPestanaTraza =
    configuracion.activa && Math.random() * 100 < configuracion.muestreo;
  if (estaPestanaTraza) {
    console.info("[traza] esta pestaña esta midiendo", {
      muestreo: configuracion.muestreo,
    });
  }
}

export function trazando(): boolean {
  return estaPestanaTraza;
}

/**
 * Cronometra una consulta de la vista de Chats.
 *
 * Devuelve lo que devuelva la promesa, pase lo que pase: si un `await` se
 * rompe aqui, la pantalla se queda a medias. Un fallo se mide y se relanza,
 * nunca se traga -es la misma familia que «ningun `catch` vacio en los ciclos
 * de refresco»-.
 */
export async function medirConsulta<T>(
  nombre: string,
  fn: () => Promise<T>,
  extra?: Record<string, unknown>,
): Promise<T> {
  if (!estaPestanaTraza) return fn();
  const t0 = performance.now();
  try {
    const r = await fn();
    console.info("[traza] consulta", {
      consulta: nombre,
      tardoMs: Math.round(performance.now() - t0),
      ...extra,
    });
    return r;
  } catch (error) {
    console.info("[traza] consulta FALLO", {
      consulta: nombre,
      tardoMs: Math.round(performance.now() - t0),
      error: error instanceof Error ? error.message : String(error),
      ...extra,
    });
    throw error;
  }
}

/* ------------------------------------------------------------------ *
 * El camino de un mensaje entrante, hasta la pantalla del asesor.
 * ------------------------------------------------------------------ */

type AvisoEnCurso = { recibidoEn: number; emitidoEn: number; jid: string };

/**
 * Avisos vistos y todavia sin pintar.
 *
 * Acotado a proposito: una pestaña de un asesor esta abierta horas, y un mapa
 * que solo crece en el navegador es exactamente la fuga que este diagnostico
 * fue a buscar. No vamos a introducirla midiendo.
 */
const avisosEnCurso = new Map<string, AvisoEnCurso>();
const TOPE_DE_AVISOS = 300;

/**
 * Ids de mensaje que llegaron por el socket.
 *
 * Sirve para lo unico que de verdad dice si el tiempo real esta cumpliendo:
 * cuando el socket se cae y vuelve, cuantos mensajes trajo el RELOJ que el
 * socket nunca anuncio. Acotado igual, y por lo mismo.
 */
const vistosPorSocket = new Set<string>();
const TOPE_DE_VISTOS = 1000;

function acotar<K, V>(mapa: Map<K, V>, tope: number): void {
  if (mapa.size <= tope) return;
  const sobran = mapa.size - tope;
  let i = 0;
  for (const k of mapa.keys()) {
    if (i++ >= sobran) break;
    mapa.delete(k);
  }
}

/** Llego un `chat:changed`. `emitidoEn` es el `ts` que puso el backend. */
export function avisoRecibido(
  messageId: string | null | undefined,
  jid: string,
  emitidoEn: number,
): void {
  if (!estaPestanaTraza || !messageId) return;
  vistosPorSocket.add(messageId);
  if (vistosPorSocket.size > TOPE_DE_VISTOS) {
    // Un `Set` conserva el orden de insercion: el primero es el mas viejo.
    const masViejo = vistosPorSocket.values().next().value;
    if (masViejo !== undefined) vistosPorSocket.delete(masViejo);
  }
  avisosEnCurso.set(messageId, { recibidoEn: Date.now(), emitidoEn, jid });
  acotar(avisosEnCurso, TOPE_DE_AVISOS);
}

/**
 * Ese mensaje ya esta en la conversacion abierta, delante del asesor.
 *
 * Aqui se cierra el camino entero: cuanto tardo desde que el backend lo emitio
 * hasta que se ve. `red` es lo que costo llegar al navegador —y es el numero
 * que delata un WebSocket que no sube y se queda en polling—; `pintado` es lo
 * nuestro.
 */
export function mensajePintado(messageId: string | null | undefined): void {
  if (!estaPestanaTraza || !messageId) return;
  const aviso = avisosEnCurso.get(messageId);
  if (!aviso) return;
  avisosEnCurso.delete(messageId);
  const ahora = Date.now();
  console.info("[traza] mensaje en pantalla", {
    jid: aviso.jid,
    // Del backend al navegador. Depende del reloj de las dos maquinas, asi
    // que un valor negativo o absurdo significa relojes desincronizados, no
    // una red imposible: en ese caso el que vale es `pintado`.
    redMs: aviso.recibidoEn - aviso.emitidoEn,
    pintadoMs: ahora - aviso.recibidoEn,
    totalMs: ahora - aviso.emitidoEn,
  });
}

/**
 * Un mensaje que trajo el RELOJ, no el socket.
 *
 * Se llama desde el sondeo del chat abierto. Si esto sale mucho, el tiempo
 * real no esta sirviendo para nada y la conversacion vive del reloj, que es
 * exactamente el fallo que se ha "arreglado" varias veces.
 */
export function mensajeSoloPorElReloj(messageId: string | null | undefined): void {
  if (!estaPestanaTraza || !messageId) return;
  if (vistosPorSocket.has(messageId)) return;
  porElRelojDesdeElUltimoCorte += 1;
}

/* ------------------------------------------------------------------ *
 * La conexion en vivo.
 * ------------------------------------------------------------------ */

let desconectadoDesde: number | null = null;
let cortes = 0;
let porElRelojDesdeElUltimoCorte = 0;

export function conexionEvento(
  tipo: "conectado" | "desconectado" | "reconectado",
  extra?: Record<string, unknown>,
): void {
  if (!estaPestanaTraza) return;

  if (tipo === "desconectado") {
    desconectadoDesde = Date.now();
    cortes += 1;
    porElRelojDesdeElUltimoCorte = 0;
    console.info("[traza] conexion", { tipo, cortes, ...extra });
    return;
  }

  if (desconectadoDesde !== null) {
    // Lo que importa de una caida no es que ocurriera: es que se perdio
    // mientras. Sin este numero, "el socket se reconecta solo" suena a que no
    // pasa nada, y lo que pasa es que en ese rato la conversacion iba ciega.
    console.info("[traza] conexion", {
      tipo: "reconectado",
      cortes,
      caidoMs: Date.now() - desconectadoDesde,
      mensajesQueTrajoElReloj: porElRelojDesdeElUltimoCorte,
      ...extra,
    });
    desconectadoDesde = null;
    porElRelojDesdeElUltimoCorte = 0;
    return;
  }

  console.info("[traza] conexion", { tipo, cortes, ...extra });
}
