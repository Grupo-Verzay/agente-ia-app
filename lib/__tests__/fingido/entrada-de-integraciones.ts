/**
 * La entrada que se empaqueta para el banco de Integrar URLs contra Postgres
 * (`scripts/banco-integraciones.sh`). Solo se finge quién ha iniciado sesión y
 * `revalidatePath`: las cinco acciones y sus consultas son las de producción.
 */
export { ponerAQuienMira } from "./auth-de-documentos";
export {
    getUserIntegrations,
    createUserIntegration,
    updateUserIntegration,
    deleteUserIntegration,
    reorderUserIntegrations,
} from "@/actions/user-integration-actions";
export { db } from "@/lib/db";
