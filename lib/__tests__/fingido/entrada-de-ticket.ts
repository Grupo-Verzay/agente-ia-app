/**
 * La entrada que se empaqueta para el banco de los avisos de un ticket.
 *
 * Sale por aquí lo mismo que en los demás bancos de acciones: el
 * `currentUser()` de mentira **dentro del paquete** —importado aparte sería
 * otra copia y `ponerAQuienMira` no movería el código que corre— y, al lado,
 * **las acciones de verdad**.
 *
 * Lo que este banco viene a demostrar no es que `crearLosAvisos` sepa escribir:
 * es **a quién le llega el aviso de un ticket**, y eso solo se ve contra
 * Postgres, con el módulo, sus `_UserModules` y las cuentas vinculadas
 * sembradas antes. Por eso lo que se ejerce son los dos caminos por los que
 * entra un ticket —la ficha pública y el formulario de dentro— y no la función
 * de avisar a solas: probar esa sería probar justo el lado que no tiene puerta.
 */
export { ponerAQuienMira } from "./auth-de-documentos";

/* Los dos caminos por los que entra un ticket. */
export { enviarTicketPublicoAction } from "@/actions/tickets-publico-actions";
export { abrirTicketAction } from "@/actions/tickets-actions";

/* Para sembrar el destino y el enlace con los escritores de producción: una
 * tabla de la App se crea sola al usarla, y un banco con su propia DDL
 * comprueba la suya. */
export { asegurarElEnlace, guardarElDestino } from "@/lib/tickets-db";

/* La lista de quién atiende y la ve, que es lo que decide el reparto. */
export { quienesAtiendenYLoVen } from "@/lib/avisar-del-ticket";

/* A dónde lleva el clic, tal cual lo calcula la ventana emergente. */
export { aDondeLleva } from "@/lib/avisos-de-tarea-tipos";

export { db } from "@/lib/db";
