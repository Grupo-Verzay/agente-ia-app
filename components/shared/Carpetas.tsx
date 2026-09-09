'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Folder, FolderOpen, FolderPlus, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import {
  crearCarpetaAction,
  eliminarCarpetaAction,
  listarCarpetasAction,
  moverACarpetaAction,
  renombrarCarpetaAction,
  type Carpeta,
} from '@/actions/carpetas-actions';

/**
 * Carpetas de una pantalla de tarjetas (Proyectos, Diagramas).
 *
 * Todo lo de carpetas vive aquí —el estado, la barra y el menú de mover— para
 * que las dos pantallas se comporten igual sin copiar nada. Si mañana las
 * necesita una tercera, es este hook y estos dos componentes.
 *
 * La carpeta NO filtra en el servidor: la lista de cosas ya viene, y aquí solo
 * se decide cuáles se pintan. Así cambiar de carpeta es instantáneo y no
 * depende de una vuelta de red.
 */
export function useCarpetas(tipo: 'proyecto' | 'diagrama') {
  const [carpetas, setCarpetas] = useState<Carpeta[]>([]);
  const [deCadaCosa, setDeCadaCosa] = useState<Record<string, string>>({});
  const [seleccionada, setSeleccionada] = useState<string | null>(null);

  const recargar = useCallback(async () => {
    const res = await listarCarpetasAction(tipo);
    if (!res.success) {
      // Un fallo mudo aquí se ve como "las carpetas no se guardan".
      console.warn('[carpetas] no se pudieron cargar', { tipo, motivo: res.message });
      return;
    }
    setCarpetas(res.data.carpetas);
    setDeCadaCosa(res.data.deCadaCosa);
  }, [tipo]);

  useEffect(() => { void recargar(); }, [recargar]);

  // Una carpeta que se borró deja de existir: si estaba puesta como filtro, se
  // vuelve a "Todos" en vez de enseñar una lista vacía sin explicación.
  useEffect(() => {
    if (seleccionada && !carpetas.some((c) => c.id === seleccionada)) setSeleccionada(null);
  }, [carpetas, seleccionada]);

  /**
   * Mueve al momento y avisa después: lo que hace uno mismo se pinta ya, y si
   * el servidor dice que no, se devuelve tal cual estaba.
   */
  const mover = useCallback(
    async (itemId: string, carpetaId: string | null) => {
      const antes = deCadaCosa[itemId] ?? null;
      if (antes === carpetaId) return;

      setDeCadaCosa((prev) => {
        const copia = { ...prev };
        if (carpetaId) copia[itemId] = carpetaId;
        else delete copia[itemId];
        return copia;
      });

      const res = await moverACarpetaAction(tipo, itemId, carpetaId);
      if (!res.success) {
        setDeCadaCosa((prev) => {
          const copia = { ...prev };
          if (antes) copia[itemId] = antes;
          else delete copia[itemId];
          return copia;
        });
        toast.error(res.message);
        return;
      }

      const destino = carpetaId ? carpetas.find((c) => c.id === carpetaId)?.nombre : null;
      toast.success(destino ? `Movido a "${destino}".` : 'Se quitó de la carpeta.');
    },
    [carpetas, deCadaCosa, tipo],
  );

  /** ¿Esta cosa se ve con la carpeta que hay puesta? */
  const enLaCarpeta = useCallback(
    (itemId: string) => {
      if (!seleccionada) return true;
      if (seleccionada === SIN_CARPETA) return !deCadaCosa[itemId];
      return deCadaCosa[itemId] === seleccionada;
    },
    [deCadaCosa, seleccionada],
  );

  return { carpetas, deCadaCosa, seleccionada, setSeleccionada, recargar, mover, enLaCarpeta };
}

/** Filtro especial: lo que no está en ninguna carpeta. */
export const SIN_CARPETA = '__sin_carpeta__';

export function BarraDeCarpetas({
  tipo,
  carpetas,
  seleccionada,
  onSeleccionar,
  onCambio,
  cuentaPorCarpeta,
  sueltas,
  className,
}: {
  tipo: 'proyecto' | 'diagrama';
  carpetas: Carpeta[];
  seleccionada: string | null;
  onSeleccionar: (id: string | null) => void;
  /** Algo cambió en el servidor (crear, renombrar, borrar): hay que recargar. */
  onCambio: () => void;
  cuentaPorCarpeta: Record<string, number>;
  /** Cuántas cosas no están en ninguna carpeta. */
  sueltas: number;
  className?: string;
}) {
  const [creando, setCreando] = useState(false);
  const [nombre, setNombre] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [renombrando, setRenombrando] = useState<Carpeta | null>(null);
  const [borrando, setBorrando] = useState<Carpeta | null>(null);

  const crear = async () => {
    setGuardando(true);
    const res = await crearCarpetaAction(tipo, nombre);
    setGuardando(false);
    if (!res.success) return toast.error(res.message);
    setCreando(false);
    setNombre('');
    onCambio();
    onSeleccionar(res.data.id);
  };

  const renombrar = async () => {
    if (!renombrando) return;
    setGuardando(true);
    const res = await renombrarCarpetaAction(renombrando.id, nombre);
    setGuardando(false);
    if (!res.success) return toast.error(res.message);
    setRenombrando(null);
    setNombre('');
    onCambio();
  };

  const eliminar = async () => {
    if (!borrando) return;
    const res = await eliminarCarpetaAction(borrando.id);
    if (!res.success) return toast.error(res.message);
    toast.success(`Se eliminó "${borrando.nombre}". Lo que tenía dentro sigue ahí, suelto.`);
    setBorrando(null);
    onCambio();
  };

  const chip = (activo: boolean) =>
    cn(
      'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors',
      activo
        ? 'border-primary bg-primary/10 font-medium text-primary'
        : 'border-border text-muted-foreground hover:border-primary/50',
    );

  return (
    <>
      <div className={cn('flex flex-wrap items-center gap-1.5', className)}>
        <button type="button" onClick={() => onSeleccionar(null)} className={chip(!seleccionada)}>
          Todas
        </button>

        {carpetas.map((c) => {
          const activo = seleccionada === c.id;
          return (
            <span key={c.id} className={cn(chip(activo), 'pr-1.5')}>
              <button
                type="button"
                onClick={() => onSeleccionar(activo ? null : c.id)}
                className="inline-flex items-center gap-1.5"
              >
                {activo ? <FolderOpen className="h-3.5 w-3.5" /> : <Folder className="h-3.5 w-3.5" />}
                <span className="max-w-[160px] truncate">{c.nombre}</span>
                <span className="tabular-nums opacity-60">{cuentaPorCarpeta[c.id] ?? 0}</span>
              </button>

              {/* Renombrar y eliminar solo quien manda en ella. Sin permiso no
                  sale el botón: enseñar uno que contesta "no autorizado" es
                  peor que no enseñarlo. */}
              {c.puedeGestionar && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className="rounded-full p-0.5 opacity-60 hover:bg-background/60 hover:opacity-100"
                      title={`Opciones de ${c.nombre}`}
                    >
                      <MoreHorizontal className="h-3.5 w-3.5" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    <DropdownMenuItem
                      className="gap-2"
                      onSelect={() => { setRenombrando(c); setNombre(c.nombre); }}
                    >
                      <Pencil className="h-3.5 w-3.5" /> Renombrar
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="gap-2 text-destructive focus:text-destructive"
                      onSelect={() => setBorrando(c)}
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Eliminar carpeta
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </span>
          );
        })}

        {/* "Sueltas" solo cuando hay carpetas Y hay algo fuera: sin carpetas,
            todo está suelto y el chip no distinguiría nada. */}
        {carpetas.length > 0 && sueltas > 0 && (
          <button
            type="button"
            onClick={() => onSeleccionar(seleccionada === SIN_CARPETA ? null : SIN_CARPETA)}
            className={chip(seleccionada === SIN_CARPETA)}
          >
            Sin carpeta
            <span className="tabular-nums opacity-60">{sueltas}</span>
          </button>
        )}

        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 gap-1.5 px-2 text-xs text-muted-foreground"
          onClick={() => { setNombre(''); setCreando(true); }}
        >
          <FolderPlus className="h-3.5 w-3.5" />
          Nueva carpeta
        </Button>
      </div>

      <Dialog
        open={creando || !!renombrando}
        onOpenChange={(abierto) => {
          if (abierto) return;
          setCreando(false);
          setRenombrando(null);
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{renombrando ? 'Renombrar carpeta' : 'Nueva carpeta'}</DialogTitle>
          </DialogHeader>
          <Input
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="ej. Clientes 2026"
            onKeyDown={(e) => e.key === 'Enter' && void (renombrando ? renombrar() : crear())}
            autoFocus
          />
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => { setCreando(false); setRenombrando(null); }}
              disabled={guardando}
            >
              Cancelar
            </Button>
            <Button onClick={() => void (renombrando ? renombrar() : crear())} disabled={guardando}>
              {guardando ? 'Guardando...' : renombrando ? 'Guardar' : 'Crear'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!borrando} onOpenChange={(abierto) => !abierto && setBorrando(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar la carpeta «{borrando?.nombre}»?</AlertDialogTitle>
            <AlertDialogDescription>
              Solo se borra la carpeta. Lo que tenía dentro no se elimina: vuelve a salir suelto.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={eliminar}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/** El botón de una tarjeta para meterla en una carpeta o sacarla. */
export function MoverACarpeta({
  carpetas,
  actual,
  onMover,
  className,
}: {
  carpetas: Carpeta[];
  actual: string | null;
  onMover: (carpetaId: string | null) => void;
  className?: string;
}) {
  const nombreActual = useMemo(
    () => carpetas.find((c) => c.id === actual)?.nombre ?? null,
    [carpetas, actual],
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          className={cn(
            'inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground',
            className,
          )}
          title={nombreActual ? `En "${nombreActual}"` : 'Mover a una carpeta'}
        >
          {actual ? <FolderOpen className="h-3.5 w-3.5" /> : <Folder className="h-3.5 w-3.5" />}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()} className="max-h-[60vh] overflow-y-auto">
        <DropdownMenuLabel>Mover a...</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuRadioGroup
          value={actual ?? SIN_CARPETA}
          onValueChange={(v) => onMover(v === SIN_CARPETA ? null : v)}
        >
          <DropdownMenuRadioItem value={SIN_CARPETA}>Sin carpeta</DropdownMenuRadioItem>
          {carpetas.map((c) => (
            <DropdownMenuRadioItem key={c.id} value={c.id}>
              <span className="truncate">{c.nombre}</span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        {carpetas.length === 0 && (
          <p className="px-2 py-1.5 text-xs text-muted-foreground">
            Todavía no hay carpetas. Créalas arriba.
          </p>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
