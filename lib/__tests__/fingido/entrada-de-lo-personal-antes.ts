/**
 * El «antes» de lo personal: las acciones de etiquetas y respuestas rápidas tal
 * como estaban en `ANTES_REF`, sacadas a un árbol de git aparte por
 * `scripts/banco-embudos.sh`. Mismo `currentUser()` fingido, mismas pruebas.
 */
export { ponerAQuienMira } from "./auth-de-documentos";
export {
    createTagAction,
    listTagsAction,
    deleteTagAction,
    replaceSessionTagsAction,
    getSessionTagsAction,
} from "../.antes/embudos/actions/tag-actions";
export { createRR, getAllRRs, deleteRR } from "../.antes/embudos/actions/rr-actions";
export { db } from "@/lib/db";
