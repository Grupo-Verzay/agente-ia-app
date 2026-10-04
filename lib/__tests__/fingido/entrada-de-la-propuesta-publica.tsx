/**
 * La página pública de una propuesta, pintada en el servidor con el componente
 * de VERDAD (`PropuestaPublica` y el reproductor `VideoDelPlan`), para que el
 * banco lea el HTML que recibe el cliente: el video del plan y el enlace a su
 * página pública, al final.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { PropuestaPublica } from "@/components/propuestas/PropuestaPublica";

export function pintarLaPropuesta(propuesta: any, planes: any[]): string {
    return renderToStaticMarkup(<PropuestaPublica propuesta={propuesta} planes={planes} />);
}
