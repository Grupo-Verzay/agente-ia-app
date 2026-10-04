import { laGuiaPublicaAction, type GuiaPublica } from "@/actions/guia-publica-actions";

/**
 * Lo ya pedido de una guía pública, por módulo, COMPARTIDO por todos los que
 * la pintan dentro de otra página: la guía en la landing (`GuiaEnLaLanding`) y
 * la guía desplegada dentro de una función de la página de un plan
 * (`GuiaDesplegada`). Volver a abrir una guía no la vuelve a pedir, y dos
 * funciones que comparten la misma guía la piden una sola vez.
 *
 * Un fallo de red se olvida, para que «Reintentar» vuelva a preguntar.
 */
const pedidas = new Map<string, Promise<GuiaPublica | null>>();

export function pedirLaGuiaPublica(modulo: string): Promise<GuiaPublica | null> {
    let p = pedidas.get(modulo);
    if (!p) {
        p = laGuiaPublicaAction(modulo).catch((error) => {
            pedidas.delete(modulo);
            throw error;
        });
        pedidas.set(modulo, p);
    }
    return p;
}
