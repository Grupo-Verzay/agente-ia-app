/**
 * El contenedor que desplaza la lista de Chats, escrito UNA vez: lo usan la
 * lista de verdad (`chat-sidebar.tsx`) y la que se pinta desde la caché mientras
 * carga (`CachedSidebar.tsx`). Con dos copias, al cambiar de una a otra la fila
 * saltaría de ancho.
 *
 * `scrollbar-hidden` no es estética: es lo que deja la fila SIMÉTRICA. La barra
 * de desplazamiento de un navegador con barras clásicas (Windows, Linux) ocupa
 * su ancho aunque su pista sea transparente, así que la tarjeta quedaba a 4 px
 * del borde izquierdo de la columna y a 14 (4 + los 10 de la barra) del
 * derecho. Esos 10 px son un hueco muerto a la vista y, en una fila con
 * «Descartado» + «Asignar» + tres contadores + etiquetas, eran justo lo que
 * mandaba la pastilla de etiquetas a otra línea. Se sigue desplazando igual
 * —rueda, trackpad, dedo, teclado—; lo único que se quita es la pista. Medido y
 * protegido en `lib/__tests__/pastillas-de-la-fila.test.mjs`.
 */
export const LISTA_DE_CHATS = "flex-1 overflow-y-auto p-1 scrollbar-hidden";
