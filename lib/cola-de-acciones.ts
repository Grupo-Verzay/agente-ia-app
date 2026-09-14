"use client";

/**
 * El orden REAL de la cola de acciones de Next, con nombres.
 *
 * Next serializa TODAS las acciones de servidor de una pagina: una en vuelo, y
 * la siguiente no arranca hasta que la anterior resuelve. Esta en su codigo,
 * `shared/lib/router/action-queue.js`:
 *
 *     } else {
 *       // The queue is not empty, so add the action to the end of the queue
 *       // It will be started by runRemainingActions after the previous action finishes
 *       actionQueue.last.next = newAction;
 *
 * Desde fuera eso se ve como peticiones que salen justo cuando muere la
 * anterior, y el arranque de Chats cuesta la SUMA de todas. Lo que no se veia
 * es QUIEN ocupa cada turno: por la URL no se distinguen -todas van por POST a
 * la ruta de la pagina- y el codigo se ha leido mal varias veces.
 *
 * Esto pone nombres. Es solo instrumentacion.
 *
 * ## Por que esto NO altera el orden de encolado
 *
 * Tres decisiones, y las tres importan:
 *
 * 1. `fn()` se llama **sincrona**, en la misma linea, sin ningun `await` ni
 *    `Promise.resolve()` delante. El despacho ocurre en el mismo punto del
 *    flujo que ocurria antes.
 * 2. Se devuelve la **promesa original**, no una derivada. Quien llama recibe
 *    exactamente lo que recibia, con su mismo encadenamiento de errores.
 * 3. Los relojes se cuelgan con un `.then(ok, err)` **aparte**, que ademas
 *    atiende el rechazo para no dejar una promesa rechazada sin gestionar.
 *
 * ## Y por que no depende de la traza
 *
 * `leerTrazaConfigAction` es ella misma una de las acciones de la cola, y de
 * las primeras. Condicionar esto a su respuesta seria no poder ver los turnos
 * que van antes que ella, que son justo los que hay que ver.
 */

type Apunte = {
  nombre: string;
  encoladaEn: number;
  resolvioEn: number | null;
  ok: boolean | null;
};

const apuntes: Apunte[] = [];
/** Acotado: una pestaña de Chats esta abierta horas y esto vive en memoria. */
const TOPE_DE_APUNTES = 200;

/** El cero es la PRIMERA accion, no el montaje: las primeras salen de los hijos. */
let cero = 0;

function desdeElPrincipio(): number {
  if (!cero) cero = performance.now();
  return Math.round(performance.now() - cero);
}

export function apuntarAccion<T>(nombre: string, fn: () => Promise<T>): Promise<T> {
  const encoladaEn = desdeElPrincipio();

  // Sincrono y en la misma linea: aqui es donde Next encola.
  const promesa = fn();

  const apunte: Apunte = { nombre, encoladaEn, resolvioEn: null, ok: null };
  if (apuntes.length < TOPE_DE_APUNTES) apuntes.push(apunte);

  const anotar = (ok: boolean) => {
    apunte.resolvioEn = desdeElPrincipio();
    apunte.ok = ok;
  };
  // Aparte, y atendiendo el rechazo: medir no puede convertir un fallo
  // controlado en una promesa rechazada sin gestionar.
  promesa.then(
    () => anotar(true),
    () => anotar(false),
  );

  // La ORIGINAL. Quien llama no nota nada.
  return promesa;
}

/**
 * Imprime la cola: quien ocupo cada turno, cuanto espero y cuanto tardo.
 *
 * `salioEnMs` es DERIVADO, no observado: como solo corre una a la vez, una
 * accion arranca cuando termina la anterior, o cuando se encolo si la cola
 * estaba vacia. Se puede cruzar con `pedidoEnMs` del aviso de viajes de red,
 * que ese si lo mide el navegador.
 */
export function volcarLaColaDeAcciones(): void {
  const resueltas = apuntes
    .filter((a) => a.resolvioEn !== null)
    .sort((a, b) => (a.resolvioEn ?? 0) - (b.resolvioEn ?? 0));

  let finDeLaAnterior = 0;
  const turnos = resueltas.map((a, i) => {
    const salioEn = Math.max(a.encoladaEn, finDeLaAnterior);
    finDeLaAnterior = a.resolvioEn ?? salioEn;
    return {
      turno: i + 1,
      accion: a.nombre,
      encoladaEnMs: a.encoladaEn,
      salioEnMs: salioEn,
      esperoEnColaMs: salioEn - a.encoladaEn,
      tardoMs: (a.resolvioEn ?? salioEn) - salioEn,
      ok: a.ok,
    };
  });

  const sinResolver = apuntes
    .filter((a) => a.resolvioEn === null)
    .map((a) => ({ accion: a.nombre, encoladaEnMs: a.encoladaEn }));

  console.warn("[chats] LA COLA DE ACCIONES DEL ARRANQUE (ms desde la primera)", {
    cuantas: apuntes.length,
    // Lo que de verdad cuesta el arranque: la suma, porque no se solapan.
    hastaLaUltimaMs: turnos.length ? turnos[turnos.length - 1].salioEnMs + turnos[turnos.length - 1].tardoMs : 0,
    turnos,
    sinResolver,
  });
}
