"use client";

/**
 * Una consulta de Chats que NO pasa por la cola de acciones de Next.
 *
 * Next serializa las acciones de servidor de una pagina —una en vuelo, las
 * demas esperando (`shared/lib/router/action-queue.js`)—, asi que un
 * `Promise.allSettled` sobre varias acciones no las paraleliza: las encola.
 * Una ruta `/api` es un `fetch` normal y no entra ahi.
 *
 * ## Nunca revienta, y nunca se calla
 *
 * Devuelve `siFalla` cuando la respuesta no llega o no viene bien, y lo dice en
 * la consola. Las dos cosas importan:
 *
 * - Que no reviente es lo que deja intactos a quienes llaman. Una accion de
 *   servidor que falla vuelve como `{ success: false }`; si aqui saliera un
 *   `throw`, el `.then(...)` del arranque —que no siempre lleva `catch`— se
 *   quedaria a medias y la pantalla a medio pintar, sin error.
 * - Que lo diga es la regla de siempre: un fallo mudo en un ciclo de refresco
 *   no se ve como un error, se ve como una App lenta.
 *
 * Va como `console.warn` a proposito: el build borra `log` y `debug`
 * (`removeConsole` en next.config.js).
 */
export async function pedirSinCola<T>(
  ruta: string,
  cuerpo: unknown,
  siFalla: T,
): Promise<T> {
  try {
    const respuesta = await fetch(ruta, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cuerpo ?? {}),
      // La cookie de sesion: es lo unico que autentica estas rutas.
      credentials: "same-origin",
      cache: "no-store",
    });
    if (!respuesta.ok) {
      console.warn("[chats] una consulta contesto mal", {
        ruta,
        estado: respuesta.status,
      });
      return siFalla;
    }
    return (await respuesta.json()) as T;
  } catch (error) {
    console.warn("[chats] una consulta no llego", {
      ruta,
      error: error instanceof Error ? error.message : String(error),
    });
    return siFalla;
  }
}
