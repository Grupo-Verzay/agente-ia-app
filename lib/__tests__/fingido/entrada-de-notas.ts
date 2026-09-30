/**
 * La entrada que se empaqueta para el banco de Mis notas contra Postgres
 * (`scripts/banco-notas.sh`). Solo se finge quién ha iniciado sesión y el
 * `NextResponse` de la ruta de contactos: las acciones, las consultas y la
 * ruta son las de producción.
 */
export { ponerAQuienMira } from "./auth-de-documentos";
export {
    createNote,
    updateNote,
    getNotes,
    getArchivedNotes,
    getSharedNotes,
    getFolders,
    createFolder,
    archiveNote,
} from "@/actions/notes-actions";
export { GET as contactosParaVincular } from "@/app/api/notes/contacts/route";
export { db } from "@/lib/db";
