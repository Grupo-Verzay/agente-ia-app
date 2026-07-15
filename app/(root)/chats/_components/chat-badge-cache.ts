// Caché local (localStorage) del ÚLTIMO conteo conocido de los badges/contadores
// del header del chat (registros, seguimientos, citas, etc.), por sesión.
//
// Al abrir un chat, esos contadores salen de varias consultas al servidor (hasta 5
// en paralelo), así que el número aparecía un instante DESPUÉS de los mensajes.
// Con este caché mostramos el último valor conocido AL INSTANTE mientras las
// consultas reales refrescan en 2º plano —mismo patrón que el caché de mensajes—.
//
// Es solo un número por sesión (dato no sensible). Best-effort: si localStorage no
// está disponible, devuelve 0 / no escribe, y el badge simplemente carga como antes.

const PREFIX = "chat-badge:";

export function readBadgeCount(key: string): number {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    const n = raw === null ? 0 : Number(raw);
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

export function writeBadgeCount(key: string, count: number): void {
  try {
    localStorage.setItem(PREFIX + key, String(Math.max(0, Math.floor(count))));
  } catch {
    // best-effort
  }
}
