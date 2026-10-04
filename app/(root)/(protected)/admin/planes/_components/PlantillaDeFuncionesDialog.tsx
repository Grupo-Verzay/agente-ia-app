"use client";

import { useEffect, useState } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Loader2, Plus, Search, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  CATEGORIAS_DEL_PLAN,
  TOPE_DEL_NOMBRE,
  TOPE_DE_LA_DESCRIPCION,
  elTutorialQueSeGuarda,
  laLlaveDelNombre,
  sugerirLaFuncion,
} from "@/lib/pagina-de-plan";
import { MODULOS_CON_GUIA, NOMBRE_DE_LA_GUIA, esModuloConGuia } from "@/lib/introduccion-de-la-guia";
import { TOPE_DE_LA_PLANTILLA, type FuncionDeLaPlantilla } from "@/lib/plantilla-de-funciones";

/**
 * La PLANTILLA MAESTRA de funciones: el inventario completo, una vez cada
 * función, que comparten todos los planes de la audiencia. Lo que se escribe
 * aquí —nombre, descripción, categoría, tutorial— llega a todos los planes al
 * guardar; una función nueva entra APAGADA en todos (cada plan la enciende y
 * la destaca en su propio editor), y borrar una la quita de todos.
 *
 * El orden de esta lista es el de las apagadas en el editor de cada plan; el
 * de las encendidas lo decide cada plan.
 */

const SIN_TUTORIAL = "__sin__";
const ENLACE_PROPIO = "__enlace__";

function nuevoId(): string {
  return `f-n${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** «Clientes directos» o «Resellers». */
  titulo: string;
  plantilla: readonly FuncionDeLaPlantilla[];
  /** Cuántos planes tienen encendida cada función, por id. */
  encendidas: Record<string, number>;
  /** Cuántos planes hay en la audiencia. */
  totalDePlanes: number;
  onGuardar: (lista: FuncionDeLaPlantilla[]) => Promise<boolean>;
};

export function PlantillaDeFuncionesDialog({
  open,
  onOpenChange,
  titulo,
  plantilla,
  encendidas,
  totalDePlanes,
  onGuardar,
}: Props) {
  const [lista, setLista] = useState<FuncionDeLaPlantilla[]>([]);
  const [busqueda, setBusqueda] = useState("");
  const [nueva, setNueva] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [aBorrar, setABorrar] = useState<FuncionDeLaPlantilla | null>(null);
  const [conEnlace, setConEnlace] = useState<ReadonlySet<string>>(() => new Set());

  // Al abrir se copia la plantilla: lo que se toque aquí no llega a ningún
  // plan hasta «Guardar».
  useEffect(() => {
    if (!open) return;
    setLista(plantilla.map((f) => ({ ...f })));
    setBusqueda("");
    setNueva("");
    setConEnlace(new Set());
  }, [open, plantilla]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const cambiar = (id: string, patch: Partial<FuncionDeLaPlantilla>) =>
    setLista((l) => l.map((f) => (f.id === id ? { ...f, ...patch } : f)));

  const llave = laLlaveDelNombre(busqueda);
  const filtrando = llave.length > 0;
  const queSeVen = filtrando
    ? lista.filter((f) => laLlaveDelNombre(`${f.nombre} ${f.descripcion}`).includes(llave))
    : lista;

  const yaExiste = (nombre: string) => {
    const k = laLlaveDelNombre(nombre);
    return lista.find((f) => laLlaveDelNombre(f.nombre) === k) ?? null;
  };

  const agregar = () => {
    const nombre = nueva.trim().slice(0, TOPE_DEL_NOMBRE);
    if (!nombre) return;
    const otra = yaExiste(nombre);
    if (otra) {
      setBusqueda(otra.nombre);
      return;
    }
    const sugerida = sugerirLaFuncion(nombre);
    setLista((l) => [
      ...l,
      { id: nuevoId(), nombre, descripcion: "", categoria: sugerida.categoria, tutorial: sugerida.tutorial },
    ]);
    setNueva("");
  };

  const alSoltar = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    setLista((l) => {
      const de = l.findIndex((f) => f.id === active.id);
      const a = l.findIndex((f) => f.id === over.id);
      return de < 0 || a < 0 ? l : arrayMove(l, de, a);
    });
  };

  const repetidas = (() => {
    const vistas = new Set<string>();
    const fuera = new Set<string>();
    for (const f of lista) {
      const k = laLlaveDelNombre(f.nombre);
      if (vistas.has(k)) fuera.add(f.id);
      vistas.add(k);
    }
    return fuera;
  })();
  const vacias = lista.filter((f) => !f.nombre.trim());
  const sePuedeGuardar = repetidas.size === 0 && vacias.length === 0 && !guardando;

  const guardar = async () => {
    if (!sePuedeGuardar) return;
    setGuardando(true);
    try {
      const listo = await onGuardar(
        lista.map((f) => ({ ...f, tutorial: elTutorialQueSeGuarda(f.tutorial, MODULOS_CON_GUIA) })),
      );
      if (listo) onOpenChange(false);
    } finally {
      setGuardando(false);
    }
  };

  const cuantas = aBorrar ? encendidas[aBorrar.id] ?? 0 : 0;

  return (
    <>
      <Dialog open={open} onOpenChange={(v) => !guardando && onOpenChange(v)}>
        <DialogContent className="sm:max-w-2xl" data-plantilla-de-funciones>
          <DialogHeader>
            <DialogTitle>Plantilla de funciones · {titulo}</DialogTitle>
          </DialogHeader>

          <p className="text-xs text-muted-foreground">
            El inventario completo de funciones de los {totalDePlanes} planes. Lo que escribas aquí llega a
            todos al guardar. Una función nueva entra apagada en todos los planes: se enciende y se destaca
            en cada plan.
          </p>

          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar función"
              className="h-8 pl-8 text-xs"
              aria-label="Buscar en la plantilla"
              data-buscar-en-la-plantilla
            />
          </div>

          {filtrando && (
            <p className="text-[11px] text-muted-foreground">Con una búsqueda puesta no se reordena: quítala para arrastrar.</p>
          )}

          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={alSoltar}>
            <SortableContext items={queSeVen.map((f) => f.id)} strategy={verticalListSortingStrategy}>
              <ul className="space-y-2" data-lista-de-la-plantilla>
                {queSeVen.map((f) => (
                  <FilaDeLaPlantilla
                    key={f.id}
                    funcion={f}
                    arrastrable={!filtrando}
                    repetida={repetidas.has(f.id)}
                    encendidaEn={encendidas[f.id] ?? 0}
                    totalDePlanes={totalDePlanes}
                    conEnlace={conEnlace.has(f.id)}
                    onEnlace={(si) =>
                      setConEnlace((s) => {
                        const n = new Set(s);
                        if (si) n.add(f.id);
                        else n.delete(f.id);
                        return n;
                      })
                    }
                    onCambiar={(patch) => cambiar(f.id, patch)}
                    onBorrar={() => setABorrar(f)}
                  />
                ))}
              </ul>
            </SortableContext>
          </DndContext>
          {filtrando && queSeVen.length === 0 && (
            <p className="text-xs text-muted-foreground">Ninguna función se llama así.</p>
          )}

          <div className="flex gap-2">
            <Input
              value={nueva}
              maxLength={TOPE_DEL_NOMBRE}
              onChange={(e) => setNueva(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  agregar();
                }
              }}
              placeholder="Nueva función (llega apagada a todos los planes)"
              className="h-8 text-xs"
              aria-label="Nueva función de la plantilla"
              data-nueva-de-la-plantilla
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 gap-1 text-xs"
              onClick={agregar}
              disabled={!nueva.trim() || lista.length >= TOPE_DE_LA_PLANTILLA}
              data-agregar-a-la-plantilla
            >
              <Plus className="h-3.5 w-3.5" />
              Agregar
            </Button>
          </div>
          {nueva.trim() && yaExiste(nueva) && (
            <p className="text-[11px] text-amber-600 dark:text-amber-400">
              Ya existe «{yaExiste(nueva)?.nombre}»: pulsa Agregar para buscarla.
            </p>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={guardando}>
              Cancelar
            </Button>
            <Button onClick={guardar} disabled={!sePuedeGuardar} data-guardar-la-plantilla>
              {guardando ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={aBorrar !== null} onOpenChange={(v) => !v && setABorrar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Quitar «{aBorrar?.nombre}» de la plantilla?</AlertDialogTitle>
            <AlertDialogDescription>
              {cuantas > 0
                ? `Está encendida en ${cuantas} ${cuantas === 1 ? "plan" : "planes"}: al guardar desaparece de todos, también de su página y de su tarjeta en la landing.`
                : "No está encendida en ningún plan. Al guardar desaparece de la plantilla y de todos los planes."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Volver</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const id = aBorrar?.id;
                if (id) setLista((l) => l.filter((f) => f.id !== id));
                setABorrar(null);
              }}
              data-confirmar-quitar-de-la-plantilla
            >
              Quitar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function FilaDeLaPlantilla({
  funcion: f,
  arrastrable,
  repetida,
  encendidaEn,
  totalDePlanes,
  conEnlace,
  onEnlace,
  onCambiar,
  onBorrar,
}: {
  funcion: FuncionDeLaPlantilla;
  arrastrable: boolean;
  repetida: boolean;
  encendidaEn: number;
  totalDePlanes: number;
  conEnlace: boolean;
  onEnlace: (si: boolean) => void;
  onCambiar: (patch: Partial<FuncionDeLaPlantilla>) => void;
  onBorrar: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: f.id,
    disabled: !arrastrable,
  });
  const t = (f.tutorial ?? "").trim();
  const esEnlace = conEnlace || /^https?:\/\//i.test(t);
  const valorDelTutorial = esEnlace ? ENLACE_PROPIO : esModuloConGuia(t) ? t : SIN_TUTORIAL;

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }}
      className="rounded-md border border-border p-2"
      data-funcion-de-la-plantilla={f.id}
    >
      <div className="flex items-center gap-1.5">
        {arrastrable ? (
          <button
            type="button"
            className="cursor-grab touch-none p-1 text-muted-foreground/60 hover:text-foreground"
            title="Arrastrar para reordenar"
            aria-label={`Arrastrar ${f.nombre} para reordenar`}
            {...attributes}
            {...listeners}
          >
            <GripVertical className="h-4 w-4" />
          </button>
        ) : (
          <span className="w-6 shrink-0" aria-hidden />
        )}
        <Input
          value={f.nombre}
          maxLength={TOPE_DEL_NOMBRE}
          onChange={(e) => onCambiar({ nombre: e.target.value })}
          className="h-8 flex-1 text-xs"
          aria-label="Nombre de la función"
          data-nombre-en-la-plantilla
        />
        <span
          className="shrink-0 whitespace-nowrap text-[11px] text-muted-foreground"
          title="En cuántos planes está encendida"
          data-encendida-en
        >
          {encendidaEn}/{totalDePlanes}
        </span>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="h-7 w-7 shrink-0"
          onClick={onBorrar}
          title="Quitar de la plantilla"
          aria-label={`Quitar ${f.nombre} de la plantilla`}
          data-quitar-de-la-plantilla
        >
          <Trash2 className="h-3.5 w-3.5 text-destructive" />
        </Button>
      </div>
      {repetida && (
        <p className="mt-1 pl-7 text-[11px] text-amber-600 dark:text-amber-400">
          Otra función se llama igual: cambia uno de los dos nombres.
        </p>
      )}
      {!f.nombre.trim() && (
        <p className="mt-1 pl-7 text-[11px] text-amber-600 dark:text-amber-400">Escribe el nombre o quítala.</p>
      )}
      <div className="mt-2 grid grid-cols-1 gap-2 pl-7 sm:grid-cols-2">
        <Select value={f.categoria} onValueChange={(v) => onCambiar({ categoria: v })}>
          <SelectTrigger className="h-8 text-xs" aria-label="Categoría">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CATEGORIAS_DEL_PLAN.map((c) => (
              <SelectItem key={c.slug} value={c.slug} className="text-xs">
                {c.nombre}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={valorDelTutorial}
          onValueChange={(v) => {
            if (v === ENLACE_PROPIO) {
              onEnlace(true);
              if (!/^https?:\/\//i.test(t)) onCambiar({ tutorial: "" });
              return;
            }
            onEnlace(false);
            onCambiar({ tutorial: v === SIN_TUTORIAL ? null : v });
          }}
        >
          <SelectTrigger className="h-8 text-xs" aria-label="Tutorial">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={SIN_TUTORIAL} className="text-xs">Sin tutorial</SelectItem>
            {MODULOS_CON_GUIA.map((m) => (
              <SelectItem key={m} value={m} className="text-xs">
                Guía de {NOMBRE_DE_LA_GUIA[m]}
              </SelectItem>
            ))}
            <SelectItem value={ENLACE_PROPIO} className="text-xs">Enlace propio…</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="mt-2 space-y-2 pl-7">
        <Input
          value={f.descripcion}
          maxLength={TOPE_DE_LA_DESCRIPCION}
          onChange={(e) => onCambiar({ descripcion: e.target.value })}
          placeholder="Una línea que la explique (opcional)"
          className="h-8 text-xs"
          aria-label="Descripción de la función"
        />
        {esEnlace && (
          <Input
            value={t}
            onChange={(e) => onCambiar({ tutorial: e.target.value })}
            placeholder="https://www.youtube.com/watch?v=…"
            className="h-8 text-xs"
            aria-label="Enlace del tutorial"
          />
        )}
      </div>
    </li>
  );
}
