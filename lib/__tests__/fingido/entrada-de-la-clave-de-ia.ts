/**
 * La entrada que se empaqueta para el banco de la clave de IA.
 *
 * `currentUser()` de mentira dentro del paquete —importado aparte sería otra
 * copia y `ponerAQuienMira` no movería el código que corre— y, al lado, las
 * acciones de verdad de `actions/userAiconfig-actions.ts` más el lector de la
 * clave para el servidor, que es lo que este banco viene a separar: el primero
 * viaja al navegador y el segundo no.
 */
export { ponerAQuienMira } from "./auth-de-documentos";
export {
    getUserAiSettings,
    getUserAiConfigs,
    upsertUserAiConfig,
    updateUserAiConfig,
    toggleUserAiConfigActive,
} from "@/actions/userAiconfig-actions";
export { resolveUserAiClient } from "@/lib/cliente-de-ia.server";
export { db } from "@/lib/db";
