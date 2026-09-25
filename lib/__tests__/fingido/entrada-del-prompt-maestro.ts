/**
 * La entrada que se empaqueta para el banco del prompt maestro por cuenta:
 * `currentUser()` de mentira y, al lado, las acciones y la tabla de verdad.
 */
export { ponerAQuienMira } from "./auth-de-documentos";
export {
    leerPromptMaestroDeCuentaAction,
    guardarPromptMaestroDeCuentaAction,
} from "@/actions/prompt-maestro-actions";
export { db } from "@/lib/db";
