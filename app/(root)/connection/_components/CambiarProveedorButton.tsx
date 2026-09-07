'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeftRight, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
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
import { cambiarProveedorAEvolution, cambiarProveedorAWaha } from '@/actions/proveedor-de-linea-actions';

interface Props {
  instanceName: string;
  /** Hacia donde se cambia. La linea (nombre, historial, leads) es la misma. */
  destino: 'waha' | 'evolution';
  /** Con texto, el boton sale apagado y explica por que (p. ej. Evolution sigue conectada). */
  motivoParaNoPoder?: string | null;
  /**
   * En la cabecera de la tarjeta va SOLO el icono, sin etiqueta ni nota: la
   * tarjeta no lleva texto suelto. Lo que hace se lee al posar el cursor y se
   * explica en la confirmacion, que es donde de verdad hace falta.
   */
  soloIcono?: boolean;
}

/**
 * Lo mismo en los dos sentidos, y a proposito.
 *
 * A quien usa la App no le sirve saber si detras hay Evolution o Waha: son
 * nombres de servidores nuestros. Lo unico que le cambia la vida es que se
 * cierra la sesion y hay que volver a escanear el QR. Los nombres de proveedor
 * solo viven en la consola y en el codigo.
 */
const TEXTO = {
  titulo: '¿Cambiar la conexión de esta línea?',
  detalle:
    'Se cierra la sesión de WhatsApp y tendrás que volver a escanear el QR. La línea sigue siendo la misma: conserva su nombre, su historial, sus leads y sus seguimientos.',
  confirmar: 'Cambiar y escanear QR',
  boton: 'Cambiar la conexión de esta línea',
} as const;

/**
 * Cambiar el proveedor de una linea desde su tarjeta. Es un solo viaje al
 * servidor y el boton enseña que esta trabajando mientras dura.
 */
export const CambiarProveedorButton = ({ instanceName, destino, motivoParaNoPoder, soloIcono }: Props) => {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [cambiando, setCambiando] = useState(false);
  const textos = TEXTO;

  const confirmar = async () => {
    setCambiando(true);
    try {
      const res =
        destino === 'waha'
          ? await cambiarProveedorAWaha(instanceName)
          : await cambiarProveedorAEvolution(instanceName);
      if (res.success) {
        toast.success(res.message);
        setAbierto(false);
        router.refresh();
      } else {
        toast.error(res.message);
      }
    } catch (error) {
      console.error('[CambiarProveedorButton]', error);
      toast.error('No se pudo cambiar el proveedor.');
    } finally {
      setCambiando(false);
    }
  };

  return (
    <>
      {soloIcono ? (
        <Button
          size="icon"
          variant="outline"
          className="h-8 w-8"
          onClick={() => setAbierto(true)}
          disabled={Boolean(motivoParaNoPoder)}
          title={motivoParaNoPoder ?? textos.boton}
        >
          {cambiando ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <ArrowLeftRight className="h-4 w-4" />
          )}
        </Button>
      ) : (
        <>
          <Button
            size="sm"
            variant="outline"
            className="w-full"
            onClick={() => setAbierto(true)}
            disabled={Boolean(motivoParaNoPoder)}
            title={motivoParaNoPoder ?? undefined}
          >
            <ArrowLeftRight className="w-4 h-4 mr-1" />
            {textos.boton}
          </Button>
          {motivoParaNoPoder && (
            <p className="text-center text-xs text-muted-foreground">{motivoParaNoPoder}</p>
          )}
        </>
      )}

      <AlertDialog open={abierto} onOpenChange={setAbierto}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{textos.titulo}</AlertDialogTitle>
            <AlertDialogDescription>{textos.detalle}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cambiando}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); void confirmar(); }} disabled={cambiando}>
              {cambiando && <Loader2 className="animate-spin w-4 h-4 mr-1" />}
              {cambiando ? 'Cambiando…' : textos.confirmar}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
