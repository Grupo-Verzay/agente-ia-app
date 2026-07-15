"use client";

import { useEffect } from "react";

// Pide al navegador almacenamiento PERSISTENTE para blindar IndexedDB (el caché
// local de chats). Sin esto, el navegador puede EVACUAR el caché:
//   - Bajo presión de disco (poca memoria en el móvil).
//   - Por políticas como el ITP de Safari/iOS, que borra datos de sitios tras
//     ~7 días sin visitarlos.
// Con almacenamiento persistente el caché sobrevive, y reabrir chats sigue siendo
// instantáneo aunque el asesor no entre por varios días.
//
// Es best-effort e idempotente: si el navegador no lo soporta o lo deniega, no
// pasa nada (el caché cae al comportamiento normal, recalentándose desde el
// servidor). Chrome/Android suele concederlo solo cuando el sitio está instalado
// (PWA) o tiene notificaciones concedidas —justo el caso de los asesores—.
export function StoragePersistence() {
  useEffect(() => {
    try {
      const storage = navigator.storage;
      if (!storage?.persist || !storage.persisted) return;
      void storage
        .persisted()
        .then((already) => {
          if (already) return;
          return storage.persist().then(() => undefined);
        })
        .catch(() => {
          // best-effort: si el navegador lo deniega, seguimos sin bloquear nada.
        });
    } catch {
      // navigator.storage no disponible → sin blindaje, pero todo sigue funcionando.
    }
  }, []);

  return null;
}
