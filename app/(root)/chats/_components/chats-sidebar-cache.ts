// Caché ligero (localStorage) de la LISTA de chats del sidebar y de la FORMA de su
// barra, para pintar las dos al instante al ENTRAR a /chats mientras el servidor
// trae la versión fresca (la página es force-dynamic: en cada entrada consulta
// Evolution y eso bloquea el render → el loading.tsx mostraba un skeleton gris).
//
// Solo se guarda lo mínimo para el "puente" visual (nombre, avatar, hora, último
// mensaje) de los primeros chats. Best-effort: si localStorage falla, se cae al
// skeleton normal.

export type CachedSidebarRow = {
  name: string;
  avatarSrc?: string;
  timestamp?: string;
  lastMessage?: string;
};

/**
 * Qué piezas lleva la barra de esta cuenta.
 *
 * La estructura de la barra **no puede cambiar delante de quien mira**: se
 * pinta desde el primer fotograma y lo único que llega después son los números.
 * Pero tres piezas dependen de la cuenta —el desplegable de líneas, el filtro de
 * etiquetas, el de asesores— y la pestaña «Mías» de si quien mira es asesor; sin
 * saberlo, el puente tendría que adivinar.
 *
 * Así que no se adivina: se recuerda lo que había la última vez. La primera
 * visita de un navegador es la única que puede fallar, y falla en una sola
 * dirección (ver `FORMA_POR_DEFECTO`).
 */
export type FormaDeLaBarra = {
  /** Hay más de una línea → el desplegable «Todos ▾» en vez del título «Chats». */
  canales: boolean;
  /** La cuenta tiene etiquetas → el embudo. */
  etiquetas: boolean;
  /** Se puede filtrar por asesor → el botón de personas. */
  asesores: boolean;
  /** Quien mira es asesor → la pestaña «Mías». */
  mias: boolean;
};

/** Sin nada guardado se pinta la barra completa: ver `FORMA_POR_DEFECTO`. */
export const FORMA_POR_DEFECTO: FormaDeLaBarra = {
  // La barra entera. Es la de casi todas las cuentas con equipo, y sobre todo:
  // de las dos equivocaciones posibles, esta es la buena. Pintar una pieza que
  // luego no está la quita —un hueco que se cierra—; no pintarla obliga a
  // MOVER todo lo demás cuando aparece, que es justo lo que se ve mal.
  canales: true,
  etiquetas: true,
  asesores: true,
  mias: true,
};

const KEY = "chats-sidebar-cache";
const MAX_ROWS = 14;

type Guardado = { filas: CachedSidebarRow[]; forma: FormaDeLaBarra };

export function saveSidebarCache(rows: CachedSidebarRow[], forma: FormaDeLaBarra): void {
  try {
    const guardado: Guardado = { filas: rows.slice(0, MAX_ROWS), forma };
    localStorage.setItem(KEY, JSON.stringify(guardado));
  } catch {
    // best-effort
  }
}

export function readSidebarCache(): Guardado {
  const vacio: Guardado = { filas: [], forma: FORMA_POR_DEFECTO };
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return vacio;
    const parsed = JSON.parse(raw);

    // Lo guardado por la versión anterior era el array pelado. Se acepta: no
    // vale la pena tirar la lista de alguien por haber cambiado el envoltorio.
    if (Array.isArray(parsed)) return { filas: parsed as CachedSidebarRow[], forma: FORMA_POR_DEFECTO };

    if (parsed && typeof parsed === "object") {
      const filas = Array.isArray((parsed as Guardado).filas) ? (parsed as Guardado).filas : [];
      const forma = (parsed as Guardado).forma;
      return {
        filas,
        forma: forma && typeof forma === "object" ? { ...FORMA_POR_DEFECTO, ...forma } : FORMA_POR_DEFECTO,
      };
    }

    return vacio;
  } catch {
    return vacio;
  }
}
