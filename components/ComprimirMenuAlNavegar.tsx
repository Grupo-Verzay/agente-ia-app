"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { useSidebar } from "@/components/ui/sidebar";
import { debeComprimirse } from "@/lib/menu-al-navegar";

/**
 * Comprime el menú lateral al entrar a cualquier sección. La regla vive en
 * `lib/menu-al-navegar.ts`. Va dentro del `SidebarProvider` del layout, una
 * sola vez: con un colapsador por pantalla, la que se olvide de montarlo se
 * queda con el menú abierto y la plataforma deja de ser simétrica.
 *
 * El estado del menú se lee por referencia: el efecto depende SOLO de la ruta,
 * así que abrir el menú a mano no lo vuelve a cerrar.
 */
/** El mismo corte que `useIsMobile`: por debajo de 768 px el menú es una hoja. */
function esPantallaDeTelefono(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(max-width: 767px)").matches;
}

export function ComprimirMenuAlNavegar() {
  const pathname = usePathname();
  const { open, setOpen, isMobile } = useSidebar();
  const anteriorRef = useRef<string | null>(null);
  const estadoRef = useRef({ open, setOpen, isMobile });
  estadoRef.current = { open, setOpen, isMobile };

  useEffect(() => {
    const { open: abierto, setOpen: poner, isMobile } = estadoRef.current;
    // `isMobile` nace en falso y se corrige en un efecto del proveedor, que
    // corre DESPUÉS de este (los efectos de los hijos van primero). En el
    // primer pintado de un teléfono se pregunta a la pantalla directamente, o
    // se escribiría la cookie del menú de escritorio sin motivo.
    const esMovil = isMobile || esPantallaDeTelefono();
    const anterior = anteriorRef.current;
    anteriorRef.current = pathname;
    if (debeComprimirse({ anterior, actual: pathname, esMovil, abierto })) poner(false);
  }, [pathname]);

  return null;
}
