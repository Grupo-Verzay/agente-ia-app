'use client'

import { useEffect } from "react";

export function ChunkRecovery() {
    useEffect(() => {
        const handler = (e: PromiseRejectionEvent) => {
            const msg = String(e?.reason?.message || "");
            const name = String(e?.reason?.name || "");
            if (name === "ChunkLoadError" || /Loading chunk \d+ failed/i.test(msg)) {
                // Limpia caches (SW + CacheStorage) y recarga dura
                (async () => {
                    try {
                        if ("caches" in window) {
                            const keys = await caches.keys();
                            await Promise.all(keys.map(k => caches.delete(k)));
                        }
                        if ("serviceWorker" in navigator) {
                            const regs = await navigator.serviceWorker.getRegistrations();
                            await Promise.all(regs.map(r => r.unregister()));
                        }
                    } finally {
                        window.location.reload();
                    }
                })();
            }
        };
        window.addEventListener("unhandledrejection", handler);
        return () => window.removeEventListener("unhandledrejection", handler);
    }, []);
    return null;
}
