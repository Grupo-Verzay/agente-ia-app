/**
 * La pantalla de COPILOTO (`/copiloto`): el copiloto de IA (LibreChat)
 * embebido, con dos botones de la plataforma encima —«Fijar en Chats» y
 * «Pantalla completa»—. Puro: lo leen `MainCopiloto.tsx`, la guía y el banco.
 *
 * # Dónde van los dos botones, y por qué depende del ANCHO
 *
 * Los botones flotan sobre el copiloto, a la izquierda de su botón de más a la
 * derecha (compartir en una conversación, chat temporal en una nueva: a 52 px
 * del borde), a la altura de su cabecera.
 * Eso vale mientras el copiloto tenga sitio, y deja de valer por debajo. La
 * cabecera del copiloto no es nuestra y cambia con su propio ancho —medido
 * en la v0.8.7 que corre en producción—:
 *
 * | ancho del copiloto | su cabecera |
 * | --- | --- |
 * | 768 px o más | el selector de modelo y sus botones a la izquierda (acaban hacia los **614 px** con su lista abierta); el de más a la derecha, a la derecha |
 * | menos de 768 | TODO a la izquierda, el de más a la derecha incluido: acaba hacia los **338 px** |
 *
 * Con el rótulo puesto los dos botones miden unos 180 px, así que flotando a
 * 52 px del borde tapaban el grupo de la izquierda en cuanto el copiloto
 * medía menos de ~846 px, y en un teléfono lo tapaban entero (el selector de
 * modelo y sus tres botones, debajo de «Fijar en Chats»). De ahí los
 * tres tamaños, que se deciden con una consulta de CONTENEDOR —el ancho del
 * copiloto, no el de la ventana: el menú de la plataforma se abre y se cierra—:
 *
 * | ancho del copiloto | los botones |
 * | --- | --- |
 * | 53,75 rem (860 px) o más | flotan, con el rótulo «Fijar en Chats» — como siempre |
 * | de 35 rem (560 px) a 53,75 rem | flotan, solo con su icono (80 px en vez de 180) |
 * | menos de 35 rem | en su propia fila, ENCIMA del copiloto, con el rótulo |
 *
 * Los dos cortes salen de esas medidas: con el icono solo hacen falta 132 px a
 * la derecha del grupo, así que caben desde 470 px (cabecera estrecha) y desde
 * 746 px (cabecera ancha); con el rótulo, desde 846 px. Por debajo de 560 px
 * no caben de ninguna forma sin tapar algo, y la fila de encima cuesta 49 px
 * de alto pero no tapa nada.
 *
 * Las clases van LITERALES: Tailwind solo genera lo que ve escrito, y lee
 * `lib/` (ver `tailwind.config.ts`).
 */
import { comoUrlDeIntegracion } from "@/lib/url-embebible";

/** El copiloto de la plataforma. */
export const COPILOTO_POR_DEFECTO = "https://copiloto.ia-app.com";

/**
 * El parámetro con el que un módulo cambia el copiloto (el de un reseller, por
 * ejemplo), igual que `/canva`: `/copiloto?u=https://…`.
 */
export const PARAMETRO_DEL_COPILOTO = "u";

/**
 * El nombre de la pestaña que «Fijar en Chats» pone en cada conversación. Es
 * una INTEGRACIÓN del cliente (una integración = una pestaña en el chat).
 */
export const NOMBRE_DE_LA_PESTANA = "Copiloto";

/** Cómo se llama el copiloto para un lector de pantalla (el `title` del marco). */
export const TITULO_DEL_MARCO = "Copiloto de IA";

/**
 * El copiloto que se abre: el del parámetro si es una dirección `http(s)`; si
 * no —no está, o es `javascript:` y compañía—, el de la plataforma. Nunca se
 * embebe lo que no pase por `comoUrlDeIntegracion`: `?u=` llega de un enlace
 * que cualquiera puede mandar.
 */
export function laUrlDelCopiloto(pedida: string | null | undefined): string {
    if (!pedida?.trim()) return COPILOTO_POR_DEFECTO;
    return comoUrlDeIntegracion(pedida) ?? COPILOTO_POR_DEFECTO;
}

/** Los dos cortes, en px (el de la tabla de arriba); las clases llevan su valor en rem. */
export const ANCHO_PARA_FLOTAR_PX = 560;
export const ANCHO_PARA_EL_ROTULO_PX = 860;

/** Cómo van los botones con un copiloto de ese ancho: la tabla de arriba, para el banco. */
export function comoVanLosBotones(anchoDelCopiloto: number): "fila" | "flotan-con-icono" | "flotan-con-rotulo" {
    if (anchoDelCopiloto < ANCHO_PARA_FLOTAR_PX) return "fila";
    if (anchoDelCopiloto < ANCHO_PARA_EL_ROTULO_PX) return "flotan-con-icono";
    return "flotan-con-rotulo";
}

/** La caja de la pantalla: el contenedor contra el que se miden los botones. */
export const CAJA_DEL_COPILOTO =
    "relative flex h-full w-full flex-col overflow-hidden bg-background [container-type:inline-size]";

/** El marco del copiloto: lo que queda de alto, debajo de la fila si la hay. */
export const MARCO_DEL_COPILOTO = "min-h-0 w-full flex-1";

/** Los dos botones: su fila en un teléfono, flotando desde 35 rem. */
export const MANDOS_DEL_COPILOTO =
    "flex shrink-0 items-center justify-end gap-2 border-b bg-background px-2 py-1.5 " +
    "[@container(min-width:35rem)]:absolute [@container(min-width:35rem)]:right-[52px] " +
    "[@container(min-width:35rem)]:top-2 [@container(min-width:35rem)]:z-20 " +
    "[@container(min-width:35rem)]:border-0 [@container(min-width:35rem)]:bg-transparent " +
    "[@container(min-width:35rem)]:p-0";

/** «Fijar en Chats»: con su rótulo, salvo en la franja del medio, donde va solo el icono. */
export const BOTON_FIJAR =
    "inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border bg-background px-3.5 text-xs font-semibold " +
    "transition-colors hover:bg-accent disabled:opacity-60 " +
    "[@container(min-width:35rem)_and_(max-width:53.749rem)]:w-9 " +
    "[@container(min-width:35rem)_and_(max-width:53.749rem)]:px-0";

/** El rótulo de «Fijar en Chats», que desaparece en la franja del medio. */
export const ROTULO_DE_FIJAR = "[@container(min-width:35rem)_and_(max-width:53.749rem)]:hidden";

/** «Pantalla completa»: siempre un cuadrado, al lado. */
export const BOTON_PANTALLA_COMPLETA =
    "inline-flex h-9 w-9 items-center justify-center rounded-xl border bg-background text-foreground " +
    "transition-colors hover:bg-accent";

/**
 * Los dos botones, con lo que dicen al posar el cursor (`title`) y lo que lee
 * un lector de pantalla. El banco compara la guía con esto y con lo que
 * `MainCopiloto.tsx` pinta.
 */
export const BOTONES_DE_LA_PLATAFORMA = {
    fijar: {
        rotulo: "Fijar en Chats",
        titulo: "Mostrar el Copiloto como pestaña en tus Chats",
    },
    quitar: {
        rotulo: "Quitar de Chats",
        titulo: "Quitar el Copiloto de tus Chats",
    },
    pantallaCompleta: {
        titulo: "Pantalla completa",
    },
    salirDePantallaCompleta: {
        titulo: "Salir de pantalla completa (Esc)",
    },
} as const;

/**
 * Si el navegador deja poner un elemento a pantalla completa. En un iPhone
 * no (`requestFullscreen` no existe en un `<div>`), y dentro de un marco sin
 * permiso tampoco (`fullscreenEnabled` es falso): ahí el botón no se ofrece,
 * porque un botón que al pulsarlo no hace nada es peor que no tenerlo.
 */
export function hayPantallaCompleta(documento: { fullscreenEnabled?: boolean } | undefined, elemento: object | null): boolean {
    if (!documento || !elemento) return false;
    return documento.fullscreenEnabled === true && typeof (elemento as { requestFullscreen?: unknown }).requestFullscreen === "function";
}
