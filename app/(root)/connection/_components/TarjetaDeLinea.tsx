'use client';

import { ReactNode } from 'react';
import { MessageCircle, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { TAMANO_DEL_ICONO, TituloDeTarjeta } from './TituloDeTarjeta';

/**
 * La tarjeta de la linea de WhatsApp, IGUAL sea cual sea el proveedor.
 *
 * Una cosa es el nombre del canal y otra por donde se conecta. El canal se
 * llama siempre "Mensajeria WhatsApp (QR)"; Evolution y Waha son proveedores y
 * solo se nombran donde se cambia de uno a otro. Antes el titulo cambiaba con
 * el proveedor -"Mensajeria WhatsApp (QR)" con Evolution y "WhatsApp
 * Mensajeria (QR)" con Waha-, dos nombres parecidos para lo mismo, y el cliente
 * no tiene por que saber que hay dos servidores detras.
 *
 * La tarjeta tiene cuatro mandos y ninguno mas:
 *
 *   cabecera: [cambiar de proveedor] [eliminar]
 *   cuerpo:   [estado de la conexion] [Robot]
 *
 * Sin pie y sin bloques de texto: lo que hace cada boton se lee al posarse
 * encima y se confirma en su dialogo. El hueco que quedaba debajo salia de
 * estirar todas las tarjetas de la fila a la altura de la mas alta.
 */
/**
 * La burbuja del titulo, con un punto de color dentro que dice por donde
 * conecta la linea. NO se nombra el servidor: a quien usa la App no le sirve
 * saberlo, y el punto no le estorba. Quien lo necesita, lo lee al posar el
 * cursor.
 */
const BurbujaConPunto = ({ color, titulo }: { color: string; titulo: string }) => (
  <svg
    className={`${TAMANO_DEL_ICONO} text-green-600`}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <title>{titulo}</title>
    <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" />
    <circle cx="12" cy="11.5" r="3" fill={color} stroke="none" />
  </svg>
);

interface TarjetaDeLineaProps {
  /** Nombre visible de la linea (o del perfil de WhatsApp si ya conecto). */
  nombre: string;
  /** Telefono, sin el "+". Vacio mientras no se sabe. */
  numero?: string | null;
  /** Aun no hay respuesta del servidor: se enseña el hueco, no un dato falso. */
  cargando?: boolean;
  /** Texto de estado cuando no hay sesion (detenida, esperando QR...). */
  estado?: string | null;
  /** Icono de flechas. Null si la cuenta no tiene el otro proveedor. */
  cambiarProveedor?: ReactNode;
  alEliminar: () => void;
  /** Boton izquierdo: Conectado / Ver QR / Reconectar. */
  botonDeConexion: ReactNode;
  /** Boton derecho: el Robot. */
  botonDelRobot?: ReactNode;
  /** Por donde conecta la linea. Pinta el punto dentro de la burbuja. */
  proveedor?: 'evolution' | 'waha';
}

export const TarjetaDeLinea = ({
  nombre,
  numero,
  cargando,
  estado,
  cambiarProveedor,
  alEliminar,
  botonDeConexion,
  botonDelRobot,
  proveedor = 'evolution',
}: TarjetaDeLineaProps) => {
  const inicial = nombre.trim().charAt(0).toUpperCase() || '?';

  return (
    <Card className="border-border flex flex-col">
      <CardHeader className="p-4 pb-2">
        <div className="flex items-center justify-between gap-2">
          <TituloDeTarjeta
            icono={
              <BurbujaConPunto
                color={proveedor === 'waha' ? '#16a34a' : '#2563eb'}
                titulo={proveedor === 'waha' ? 'Conexión por Waha' : 'Conexión por Evolution'}
              />
            }
          >
            Mensajería WhatsApp (QR)
          </TituloDeTarjeta>
          <div className="flex shrink-0 items-center gap-2">
            {cambiarProveedor}
            <Button
              variant="destructive"
              size="icon"
              className="h-8 w-8"
              onClick={alEliminar}
              title="Eliminar línea"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="flex flex-col gap-3 p-4 pt-2">
        {/* El nombre de la linea se sabe SIEMPRE -viene de nuestra base-, asi que
            se pinta ya. Solo espera la segunda linea, que es lo unico que
            depende del servidor. Con todo el bloque en hueco, una Evolution
            lenta dejaba una tarjeta sin nada que leer: el fallo mudo de
            siempre. */}
        <div className="flex items-center gap-3">
          <Avatar className="rounded-lg">
            <AvatarFallback className="rounded-lg bg-green-100 text-green-600 dark:bg-green-950/40">
              {numero ? inicial : <MessageCircle className="h-4 w-4" />}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <div className="truncate text-sm font-medium">{nombre}</div>
            {numero ? (
              <div className="truncate font-mono text-[13px] text-muted-foreground">+{numero}</div>
            ) : cargando ? (
              <Skeleton className="h-3 w-[110px]" />
            ) : (
              <div className="truncate text-[13px] text-muted-foreground">
                {estado ?? 'Sin conectar'}
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 items-stretch gap-2 [&_button]:w-full">
          {botonDeConexion}
          {botonDelRobot}
        </div>
      </CardContent>
    </Card>
  );
};
