// Caché local de mensajes en IndexedDB (almacenamiento persistente del navegador).
//
// Objetivo: que reabrir un chat ya visitado sea INSTANTÁNEO y con CERO red, incluso
// después de recargar la página —como WhatsApp, que lee del almacenamiento del
// dispositivo—. El caché en memoria se pierde al recargar; IndexedDB no.
//
// Se guarda solo la PRIMERA página (lo necesario para abrir al instante); el
// scroll-back sigue leyendo del servidor. Por SEGURIDAD NO se persiste apiKeyData
// (la clave de Evolution): el llamador la reinyecta desde el contexto al leer.
//
// Todo es tolerante a fallos: si IndexedDB no está disponible (SSR, modo privado,
// cuota llena), cada función resuelve a null/void sin romper nada y el flujo cae al
// comportamiento normal (leer del servidor).

export type IdbChatValue = {
  messages: unknown[];
  info: Record<string, unknown>;
};

type IdbChatRecord = IdbChatValue & { key: string; updatedAt: number };

const DB_NAME = "agente-chats";
const DB_VERSION = 1;
const STORE = "messages";
// Máx. de chats guardados: poda LRU por updatedAt para acotar el uso de disco.
const MAX_ENTRIES = 250;

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  if (typeof window === "undefined" || typeof indexedDB === "undefined") {
    return Promise.resolve(null);
  }
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          const store = db.createObjectStore(STORE, { keyPath: "key" });
          store.createIndex("updatedAt", "updatedAt");
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

/** Lee la copia local de un chat (o null si no hay / no se pudo). */
export async function idbGetChat(key: string): Promise<IdbChatRecord | null> {
  const db = await openDb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(key);
      req.onsuccess = () => resolve((req.result as IdbChatRecord) ?? null);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

/** Escribe/actualiza la copia local de un chat (best-effort). */
export async function idbSetChat(key: string, value: IdbChatValue): Promise<void> {
  const db = await openDb();
  if (!db) return;
  return new Promise((resolve) => {
    try {
      const record: IdbChatRecord = {
        key,
        messages: value.messages,
        info: value.info,
        updatedAt: Date.now(),
      };
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(record);
      tx.oncomplete = () => {
        resolve();
        void prune();
      };
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    } catch {
      resolve();
    }
  });
}

/** Elimina la copia local de un chat (p. ej. al limpiar la sesión). */
export async function idbDeleteChat(key: string): Promise<void> {
  const db = await openDb();
  if (!db) return;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    } catch {
      resolve();
    }
  });
}

/** Poda LRU: si superamos MAX_ENTRIES, borra las entradas más antiguas. */
async function prune(): Promise<void> {
  const db = await openDb();
  if (!db) return;
  try {
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    const countReq = store.count();
    countReq.onsuccess = () => {
      const excess = countReq.result - MAX_ENTRIES;
      if (excess <= 0) return;
      let removed = 0;
      // El índice updatedAt itera de más viejo a más nuevo (orden ascendente).
      store.index("updatedAt").openCursor().onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
        if (!cursor || removed >= excess) return;
        cursor.delete();
        removed += 1;
        cursor.continue();
      };
    };
  } catch {
    // best-effort
  }
}
