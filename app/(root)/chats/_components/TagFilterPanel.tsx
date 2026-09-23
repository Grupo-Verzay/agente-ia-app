"use client";

import { useState } from "react";
import { CalendarDays, Check, Filter, Search, Tag, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CONTROL_DE_ICONO, GLIFO_DE_CONTROL } from "@/lib/cabeceras-de-chats";
import { usePanelFlotante } from "@/hooks/usePanelFlotante";
import { PANEL_QUE_SE_DESPLAZA, RELLENO_DEL_MENU } from "@/lib/paneles-flotantes";
import { cn } from "@/lib/utils";
import type { SimpleTag } from "@/types/session";
import {
  ATAJOS_DE_RANGO,
  atajoDelRango,
  rangoDelAtajo,
  type AtajoDeRango,
  type CampoDeFecha,
} from "@/lib/rango-de-fechas-chats";

/**
 * El panel del embudo: DOS filtros en un solo sitio.
 *
 * Arriba el **rango de fechas** y debajo las **etiquetas**, con una separación
 * clara entre los dos. El rango vivía antes en el menú «⋯»; se movió aquí para
 * que los dos filtros que recortan la lista por un criterio propio vivan juntos,
 * y para que los campos de fecha tengan sitio de sobra —en el menú se cortaban—.
 *
 * El botón del embudo se marca activo cuando hay **cualquiera** de los dos: un
 * rango puesto o etiquetas elegidas. La insignia con el número sigue siendo de
 * las etiquetas; el rango, al no ser una cuenta, solo enciende el resaltado.
 *
 * # Por qué un `Popover` y no el menú
 *
 * Un `<input type="date">` dentro de un `DropdownMenu` pelea con el buscador por
 * letras del menú y se cierra al abrir el calendario nativo. Un `Popover` no
 * tiene nada de eso: es el sitio natural para inputs.
 */

type TagFilterPanelProps = {
  onClearFilter: () => void;
  onToggleTag: (tagId: number) => void;
  selectedTagIds: Set<number>;
  tags: SimpleTag[];
  /** El rango de fechas, tal cual funcionaba en el menú «⋯». */
  rangoDesde: string;
  rangoHasta: string;
  campoDeFecha: CampoDeFecha;
  rangoActivo: boolean;
  onRangoDesde: (v: string) => void;
  onRangoHasta: (v: string) => void;
  onCampoDeFecha: (v: CampoDeFecha) => void;
  onLimpiarRango: () => void;
};

export function TagFilterPanel({
  onClearFilter,
  onToggleTag,
  selectedTagIds,
  tags,
  rangoDesde,
  rangoHasta,
  campoDeFecha,
  rangoActivo,
  onRangoDesde,
  onRangoHasta,
  onCampoDeFecha,
  onLimpiarRango,
}: TagFilterPanelProps) {
  const [search, setSearch] = useState("");
  // El embudo: ancho de la columna, filo izquierdo, bajo las pastillas.
  const panel = usePanelFlotante("columnaAncha", "popover");
  const filterCount = selectedTagIds.size;
  // El embudo se marca activo con CUALQUIERA de los dos filtros, igual que ya se
  // marcaba con las etiquetas.
  const activo = filterCount > 0 || rangoActivo;

  // Los atajos (Hoy, Ayer, Últimos 7/30 días) rellenan Desde y Hasta de una
  // vez. Un solo `ahora` por render: el marcado y el clic deciden con la misma
  // fecha, calculada en la zona de la cuenta (nunca en UTC). El atajo marcado
  // sale del rango puesto, así que escribir fechas a mano que no casen deja los
  // cuatro sin marcar, y «Limpiar» los apaga sin ninguna rama aparte.
  const ahora = new Date();
  const atajoActivo = atajoDelRango(rangoDesde, rangoHasta, ahora);
  const aplicarAtajo = (id: AtajoDeRango) => {
    const r = rangoDelAtajo(id, ahora);
    onRangoDesde(r.desde);
    onRangoHasta(r.hasta);
  };

  const sorted = tags
    .slice()
    .sort((a, b) => a.order - b.order)
    .filter((t) => t.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <Popover onOpenChange={panel.alAbrir}>
      <PopoverTrigger asChild ref={panel.disparador}>
        <button
          type="button"
          aria-label="Filtros"
          title="Filtrar por fecha o etiquetas"
          data-embudo
          data-activo={activo ? "si" : "no"}
          className={cn(
            "relative flex shrink-0 items-center justify-center rounded-full border transition-colors",
            CONTROL_DE_ICONO,
            activo
              ? "border-primary bg-primary/10 text-primary"
              : "border-border text-muted-foreground hover:bg-accent hover:text-foreground",
          )}
        >
          <Filter className={GLIFO_DE_CONTROL} />
          {filterCount > 0 && (
            <span className="absolute -right-1 -top-1 flex h-3 w-3 items-center justify-center rounded-full bg-primary text-[7px] font-bold text-primary-foreground">
              {filterCount}
            </span>
          )}
        </button>
      </PopoverTrigger>

      {/* El ancho lo pone la COLUMNA, no un `w-72` escrito aquí.
          Aquel medía 288 px y la columna mide 352 a 1024: con `align="end"` el
          panel salía flotando en mitad de la lista, y en un móvil estrecho se
          montaba sobre el borde. Ahora mide el ancho común, colgado de su
          botón y dentro de la columna, y nace justo debajo de la raya de la
          cabecera, como los otros tres menús (`columnaAncha`). */}
      <PopoverContent {...panel.props} className={cn(RELLENO_DEL_MENU, PANEL_QUE_SE_DESPLAZA)}>
        {/* ── Rango de fechas ─────────────────────────────────────────────── */}
        <div className="mb-1 flex items-center justify-between px-1">
          <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            <CalendarDays className="h-3 w-3 shrink-0" />
            Rango de fechas
          </span>
          {rangoActivo && (
            <button
              type="button"
              onClick={onLimpiarRango}
              data-limpiar-rango
              className="flex items-center gap-0.5 text-[10px] text-muted-foreground hover:text-foreground"
            >
              <X className="h-3 w-3" />
              Limpiar
            </button>
          )}
        </div>

        {/* Qué fecha cuenta: el inicio (por defecto) o la última actividad. En
            renglones completos para que el rótulo no se parta. */}
        <button
          type="button"
          onClick={() => onCampoDeFecha("inicio")}
          data-campo="inicio"
          className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm text-left hover:bg-muted/60"
        >
          <span className={campoDeFecha === "inicio" ? "font-semibold text-foreground" : "text-muted-foreground"}>
            Inicio de conversación
          </span>
          {campoDeFecha === "inicio" && <Check className="h-4 w-4 shrink-0 text-primary" />}
        </button>
        <button
          type="button"
          onClick={() => onCampoDeFecha("actividad")}
          data-campo="actividad"
          className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm text-left hover:bg-muted/60"
        >
          <span className={campoDeFecha === "actividad" ? "font-semibold text-foreground" : "text-muted-foreground"}>
            Última actividad
          </span>
          {campoDeFecha === "actividad" && <Check className="h-4 w-4 shrink-0 text-primary" />}
        </button>

        {/* Atajos, ENCIMA de Desde y Hasta. `flex-1` sin `min-w-0`: cada chip
            crece por igual y nunca encoge por debajo de su texto, así que los
            cuatro caben en una sola fila del panel sin cortarse. El marcado usa
            el mismo realce que el resto del panel. */}
        <div className="mt-1 flex items-center gap-1 px-1" data-atajos>
          {ATAJOS_DE_RANGO.map(({ id, etiqueta, titulo }) => {
            const marcado = atajoActivo === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => aplicarAtajo(id)}
                data-atajo={id}
                data-marcado={marcado ? "si" : "no"}
                title={titulo}
                className={cn(
                  "flex-1 whitespace-nowrap rounded-md border px-1 py-1 text-[11px] font-medium transition-colors",
                  marcado
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                )}
              >
                {etiqueta}
              </button>
            );
          })}
        </div>

        <div className="mt-1 space-y-1 px-1">
          <label className="flex items-center gap-2 text-sm">
            <span className="w-12 shrink-0 text-muted-foreground">Desde</span>
            <input
              type="date"
              value={rangoDesde}
              max={rangoHasta || undefined}
              onChange={(e) => onRangoDesde(e.target.value)}
              data-desde
              className="min-w-0 flex-1 rounded-md border border-input bg-background px-2 py-1 text-sm"
            />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <span className="w-12 shrink-0 text-muted-foreground">Hasta</span>
            <input
              type="date"
              value={rangoHasta}
              min={rangoDesde || undefined}
              onChange={(e) => onRangoHasta(e.target.value)}
              data-hasta
              className="min-w-0 flex-1 rounded-md border border-input bg-background px-2 py-1 text-sm"
            />
          </label>
        </div>

        {/* ── Etiquetas ───────────────────────────────────────────────────── */}
        {tags.length > 0 && (
          <>
            {/* Separación clara entre las dos secciones. */}
            <div className="my-2 border-t border-border" />
            <div className="mb-1 px-1">
              <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                <Tag className="h-3 w-3 shrink-0" />
                Etiquetas
              </span>
            </div>

            {/* Buscador de etiquetas. */}
            <div className="relative mb-1">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground pointer-events-none" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar etiqueta..."
                className="w-full rounded-md bg-muted/40 py-1.5 pl-8 pr-3 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-border"
              />
            </div>

            {/* Lista de etiquetas. */}
            <div className="flex flex-col">
              {sorted.map((tag) => {
                const isActive = selectedTagIds.has(tag.id);
                const color = tag.color ?? "#6366F1";
                return (
                  <button
                    key={tag.id}
                    type="button"
                    data-tag={tag.id}
                    onClick={() => (isActive ? onClearFilter() : onToggleTag(tag.id))}
                    className={cn(
                      "flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition-colors text-left",
                      isActive ? "bg-foreground/10" : "hover:bg-muted/60",
                    )}
                  >
                    <Tag className="h-4 w-4 shrink-0" style={{ color }} />
                    <span className={isActive ? "font-semibold text-foreground" : "text-muted-foreground"}>
                      {tag.name}
                    </span>
                  </button>
                );
              })}
              {sorted.length === 0 && (
                <p className="px-2 py-2 text-xs text-muted-foreground">Sin resultados</p>
              )}
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
