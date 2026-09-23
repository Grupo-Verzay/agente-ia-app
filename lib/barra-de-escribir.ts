/**
 * La forma de una barra de escribir, escrita UNA vez.
 *
 * Las dos barras de la plataforma —la de Chats y la del chat de equipo— son el
 * mismo patrón: un botón «+» a la izquierda que despliega las herramientas en
 * una columna flotante por encima de la caja, la caja ocupando todo el ancho
 * que queda, y a la derecha el micrófono —que despliega su propia columna con
 * el dictado y la nota de voz— o el botón redondo de enviar en cuanto hay algo
 * que mandar.
 *
 * Copiadas a mano en los dos sitios, el día que se afine el radio, el hueco o
 * el color de un botón se afina en una barra y la otra se queda atrás. Eso no
 * se ve como un error: se ve como dos pantallas de la misma plataforma que no
 * se parecen, y nadie sabe cuál es la buena.
 *
 * Va en `lib/` y **por eso `tailwind.config.ts` tiene que mirar `lib/`** —lo
 * mira, con su explicación al lado—. Sin ese glob estas clases no generan ni
 * una regla y los botones salen sin forma, con el build limpio. Se comprueba
 * buscando la DECLARACIÓN en el CSS del build, no la clase en el código.
 */

/* ────────────────────────────────────────────────────────────────────────────
 * El MARCO de la barra: relleno, fila y alto. Uno solo para las tres.
 *
 * Convivían tres: la conversación `px-2 py-1.5 sm:px-3 sm:py-2`, el chat de
 * equipo `px-3 py-3 sm:px-6` y el copiloto `px-3 py-3`. Medido sobre la página
 * servida, la barra del equipo medía **65 px** donde la de la conversación
 * mide **57**, así que en las dos columnas la raya de arriba caía a distinta
 * altura; y el «+» quedaba a 12, 24 o 12 px del filo, con 8 px más hasta la
 * caja. Cada píxel de ese aire es ancho que le falta a la caja de escribir.
 *
 * > **El «+» queda a la MISMA distancia del filo que de la caja, y esa
 * > distancia es la mínima**: 6 px, el margen de las cabeceras de Chats
 * > (`MARGEN_DE_LAS_CABECERAS`). A la derecha, la caja llega hasta los mismos
 * > 6 px del filo.
 *
 * El relleno vertical es el de la conversación, que era el modelo. Con la caja
 * en su línea (`min-h-10`, 40 px) eso son 57 px con la raya: el ALTO de la
 * barra, y el de todo pie fijo de un panel (`PIE_DEL_PANEL`).
 * ──────────────────────────────────────────────────────────────────────────── */

/** El hueco a cada lado del «+» (filo → «+» y «+» → caja), en px. */
export const HUECO_DEL_MAS = 6;

/** El alto de la barra con la caja en una línea, raya incluida, en px (escritorio). */
export const ALTO_DE_LA_BARRA = 57;

/** El marco: la raya de arriba y el relleno. Lo usan las tres barras. */
export const MARCO_DE_LA_BARRA = "shrink-0 border-t border-border px-1.5 py-1.5 sm:py-2";

/** La fila de dentro: el «+», la caja y lo que vaya al lado. */
export const FILA_DE_LA_BARRA = "relative flex flex-nowrap items-center gap-1.5";

/**
 * El pie FIJO de un panel lateral: la fila de «Cancelar / Crear» del
 * recordatorio y de la tarea, y la de «No se envía al cliente» del contexto
 * del lead. Se queda abajo mientras lo de encima se desplaza.
 *
 * **Mide lo que la barra de escribir**, con su raya arriba: así, con un panel
 * abierto al lado de la conversación, la raya del pie y la de la barra caen en
 * el mismo píxel. El alto es el de la barra con la caja en una línea —el
 * relleno de arriba y abajo más los 40 px de un botón—, escrito en `rem` más
 * el píxel de la raya, que es como lo suma la barra: así cuadra también con la
 * escala de letra de la plataforma (`ui_scale`), que mueve los `rem` y no la
 * raya.
 */
export const PIE_DEL_PANEL =
    "flex shrink-0 items-center justify-between gap-2 border-t border-border bg-background px-1.5 h-[calc(3rem+1px)] sm:h-[calc(3.5rem+1px)]";

/**
 * La columna flotante que sale del «+», por ENCIMA de la caja.
 *
 * Hacia arriba y no hacia abajo: debajo está el borde de la ventana, y en un
 * panel lateral no hay sitio para desplegar nada ahí.
 */
export const COLUMNA_DE_HERRAMIENTAS =
    "absolute bottom-full left-0 mb-2 z-50 flex flex-col items-center gap-1 rounded-xl border border-border bg-popover p-2 shadow-lg";

/** La misma columna, anclada a la derecha: la del micrófono. */
export const COLUMNA_DE_VOZ =
    "absolute bottom-full right-0 mb-2 z-50 flex flex-col items-center gap-1 rounded-xl border border-border bg-popover p-2 shadow-lg";

/** Un botón de la columna de herramientas (el «+» incluido). */
export const BOTON_DE_HERRAMIENTA = "h-8 w-8 rounded-full shrink-0 transition-colors";

/** Los botones redondos de la derecha, dentro de la caja. */
export const BOTON_REDONDO = "h-7 w-7 rounded-full shrink-0";

/** El de enviar: el azul con la flecha. */
export const BOTON_DE_ENVIAR = "bg-[#4F7FE8] hover:bg-[#426FD4]";

/** Un botón redondo en reposo (micrófono, dictado). */
export const BOTON_REDONDO_EN_REPOSO =
    "bg-zinc-200 hover:bg-zinc-300 dark:bg-zinc-700 dark:hover:bg-zinc-600";

/** Y grabando, que tiene que verse sin leer nada. */
export const BOTON_REDONDO_GRABANDO = "bg-red-500 hover:bg-red-600";

/* ────────────────────────────────────────────────────────────────────────────
 * Y lo que DECIDE la barra, no solo cómo se ve
 *
 * El #790 sacó a `lib/` las clases y a `components/shared/` el formato, los
 * emojis y el texto ya pintado. La barra en sí siguió siendo **dos**:
 * `ChatInputBar.tsx` y un compositor escrito dentro de `HiloDelEquipo.tsx`. Y
 * dos implementaciones no divergen en lo grande —las dos mandan mensajes—:
 * divergen en lo pequeño, que es lo que se reporta como «en el chat de equipo
 * no deja pegar capturas» y «el icono del dictado sale como una T».
 *
 * Así que lo que decide la barra vive aquí, es PURO, y lo llaman las dos.
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * Por debajo de este ancho la barra va **plegada**: las herramientas salen del
 * «+» en su columna y a la derecha queda un solo botón.
 *
 * Es una MEDIDA, no una pantalla: el chat de equipo se lee en un panel lateral
 * de 18 a 24 rem —siempre plegado— y también en su propia ruta a todo lo
 * ancho, donde tiene tanto sitio como Chats. Escrito como «aquí siempre
 * plegado» las dos pantallas se ven distintas sin que nada lo justifique.
 */
export const ANCHO_COMPACTO = 640;

/** Qué botón va a la derecha de la caja, dentro de ella. */
export type BotonDeLaDerecha = "dictado" | "nota" | "enviar" | "menu";

/** Lo que hay que saber para decidirlo. */
export type EstadoDeLaDerecha = {
    /** La barra no tiene ancho para los tres (ver `ANCHO_COMPACTO`). */
    compacta: boolean;
    /** Hay voz que ofrecer. Falso al previsualizar un audio o al editar. */
    conVoz: boolean;
    /**
     * Hay nota de voz. Falso en el copiloto, que solo dicta: ahí el botón de
     * la derecha es UNO —el micrófono con la caja vacía, la flecha con texto—
     * y no hay menú que desplegar. Sin el campo, `true`.
     */
    conNota?: boolean;
    /** El navegador tiene dictado (Web Speech). */
    hayDictado: boolean;
    dictando: boolean;
    grabando: boolean;
    hayAlgoQueEnviar: boolean;
};

/**
 * Los botones de la derecha, en orden, y **es la misma decisión en las dos
 * barras**.
 *
 * Con sitio van los tres en fila —dictado, nota de voz y enviar— y el de
 * enviar sale apagado mientras no haya nada que mandar. Plegada hay uno solo,
 * y cuál es depende de lo que se esté haciendo:
 *
 * 1. **Grabando manda la grabación**: lo único que se puede hacer es
 *    terminarla.
 * 2. **Dictando, el botón de parar NO desaparece porque haya texto.** Si
 *    desapareciera, la única forma de callar el dictado sería enviar el
 *    mensaje.
 * 3. Con algo que enviar, el azul.
 * 4. Y si no, el micrófono — que despliega dictado y nota **solo cuando el
 *    navegador tiene dictado**: un menú con una sola cosa dentro es un clic de
 *    más.
 */
export function losBotonesDeLaDerecha(e: EstadoDeLaDerecha): BotonDeLaDerecha[] {
    if (e.conNota === false) {
        // Solo dictado: un botón, el que toca. Dictando se queda el de parar
        // aunque haya texto (regla 2), y enviar sale en cuanto hay algo que
        // mandar. Sin dictado en el navegador, enviar siempre.
        if (!e.conVoz || !e.hayDictado) return ["enviar"];
        if (e.dictando) return ["dictado"];
        return e.hayAlgoQueEnviar ? ["enviar"] : ["dictado"];
    }
    if (!e.compacta) {
        const fila: BotonDeLaDerecha[] = [];
        if (e.conVoz && e.hayDictado) fila.push("dictado");
        if (e.conVoz) fila.push("nota");
        fila.push("enviar");
        return fila;
    }
    if (!e.conVoz) return ["enviar"];
    if (e.grabando) return ["nota"];
    if (e.dictando) return e.hayAlgoQueEnviar ? ["dictado", "enviar"] : ["dictado"];
    if (e.hayAlgoQueEnviar) return ["enviar"];
    return e.hayDictado ? ["menu"] : ["nota"];
}

/**
 * El hueco que hay que dejarle a esos botones dentro de la caja.
 *
 * Sale de la MISMA lista, y por eso no pueden discrepar: de más, la última
 * palabra se corta sola contra un hueco vacío; de menos, el texto pasa por
 * debajo del botón y no se lee. Los tres números son los que Chats llevaba
 * medidos (`pr-12` / `pr-28`) más el de dos que el chat de equipo ya había
 * tenido que calcular por su cuenta.
 */
export function rellenoDeLaCaja(cuantos: number): string {
    if (cuantos >= 3) return "pr-28";
    if (cuantos === 2) return "pr-[4.5rem]";
    return "pr-12";
}

/**
 * Los ficheros que trae el portapapeles, o ninguno.
 *
 * **Pegar una captura es la forma en que la gente adjunta una imagen**: se
 * recorta y se pega, no se guarda en el escritorio para buscarla luego. Es la
 * misma regla que ya rige en los adjuntos de una tarea, y el chat de equipo
 * **no la tenía**: su `<Textarea>` no llevaba ningún `onPaste`, así que Ctrl+V
 * con una captura dentro no hacía absolutamente nada — ni error, ni aviso.
 *
 * Devuelve `[]` cuando el portapapeles trae solo texto, y quien llama **no
 * toca el evento en ese caso**: sin esa condición, pegar texto dejaría de
 * comportarse como siempre.
 *
 * `soloImagenes` es la diferencia legítima entre las dos barras: por WhatsApp
 * se compone con imágenes (`ComposeMedia`), y el chat de equipo admite
 * cualquier fichero.
 */
export function archivosDelPortapapeles(
    items: ArrayLike<DataTransferItem> | null | undefined,
    opciones?: { soloImagenes?: boolean },
): File[] {
    if (!items) return [];
    const soloImagenes = opciones?.soloImagenes ?? false;
    const salen: File[] = [];
    for (let i = 0; i < items.length; i += 1) {
        const item = items[i];
        if (!item || item.kind !== "file") continue;
        if (soloImagenes && !String(item.type ?? "").startsWith("image/")) continue;
        const fichero = item.getAsFile();
        if (fichero) salen.push(fichero);
    }
    return salen;
}
