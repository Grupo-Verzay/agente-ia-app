/**
 * La entrada que se empaqueta para el banco de la mudanza de una persona.
 *
 * Sale por aquí lo mismo que en los demás bancos de acciones: `currentUser()`
 * de mentira **dentro del paquete** —si se importara aparte sería otra copia y
 * `ponerAQuienMira` no movería el código que corre— y, al lado, **las acciones
 * de verdad**.
 *
 * Lo que este banco viene a demostrar no es que `aplicarLaMudanza` sepa
 * escribir: es que **nada de lo que ella firmó cambia de autor** y que **nada
 * queda huérfano**. Eso solo se ve contra Postgres, con filas de las dos clases
 * —lo suyo y lo de la cuenta— sembradas antes de moverla.
 *
 * Y lo suyo se siembra **por los escritores de verdad** (`guardarLaJornada`,
 * las acciones de Documentación), no con un `CREATE TABLE` copiado al banco:
 * una columna en SQL en crudo no se deduce, se comprueba, y un banco con su
 * propia DDL comprueba la suya.
 */
export { ponerAQuienMira } from "./auth-de-documentos";

export {
    cuentasParaMudarAction,
    informeDeLaMudanzaAction,
    mudarALaPersonaAction,
} from "@/actions/mudanza-de-persona-actions";

export { losModulosDe } from "@/lib/mudanza-de-persona-db";

/* Para sembrar lo suyo con los escritores de producción. */
export { guardarLaJornada } from "@/lib/actividad-del-equipo-db";
export {
    crearEspacioAction,
    ponerPermisoAction,
} from "@/actions/documentacion-actions";

export { db } from "@/lib/db";
