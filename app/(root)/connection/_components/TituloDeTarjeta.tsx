'use client';

import { ReactNode } from 'react';
import { CardTitle } from '@/components/ui/card';

/**
 * El titulo de CUALQUIER tarjeta de Conexion, con una sola medida.
 *
 * Antes convivian dos escalas y se veian disparejas una al lado de la otra: las
 * tarjetas con linea conectada heredaban el titulo por defecto de `CardTitle`
 * (24 px) con iconos de 16, y las de un canal por conectar lo escribian a mano
 * a 20 px con iconos de 24. Nadie lo decidio: salio de que cada tarjeta se
 * escribio en un momento distinto.
 *
 * Se elige 19 px porque a 24 el titulo mas largo -"Mensajeria WhatsApp (QR)"-
 * se parte en dos lineas en la rejilla de dos columnas.
 *
 * Si hace falta otra tarjeta de canal, se usa esto y no un tamaño a mano.
 */
export const TAMANO_DEL_ICONO = 'h-[21px] w-[21px] shrink-0';

interface TituloDeTarjetaProps {
  /** Icono del canal. Se le aplica el tamaño comun desde aqui. */
  icono: ReactNode;
  children: ReactNode;
}

export const TituloDeTarjeta = ({ icono, children }: TituloDeTarjetaProps) => (
  <CardTitle className="flex min-w-0 items-center gap-2 text-[19px] font-semibold tracking-tight">
    {icono}
    <span className="truncate">{children}</span>
  </CardTitle>
);
