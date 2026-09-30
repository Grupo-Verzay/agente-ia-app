'use client';

import * as React from 'react';
import { Loader2, Pencil, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
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
import { laPreguntaDeBorrar } from '@/lib/tabla-de-finanzas';

/**
 * Los botones de UNA fila de cualquier lista de Finanzas, y los de la cabecera
 * de su detalle: los mismos iconos, del mismo tamaño y con su nombre al pasar
 * el ratón.
 *
 * Había cuatro formas: Ventas con un ojo que no hacía nada, un lápiz y una
 * papelera; Gastos con un «⋯» que desplegaba «Editar» y «Eliminar»; Clientes y
 * Proveedores con lápiz y papelera sin nombre; y Cuentas con los tres botones un
 * número más grandes. Y en las cuatro, **la papelera borraba sin preguntar**:
 * un clic que se escapa se llevaba una venta y en la contabilidad no hay
 * papelera de reciclaje.
 *
 * Borrar pregunta SIEMPRE, con el nombre de lo que se va, y no cierra el
 * diálogo hasta que el servidor contesta: un «listo» antes de tiempo es peor
 * que esperar un segundo.
 */
export type AccionExtraDeLaFila = {
  clave: string;
  etiqueta: string;
  icono: React.ReactNode;
  onClick: () => void;
};

export function ConfirmarBorrado({
  abierto,
  alCambiar,
  queEs,
  nombre,
  detalle,
  onConfirmar,
}: {
  abierto: boolean;
  alCambiar: (abierto: boolean) => void;
  /** Qué se borra, con su artículo: «la venta», «el gasto», «la cuenta». */
  queEs: string;
  nombre?: string | null;
  /** Una segunda línea, si hace falta decir algo más que «no se deshace». */
  detalle?: string;
  /** Devuelve si se borró: con `false` el diálogo se queda abierto. */
  onConfirmar: () => Promise<boolean | void> | boolean | void;
}) {
  const [borrando, setBorrando] = React.useState(false);

  const borrar = async () => {
    setBorrando(true);
    try {
      const salio = await onConfirmar();
      if (salio !== false) alCambiar(false);
    } finally {
      setBorrando(false);
    }
  };

  return (
    <AlertDialog open={abierto} onOpenChange={(v) => !borrando && alCambiar(v)}>
      <AlertDialogContent onClick={(e) => e.stopPropagation()} data-confirmar-borrado>
        <AlertDialogHeader>
          <AlertDialogTitle>{laPreguntaDeBorrar(queEs, nombre)}</AlertDialogTitle>
          <AlertDialogDescription>
            {detalle ? `${detalle} ` : ''}Esta acción no se puede deshacer.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={borrando}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              // Sin esto Radix cierra al pulsar y el «Eliminando…» no se ve.
              e.preventDefault();
              void borrar();
            }}
            disabled={borrando}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {borrando ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Eliminando…
              </>
            ) : (
              'Eliminar'
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function BotonDeLaFila({
  etiqueta,
  onClick,
  children,
  destructivo = false,
  disabled,
  tamano,
}: {
  etiqueta: string;
  onClick: () => void;
  children: React.ReactNode;
  destructivo?: boolean;
  disabled?: boolean;
  tamano: 'fila' | 'detalle';
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          size="icon"
          variant={destructivo ? 'destructive' : 'outline'}
          aria-label={etiqueta}
          data-accion-de-fila={etiqueta}
          className={tamano === 'fila' ? 'h-8 w-8' : 'h-9 w-9'}
          disabled={disabled}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation(); // que no abra el detalle de la fila
            onClick();
          }}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{etiqueta}</TooltipContent>
    </Tooltip>
  );
}

export function AccionesDeLaFila({
  queEs,
  nombre,
  onEditar,
  onEliminar,
  extras = [],
  ocupado = false,
  ajena = false,
  tamano = 'fila',
}: {
  /** Qué es la fila, con su artículo: «la venta», «el cliente»… */
  queEs: string;
  /** Su nombre, para la pregunta de borrar. */
  nombre?: string | null;
  onEditar?: () => void;
  /** Borra. Devuelve si salió: con `false`, la confirmación se queda abierta. */
  onEliminar?: () => Promise<boolean | void> | boolean | void;
  extras?: AccionExtraDeLaFila[];
  ocupado?: boolean;
  /**
   * Una fila de otra cuenta se ve y no se toca: las acciones de escritura de
   * Finanzas acotan por la cuenta con la que se llaman, así que el lápiz sobre
   * una fila ajena contestaría «no encontrada».
   */
  ajena?: boolean;
  /** `fila` (8) en una tabla, `detalle` (9) en la cabecera de un detalle. */
  tamano?: 'fila' | 'detalle';
}) {
  const [confirmando, setConfirmando] = React.useState(false);

  if (ajena) return <span className="block text-right text-xs text-muted-foreground">—</span>;

  return (
    <TooltipProvider>
      <div
        className="flex items-center justify-end gap-1"
        data-acciones-de-la-fila
        onClick={(e) => e.stopPropagation()}
      >
        {extras.map((x) => (
          <BotonDeLaFila key={x.clave} etiqueta={x.etiqueta} onClick={x.onClick} disabled={ocupado} tamano={tamano}>
            {x.icono}
          </BotonDeLaFila>
        ))}
        {onEditar ? (
          <BotonDeLaFila etiqueta="Editar" onClick={onEditar} disabled={ocupado} tamano={tamano}>
            <Pencil className="h-4 w-4" />
          </BotonDeLaFila>
        ) : null}
        {onEliminar ? (
          <BotonDeLaFila etiqueta="Eliminar" onClick={() => setConfirmando(true)} destructivo disabled={ocupado} tamano={tamano}>
            <Trash2 className="h-4 w-4" />
          </BotonDeLaFila>
        ) : null}
        {/* Dentro del `div` que corta el clic, aunque se pinte en un portal:
            en React un clic en un portal sube por el árbol de React, así que
            fuera de aquí pulsar «Cancelar» abriría el detalle de la fila. */}
        {onEliminar ? (
          <ConfirmarBorrado
            abierto={confirmando}
            alCambiar={setConfirmando}
            queEs={queEs}
            nombre={nombre}
            onConfirmar={onEliminar}
          />
        ) : null}
      </div>
    </TooltipProvider>
  );
}
