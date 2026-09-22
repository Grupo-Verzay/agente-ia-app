/**
 * La entrada que se empaqueta para el banco del RESCATE de llamadas.
 *
 * Lo que sale por aquí es **el barrido de verdad y su ruta**, no la función
 * pura sola: lo que hay que demostrar es que una llamada a la que nadie avisó
 * vuelve **desde su fila**, en un proceso que no sabe nada de la llamada — que
 * es justo lo que un redespliegue deja. Probando solo la decisión se estaría
 * probando el único trozo que no podía estar roto.
 *
 * Se finge lo mismo que en el banco de la grabación y ni una cosa más: el
 * paquete `openai` y el `fetch` contra el servidor de llamadas. El barrido, la
 * ruta, la consulta, el sello, la transcripción y el cobro son el código de
 * producción.
 */
export { ponerLoQueDiceLaIa, loQueSeLePidioALaIa, olvidarLoPedido } from "./ia-de-mentira";

export { rescatarLlamadasSinCerrar } from "@/lib/rescate-de-llamadas.server";
export { POST as pedirElRescate } from "@/app/api/calls/rescatar/route";
export { POST as avisarDelFinDeLaLlamada } from "@/app/api/calls/call-ended/route";

export {
    queLeFaltaALaLlamada,
    elSelloQueTrae,
    elSiguienteSello,
    TOPE_POR_VUELTA,
    TOPE_DE_RESCATES,
    EDAD_MINIMA_MS,
    ESPERA_ENTRE_RESCATES_MS,
    VENTANA_DE_RESCATE_DIAS,
} from "@/lib/rescate-de-llamadas";

export { esperarYProcesarLaGrabacion, ESPERA_ENTRE_INTENTOS_MS } from "@/lib/grabacion-de-llamada.server";

export { db } from "@/lib/db";
