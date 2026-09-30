/**
 * Lo mismo que `entrada-de-macros.ts`, con las acciones de las macros de
 * ANTES_REF (el banco las deja en `lib/__tests__/.antes/macros`).
 */
export { ponerAQuienMira } from "./auth-de-documentos";
export { llamadas, contestar, limpiar } from "./acciones-de-macros";
export {
    executeMacroAction,
    getAccountLinesAction,
    createMacroAction,
    updateMacroAction,
    getMacrosAction,
} from "../.antes/macros/actions/macro-actions";
export { db } from "@/lib/db";
