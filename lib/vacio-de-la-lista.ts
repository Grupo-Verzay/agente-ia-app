/**
 * Como se pinta la lista de Chats cuando ningun chat casa por nombre o numero.
 *
 * Con un texto que tambien se busca DENTRO de los mensajes, debajo va la
 * seccion «En mensajes». Si el aviso de vacio ocupa el alto entero de la
 * lista (centrado), empuja esos resultados al fondo y deja un hueco en blanco
 * arriba: parece que no hay coincidencias. En ese caso el aviso es COMPACTO,
 * pegado arriba, y los resultados salen justo debajo.
 *
 * Sin busqueda en mensajes no hay nada debajo, y el aviso se queda centrado
 * como siempre.
 */
import { seBuscaEnLosMensajes } from "./busqueda-en-mensajes";

export function elVacioEsCompacto(texto: string): boolean {
  return seBuscaEnLosMensajes(texto ?? "");
}

/** Clases del aviso de vacio: centrado a todo el alto, o compacto arriba. */
export function lasClasesDelVacio(compacto: boolean): string {
  return compacto
    ? "flex flex-col items-center gap-1 px-6 pb-2 pt-4 text-center text-muted-foreground"
    : "flex h-full flex-col items-center justify-center gap-2 p-6 text-center text-muted-foreground";
}
