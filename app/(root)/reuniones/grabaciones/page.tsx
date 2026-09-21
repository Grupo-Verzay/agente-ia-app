/**
 * `/reuniones/grabaciones` — la MISMA pantalla que `/reuniones`.
 *
 * Reuniones y su grabación son **dos módulos alternativos**, como Agenda y
 * Multiagenda: el administrador asigna uno u otro (no se acumulan), y les pone
 * el nombre que quiera —los dos pueden llamarse «Reuniones» en el menú, y quien
 * tenga solo uno ve una sola pestaña—. La diferencia no está en la pantalla:
 *
 * - `/reuniones` da acceso a la sala, sin botón de grabar.
 * - `/reuniones/grabaciones` da acceso a la MISMA sala, con el botón de grabar
 *   habilitado.
 *
 * Y esa diferencia **no la decide la ruta**: la decide tener el módulo de
 * grabación (`laCuentaPuedeGrabar`, por la CUENTA). Por eso esta ruta no puede
 * ser un 404 —era el fallo: se asignaba el módulo, salía la pestaña y llevaba a
 * «página no encontrada»— y tampoco necesita una pantalla propia: renderiza la
 * de `/reuniones` tal cual. Quien llega aquí es porque tiene el módulo de
 * grabación, así que el botón de grabar le sale por la puerta de siempre.
 *
 * Se reexporta el `default` (y `dynamic`) de la página padre en vez de
 * copiarla: con una copia, el día que se afine la carga de Reuniones esta se
 * quedaría atrás, y eso no se ve como un error sino como «en grabaciones a
 * veces falta algo».
 */
export { default, dynamic } from "../page";
