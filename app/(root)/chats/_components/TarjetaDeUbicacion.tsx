'use client';

import React, { useMemo } from 'react';
import { MapPin, Radio } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ANCHO_DE_LA_NOTA, MARCO_DE_UN_ADJUNTO } from '@/components/shared/NotaDeVoz';
import {
  elEnlaceDelMapa,
  lasCoordenadasEnTexto,
  type Ubicacion,
} from '@/lib/ubicacion-de-whatsapp';
import {
  ALTO_DEL_MAPA,
  ANCHO_DEL_MAPA,
  ATRIBUCION_DEL_MAPA,
  TAMANO_DE_TESELA,
  lasTeselasDelMapa,
} from '@/lib/mapa-de-la-ubicacion';

/**
 * La tarjeta de una ubicación que compartió el contacto (o que mandamos).
 *
 * Tiene la MISMA anatomía que la tarjeta de un documento (`DocumentCard`),
 * porque es lo mismo —un adjunto que se abre fuera—: el marco de un adjunto,
 * el mismo ancho fijo (`ANCHO_DE_LA_NOTA`), la vista previa arriba con el alto
 * de la miniatura de un PDF (150 px) y debajo una línea con icono, título y
 * detalle. Puestas una encima de otra en la conversación, se leen como de la
 * misma familia.
 *
 * Toda la tarjeta es UN enlace que abre el punto en Google Maps, en otra
 * pestaña. El enlace se arma con las coordenadas (`elEnlaceDelMapa`), nunca con
 * el `url` que venga dentro del mensaje: ese lo escribió alguien de fuera.
 *
 * Si las teselas no cargan (sin red hacia OpenStreetMap), queda el fondo con el
 * pin en medio y el texto debajo: la tarjeta sigue diciendo dónde es y se sigue
 * pudiendo abrir, que es lo que importa.
 */
export const TarjetaDeUbicacion: React.FC<{ ubicacion: Ubicacion }> = React.memo(({ ubicacion }) => {
  const { latitud, longitud, nombre, direccion, enVivo } = ubicacion;
  const teselas = useMemo(() => lasTeselasDelMapa(latitud, longitud), [latitud, longitud]);
  const enlace = elEnlaceDelMapa(ubicacion);
  const coordenadas = lasCoordenadasEnTexto(ubicacion);

  const titulo = nombre || (enVivo ? 'Ubicación en vivo' : 'Ubicación');
  // Debajo, lo más útil que haya: la dirección; si no, las coordenadas.
  const detalle = direccion || coordenadas;

  return (
    <div className={cn(MARCO_DE_UN_ADJUNTO, ANCHO_DE_LA_NOTA)} data-tarjeta-de-ubicacion="">
      <a
        href={enlace}
        target="_blank"
        rel="noopener noreferrer"
        className="block bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
        aria-label={`Abrir ${titulo} en el mapa`}
        title="Abrir en Google Maps"
      >
        <div
          className="relative w-full overflow-hidden border-b bg-[#e8e4da] dark:border-gray-600 dark:bg-gray-700"
          style={{ height: ALTO_DEL_MAPA, maxWidth: ANCHO_DEL_MAPA }}
          data-mapa=""
        >
          {teselas.map((t) => (
            // Teselas de 256 px colocadas respecto al CENTRO de la caja: si la
            // caja se estrecha, el punto sigue en medio. `next/image` no sirve
            // aquí —obligaría a declarar el dominio y no aporta nada a una
            // imagen que ya viene del tamaño exacto—.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={t.url}
              src={t.url}
              alt=""
              aria-hidden="true"
              loading="lazy"
              decoding="async"
              draggable={false}
              referrerPolicy="strict-origin-when-cross-origin"
              className="pointer-events-none absolute max-w-none select-none"
              style={{
                width: TAMANO_DE_TESELA,
                height: TAMANO_DE_TESELA,
                left: `calc(50% + ${t.dx}px)`,
                top: `calc(50% + ${t.dy}px)`,
              }}
            />
          ))}
          {/* El pin: la punta cae EXACTAMENTE en el punto (el centro de la caja). */}
          <span
            className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-full"
            data-pin=""
          >
            <MapPin className="h-8 w-8 fill-red-500 text-white drop-shadow" strokeWidth={1.5} />
          </span>
          <span className="pointer-events-none absolute bottom-0 right-0 bg-white/80 px-1 text-[9px] leading-tight text-gray-600">
            {ATRIBUCION_DEL_MAPA}
          </span>
        </div>

        <div className="flex items-center gap-2 p-3">
          {enVivo ? (
            <Radio className="h-5 w-5 flex-shrink-0 text-red-500 dark:text-red-400" />
          ) : (
            <MapPin className="h-5 w-5 flex-shrink-0 text-red-500 dark:text-red-400" />
          )}
          <span className="min-w-0 flex-1">
            <span
              className="block truncate text-sm font-medium text-gray-900 dark:text-gray-100"
              title={titulo}
            >
              {titulo}
            </span>
            <span className="block truncate text-xs text-gray-500 dark:text-gray-400" title={detalle}>
              {detalle}
            </span>
          </span>
        </div>
      </a>
    </div>
  );
});

TarjetaDeUbicacion.displayName = 'TarjetaDeUbicacion';
