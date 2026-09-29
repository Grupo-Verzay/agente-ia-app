/**
 * La entrada que se empaqueta para el banco de DESARCHIVAR contra Postgres.
 * El `currentUser()` de mentira va dentro del paquete; las acciones, la tabla
 * y el registro de auditoría son los de producción.
 */
export { ponerAQuienMira } from "./auth-de-documentos";
export {
    createNote,
    getNotes,
    getArchivedNotes,
    archiveNote,
    unarchiveNote,
} from "@/actions/notes-actions";
export { db } from "@/lib/db";
