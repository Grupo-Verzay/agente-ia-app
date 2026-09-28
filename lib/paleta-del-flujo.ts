/**
 * La paleta «Selecciona una acción» del creador de flujos.
 *
 * Es el `Sidebar` de shadcn con `side="right"`, y ese componente nace
 * `fixed inset-y-0 right-0 h-svh`: pegado a la VENTANA y de alto entero. Eso
 * rompía dos cosas a la vez, las dos sin un solo error:
 *
 * 1. Con un panel del borde abierto (chat del equipo, copiloto, nota rápida) la
 *    envoltura del contenido se estrecha para dejarle su franja, pero la paleta
 *    no se movía: seguía clavada al borde de la ventana, justo DEBAJO del panel.
 *    Quedaban a la vista su cabecera —que sube por encima de la barra— y nada
 *    más, y se leía como un panel en blanco.
 * 2. Y tapaba la barra de arriba de la plataforma, que ningún otro panel tapa.
 *
 * Así que se ancla a su contenedor (`absolute`, con el `SidebarProvider` de la
 * página en `relative`) y mide lo que mide él (`h-full`). Con eso es una
 * COLUMNA del contenido, como la lista en Chats: el panel del borde la corre a
 * la izquierda con todo lo demás y queda como tercera columna.
 *
 * `absolute` y `h-full` pisan a `fixed` y `h-svh` porque `cn` es
 * tailwind-merge: son del mismo grupo y gana el que va detrás.
 */
export const PALETA_DEL_FLUJO =
    "absolute h-full bg-white dark:bg-gray-900 text-gray-800 dark:text-zinc-100 border-l border-zinc-200 dark:border-gray-800";
