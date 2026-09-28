"use client";

import React, { useState } from "react";
import { Building2, CalendarDays, Check, ChevronDown, ChevronLeft, Filter, Search, Tag, Workflow, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  FILTRO_DE_LA_COLUMNA,
  FILTRO_DE_LA_COLUMNA_ACTIVO,
  FILTRO_DE_LA_COLUMNA_INACTIVO,
  GLIFO_DE_CONTROL,
} from "@/lib/cabeceras-de-chats";
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
import { etiquetasDelFiltro } from "@/lib/etiquetas-de-la-linea";
import {
  elEmbudoDelFiltro,
  hayQueElegirCuenta,
  losEmbudosDelFiltro,
  type EmbudosDeLaCuenta,
} from "@/lib/filtro-de-chats-por-cuenta";
import { embudosDelFiltroDeChatsAction } from "@/actions/filtro-de-chats-actions";
import {
  SECCION_AL_ABRIR,
  alternarSeccion,
  cierraElPanel,
  type AccionDelFiltro,
  type SeccionDelFiltro,
} from "@/lib/secciones-del-filtro";

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
 * # Etiquetas y Embudos se PLIEGAN, y elegir cierra el panel
 *
 * Las dos secciones nacen plegadas cada vez que se abre el panel, y desplegar
 * una pliega la otra (`lib/secciones-del-filtro.ts`): con las dos listas
 * abiertas el panel tapaba la lista de chats entera. Y elegir o quitar una
 * etiqueta o una etapa cierra el panel —el filtro ya se aplicó y lo que se
 * quiere ver es la lista—; elegir la cuenta o el embudo no, que son pasos.
 * Por eso el `Popover` es CONTROLADO (`abierto`).
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
  /** TODAS las etiquetas de la bandeja, cada una con su cuenta (`userId`). */
  tags: SimpleTag[];
  /**
   * Las cuentas de la bandeja, la de la línea elegida en «Canales» y la que
   * resulta (`laCuentaDelFiltro`). Etiquetas y Embudos leen la MISMA.
   */
  cuentas?: string[];
  cuentaDeLaLinea?: string | null;
  cuentaDelFiltro?: string | null;
  onElegirCuenta?: (cuenta: string | null) => void;
  /** El filtro de embudos: el embudo elegido y la etapa, como las etiquetas. */
  embudoElegido?: string | null;
  onElegirEmbudo?: (embudo: string | null) => void;
  selectedEtapaIds?: Set<string>;
  onToggleEtapa?: (etapaId: string) => void;
  onClearEtapas?: () => void;
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
  cuentas = [],
  cuentaDeLaLinea = null,
  cuentaDelFiltro = null,
  onElegirCuenta,
  embudoElegido = null,
  onElegirEmbudo,
  selectedEtapaIds = new Set<string>(),
  onToggleEtapa,
  onClearEtapas,
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
  const filterCount = selectedTagIds.size + selectedEtapaIds.size;

  // Los embudos se piden al ABRIR el panel, no en cada carga de Chats, y una
  // vez por juego de cuentas.
  const llaveDeLasCuentas = cuentas.join("|");
  const [embudos, setEmbudos] = useState<{ llave: string; datos: EmbudosDeLaCuenta[] } | null>(null);
  const [cargandoEmbudos, setCargandoEmbudos] = useState(false);
  const [errorEmbudos, setErrorEmbudos] = useState<string | null>(null);
  const datosDeEmbudos = embudos?.llave === llaveDeLasCuentas ? embudos.datos : null;
  const pedirLosEmbudos = async () => {
    if (cargandoEmbudos || datosDeEmbudos || cuentas.length === 0) return;
    setCargandoEmbudos(true);
    setErrorEmbudos(null);
    try {
      const res = await embudosDelFiltroDeChatsAction(cuentas);
      if (res.success) setEmbudos({ llave: llaveDeLasCuentas, datos: res.data ?? [] });
      else setErrorEmbudos(res.message);
    } catch (error) {
      console.error("[chats] no se pudieron pedir los embudos del filtro", error);
      setErrorEmbudos("No se pudieron cargar los embudos.");
    } finally {
      setCargandoEmbudos(false);
    }
  };
  const [abierto, setAbierto] = useState(false);
  const [seccion, setSeccion] = useState<SeccionDelFiltro | null>(SECCION_AL_ABRIR);
  const alAbrir = (siguiente: boolean) => {
    setAbierto(siguiente);
    panel.alAbrir(siguiente);
    if (siguiente) {
      setSeccion(SECCION_AL_ABRIR);
      void pedirLosEmbudos();
    }
  };
  /** Ejecuta la acción y, si aplica un filtro, cierra el panel entero. */
  const hacer = (accion: AccionDelFiltro, fn: () => void) => {
    fn();
    if (cierraElPanel(accion)) setAbierto(false);
  };

  const elegirCuenta = hayQueElegirCuenta(cuentas, cuentaDeLaLinea);
  const nombreDe = (cuenta: string) =>
    datosDeEmbudos?.find((d) => d.cuentaId === cuenta)?.nombre ?? (cargandoEmbudos ? "Cargando…" : "Cuenta");
  // Sin cuenta resuelta y con varias en la bandeja no se enseña nada: primero
  // se elige la cuenta. Sin líneas (ninguna cuenta), las de siempre.
  const seVenLasSecciones = !elegirCuenta || Boolean(cuentaDelFiltro);
  const etiquetasDeLaCuenta = etiquetasDelFiltro(tags, cuentaDelFiltro);
  const embudosDeLaCuenta = losEmbudosDelFiltro(datosDeEmbudos ?? [], cuentaDelFiltro);
  const embudoDelFiltro = elEmbudoDelFiltro(embudosDeLaCuenta, embudoElegido);
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

  const sorted = etiquetasDeLaCuenta
    .slice()
    .sort((a, b) => a.order - b.order)
    .filter((t) => t.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <Popover open={abierto} onOpenChange={alAbrir}>
      <PopoverTrigger asChild ref={panel.disparador}>
        <button
          type="button"
          aria-label="Filtros"
          title="Filtrar por fecha, etiquetas o embudos"
          data-embudo
          data-activo={activo ? "si" : "no"}
          className={cn(
            FILTRO_DE_LA_COLUMNA,
            activo ? FILTRO_DE_LA_COLUMNA_ACTIVO : FILTRO_DE_LA_COLUMNA_INACTIVO,
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

        {/* ── Cuenta ──────────────────────────────────────────────────────
            Solo cuando la bandeja junta varias cuentas y no hay una línea
            elegida en «Canales»: primero se elige la cuenta, y solo entonces
            salen sus etiquetas y sus embudos. Nunca mezclados. */}
        {elegirCuenta && (
          <>
            <div className="my-2 border-t border-border" />
            <SeccionDelPanel icono={Building2} titulo="Cuenta" />
            {cuentaDelFiltro ? (
              <div className="flex items-center gap-2 px-2 py-1.5 text-sm" data-cuenta-elegida={cuentaDelFiltro}>
                <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate font-semibold text-foreground" title={nombreDe(cuentaDelFiltro)}>
                  {nombreDe(cuentaDelFiltro)}
                </span>
                <button
                  type="button"
                  data-cambiar-cuenta
                  onClick={() => onElegirCuenta?.(null)}
                  className="shrink-0 text-[11px] text-muted-foreground hover:text-foreground"
                >
                  Cambiar
                </button>
              </div>
            ) : (
              <div className="flex flex-col">
                {cuentas.map((cuenta) => (
                  <button
                    key={cuenta}
                    type="button"
                    data-cuenta={cuenta}
                    onClick={() => onElegirCuenta?.(cuenta)}
                    className="flex items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm text-muted-foreground transition-colors hover:bg-muted/60"
                  >
                    <Building2 className="h-4 w-4 shrink-0" />
                    <span className="min-w-0 truncate" title={nombreDe(cuenta)}>{nombreDe(cuenta)}</span>
                  </button>
                ))}
                <p className="px-2 pt-1 text-xs text-muted-foreground" data-elige-cuenta>
                  Elige una cuenta para ver sus etiquetas y sus embudos.
                </p>
              </div>
            )}
          </>
        )}

        {seVenLasSecciones && (
          <>
            {/* ── Etiquetas ─────────────────────────────────────────────── */}
            <div className="my-2 border-t border-border" />
            <SeccionDelPanel
              icono={Tag}
              titulo="Etiquetas"
              dato="etiquetas"
              plegable
              abierta={seccion === "etiquetas"}
              elegidas={selectedTagIds.size}
              onAlternar={() => setSeccion((s) => alternarSeccion(s, "etiquetas"))}
            />
            {seccion === "etiquetas" && (
            <div data-lista-de-seccion="etiquetas">
            {etiquetasDeLaCuenta.length > 0 && (
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
            )}
            <div className="flex flex-col">
              {sorted.map((tag) => (
                <OpcionDelPanel
                  key={tag.id}
                  dato={{ "data-tag": tag.id }}
                  activa={selectedTagIds.has(tag.id)}
                  onClick={() =>
                    hacer("etiqueta", () => (selectedTagIds.has(tag.id) ? onClearFilter() : onToggleTag(tag.id)))
                  }
                  icono={<Tag className="h-4 w-4 shrink-0" style={{ color: tag.color ?? "#6366F1" }} />}
                  nombre={tag.name}
                />
              ))}
              {etiquetasDeLaCuenta.length === 0 ? (
                <p className="px-2 py-2 text-xs text-muted-foreground">Esta cuenta no tiene etiquetas.</p>
              ) : (
                sorted.length === 0 && <p className="px-2 py-2 text-xs text-muted-foreground">Sin resultados</p>
              )}
            </div>
            </div>
            )}

            {/* ── Embudos ───────────────────────────────────────────────────
                Si la cuenta tiene varios, se elige primero el embudo y luego
                la etapa, con el mismo comportamiento que las etiquetas. */}
            <div className="my-2 border-t border-border" />
            <SeccionDelPanel
              icono={Workflow}
              titulo="Embudos"
              dato="embudos"
              plegable
              abierta={seccion === "embudos"}
              elegidas={selectedEtapaIds.size}
              onAlternar={() => setSeccion((s) => alternarSeccion(s, "embudos"))}
            />
            {seccion === "embudos" && (
            <div data-lista-de-seccion="embudos">
            {cargandoEmbudos && !datosDeEmbudos ? (
              <p className="px-2 py-2 text-xs text-muted-foreground">Cargando embudos…</p>
            ) : errorEmbudos && !datosDeEmbudos ? (
              <p className="px-2 py-2 text-xs text-destructive">{errorEmbudos}</p>
            ) : embudosDeLaCuenta.length === 0 ? (
              <p className="px-2 py-2 text-xs text-muted-foreground">Esta cuenta no tiene embudos.</p>
            ) : !embudoDelFiltro ? (
              <div className="flex flex-col">
                {embudosDeLaCuenta.map((embudo) => (
                  <OpcionDelPanel
                    key={embudo.id}
                    dato={{ "data-embudo-opcion": embudo.id }}
                    activa={false}
                    onClick={() => onElegirEmbudo?.(embudo.id)}
                    icono={<Workflow className="h-4 w-4 shrink-0" />}
                    nombre={embudo.nombre}
                  />
                ))}
                <p className="px-2 pt-1 text-xs text-muted-foreground" data-elige-embudo>
                  Elige un embudo para ver sus etapas.
                </p>
              </div>
            ) : (
              <div className="flex flex-col">
                {embudosDeLaCuenta.length > 1 && (
                  <button
                    type="button"
                    data-cambiar-embudo
                    onClick={() => {
                      onClearEtapas?.();
                      onElegirEmbudo?.(null);
                    }}
                    className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-sm font-semibold text-foreground hover:bg-muted/60"
                    title="Cambiar de embudo"
                  >
                    <ChevronLeft className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 truncate">{embudoDelFiltro.nombre}</span>
                  </button>
                )}
                {embudoDelFiltro.etapas.map((etapa) => (
                  <OpcionDelPanel
                    key={etapa.id}
                    dato={{ "data-etapa": etapa.id }}
                    activa={selectedEtapaIds.has(etapa.id)}
                    onClick={() =>
                      hacer("etapa", () =>
                        selectedEtapaIds.has(etapa.id) ? onClearEtapas?.() : onToggleEtapa?.(etapa.id),
                      )
                    }
                    icono={<span className="h-2.5 w-2.5 shrink-0 rounded-full mx-[3px]" style={{ backgroundColor: etapa.color }} />}
                    nombre={etapa.nombre}
                  />
                ))}
                {embudoDelFiltro.etapas.length === 0 && (
                  <p className="px-2 py-2 text-xs text-muted-foreground">Este embudo no tiene etapas.</p>
                )}
              </div>
            )}
            </div>
            )}
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}

/**
 * El rótulo de una sección del panel. Etiquetas, Embudos y Cuenta lo pintan
 * igual: con uno escrito en cada sección, se separan sin que nadie lo note.
 */
function SeccionDelPanel({
  icono: Icono,
  titulo,
  dato,
  plegable = false,
  abierta = false,
  elegidas = 0,
  onAlternar,
}: {
  icono: React.ComponentType<{ className?: string }>;
  titulo: string;
  dato?: string;
  /** Etiquetas y Embudos: el rótulo es un botón con su flecha. */
  plegable?: boolean;
  abierta?: boolean;
  /** Cuántas hay elegidas dentro: plegada, es lo único que dice que filtra. */
  elegidas?: number;
  onAlternar?: () => void;
}) {
  if (plegable) {
    return (
      <button
        type="button"
        onClick={onAlternar}
        aria-expanded={abierta}
        data-seccion={dato ?? titulo.toLowerCase()}
        data-abierta={abierta ? "si" : "no"}
        className="mb-1 flex w-full items-center justify-between gap-2 rounded-md px-1 py-1 text-left hover:bg-muted/60"
      >
        <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          <Icono className="h-3 w-3 shrink-0" />
          {titulo}
          {elegidas > 0 && (
            <span
              data-elegidas
              className="ml-0.5 rounded-full bg-primary px-1.5 text-[9px] font-bold leading-4 text-primary-foreground"
            >
              {elegidas}
            </span>
          )}
        </span>
        <ChevronDown
          data-flecha
          className={cn(
            "h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform",
            abierta ? "rotate-180" : "rotate-0",
          )}
        />
      </button>
    );
  }
  return (
    <div className="mb-1 px-1" data-seccion={dato ?? titulo.toLowerCase()}>
      <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        <Icono className="h-3 w-3 shrink-0" />
        {titulo}
      </span>
    </div>
  );
}

/** Una fila del panel: la de una etiqueta y la de una etapa son la MISMA. */
function OpcionDelPanel({
  activa,
  onClick,
  icono,
  nombre,
  dato,
}: {
  activa: boolean;
  onClick: () => void;
  icono: React.ReactNode;
  nombre: string;
  dato: Record<string, string | number>;
}) {
  return (
    <button
      type="button"
      {...dato}
      data-activa={activa ? "si" : "no"}
      onClick={onClick}
      className={cn(
        "flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition-colors text-left",
        activa ? "bg-foreground/10" : "hover:bg-muted/60",
      )}
    >
      {icono}
      <span className={cn("min-w-0 truncate", activa ? "font-semibold text-foreground" : "text-muted-foreground")} title={nombre}>
        {nombre}
      </span>
    </button>
  );
}
