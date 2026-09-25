/**
 * La entrada que se empaqueta para el banco de la etapa en la fila.
 *
 * Lo que se prueba contra Postgres son **las consultas de verdad**: las tres
 * lecturas en bloque de `lib/embudos-db.ts` y la decisión de
 * `lasEtapasDeLaBandeja`. Al lado va la acción de la CABECERA, con su
 * `currentUser()` fingido, para poder encadenar las dos: si la fila y la
 * cabecera dijeran etapas distintas no habría forma de saber cuál miente.
 */
export { ponerAQuienMira } from "./auth-de-documentos";
export { lasEtapasDeLaBandeja } from "@/lib/etapas-de-la-bandeja.server";
export { etapaDeLaConversacionAction, moverTarjetaAction } from "@/actions/embudos-actions";
export { crearEmbudo, guardarEtapas, asignarEmbudos, lasEtapasDe, losEmbudosDe } from "@/lib/embudos-db";
export { db } from "@/lib/db";
