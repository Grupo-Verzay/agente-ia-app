"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type ModuleToolbarProps = {
  children?: ReactNode;
  left?: ReactNode;
  right?: ReactNode;
  className?: string;
};

export function ModuleToolbar({ children, left, right, className }: ModuleToolbarProps) {
  const content = children ?? (
    <>
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">{left}</div>
      <div className="flex shrink-0 items-center gap-2">{right}</div>
    </>
  );

  // Siempre en una sola fila (también en móvil): el buscador ocupa el espacio
  // disponible y las acciones (p. ej. "+ Crear") quedan ancladas a la derecha,
  // alineadas con la barra de búsqueda. Antes se apilaban en <640px, lo que
  // empujaba el botón de crear debajo del buscador.
  return (
    <div className={cn("flex flex-row items-center justify-between gap-2", className)}>
      {content}
    </div>
  );
}
