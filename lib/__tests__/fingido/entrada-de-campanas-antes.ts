/**
 * El «antes» de Campañas: las acciones de recordatorios tal como estaban en
 * `ANTES_REF`, sacadas de git a una carpeta aparte (ver el script).
 */
export { ponerAQuienMira } from "./auth-de-documentos";
export * as antes from "../.antes/campanas/actions/reminders-actions";
export { db } from "@/lib/db";
