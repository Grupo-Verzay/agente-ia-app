// Archivar y desarchivar una nota son UN mando con dos caras.
//
// Archivar vivía solo en la barra del editor (el icono de caja) y la acción de
// servidor para deshacerlo (`unarchiveNote`) existía pero no la llamaba
// ninguna pantalla: una nota archivada se quedaba en «Archivo» para siempre.
//
// La regla, para que las dos caras no puedan separarse: el MISMO botón, en el
// MISMO sitio de la barra, dice lo que hará según el estado de la nota, y las
// dos quitan la nota de la lista que se está mirando (archivar la saca de las
// activas; desarchivar, del Archivo) y la cierran.

export type AccionDeArchivo = "archivar" | "desarchivar";

export type MandoDeArchivo = {
  accion: AccionDeArchivo;
  /** El `title` del botón. */
  titulo: string;
  /** Lo que se dice cuando salió bien. */
  aviso: string;
  /** El valor de `isArchived` que queda guardado. */
  quedaArchivada: boolean;
};

export function elMandoDeArchivo(estaArchivada: boolean | null | undefined): MandoDeArchivo {
  return estaArchivada === true
    ? { accion: "desarchivar", titulo: "Desarchivar nota", aviso: "Nota desarchivada", quedaArchivada: false }
    : { accion: "archivar", titulo: "Archivar nota", aviso: "Nota archivada", quedaArchivada: true };
}

/** Sin la nota que acaba de cambiar de lado: la lista que se mira ya no la tiene. */
export function sinLaNota<T extends { id: string }>(notas: T[], id: string): T[] {
  return notas.filter((n) => n.id !== id);
}
