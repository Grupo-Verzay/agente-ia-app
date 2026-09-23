/**
 * La misma entrada con las dos acciones de ANTES (`git show` de `ANTES_REF`):
 * el modo roto AFIRMA con ellas el «No autorizado» del panel.
 */
export { ponerAQuienMira } from "./auth-de-documentos";
export { getSalesPlaybookAction, saveSalesPlaybookFeedbackAction } from "../.antes/contexto/sales-playbook-actions";
export { scoreLeadBySessionId } from "../.antes/contexto/lead-score-action";
export { db } from "@/lib/db";
