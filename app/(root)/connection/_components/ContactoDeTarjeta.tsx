'use client';

import { ReactNode } from 'react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * El bloque "quien esta conectado" de CUALQUIER tarjeta de Conexion: avatar,
 * nombre y una segunda linea con el dato que lo identifica.
 *
 * Estaba escrito tres veces —la linea de WhatsApp, Llamadas y los canales de
 * credenciales— y cada copia habia elegido su tamaño: la segunda linea iba a
 * 12 px sans en una y a 13 px monoespaciada en otra. Una al lado de la otra se
 * veian disparejas, que es justo lo que se ve en la pantalla.
 *
 * Con un solo componente no pueden separarse otra vez. Si hace falta otra
 * tarjeta, usa esto y no vuelvas a escribir el bloque.
 */
interface ContactoDeTarjetaProps {
  /** Icono del canal dentro del avatar. */
  icono: ReactNode;
  /** Inicial del nombre. Se usa en vez del icono cuando ya hay contacto. */
  inicial?: string | null;
  nombre: string;
  /** Segunda linea: el telefono, el @usuario, la pagina… */
  dato?: ReactNode;
  /** Aun no hay respuesta del servidor: hueco en la segunda linea, no un dato falso. */
  cargando?: boolean;
  /** Fondo del avatar. El verde es de WhatsApp; los demas canales van neutros. */
  fondo?: string;
}

export const ContactoDeTarjeta = ({
  icono,
  inicial,
  nombre,
  dato,
  cargando,
  fondo = 'bg-green-100 text-green-600 dark:bg-green-950/40',
}: ContactoDeTarjetaProps) => (
  <div className="flex items-center gap-3">
    <Avatar className="rounded-lg">
      <AvatarFallback className={`rounded-lg ${fondo}`}>
        {inicial ? inicial : icono}
      </AvatarFallback>
    </Avatar>
    <div className="min-w-0">
      <div className="truncate text-sm font-medium">{nombre}</div>
      {dato ? (
        <div className="truncate font-mono text-[13px] text-muted-foreground">{dato}</div>
      ) : cargando ? (
        <Skeleton className="h-3 w-[110px]" />
      ) : null}
    </div>
  </div>
);
