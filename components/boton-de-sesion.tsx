'use client';

import { useState } from 'react';
import { Loader2, Power, QrCode } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface BotonDeSesionProps {
  /** Cierra la sesion de WhatsApp de la linea. Devuelve si salio bien. */
  alCerrarSesion: () => Promise<void>;
}

/**
 * El boton verde de "Conectado", que ahora SIRVE para algo: cierra la sesion.
 *
 * Antes no hacia nada util -en Evolution abria el dialogo del QR estando ya
 * conectado, que no sirve para nada, y en Waha estaba apagado del todo-, y a
 * la vez cerrar sesion era la unica forma de cambiar el telefono de una linea
 * sin borrarla. Estaba escondida en el pie de una sola de las dos tarjetas.
 *
 * Al posar el cursor cambia a "Cerrar sesion" y se pone rojo: un boton verde
 * que desvincula el telefono sin avisar es una trampa. En movil no hay cursor,
 * asi que el primer toque abre directamente la confirmacion, que es la que de
 * verdad protege.
 */
export const BotonDeSesion = ({ alCerrarSesion }: BotonDeSesionProps) => {
  const [abierto, setAbierto] = useState(false);
  const [cerrando, setCerrando] = useState(false);

  const confirmar = async () => {
    setCerrando(true);
    try {
      await alCerrarSesion();
      setAbierto(false);
    } finally {
      setCerrando(false);
    }
  };

  return (
    <>
      <Button
        type="button"
        onClick={() => setAbierto(true)}
        className="group w-full bg-green-600 text-white hover:bg-red-600 focus-visible:bg-red-600"
        title="Cerrar la sesión de WhatsApp de esta línea"
      >
        <span className="flex items-center gap-2 group-hover:hidden group-focus-visible:hidden">
          <QrCode className="h-4 w-4" />
          Conectado
        </span>
        <span className="hidden items-center gap-2 group-hover:flex group-focus-visible:flex">
          <Power className="h-4 w-4" />
          Cerrar sesión
        </span>
      </Button>

      <AlertDialog open={abierto} onOpenChange={setAbierto}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Cerrar la sesión de WhatsApp?</AlertDialogTitle>
            <AlertDialogDescription>
              Se desvincula el teléfono de esta línea: desaparece de Dispositivos vinculados y para
              volver a usarla hay que escanear un QR nuevo. El historial, los leads y los
              seguimientos se quedan como están.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="sm:justify-between">
            <AlertDialogCancel disabled={cerrando}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void confirmar();
              }}
              disabled={cerrando}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {cerrando && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              Cerrar sesión
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
