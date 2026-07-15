// Caché ligero (localStorage) de la LISTA de chats del sidebar, para pintarla al
// instante al ENTRAR a /chats mientras el servidor trae la versión fresca (la página
// es force-dynamic: en cada entrada consulta Evolution y eso bloquea el render → el
// loading.tsx mostraba un skeleton gris). Con esto se ve tu última lista de una.
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

const KEY = "chats-sidebar-cache";
const MAX_ROWS = 14;

export function saveSidebarCache(rows: CachedSidebarRow[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(rows.slice(0, MAX_ROWS)));
  } catch {
    // best-effort
  }
}

export function readSidebarCache(): CachedSidebarRow[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as CachedSidebarRow[]) : [];
  } catch {
    return [];
  }
}
