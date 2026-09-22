/**
 * Lo que se sabe de un fallo del navegador: como se lee, si se puede recuperar
 * solo, y donde queda anotado para poder contarlo DESPUES.
 *
 * Esto existe por la misma razon que `hardReload(motivo)`: cuando la pantalla
 * se rompe, lo siguiente que hace la persona es recargar, y la recarga se lleva
 * la consola por delante. No queda ni rastro, no hay captura que pedir, y "a
 * veces se queda en blanco" se queda en una sensacion. Anotarlo en el momento y
 * contarlo en la vuelta siguiente lo convierte en un dato.
 *
 * Todo va en `try`: en una ventana privada tocar `localStorage` puede lanzar, y
 * el registro de un fallo no puede ser la causa del siguiente.
 */

const LLAVE_DE_FALLOS = 'verzay:fallos';

/**
 * Cuantos se guardan. No es un historico: es "los ultimos, para poder mirarlos
 * al dia siguiente". Con uno solo, el segundo fallo borra el que explicaba el
 * primero; con cien, lo que se guarda crece sin freno en el almacenamiento del
 * navegador para no leerse nunca.
 */
const CUANTOS_SE_GUARDAN = 5;

/**
 * De donde vino el fallo. Sirve para saber QUE red lo cazo, que es justo lo que
 * separa "un componente reviento" de "no habia nada que lo cazara".
 */
export type DondeSeCazo =
  | 'global' // app/global-error.tsx: escapo del layout raiz
  | 'ruta' // app/error.tsx: reviento una pantalla
  | 'arbol' // el ErrorBoundary de components/error-bundary.tsx
  | 'ventana'; // window.onerror / unhandledrejection

export type FalloAnotado = {
  cuando: number;
  donde: string;
  cazadoEn: DondeSeCazo;
  nombre: string;
  mensaje: string;
  pila?: string;
  digest?: string;
  /** Cuanto llevaba abierta la pestaña. Dice si esto pasa "cada cierto rato". */
  vivaDesdeMs?: number;
};

/** Un error puede llegar como `Error`, como cadena o como cualquier cosa. */
export function comoSeLee(error: unknown): {
  nombre: string;
  mensaje: string;
  pila?: string;
  digest?: string;
} {
  if (error instanceof Error) {
    return {
      nombre: error.name || 'Error',
      mensaje: error.message || String(error),
      pila: error.stack,
      digest: (error as { digest?: string }).digest,
    };
  }
  if (typeof error === 'string') return { nombre: 'Error', mensaje: error };
  try {
    const suelto = error as { name?: string; message?: string; digest?: string };
    return {
      nombre: suelto?.name ?? 'Error',
      mensaje: suelto?.message ?? JSON.stringify(error),
      digest: suelto?.digest,
    };
  } catch {
    return { nombre: 'Error', mensaje: 'Error desconocido' };
  }
}

/**
 * Si el fallo es de los que se curan recargando: un desfase de version tras un
 * despliegue.
 *
 * Vive aqui y no dentro de `ChunkRecovery` porque lo preguntan TRES sitios —el
 * oyente de la ventana, la pantalla global y la de ruta—. Con una copia en cada
 * uno, el dia que se afine la lista se afina en uno y los otros dos se quedan
 * atras; y eso no se ve como un error, se ve como que "a veces se recupera y a
 * veces no".
 */
export function esRecuperable(mensaje: string, nombre: string): boolean {
  // 1) Chunk de JS que ya no existe tras un despliegue.
  if (nombre === 'ChunkLoadError') return true;
  if (/Loading chunk [^ ]+ failed/i.test(mensaje)) return true;
  if (/Loading CSS chunk/i.test(mensaje)) return true;
  if (/error loading dynamically imported module/i.test(mensaje)) return true;
  // 2) Desfase de version de SERVER ACTIONS: la pestaña quedo con el codigo
  //    viejo y su accion ya no existe en el servidor nuevo. El resultado llega
  //    `undefined` y se lee como "reading 'success'".
  if (/Failed to find Server Action/i.test(mensaje)) return true;
  if (/Cannot read properties of undefined \(reading 'success'\)/i.test(mensaje)) return true;
  return false;
}

/**
 * Anota el fallo para poder contarlo despues, y lo escribe ya en la consola.
 *
 * Las dos mitades hacen falta: la consola sirve a quien tenga las herramientas
 * abiertas en ese instante —casi nadie—, y lo anotado sirve al dia siguiente,
 * que es cuando se pregunta.
 *
 * `console.error` a proposito: `log` y `debug` los borra el build (ver la regla
 * de `removeConsole` en CLAUDE.md).
 */
export function anotarElFallo(cazadoEn: DondeSeCazo, error: unknown, extra?: string): FalloAnotado | null {
  if (typeof window === 'undefined') return null;

  const leido = comoSeLee(error);
  const fallo: FalloAnotado = {
    cuando: Date.now(),
    donde: window.location.pathname + window.location.search,
    cazadoEn,
    nombre: leido.nombre,
    mensaje: extra ? `${leido.mensaje} — ${extra}` : leido.mensaje,
    pila: leido.pila?.slice(0, 2000),
    digest: leido.digest,
    vivaDesdeMs: Math.round(performance.now()),
  };

  console.error('[app] fallo de pantalla', {
    cazadoEn,
    nombre: fallo.nombre,
    mensaje: fallo.mensaje,
    donde: fallo.donde,
    digest: fallo.digest,
    pila: fallo.pila,
  });

  try {
    const anotados = losFallosAnotados();
    anotados.push(fallo);
    localStorage.setItem(
      LLAVE_DE_FALLOS,
      JSON.stringify(anotados.slice(-CUANTOS_SE_GUARDAN)),
    );
  } catch {
    // Sin almacenamiento el fallo se queda solo en la consola. Perder el
    // registro es mejor que romper la pantalla de error.
  }

  return fallo;
}

/** Los ultimos fallos anotados en ESTE navegador. Lo que no se entienda, nada. */
export function losFallosAnotados(): FalloAnotado[] {
  if (typeof window === 'undefined') return [];
  try {
    const crudo = localStorage.getItem(LLAVE_DE_FALLOS);
    if (!crudo) return [];
    const leido = JSON.parse(crudo);
    return Array.isArray(leido) ? (leido as FalloAnotado[]) : [];
  } catch {
    return [];
  }
}

/** Borra lo anotado. Lo llama el arranque, despues de contarlo. */
export function olvidarLosFallos(): void {
  try {
    localStorage.removeItem(LLAVE_DE_FALLOS);
  } catch {
    /* noop */
  }
}

/**
 * Cuenta en la consola los fallos de las cargas ANTERIORES. Se llama una vez al
 * arrancar la App, al lado de `reportarRecargaPrevia()`.
 *
 * Su ausencia tambien informa: si alguien dice que se le quedo la pantalla en
 * blanco y aqui no sale nada, el fallo NO paso por ninguna de nuestras redes
 * —o el navegador no tenia almacenamiento donde anotarlo—.
 */
export function contarLosFallosAnteriores(): void {
  const anotados = losFallosAnotados();
  if (anotados.length === 0) return;
  olvidarLosFallos();
  console.error(
    `[app] esta pestaña arrastra ${anotados.length} fallo(s) de pantalla sin contar:`,
    anotados.map((f) => ({
      cazadoEn: f.cazadoEn,
      donde: f.donde,
      nombre: f.nombre,
      mensaje: f.mensaje,
      hace: `${Math.round((Date.now() - f.cuando) / 1000)}s`,
      pila: f.pila,
    })),
  );
}

/**
 * Lo que se guarda en la portapapeles / se le pide a quien reporta. Es texto
 * plano a proposito: se pega en un WhatsApp.
 */
export function comoSeCuenta(fallo: FalloAnotado | null): string {
  if (!fallo) return '';
  return [
    `cuando: ${new Date(fallo.cuando).toISOString()}`,
    `donde: ${fallo.donde}`,
    `cazado en: ${fallo.cazadoEn}`,
    `error: ${fallo.nombre}: ${fallo.mensaje}`,
    fallo.digest ? `digest: ${fallo.digest}` : '',
    fallo.pila ? `pila:\n${fallo.pila}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}
