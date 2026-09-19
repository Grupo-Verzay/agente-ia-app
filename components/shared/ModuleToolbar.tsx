"use client";

import type { ReactNode } from "react";
import { BarraDeAcciones } from "@/components/shared/BarraDeAcciones";

/**
 * La barra de un módulo. **Por dentro ya no es una fila propia: es
 * `BarraDeAcciones`.**
 *
 * Esto existía antes que la ley de la barra y lo hacía casi igual —izquierda
 * que crece, derecha fija— pero con tres diferencias que, puestas al lado de
 * Clientes, se veían: `items-end` en vez de centrado, `flex-wrap` en la
 * izquierda —que parte la barra en dos filas en cuanto una pantalla tiene
 * buscador, dos desplegables y cuatro pastillas— y **ningún sitio para el `⋯`**
 * de acciones masivas.
 *
 * Se conserva el nombre porque lo importan quince pantallas y renombrarlo sería
 * un diff de mil líneas que no cambia nada. Lo que cambia es que **la forma la
 * decide un solo componente**: el día que se afine el alto o el hueco, se afina
 * en `BarraDeAcciones` y salen las quince.
 *
 * # `children` es la forma VIEJA, y no coloca nada
 *
 * Con `children` todo cae en la franja de la izquierda, así que un botón de
 * crear escrito ahí se queda **pegado al buscador** en vez de ir a la derecha.
 * Es exactamente el desorden del que viene esta ley. Las pantallas se pasan a
 * `filtros` / `crear` / `acciones`; mientras alguna siga con `children`, al
 * menos comparte el alto y el desplazamiento con las demás.
 */
type ModuleToolbarProps = {
  /** Forma vieja: todo junto. No coloca nada — ver arriba. */
  children?: ReactNode;
  /** Buscador, desplegables y pastillas. */
  left?: ReactNode;
  /** El botón de crear. Va pegado a la derecha, justo antes del `⋯`. */
  right?: ReactNode;
  /** El `⋯` de acciones masivas, en la esquina. */
  acciones?: ReactNode;
  className?: string;
};

export function ModuleToolbar({ children, left, right, acciones, className }: ModuleToolbarProps) {
  return (
    <BarraDeAcciones
      filtros={children ?? left}
      crear={right}
      acciones={acciones}
      className={className}
    />
  );
}
