/**
 * La entrada que se empaqueta para el banco de las INTEGRACIONES (las pestañas
 * de Chats, entre ellas la del Copiloto).
 *
 * El `currentUser()` de mentira va DENTRO del paquete —importado aparte sería
 * otra copia y `ponerAQuienMira` no movería el código que corre—, y al lado las
 * acciones de VERDAD. Lo único fingido es quién ha iniciado sesión.
 */
export { ponerAQuienMira } from "./auth-de-documentos";
export {
    getUserIntegrations,
    createUserIntegration,
    updateUserIntegration,
    deleteUserIntegration,
} from "@/actions/user-integration-actions";
export { db } from "@/lib/db";
