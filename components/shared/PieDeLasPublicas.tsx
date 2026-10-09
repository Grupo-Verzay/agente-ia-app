import type { ReactNode } from "react";
import { CheckCircle2 } from "lucide-react";
import { SANGRIA_DEL_TEXTO } from "@/lib/ancho-de-la-landing";
import {
    COLORES_DEL_PIE,
    LINEA_DEL_PIE,
    elTextoDeLosDerechos,
    type TemaDelPie,
} from "@/lib/pie-de-las-publicas";

/**
 * El pie de las tres pantallas públicas: una raya al ancho del CONTENIDO y,
 * debajo, «© <año> Agente IA. Todos los derechos reservados.». Lo que cambia
 * entre pantallas entra por los huecos, nunca por un texto propio:
 *
 * - `ancho`: el contenedor del contenido, cuando la pantalla no lo pone ya (la
 *   landing y un plan); en la propuesta el pie va DENTRO de su `article`.
 * - `antes` / `despues`: el logo y los enlaces de la landing, a los lados.
 * - `preparadaPor`: la línea de más de la propuesta, encima de los derechos.
 *
 * Sin hooks: lo pinta también un componente del servidor (la propuesta).
 */
export function PieDeLasPublicas({
    tema,
    aire,
    ancho,
    antes,
    despues,
    preparadaPor,
}: {
    tema: TemaDelPie;
    aire: string;
    ancho?: string;
    antes?: ReactNode;
    despues?: ReactNode;
    preparadaPor?: string;
}) {
    const colores = COLORES_DEL_PIE[tema];
    const conLados = Boolean(antes || despues);
    const centro = (
        <div className="flex flex-col items-center gap-1.5 text-center">
            {preparadaPor ? (
                <p data-preparada-por className={`flex items-center justify-center gap-1.5 text-xs ${colores.texto}`}>
                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                    {preparadaPor}
                </p>
            ) : null}
            <p data-derechos className={`text-xs ${colores.texto}`}>
                {elTextoDeLosDerechos()}
            </p>
        </div>
    );
    const linea = (
        <div data-linea-del-pie className={`${LINEA_DEL_PIE} ${colores.linea}`}>
            {conLados ? (
                <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-between">
                    {antes}
                    {centro}
                    {despues}
                </div>
            ) : (
                centro
            )}
        </div>
    );
    // La raya no toca el borde en el teléfono: el contenedor de las públicas
    // ya no lleva margen a los lados ahí (`ANCHO_DE_LA_LANDING`), y una raya de
    // lado a lado rompería «al ancho del contenido». Desde `sm`, sin sangría.
    const conSangria = <div className={SANGRIA_DEL_TEXTO}>{linea}</div>;
    return (
        <footer data-pie-de-pagina className={aire}>
            {ancho ? <div className={ancho}>{conSangria}</div> : conSangria}
        </footer>
    );
}
