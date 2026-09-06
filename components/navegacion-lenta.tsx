"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

/**
 * Cuánto tarda cambiar de página, medido desde el clic.
 *
 * "Cambio de pestaña y tarda muchísimo" no se puede diagnosticar sin saber
 * cuánto, desde dónde y hacia dónde. Aquí se anota el instante del último clic
 * en un enlace interno y, cuando la ruta cambia, se compara. Si pasa del
 * umbral sale un aviso con las dos rutas y los milisegundos.
 *
 * Es `console.warn` a propósito: `log` y `debug` los borra el build (ver la
 * regla de `removeConsole` en CLAUDE.md).
 */
const UMBRAL_MS = 1500;

export function NavegacionLenta() {
  const pathname = usePathname();
  const ultimoClic = useRef<{ en: number; hacia: string; desde: string } | null>(null);
  const rutaAnterior = useRef(pathname);

  useEffect(() => {
    const alPulsar = (evento: MouseEvent) => {
      const enlace = (evento.target as Element | null)?.closest?.("a[href]");
      const href = enlace?.getAttribute("href");
      if (!href || !href.startsWith("/")) return;
      ultimoClic.current = { en: performance.now(), hacia: href, desde: window.location.pathname };
    };
    document.addEventListener("pointerdown", alPulsar, true);
    return () => document.removeEventListener("pointerdown", alPulsar, true);
  }, []);

  useEffect(() => {
    if (pathname === rutaAnterior.current) return;
    rutaAnterior.current = pathname;

    const clic = ultimoClic.current;
    ultimoClic.current = null;
    if (!clic) return;

    const tardo = Math.round(performance.now() - clic.en);
    if (tardo > UMBRAL_MS) {
      console.warn("[app] cambiar de pagina tardo", {
        desde: clic.desde,
        hacia: pathname,
        tardoMs: tardo,
      });
    }
  }, [pathname]);

  return null;
}
