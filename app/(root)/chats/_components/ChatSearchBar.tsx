"use client";

import { useEffect, useMemo } from "react";
import { BuscadorDeLaColumna } from "@/components/shared/BuscadorDeLaColumna";
import { GRUPO_DEL_BUSCADOR, TITULO_DE_LA_COLUMNA } from "@/lib/cabeceras-de-chats";
import { SelectorDeCanal } from "@/components/shared/SelectorDeCanal";
import { getInstanceUiDisplayName } from "@/lib/instance-display-name";

type Channel = {
  instanceName: string;
  displayName?: string | null;
  instanceType?: string | null;
  metaChannel?: string | null;
  linkedUserId?: string;
  company?: string;
};

type ChatSearchBarProps = {
  onClear: () => void;
  onChange: (value: string) => void;
  value: string;
  channels?: Channel[];
  selectedChannel?: string | null;
  channelCounts?: Record<string, number>;
  onChannelChange?: (channel: string | null) => void;
};

export function ChatSearchBar({
  onClear,
  onChange,
  value,
  channels = [],
  selectedChannel,
  channelCounts = {},
  onChannelChange,
}: ChatSearchBarProps) {
  const hasChannels = channels.length > 1;
  /** La suma de las lineas: el mismo total que enseña el chip de la cabecera. */
  const totalCount = Object.values(channelCounts).reduce((a, b) => a + b, 0);

  /**
   * Lineas que tienen chats pero NO tienen fila en el desplegable.
   *
   * «Todos» suma TODAS las lineas que aparecen en los chats; las filas solo
   * salen para las lineas que llegan en `channels` (las `Instancias` de la
   * cuenta y las de las cuentas vinculadas). Cuando una linea trae chats y no
   * esta en esa lista, los numeros no cuadran —«Todos 614» con las filas
   * sumando 469— y esos chats **no se pueden filtrar por ninguna fila**: el
   * filtro no llega a ellos.
   *
   * Se les pinta su propia fila, con el nombre crudo de la linea. Asi la suma
   * siempre cuadra y no queda nada inalcanzable.
   */
  const lineasSinFila = useMemo(
    () =>
      Object.keys(channelCounts).filter(
        (nombre) =>
          (channelCounts[nombre] ?? 0) > 0 &&
          !channels.some((ch) => ch.instanceName === nombre),
      ),
    [channelCounts, channels],
  );

  useEffect(() => {
    if (!hasChannels || lineasSinFila.length === 0) return;
    console.warn("[chats] hay chats de lineas que no estan en el filtro de canales", {
      lineas: lineasSinFila.map((nombre) => ({ linea: nombre, chats: channelCounts[nombre] })),
      lineasDelFiltro: channels.map((ch) => ch.instanceName),
    });
  }, [hasChannels, lineasSinFila, channelCounts, channels]);

  return (
    <div className={GRUPO_DEL_BUSCADOR}>
      {hasChannels ? (
        // El selector es el componente compartido con Correo: el botón, el
        // panel, su título, la fila de «Todos» y una por línea salen de un
        // sitio. La fila de «Todos» lleva la suma de las líneas —el mismo
        // total que el chip azul de la cabecera— y sin número solo cuando
        // todavía no se sabe.
        <SelectorDeCanal
          titulo="Canales"
          ariaLabel="Canal"
          todos={{ etiqueta: "Todos", cuenta: Object.keys(channelCounts).length > 0 ? totalCount : undefined }}
          opciones={[
            ...channels.map((ch) => ({
              valor: ch.instanceName,
              etiqueta: getInstanceUiDisplayName(ch),
              detalle: ch.company,
              // Una linea con cero conversaciones enseña su 0: sin el, la suma
              // de arriba no se puede comprobar a ojo.
              cuenta: channelCounts[ch.instanceName],
            })),
            // Lineas con chats que no estan en `channels`: sin esta fila sus
            // chats se cuentan en «Todos» y no hay forma de filtrarlos.
            ...lineasSinFila.map((nombre) => ({
              valor: nombre,
              etiqueta: nombre,
              detalle: "Linea sin ficha",
              cuenta: channelCounts[nombre],
            })),
          ]}
          valor={selectedChannel ?? null}
          alCambiar={(v) => onChannelChange?.(v)}
        />
      ) : (
        <span className={TITULO_DE_LA_COLUMNA}>Chats</span>
      )}

      <BuscadorDeLaColumna value={value} onChange={onChange} onClear={onClear} ariaLabel="Buscar chats" />
    </div>
  );
}
