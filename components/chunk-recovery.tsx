'use client'

import { useEffect } from "react";

import { cleanCacheBustParam, hardReload, reportarRecargaPrevia } from "@/lib/hard-reload";

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

function recover(motivo: string) {
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
      hardReload(motivo);
    }
  })();
}

export function ChunkRecovery() {
  useEffect(() => {
    // Si venimos de una recuperación, la carga fue bien: se limpia el parámetro
    // para que no quede a la vista ni se propague al compartir el enlace.
    cleanCacheBustParam();
    // Y se cuenta por que se recargo la vez anterior, si fue cosa nuestra. Sin
    // esto, una recarga se lleva la consola por delante y no queda ni rastro:
    // "la App se refresca sola" no se podia comprobar de ninguna forma.
    reportarRecargaPrevia();

    const onRejection = (e: PromiseRejectionEvent) => {
      const mensaje = String(e?.reason?.message || "");
      const nombre = String(e?.reason?.name || "");
      if (isRecoverable(mensaje, nombre)) recover(`promesa rechazada: ${nombre || mensaje}`);
    };
    const onError = (e: ErrorEvent) => {
      const mensaje = String(e?.message || e?.error?.message || "");
      const nombre = String(e?.error?.name || "");
      if (isRecoverable(mensaje, nombre)) {
        recover(`error de la pagina: ${nombre || mensaje}`);
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
