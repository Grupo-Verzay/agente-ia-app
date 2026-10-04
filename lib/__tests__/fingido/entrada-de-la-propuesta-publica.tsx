/**
 * La página pública de una propuesta, pintada en el servidor con el componente
 * de VERDAD (`PropuestaPublica`, con `PlanEnLaPropuesta` y sus piezas), para
 * que el banco lea el HTML que recibe el cliente: el plan completo dentro de
 * su servicio.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { PropuestaPublica } from "@/components/propuestas/PropuestaPublica";

export function pintarLaPropuesta(propuesta: any, planes: any[]): string {
    return renderToStaticMarkup(<PropuestaPublica propuesta={propuesta} planes={planes} />);
}
