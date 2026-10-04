"use client";

import { useState } from "react";
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
import { AlertTriangle, GripVertical, Lock, Plus, Search, Star, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  CATEGORIAS_DEL_PLAN,
  CATEGORIA_CAPACIDAD,
  DATOS_QUE_SE_PUEDEN_USAR,
  TOPE_DE_FUNCIONES,
  TOPE_DEL_NOMBRE,
  TOPE_DE_LA_DESCRIPCION,
  elEnlaceDelTutorialNoSirve,
  laLlaveDelNombre,
  lasFuncionesDestacadas,
  losAvisosDelTexto,
  sugerirLaFuncion,
  type DatosDelPlan,
  type FuncionDelPlan,
} from "@/lib/pagina-de-plan";
import { MODULOS_CON_GUIA, NOMBRE_DE_LA_GUIA, esModuloConGuia } from "@/lib/introduccion-de-la-guia";
import { enElOrdenDeLaPlantilla, type FuncionDeLaPlantilla } from "@/lib/plantilla-de-funciones";

/**
 * Las funciones de un plan, una por fila: el interruptor, la estrella, el
 * nombre, su categoría, una línea que la explica y su tutorial. Se ordenan
 * arrastrando por el asa, como toda lista reordenable de la plataforma, y ese
 * orden ES el de las tarjetas de «Qué incluye» en la página del plan: una por
 * función, sin agrupar por categoría.
 *
 * Son DOS mandos y no se pisan:
 *
 * - **El interruptor** dice si el plan la trae. Apagada no sale en NINGUNA
 *   parte: ni en la página del plan, ni en la tarjeta de la landing.
 * - **La estrella** dice si, además, sale en la tarjeta CORTA de la landing.
 *   Quitarla de la tarjeta no la quita del plan: la página de detalle las
 *   enseña todas. Con la función apagada la estrella se apaga también —lo
 *   que el plan no trae no se anuncia—, y al volver a encenderla recupera la
 *   marca que tenía.
 *
 * Lo que la página NO va a enseñar —una función que contradice al plan— se
 * dice en la propia fila, con el motivo.
 *
 * **Con `plantilla`** (el caso de siempre en el panel) el plan ve el
 * inventario ENTERO de la plantilla maestra, en dos grupos: arriba sus
 * encendidas, en su orden y arrastrables; debajo las apagadas, en el orden de
 * la plantilla y con buscador. Encender una la pone al final de las
 * encendidas. Los textos de una función de la plantilla —nombre, descripción,
 * categoría, tutorial— se editan en la plantilla y llegan a todos los planes;
 * aquí se ven con un candado. Una función que se escribe aquí y la plantilla
 * no tiene entra en la plantilla al guardar, apagada en los demás planes.
 */

const SIN_TUTORIAL = "__sin__";
const ENLACE_PROPIO = "__enlace__";

function nuevoId(): string {
  return `f-n${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

type Props = {
  funciones: FuncionDelPlan[];
  onChange: (funciones: FuncionDelPlan[]) => void;
  datos: DatosDelPlan;
  /** La plantilla maestra de la audiencia del plan. Sin ella, el editor de antes. */
  plantilla?: readonly FuncionDeLaPlantilla[] | null;
  /** Abre la plantilla maestra para editar los textos de una función. */
  onEditarPlantilla?: () => void;
};

export function FuncionesDelPlanEditor({ funciones, onChange, datos, plantilla, onEditarPlantilla }: Props) {
  const conPlantilla = Array.isArray(plantilla);
  const deLaPlantilla = new Set((plantilla ?? []).map((f) => f.id));
  const [nueva, setNueva] = useState("");
  const [busqueda, setBusqueda] = useState("");
  // Las filas que eligieron «Enlace propio» aunque todavía no tengan nada escrito.
  const [conEnlace, setConEnlace] = useState<ReadonlySet<string>>(() => new Set());

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // Con plantilla, lo que se manda va siempre en la forma que guarda el
  // servidor: encendidas en su orden y detrás las apagadas en el de la plantilla.
  const ordenar = (lista: FuncionDelPlan[]) =>
    conPlantilla ? enElOrdenDeLaPlantilla(lista, plantilla ?? []) : lista;

  const cambiar = (id: string, patch: Partial<FuncionDelPlan>) => {
    const antes = funciones.find((f) => f.id === id);
    if (!antes) return;
    const despues = { ...antes, ...patch };
    let lista = funciones.map((f) => (f.id === id ? despues : f));
    if (conPlantilla && patch.activa === true && !antes.activa) {
      // Encender la pone al final de las encendidas, no donde estaba apagada.
      lista = lista.filter((f) => f.id !== id);
      const ultima = lista.reduce((u, f, i) => (f.activa ? i : u), -1);
      lista.splice(ultima + 1, 0, despues);
    }
    onChange(ordenar(lista));
  };

  const quitar = (id: string) => onChange(funciones.filter((f) => f.id !== id));

  const agregar = () => {
    const nombre = nueva.replace(/\s+/g, " ").trim().slice(0, TOPE_DEL_NOMBRE);
    if (!nombre || funciones.length >= TOPE_DE_FUNCIONES) return;
    const yaEsta = funciones.find((f) => laLlaveDelNombre(f.nombre) === laLlaveDelNombre(nombre));
    if (yaEsta) {
      // Ya existe (apagada, casi siempre): se enciende en vez de repetirla.
      if (!yaEsta.activa) cambiar(yaEsta.id, { activa: true });
      setNueva("");
      return;
    }
    const nuevaFuncion: FuncionDelPlan = {
      id: nuevoId(), nombre, descripcion: "", activa: true, destacada: true, ...sugerirLaFuncion(nombre),
    };
    const ultima = funciones.reduce((u, f, i) => (f.activa ? i : u), -1);
    onChange(
      conPlantilla
        ? ordenar([...funciones.slice(0, ultima + 1), nuevaFuncion, ...funciones.slice(ultima + 1)])
        : [...funciones, nuevaFuncion],
    );
    setNueva("");
  };

  const alSoltar = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const desde = funciones.findIndex((f) => f.id === active.id);
    const hasta = funciones.findIndex((f) => f.id === over.id);
    if (desde < 0 || hasta < 0) return;
    onChange(ordenar(arrayMove(funciones, desde, hasta)));
  };

  const filaDe = (f: FuncionDelPlan) => (
    <FilaDeFuncion
      key={f.id}
      funcion={f}
      datos={datos}
      bloqueada={conPlantilla && deLaPlantilla.has(f.id)}
      onEditarPlantilla={onEditarPlantilla}
      arrastrable={!conPlantilla || f.activa}
      conEnlace={conEnlace.has(f.id)}
      onEnlace={(si) =>
        setConEnlace((prev) => {
          const s = new Set(prev);
          if (si) s.add(f.id);
          else s.delete(f.id);
          return s;
        })
      }
      onCambiar={(patch) => cambiar(f.id, patch)}
      onQuitar={() => quitar(f.id)}
    />
  );

  const lasEncendidas = funciones.filter((f) => f.activa);
  const lasApagadas = funciones.filter((f) => !f.activa);
  const llaveBuscada = laLlaveDelNombre(busqueda);
  const apagadasQueSeVen = llaveBuscada
    ? lasApagadas.filter((f) => laLlaveDelNombre(`${f.nombre} ${f.descripcion}`).includes(llaveBuscada))
    : lasApagadas;

  const encendidas = funciones.filter((f) => f.activa).length;
  const enLaTarjeta = lasFuncionesDestacadas(funciones).length;
  const lleno = funciones.length >= TOPE_DE_FUNCIONES;

  return (
    <div className="space-y-2" data-editor-de-funciones>
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-sm font-medium">Funciones del plan</p>
        <p className="text-[11px] text-muted-foreground" data-cuenta-de-funciones>
          {encendidas} encendidas de {funciones.length} · {enLaTarjeta} en la tarjeta
        </p>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Lo que cambies aquí sale tal cual en la página del plan, una tarjeta por función y en este
        orden (arrastra por el asa para cambiarlo): apagar una función la quita del plan entero y
        renombrarla la renombra. La estrella{" "}
        <Star className="inline h-3 w-3 fill-amber-400 text-amber-500" aria-hidden /> decide aparte
        cuáles salen resumidas en la tarjeta de la landing; la página del plan las enseña todas.
        Puedes escribir{" "}
        {DATOS_QUE_SE_PUEDEN_USAR.map((d, i) => (
          <span key={d.clave}>
            <code className="rounded bg-muted px-1">{d.clave}</code>
            {i < DATOS_QUE_SE_PUEDEN_USAR.length - 1 ? " " : ""}
          </span>
        ))}{" "}
        y se cambian por los datos del plan.
      </p>

      {funciones.length === 0 ? (
        <p className="rounded-md border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
          Este plan todavía no tiene funciones.
        </p>
      ) : conPlantilla ? (
        <>
          <p className="pt-1 text-xs font-medium" data-grupo-de-funciones="encendidas">
            Encendidas en este plan ({lasEncendidas.length})
          </p>
          {lasEncendidas.length === 0 ? (
            <p className="rounded-md border border-dashed border-border px-3 py-3 text-center text-xs text-muted-foreground">
              Ninguna encendida: enciende abajo las que trae este plan.
            </p>
          ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={alSoltar}>
              <SortableContext items={lasEncendidas.map((f) => f.id)} strategy={verticalListSortingStrategy}>
                <ul className="space-y-2" data-lista-de-encendidas>
                  {lasEncendidas.map(filaDe)}
                </ul>
              </SortableContext>
            </DndContext>
          )}
          <div className="flex items-center justify-between gap-2 pt-2">
            <p className="text-xs font-medium" data-grupo-de-funciones="apagadas">
              Apagadas, del inventario completo ({lasApagadas.length})
            </p>
            {onEditarPlantilla && (
              <Button type="button" size="sm" variant="ghost" className="h-7 text-xs" onClick={onEditarPlantilla} data-abrir-plantilla>
                Editar plantilla
              </Button>
            )}
          </div>
          {lasApagadas.length > 0 && (
            <div className="relative">
              <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar una función apagada"
                className="h-8 pl-7 text-xs"
                aria-label="Buscar una función apagada"
                data-buscar-apagadas
              />
            </div>
          )}
          {lasApagadas.length === 0 ? (
            <p className="text-[11px] text-muted-foreground">Este plan tiene encendido todo el inventario.</p>
          ) : apagadasQueSeVen.length === 0 ? (
            <p className="text-[11px] text-muted-foreground">Ninguna apagada coincide con «{busqueda}».</p>
          ) : (
            <ul className="space-y-2" data-lista-de-apagadas>
              {apagadasQueSeVen.map(filaDe)}
            </ul>
          )}
        </>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={alSoltar}>
          <SortableContext items={funciones.map((f) => f.id)} strategy={verticalListSortingStrategy}>
            <ul className="space-y-2">{funciones.map(filaDe)}</ul>
          </SortableContext>
        </DndContext>
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
          placeholder={
            lleno
              ? `Tope de ${TOPE_DE_FUNCIONES} funciones`
              : conPlantilla
              ? "Nueva función (entra en la plantilla, apagada en los demás planes)"
              : "Nueva función, p. ej. Agenda de citas"
          }
          disabled={lleno}
          className="h-8 text-xs"
          data-nueva-funcion
        />
        <Button type="button" size="sm" variant="outline" className="h-8 shrink-0 gap-1 text-xs" onClick={agregar} disabled={lleno || !nueva.trim()}>
          <Plus className="h-3.5 w-3.5" /> Agregar
        </Button>
      </div>
    </div>
  );
}

function FilaDeFuncion({
  funcion: f,
  datos,
  bloqueada,
  onEditarPlantilla,
  arrastrable,
  conEnlace,
  onEnlace,
  onCambiar,
  onQuitar,
}: {
  funcion: FuncionDelPlan;
  datos: DatosDelPlan;
  /** De la plantilla: sus textos se editan allí, no aquí. */
  bloqueada: boolean;
  onEditarPlantilla?: () => void;
  arrastrable: boolean;
  conEnlace: boolean;
  onEnlace: (si: boolean) => void;
  onCambiar: (patch: Partial<FuncionDelPlan>) => void;
  onQuitar: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: f.id,
    disabled: !arrastrable,
  });

  const t = (f.tutorial ?? "").trim();
  const esEnlace = conEnlace || /^https?:\/\//i.test(t);
  const valorDelTutorial = esEnlace ? ENLACE_PROPIO : esModuloConGuia(t) ? t : SIN_TUTORIAL;
  const guiaRetirada = !esEnlace && t && !esModuloConGuia(t) ? t : null;

  const avisos = f.activa ? losAvisosDelTexto(`${f.nombre}\n${f.descripcion}`, datos) : [];
  const enlaceMalo = esEnlace && elEnlaceDelTutorialNoSirve(f.tutorial);

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }}
      className={`rounded-md border border-border p-2 ${f.activa ? "" : "bg-muted/40"}`}
      data-funcion={f.id}
      data-activa={f.activa ? "si" : "no"}
      data-destacada={f.activa && f.destacada ? "si" : "no"}
      data-de-la-plantilla={bloqueada ? "si" : "no"}
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
          // Apagada no tiene orden propio: conserva el hueco del asa para que
          // el nombre arranque en la misma columna que el de las encendidas.
          <span className="w-6 shrink-0" aria-hidden />
        )}
        <Switch
          checked={f.activa}
          onCheckedChange={(v) => onCambiar({ activa: v })}
          aria-label={f.activa ? "Apagar función" : "Encender función"}
          title={f.activa ? "Encendida: el plan la trae" : "Apagada: no sale en ninguna parte"}
          data-interruptor-de-funcion
        />
        <button
          type="button"
          onClick={() => onCambiar({ destacada: !f.destacada })}
          disabled={!f.activa}
          aria-pressed={f.activa && f.destacada}
          aria-label={
            !f.activa
              ? "Enciende la función para poder destacarla en la tarjeta"
              : f.destacada
              ? "Quitar de la tarjeta de la landing"
              : "Destacar en la tarjeta de la landing"
          }
          title={
            !f.activa
              ? "Apagada: no sale en la tarjeta"
              : f.destacada
              ? "Sale en la tarjeta de la landing"
              : "No sale en la tarjeta de la landing (sí en la página del plan)"
          }
          className="shrink-0 rounded p-1 transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
          data-destacar-funcion
        >
          <Star
            className={`h-4 w-4 ${f.activa && f.destacada ? "fill-amber-400 text-amber-500" : "text-muted-foreground"}`}
          />
        </button>
        {bloqueada ? (
          <>
            <span
              className={`min-w-0 flex-1 truncate px-1 text-xs ${f.activa ? "font-medium" : "text-muted-foreground"}`}
              title={f.nombre}
              data-nombre-de-funcion
            >
              {f.nombre}
            </span>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-7 w-7 shrink-0"
              onClick={onEditarPlantilla}
              disabled={!onEditarPlantilla}
              title="Se edita en la plantilla de funciones"
              aria-label={`Editar ${f.nombre} en la plantilla de funciones`}
              data-editar-en-la-plantilla
            >
              <Lock className="h-3.5 w-3.5 text-muted-foreground" />
            </Button>
          </>
        ) : (
          <>
            <Input
              value={f.nombre}
              maxLength={TOPE_DEL_NOMBRE}
              onChange={(e) => onCambiar({ nombre: e.target.value })}
              className={`h-8 flex-1 text-xs ${f.activa ? "" : "text-muted-foreground"}`}
              aria-label="Nombre de la función"
              data-nombre-de-funcion
            />
            <Button type="button" size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={onQuitar} title="Quitar función">
              <Trash2 className="h-3.5 w-3.5 text-destructive" />
            </Button>
          </>
        )}
      </div>

      {bloqueada ? (
        <div className="mt-1 space-y-0.5 pl-7 text-[11px] text-muted-foreground" data-textos-de-la-plantilla>
          <p>
            {CATEGORIAS_DEL_PLAN.find((c) => c.slug === f.categoria)?.nombre ?? f.categoria}
            {" · "}
            {esEnlace ? "Enlace propio" : esModuloConGuia(t) ? `Guía de ${NOMBRE_DE_LA_GUIA[t as keyof typeof NOMBRE_DE_LA_GUIA]}` : "Sin tutorial"}
          </p>
          {f.descripcion && <p className="line-clamp-2">{f.descripcion}</p>}
          {avisos.map((a) => (
            <p key={a} className="flex items-start gap-1 text-amber-600 dark:text-amber-400" data-aviso-de-funcion>
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
              <span>No sale en la página: {a}</span>
            </p>
          ))}
        </div>
      ) : (
      <>
      <div className="mt-2 grid grid-cols-1 gap-2 pl-7 sm:grid-cols-2">
        <Select value={f.categoria} onValueChange={(v) => onCambiar({ categoria: v })}>
          <SelectTrigger className="h-8 text-xs" aria-label="Categoría" data-categoria-de-funcion>
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
          <SelectTrigger className="h-8 text-xs" aria-label="Tutorial" data-tutorial-de-funcion>
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
            data-enlace-de-tutorial
          />
        )}
        {f.categoria === CATEGORIA_CAPACIDAD && (
          <p className="text-[11px] text-muted-foreground">
            Va en el resumen de capacidad (créditos, catálogo y asistencia), no en las tarjetas de «Qué incluye».
          </p>
        )}
        {enlaceMalo && (
          <p className="text-[11px] text-amber-600 dark:text-amber-400" data-aviso-de-funcion>
            El enlace tiene que ser una dirección web completa (https://…). Así no se guarda.
          </p>
        )}
        {guiaRetirada && (
          <p className="text-[11px] text-amber-600 dark:text-amber-400" data-aviso-de-funcion>
            La guía «{guiaRetirada}» ya no está publicada: el tutorial no sale.
          </p>
        )}
        {avisos.map((a) => (
          <p key={a} className="flex items-start gap-1 text-[11px] text-amber-600 dark:text-amber-400" data-aviso-de-funcion>
            <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
            <span>No sale en la página: {a}</span>
          </p>
        ))}
      </div>
      </>
      )}
    </li>
  );
}
