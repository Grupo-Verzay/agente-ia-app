/**
 * Cómo se ve una FILA de los dos desplegables que se abren desde la cabecera de
 * la conversación: el de **Etiquetas** y el de **Etapas**.
 *
 * Aquí no se decide DÓNDE nace el panel —eso es `lib/paneles-flotantes.ts`, y
 * los dos ya nacen en el mismo filo y a la misma altura— sino cómo se ve lo de
 * dentro. Son dos componentes que no se parecen por debajo: el de Etiquetas es
 * un `Command` de cmdk con sus grupos, y el de Etapas una lista de botones. Cada
 * uno traía su sangrado, su redondeo y su forma de marcar lo puesto, así que
 * abiertos uno tras otro se leían como dos pantallas.
 *
 * # La sangría de más era el `p-1` del grupo
 *
 * Medido: la fila de Etiquetas arrancaba en **20 px** del borde del panel
 * —8 del relleno del panel (`RELLENO_DEL_MENU`), **4 del `p-1` que
 * `CommandGroup` mete por su cuenta** y 8 de la fila— y la de Etapas en **16**,
 * que son los mismos 8 + 8 sin nada en medio. Cuatro píxeles no se ven mirando
 * una sola; se ven al pasar de una a la otra.
 *
 * El grupo deja de meter sangría (`GRUPO_SIN_SANGRIA`) y el rótulo de Etapas
 * gana la que le faltaba (`SANGRIA_DEL_MENU`), así que **las filas y los rótulos
 * de los dos arrancan en el mismo píxel**.
 *
 * # El nombre va en MAYÚSCULA, y con CSS
 *
 * `uppercase` es `text-transform`, así que el nombre guardado no se toca: el
 * `textContent` sigue siendo el de verdad. Eso importa por dos cosas —cmdk filtra
 * por ese texto, así que buscar «ventas» sigue encontrando «Ventas»; y el globo
 * (`title`) enseña el nombre tal cual se escribió—. Convertirlo en el servidor
 * rompería las dos.
 *
 * Y por eso el globo deja de ser opcional: en mayúscula el mismo nombre ocupa
 * más, así que se recorta antes. **Todo nombre en mayúscula lleva su `title`.**
 *
 * # Lo que NO entra aquí
 *
 * Las píldoras de la lista de chats —estado, etapa, etiquetas— se quedan con su
 * capitalización. Y el combobox de Etiquetas lo pintan además el CRM y
 * `/sessions`: allí nada de esto se aplica, igual que no se les mueve el panel
 * (ver `panel` en `SessionTagsCombobox`). Lo que marca «esta es la de la
 * cabecera» es esa misma prop, y no una segunda condición.
 */

/**
 * El sangrado horizontal COMÚN de lo que vive dentro de estos menús: una fila y
 * el rótulo que la encabeza. Es el de la casa (`px-2`, el de `CommandItem`,
 * `DropdownMenuItem` y `SelectItem`), no un número nuevo.
 */
export const SANGRIA_DEL_MENU = "px-2";

/**
 * Un grupo no mete sangría propia: la fila arranca donde acaba el relleno del
 * panel, igual que en el menú que no tiene grupos. Se le quita solo la
 * horizontal —su `py-1` separa el grupo de su rótulo y eso sí hace falta—.
 */
export const GRUPO_SIN_SANGRIA = "px-0";

/**
 * El rótulo que encabeza un grupo de filas: el mismo en los dos.
 *
 * Los dos menús lo pintan de formas distintas —el de Etapas es un `<p>` y el de
 * Etiquetas lo pinta **cmdk**, que no deja ponerle clases a ese nodo— así que la
 * lista está escrita DOS veces: una suelta y otra con el prefijo de variante.
 *
 * **No se pueden componer en tiempo de ejecución.** Tailwind lee el código
 * fuente, así que una clase construida con un `map` no se genera y el rótulo
 * saldría sin estilo, con el build en verde. Es la familia de `removeConsole`.
 * Que las dos digan lo mismo lo comprueba el banco, derivando una de la otra.
 */
export const ROTULO_DEL_MENU =
    "px-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground";

/** El MISMO rótulo cuando lo pinta cmdk. Escrito a mano y probado contra el de arriba. */
export const ROTULO_EN_EL_GRUPO =
    "[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:text-xs " +
    "[&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase " +
    "[&_[cmdk-group-heading]]:tracking-wide [&_[cmdk-group-heading]]:text-muted-foreground";

/**
 * La caja de una fila, la misma en los dos. `rounded-sm` es el de la casa
 * —`CommandItem`, `DropdownMenuItem` y `SelectItem` lo llevan—; la de Etapas iba
 * en `rounded-md` y era la única.
 */
export const FILA_DEL_MENU = "rounded-sm px-2 py-1.5 text-xs";

/**
 * El nombre de una etiqueta o de una etapa: en mayúscula sostenida y recortado
 * con «…» cuando no cabe. Va con su `title`, que es lo único que conserva el
 * nombre entero.
 */
export const NOMBRE_EN_LA_FILA = "truncate uppercase";

/**
 * La fila PUESTA del menú de Etapas: un gris suave y nada más. Sin chulito
 * —lo pedido— y sin recuadro: un borde dentro de una lista de filas de 12 px se
 * lee como un recorte, no como una marca.
 *
 * Va con `font-medium`, y no es decoración. `--muted` y `--accent` son el MISMO
 * valor en este tema, así que el gris de lo puesto y el del cursor encima son
 * indistinguibles: mientras se apunta a otra fila habría dos grises. El peso es
 * lo que sigue diciendo cuál está puesta, y por eso no se puede quitar.
 *
 * Y el gris **no se pierde al apuntarlo**: el `hover` de la fila es ese mismo
 * gris, así que pasar el cursor por encima de la puesta no le cambia nada.
 */
export const FILA_PUESTA = "bg-muted font-medium";
