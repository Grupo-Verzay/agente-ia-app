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
//
// BLINDAJE:
//  - Cada valor se guarda como "<count>|<timestamp>" para permitir poda LRU.
//    (Compatible hacia atrás: un valor viejo "3" se lee igual, con ts=0.)
//  - MAX_KEYS acota el crecimiento en localStorage; al superarlo, se podan las
//    entradas más antiguas (LRU) hasta ~75% del máximo.
//  - Si localStorage se llena (QuotaExceeded), se poda y se reintenta una vez.
//  - Todo es try/catch: cualquier fallo cae al comportamiento normal (recachear).

const PREFIX = "chat-badge:";
// Cota de llaves. Cada entrada es minúscula (un número + timestamp), así que esto
// mantiene el uso muy por debajo del límite de localStorage con amplio margen.
const MAX_KEYS = 400;

export function readBadgeCount(key: string): number {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (raw === null) return 0;
    const n = Number(raw.split("|")[0]);
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

export function writeBadgeCount(key: string, count: number): void {
  const value = `${Math.max(0, Math.floor(count))}|${Date.now()}`;
  try {
    localStorage.setItem(PREFIX + key, value);
    pruneIfNeeded(false);
  } catch {
    // Probablemente cuota llena → podar agresivo y reintentar una sola vez.
    try {
      pruneIfNeeded(true);
      localStorage.setItem(PREFIX + key, value);
    } catch {
      // best-effort: si aún falla, el badge cargará como antes (sin caché).
    }
  }
}

// Poda LRU: si hay más de MAX_KEYS entradas de badges (o force=true), borra las más
// antiguas hasta dejar ~75% del máximo. Solo toca llaves con nuestro PREFIX.
function pruneIfNeeded(force: boolean): void {
  try {
    const entries: { key: string; ts: number }[] = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith(PREFIX)) continue;
      const raw = localStorage.getItem(k) ?? "";
      const ts = Number(raw.split("|")[1]) || 0;
      entries.push({ key: k, ts });
    }
    if (!force && entries.length <= MAX_KEYS) return;
    const target = Math.floor(MAX_KEYS * 0.75);
    entries.sort((a, b) => a.ts - b.ts); // más antiguas primero
    const toRemove = force ? Math.max(entries.length - target, Math.ceil(entries.length / 2)) : entries.length - target;
    for (let i = 0; i < toRemove && i < entries.length; i += 1) {
      localStorage.removeItem(entries[i].key);
    }
  } catch {
    // best-effort
  }
}
