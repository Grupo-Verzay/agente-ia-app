'use client'

import { useEffect } from "react";

// Solo auto-recargamos una vez cada MIN_GAP_MS para NO caer en un bucle de recargas
// si el error fuese por un bug real (no un desfase de versión). Si vuelve a fallar
// enseguida, ya no recarga y se muestra el error.
const RECOVERY_KEY = "verzay:last-recovery-reload";
const MIN_GAP_MS = 60000;

function isRecoverable(msg: string, name: string): boolean {
  // 1) Chunk de JS que ya no existe tras un deploy.
  if (name === "ChunkLoadError") return true;
  if (/Loading chunk \d+ failed/i.test(msg)) return true;
  // 2) Desfase de versión de SERVER ACTIONS tras un deploy: la pestaña quedó con el
  //    código viejo y su acción ya no existe en el server nuevo (POST /chats 404) → el
  //    resultado llega `undefined` → "reading 'success'". Next a veces lo reporta como
  //    "Failed to find Server Action". En ambos casos, recargar = tomar el código nuevo.
  if (/Failed to find Server Action/i.test(msg)) return true;
  if (/Cannot read properties of undefined \(reading 'success'\)/i.test(msg)) return true;
  return false;
}

function recover() {
  try {
    const last = Number(sessionStorage.getItem(RECOVERY_KEY) || "0");
    if (Date.now() - last < MIN_GAP_MS) return; // ya recargamos hace poco → no repetir
    sessionStorage.setItem(RECOVERY_KEY, String(Date.now()));
  } catch {
    // si sessionStorage no está disponible, seguimos (mejor recargar que quedar roto)
  }
  void (async () => {
    try {
      if ("caches" in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
      if ("serviceWorker" in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((r) => r.unregister()));
      }
    } finally {
      window.location.reload();
    }
  })();
}

export function ChunkRecovery() {
  useEffect(() => {
    const onRejection = (e: PromiseRejectionEvent) => {
      if (isRecoverable(String(e?.reason?.message || ""), String(e?.reason?.name || ""))) recover();
    };
    const onError = (e: ErrorEvent) => {
      if (isRecoverable(String(e?.message || e?.error?.message || ""), String(e?.error?.name || ""))) {
        recover();
      }
    };
    window.addEventListener("unhandledrejection", onRejection);
    window.addEventListener("error", onError);
    return () => {
      window.removeEventListener("unhandledrejection", onRejection);
      window.removeEventListener("error", onError);
    };
  }, []);
  return null;
}
