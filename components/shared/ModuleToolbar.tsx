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
 * # `children` y `left` son la forma VIEJA, y NO colocan nada
 *
 * Los dos caen enteros en el **carril del medio**, así que dentro manda el
 * orden en que esté escrito el JSX y no la regla de la barra. De ahí salieron
 * los dos desórdenes de `/sessions`: las pastillas de conteo escritas antes que
 * el buscador **salían antes**, y «Exportar CSV» —que no es un filtro— se
 * quedaba suelto en medio de la fila.
 *
 * Por eso ahora esto pasa también `buscador` y `secundarias`. Una pantalla con
 * buscador usa el hueco: metido en `children` se desplaza con los filtros y se
 * va de la pantalla, que es justo lo que el buscador no puede hacer.
 */
type ModuleToolbarProps = {
  /** Forma vieja: todo junto, en el carril. No coloca nada — ver arriba. */
  children?: ReactNode;
  /** Lo mismo que `children`, con otro nombre. Tampoco coloca. */
  left?: ReactNode;
  /** El campo de buscar. Fijo y el primero de la fila. */
  buscador?: ReactNode;
  /** Exportar, refrescar: lo que no acota la lista. Pegado al botón de crear. */
  secundarias?: ReactNode;
  /** El botón de crear. Va pegado a la derecha, justo antes del `⋯`. */
  right?: ReactNode;
  /** El `⋯` de acciones masivas, en la esquina. */
  acciones?: ReactNode;
  className?: string;
};

export function ModuleToolbar({
  children,
  left,
  buscador,
  secundarias,
  right,
  acciones,
  className,
}: ModuleToolbarProps) {
  return (
    <BarraDeAcciones
      buscador={buscador}
      filtros={children ?? left}
      secundarias={secundarias}
      crear={right}
      acciones={acciones}
      className={className}
    />
  );
}
