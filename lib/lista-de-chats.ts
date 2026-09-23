/**
 * El contenedor que desplaza la lista de Chats, escrito UNA vez: lo usan la
 * lista de verdad (`chat-sidebar.tsx`) y la que se pinta desde la caché mientras
 * carga (`CachedSidebar.tsx`). Con dos copias, al cambiar de una a otra la fila
 * saltaría de ancho.
 *
 * La barra de desplazamiento se VE, como en todas las listas de la plataforma
 * (#915 la escondió y se devolvió: esta lista no es la excepción). El ancho que
 * se come la barra se recupera en las pastillas de la fila, no aquí — ver
 * `lib/pastillas-de-la-fila.ts`.
 */
export const LISTA_DE_CHATS = "flex-1 overflow-y-auto p-1";
