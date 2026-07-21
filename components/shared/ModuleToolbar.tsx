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
  // disponible y las acciones (p. ej. "+ Crear") quedan ancladas a la derecha.
  // Usamos items-end para que las acciones queden alineadas con la LÍNEA del
  // buscador cuando el lado izquierdo ocupa dos filas (p. ej. en Tareas o
  // Recordatorios, donde arriba va el toggle Lista/Kanban y abajo el buscador);
  // así el botón de crear no queda flotando a media altura. En toolbars de una
  // sola fila el resultado es idéntico a centrado.
  return (
    <div className={cn("flex flex-row items-end justify-between gap-2", className)}>
      {content}
    </div>
  );
}
