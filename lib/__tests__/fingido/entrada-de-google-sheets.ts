/**
 * La entrada que se empaqueta para el banco de la pantalla de Google Sheets
 * contra Postgres. El `currentUser()` de mentira va dentro del paquete; la
 * acción, su puerta y la tabla son las de producción.
 */
export { ponerAQuienMira } from "./auth-de-documentos";
export { saveUserSheetsUrl } from "@/actions/google-sheets-actions";
export { db } from "@/lib/db";
