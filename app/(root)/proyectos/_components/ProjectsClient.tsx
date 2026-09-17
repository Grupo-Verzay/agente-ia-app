"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Loader2, Plus, Trash2, Pencil, FolderKanban, Search, AlertCircle, Eye, ListTodo,
  Share2, Building2,
  ChevronDown, Clock, SlidersHorizontal, UserRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { MetricCard } from "@/components/custom/MetricCard";
import { ModuleToolbar } from "@/components/shared/ModuleToolbar";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import type { AdvisorInfo } from "@/actions/team-actions";
import {
  listProjectsAction, saveProjectAction, deleteProjectAction,
  getProjectShareTargetsAction, setProjectSharesAction,
} from "@/actions/project-actions";
import {
  BOARD_COLUMNS, PROJECT_STATUSES, PROJECT_STATUS_LABELS,
  type ProjectData, type ProjectStatus,
} from "@/lib/project-types";
import { BarraDeCarpetas, MoverACarpeta, useCarpetas } from "@/components/shared/Carpetas";
import { CompartirConCuentasDialog } from "@/components/shared/CompartirConCuentasDialog";
import type { Carpeta as CarpetaDeProyecto } from "@/lib/carpetas";
import { ProjectBoard } from "./ProjectBoard";

const STATUS_STYLES: Record<ProjectStatus, string> = {
  activo: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
  pausado: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30",
  terminado: "bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/30",
};

/** Un color por miembro, estable: el mismo nombre siempre da el mismo. */
const AVATAR_COLORS = [
  "bg-blue-600", "bg-violet-600", "bg-teal-600",
  "bg-rose-600", "bg-amber-600", "bg-cyan-600",
];
function avatarColor(seed: string) {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function personLabel(person: { name: string | null; email: string | null }) {
  return person.name?.trim() || person.email || "Sin nombre";
}

function initials(label: string) {
  const parts = label.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

/**
 * La fecha avisa en vez de informar: «Venció hace 2 días» se lee sin pensar,
 * «30 de ago» obliga a calcular.
 */
function describeDue(iso: string | null) {
  if (!iso) return { label: "Sin fecha", tone: "idle" as const };

  const due = new Date(iso);
  const today = new Date();
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startOfDay(due) - startOfDay(today)) / 86_400_000);

  if (days < 0) {
    const n = Math.abs(days);
    return { label: n === 1 ? "Venció ayer" : `Venció hace ${n} días`, tone: "late" as const };
  }
  if (days === 0) return { label: "Vence hoy", tone: "soon" as const };
  if (days === 1) return { label: "Vence mañana", tone: "soon" as const };
  if (days <= 7) return { label: `Vence en ${days} días`, tone: "soon" as const };

  return {
    label: due.toLocaleDateString("es-CO", { day: "2-digit", month: "short" }),
    tone: "idle" as const,
  };
}

const DUE_TONES = {
  late: "bg-red-500/10 text-red-600 dark:text-red-400",
  soon: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  idle: "bg-muted text-muted-foreground",
};

/**
 * Un filtro de la barra, plegado.
 *
 * Enseña el CONCEPTO mientras no filtra («Estado») y el VALOR en cuanto filtra
 * («En pausa»), en azul. Son las dos cosas a la vez: cerrado ocupa poco —que es
 * lo que hace que la fila quepa— y un filtro puesto se nota, que es la regla de
 * siempre: un filtro que no se ve es lo que hace pensar que faltan cosas.
 *
 * El rótulo sale de la misma lista que las opciones, así que no hay dos sitios
 * que puedan decir cosas distintas.
 */
function FiltroDesplegable<T extends string>({
  icono,
  concepto,
  opciones,
  valor,
  sinFiltrar,
  onElegir,
}: {
  icono: React.ReactNode;
  concepto: string;
  opciones: { key: T; label: string }[];
  valor: T;
  /** El valor que NO filtra nada: con él puesto se enseña el concepto. */
  sinFiltrar: T;
  onElegir: (valor: T) => void;
}) {
  const filtrando = valor !== sinFiltrar;
  const elegida = opciones.find((o) => o.key === valor);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          title={concepto}
          className={cn(
            "h-7 shrink-0 gap-1.5 px-2 text-xs",
            filtrando ? "border-sky-500 text-sky-600" : "text-muted-foreground",
          )}
        >
          {icono}
          {filtrando ? elegida?.label ?? concepto : concepto}
          <ChevronDown className="h-3.5 w-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {opciones.map((o) => (
          <DropdownMenuCheckboxItem
            key={o.key}
            checked={valor === o.key}
            onCheckedChange={() => onElegir(o.key)}
          >
            {o.label}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function ProjectsClient({
  userId,
  team,
  repartoDelTrabajo,
}: {
  userId: string;
  team: AdvisorInfo[];
  /**
   * El reparto del trabajo, ya pintado en el servidor.
   *
   * Viaja como nodo y no como dato porque este fichero es `"use client"` y el
   * bloque sale de una consulta. Vacío para quien no administra la cuenta,
   * porque la consulta ya devuelve `null`: la puerta está ahí, no aquí.
   *
   * Va PLEGADO, detrás de un botón de la fila de filtros. Que llegue ya
   * resuelto es lo que permite tenerlo cerrado sin pagar nada: abrirlo no pide
   * nada al servidor, y cerrado no se pinta, así que no ocupa alto.
   */
  repartoDelTrabajo?: React.ReactNode;
}) {
  const [projects, setProjects] = useState<ProjectData[]>([]);
  const [loading, setLoading] = useState(true);
  const [openProjectId, setOpenProjectId] = useState<number | null>(null);
  const [editing, setEditing] = useState<ProjectData | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ProjectData | null>(null);
  /** El proyecto que se está compartiendo con otras cuentas. */
  const [compartiendo, setCompartiendo] = useState<ProjectData | null>(null);
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");
  // DOS filtros, no uno. Antes era una sola variable con cinco valores, así que
  // eran excluyentes: elegir «Míos» borraba el estado y elegir «Activos»
  // borraba «Míos». No se podía pedir «mis proyectos activos», y «Todos» hacía
  // de dos cosas a la vez —todos los estados y los de todo el mundo—, que es
  // justo lo que confundía. Son preguntas distintas y se cruzan con Y.
  const [estado, setEstado] = useState<"todos" | ProjectStatus>("todos");
  const [responsable, setResponsable] = useState<"equipo" | "mios">("equipo");
  // El reparto arranca CERRADO: es un dato que se consulta de vez en cuando,
  // no lo que se viene a hacer a esta pantalla.
  const [verReparto, setVerReparto] = useState(false);
  const carpetas = useCarpetas("proyecto");

  const load = useCallback(async () => {
    setLoading(true);
    const res = await listProjectsAction();
    if (res.success && res.data) setProjects(res.data);
    else toast.error(res.message);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  // A dónde lleva un aviso: `?proyecto=<id>&tarea=<id>`. Se abre el tablero y,
  // dentro, esa tarjeta.
  //
  // Se lee de `window.location` y no con `useSearchParams` a propósito: aquel
  // obliga a envolver esto en un `<Suspense>` para el prerenderizado y es una
  // trampa que se paga en el build. Aquí basta con leerlo una vez al montar.
  const [destino, setDestino] = useState<{ proyecto: number; tarea: number | null } | null>(null);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const proyecto = Number(params.get("proyecto"));
    if (!Number.isInteger(proyecto) || proyecto <= 0) return;
    const tarea = Number(params.get("tarea"));
    setDestino({ proyecto, tarea: Number.isInteger(tarea) && tarea > 0 ? tarea : null });
    setOpenProjectId(proyecto);
    // La dirección se limpia: si no, volver atrás en el tablero y recargar
    // reabriría la misma tarea una y otra vez.
    window.history.replaceState(null, "", window.location.pathname);
  }, []);

  const openProject = useMemo(
    () => projects.find((p) => p.id === openProjectId) ?? null,
    [projects, openProjectId],
  );

  const summary = useMemo(() => {
    let activos = 0, vencidas = 0, revision = 0, abiertas = 0;
    for (const p of projects) {
      if (p.status === "activo") activos += 1;
      vencidas += p.overdueTasks;
      revision += p.taskCounts["in_review"] ?? 0;
      abiertas +=
        (p.taskCounts["pending"] ?? 0) +
        (p.taskCounts["in_progress"] ?? 0) +
        (p.taskCounts["in_review"] ?? 0);
    }
    return { activos, vencidas, revision, abiertas };
  }, [projects]);

  // `enLaCarpeta` es estable (useCallback); el objeto que devuelve el hook no,
  // así que se depende de la función y no de él: si no, este memo se rehacía en
  // cada render y no servía de nada.
  const { enLaCarpeta } = carpetas;

  const visibleProjects = useMemo(() => {
    const q = query.trim().toLowerCase();
    return projects.filter((p) => {
      if (q && !p.name.toLowerCase().includes(q) && !(p.description ?? "").toLowerCase().includes(q)) {
        return false;
      }
      if (!enLaCarpeta(String(p.id))) return false;
      if (estado !== "todos" && p.status !== estado) return false;
      if (responsable === "mios") {
        return p.leadId === userId || p.members.some((m) => m.userId === userId);
      }
      return true;
    });
  }, [projects, query, estado, responsable, userId, enLaCarpeta]);

  // Cuántos hay en cada carpeta, para el número del chip. Sale de la lista
  // completa: el número dice lo que hay dentro, no lo que deja ver el filtro.
  const reparto = useMemo(() => {
    const porCarpeta: Record<string, number> = {};
    let sueltas = 0;
    for (const p of projects) {
      const c = carpetas.deCadaCosa[String(p.id)];
      if (c) porCarpeta[c] = (porCarpeta[c] ?? 0) + 1;
      else sueltas += 1;
    }
    return { porCarpeta, sueltas };
  }, [projects, carpetas.deCadaCosa]);

  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return;
    setBusy(true);
    const res = await deleteProjectAction(deleteTarget.id);
    setBusy(false);
    if (!res.success) { toast.error(res.message); return; }
    toast.success(res.message);
    setDeleteTarget(null);
    if (openProjectId === deleteTarget.id) setOpenProjectId(null);
    void load();
  }, [deleteTarget, openProjectId, load]);

  // ─── Tablero de un proyecto ────────────────────────────────────────────────
  if (openProject) {
    return (
      <ProjectBoard
        project={openProject}
        team={team}
        userId={userId}
        // Trabajar en el tablero y MANDAR en el proyecto son dos cosas: en uno
        // recibido con permiso de edición se crean y se mueven tareas, pero no
        // se edita la ficha ni se borra nada.
        canManage={openProject.puedeEditarTareas}
        recibido={openProject.recibido}
        abrirTareaId={destino?.proyecto === openProject.id ? destino.tarea : null}
        onBack={() => setOpenProjectId(null)}
        onProjectChanged={load}
      />
    );
  }

  // El rótulo de cada opción. El del desplegable cerrado sale de aquí, así que
  // no hay dos sitios que puedan decir cosas distintas.
  const ESTADOS: { key: typeof estado; label: string }[] = [
    { key: "todos", label: "Todos" },
    { key: "activo", label: "Activos" },
    { key: "pausado", label: "En pausa" },
    { key: "terminado", label: "Terminados" },
  ];
  const RESPONSABLES: { key: typeof responsable; label: string }[] = [
    { key: "equipo", label: "Del equipo" },
    { key: "mios", label: "Míos" },
  ];

  // ─── Lista de proyectos ────────────────────────────────────────────────────
  return (
    // Mismo contenedor que Clientes: sin padding propio, el contenido va pegado
    // a los bordes del área de la pantalla.
    <div className="flex h-full min-h-0 flex-col gap-2 overflow-hidden">

      {/* Resumen arriba del todo, igual que en Clientes. La miga de pan ya dice
          que esto es Proyectos, así que no se repite como título.
          La fila envolvente es la que hace que el flex-1 crezca a lo ancho; sin
          ella, dentro de una columna, se comería toda la altura. */}
      <div className="flex shrink-0 items-center justify-between">
      <div className="container-stats mb-2 hidden flex-1 sm:flex sm:gap-4 sm:overflow-x-auto">
        <div className="min-w-0 sm:flex-1">
          <MetricCard
            icon={<FolderKanban className="h-4 w-4" />}
            label="Proyectos activos"
            value={summary.activos}
            color="#22C55E"
          />
        </div>
        <div className="min-w-0 sm:flex-1">
          <MetricCard
            icon={<AlertCircle className="h-4 w-4" />}
            label="Tareas vencidas"
            value={summary.vencidas}
            helper="Tareas sin terminar cuya fecha ya pasó."
            color="#EF4444"
          />
        </div>
        <div className="min-w-0 sm:flex-1">
          <MetricCard
            icon={<Eye className="h-4 w-4" />}
            label="Esperando revisión"
            value={summary.revision}
            color="#A855F7"
          />
        </div>
        <div className="min-w-0 sm:flex-1">
          <MetricCard
            icon={<ListTodo className="h-4 w-4" />}
            label="Tareas abiertas"
            value={summary.abiertas}
            color="#3B82F6"
          />
        </div>
      </div>

      </div>

      {/* Buscador, filtros y la acción, en una sola fila. */}
      <ModuleToolbar className="shrink-0">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar proyecto..."
            className="h-9 pl-8"
          />
        </div>

        {/* Dos desplegables, no seis botones sueltos.
            Medido a 1280 con el menú lateral abierto: la izquierda solo tiene
            907px y con los chips necesitaba 1057, así que se partía en dos
            líneas — y con `items-end` en la barra, el «+ Nuevo» bajaba con
            ellas. Con dos desplegables COMPACTOS son 845px y cabe.
            Compactos importa: con la etiqueta larga («Estado: Todos») son
            959px y se seguiría partiendo. Así que el botón enseña el CONCEPTO
            mientras no filtra y el VALOR en cuanto filtra, que además es el
            patrón que ya usa Clientes. */}
        <div className="flex flex-wrap items-center gap-1.5">
          <FiltroDesplegable
            icono={<SlidersHorizontal className="h-3.5 w-3.5" />}
            concepto="Estado"
            opciones={ESTADOS}
            valor={estado}
            sinFiltrar="todos"
            onElegir={setEstado}
          />
          <FiltroDesplegable
            icono={<UserRound className="h-3.5 w-3.5" />}
            concepto="Responsable"
            opciones={RESPONSABLES}
            valor={responsable}
            sinFiltrar="equipo"
            onElegir={setResponsable}
          />
        </div>

        {/* Las carpetas SCROLLEAN, no parten la fila.
            Es lo que queda creciendo sin tope: con dos carpetas la izquierda
            vuelve a pedir 1012px de los 907 que tiene, y con cuatro, 1178. Es
            la misma solución que la barra de Clientes —el trozo del medio se
            desplaza cuando no cabe— y va desde aquí con `className`, no
            cambiando el componente, que lo comparte Diagramas.
            Las tres clases hacen falta y `flex-1` es la que NO es obvia.
            Probado sin ella: no arregla nada. El padre es `flex-wrap`, así que
            ante un desbordamiento PARTE LA LÍNEA antes de encoger a un hijo —
            encoger solo ocurre dentro de un contenedor que no parte—. Con
            `flex-1` la tira ocupa el hueco que sobra y ya no desborda la
            línea: lo que crece se queda dentro de ella y se desplaza.
            El precio, a sabiendas: «Reparto del trabajo» queda pegado a la
            derecha del grupo en vez de junto a «Nueva carpeta». Sigue en la
            misma fila y antes del «+ Nuevo», que es lo que se pedía. */}
        <BarraDeCarpetas
          className="min-w-0 flex-1 flex-nowrap overflow-x-auto"
          tipo="proyecto"
          carpetas={carpetas.carpetas}
          seleccionada={carpetas.seleccionada}
          onSeleccionar={carpetas.setSeleccionada}
          onCambio={() => void carpetas.recargar()}
          cuentaPorCarpeta={reparto.porCarpeta}
          sueltas={reparto.sueltas}
        />

        {/* El reparto del trabajo, plegado. Va aquí —en la fila de filtros,
            pegado a «Nueva carpeta»— y no suelto abajo: ahí ocupaba su alto
            siempre, y como el bloque está FUERA de la rejilla que hace scroll,
            ese alto se lo quitaba a los proyectos. Cerrado no ocupa nada
            porque no se pinta, y no cuesta una consulta de más: llega ya
            resuelto desde el servidor.
            Sin él —quien no administra la cuenta— no hay ni botón: la puerta
            es que la consulta devuelve `null`. */}
        {repartoDelTrabajo && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-expanded={verReparto}
            aria-controls="reparto-del-trabajo"
            onClick={() => setVerReparto((v) => !v)}
            className="h-7 gap-1.5 px-2 text-xs text-muted-foreground"
          >
            <Clock className="h-3.5 w-3.5" />
            Reparto del trabajo
            <ChevronDown
              className={cn("h-3.5 w-3.5 transition-transform", verReparto && "rotate-180")}
            />
          </Button>
        )}

        </div>
        <div className="flex shrink-0 items-center gap-2">
          {/* Crear lo puede cualquiera del equipo: el proyecto queda a su
              cargo. Lo de los demás sigue necesitando ser administrador. */}
          <Button size="sm" onClick={() => setCreating(true)} className="gap-1.5">
            <Plus className="h-4 w-4" /> Nuevo
          </Button>
        </div>
      </ModuleToolbar>

      {/* Abierto, se pinta pegado al botón que lo abrió. El alto que ocupa se
          lo quita a la rejilla, que hace su propio scroll: los proyectos se
          comprimen, no se van de la pantalla. */}
      {repartoDelTrabajo && verReparto && (
        <div id="reparto-del-trabajo" className="mb-3 shrink-0">
          {repartoDelTrabajo}
        </div>
      )}

      {loading ? (
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : visibleProjects.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
          <FolderKanban className="h-10 w-10 text-muted-foreground/40" />
          <div>
            <p className="font-medium">
              {projects.length === 0 ? "Todavía no hay proyectos" : "Nada coincide con esa búsqueda"}
            </p>
            <p className="text-sm text-muted-foreground">
              {projects.length === 0
                ? "Crea el primero y empieza a repartir tareas con tu equipo."
                : "Prueba con otro texto o quita los filtros."}
            </p>
          </div>
          {projects.length === 0 && (
            <Button onClick={() => setCreating(true)} className="gap-2">
              <Plus className="h-4 w-4" /> Nuevo proyecto
            </Button>
          )}
        </div>
      ) : (
        <div className="grid min-h-0 flex-1 auto-rows-min grid-cols-1 items-stretch gap-3 overflow-y-auto pb-2 sm:grid-cols-2 lg:grid-cols-3">
          {visibleProjects.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              canManage={project.puedeGestionar}
              carpetas={carpetas.carpetas}
              carpetaActual={carpetas.deCadaCosa[String(project.id)] ?? null}
              onMoverACarpeta={(id) => void carpetas.mover(String(project.id), id)}
              onOpen={() => setOpenProjectId(project.id)}
              onEdit={() => setEditing(project)}
              onDelete={() => setDeleteTarget(project)}
              onCompartir={() => setCompartiendo(project)}
            />
          ))}
        </div>
      )}

      <ProjectDialog
        open={creating || editing !== null}
        project={editing}
        team={team}
        onClose={() => { setCreating(false); setEditing(null); }}
        onSaved={() => { setCreating(false); setEditing(null); void load(); }}
      />

      {/* El MISMO diálogo de Diagramas: buscador de cuentas, interruptor por
          cuenta y «N de M cuentas». Lo que cambia son las acciones. */}
      {compartiendo && (
        <CompartirConCuentasDialog
          open={!!compartiendo}
          setOpen={(v) => !v && setCompartiendo(null)}
          titulo={compartiendo.name}
          queSeVe="Proyectos"
          cargar={async () => {
            const res = await getProjectShareTargetsAction(compartiendo.id);
            return res.success && res.data
              ? { ok: true, cuentas: res.data }
              : { ok: false, cuentas: [], message: res.message };
          }}
          guardar={async (destinos) => {
            const res = await setProjectSharesAction(compartiendo.id, destinos);
            return res.success ? { ok: true } : { ok: false, message: res.message };
          }}
          onSaved={() => void load()}
        />
      )}

      <AlertDialog open={deleteTarget !== null} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar proyecto</AlertDialogTitle>
            <AlertDialogDescription>
              {`Se eliminará «${deleteTarget?.name ?? ""}». Sus tareas NO se borran: se quedan en la pantalla de Tareas, sueltas.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              disabled={busy}
              onClick={(e) => { e.preventDefault(); void handleDelete(); }}
            >
              {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── Tarjeta ─────────────────────────────────────────────────────────────────

function ProjectCard({
  project,
  canManage,
  carpetas,
  carpetaActual,
  onMoverACarpeta,
  onOpen,
  onEdit,
  onDelete,
  onCompartir,
}: {
  project: ProjectData;
  canManage: boolean;
  carpetas: CarpetaDeProyecto[];
  carpetaActual: string | null;
  onMoverACarpeta: (carpetaId: string | null) => void;
  onOpen: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onCompartir: () => void;
}) {
  const total = BOARD_COLUMNS.reduce((sum, col) => sum + (project.taskCounts[col.status] ?? 0), 0);
  const due = describeDue(project.dueDate);
  const shown = project.members.slice(0, 4);
  const rest = project.members.length - shown.length;

  // Solo las etapas con tareas: una leyenda de cinco entradas a cero no dice nada.
  const segments = BOARD_COLUMNS
    .map((col) => ({ ...col, count: project.taskCounts[col.status] ?? 0 }))
    .filter((col) => col.count > 0);

  return (
    <Card
      className="group relative flex h-full cursor-pointer flex-col transition-colors hover:border-primary/50"
      onClick={onOpen}
    >
      <CardContent className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex items-start gap-2">
          <p className="min-w-0 flex-1 font-semibold leading-snug">{project.name}</p>
          {/* Quietas hasta que el puntero entra o llega el teclado: la papelera
              roja permanente era lo más llamativo de la tarjeta. Van en la fila,
              antes del estado: así el estado se queda pegado a la derecha, en el
              mismo sitio que le sale a un participante, que no tiene botones. */}
          <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
            {/* Archivar en una carpeta es ordenar la propia pantalla, no cambiar
                el proyecto: no pide ser quien lo gestiona. */}
            <MoverACarpeta
              carpetas={carpetas}
              actual={carpetaActual}
              onMover={onMoverACarpeta}
              className="h-6 w-6 rounded-md border"
            />
            {canManage && (
              <>
              {/* Compartir con otras cuentas es de quien manda en el proyecto,
                  igual que en Diagramas: en uno recibido no sale, porque
                  repartirlo sigue siendo de quien lo hizo. */}
              <Button
                variant="outline" size="icon" className="h-6 w-6"
                title="Compartir con otras cuentas"
                aria-label={`Compartir ${project.name}`}
                onClick={(e) => { e.stopPropagation(); onCompartir(); }}
              >
                <Share2 className="h-3 w-3" />
              </Button>
              <Button
                variant="outline" size="icon"
                className="h-6 w-6 text-muted-foreground hover:text-red-600"
                title="Eliminar" aria-label={`Eliminar ${project.name}`}
                onClick={(e) => { e.stopPropagation(); onDelete(); }}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
              <Button
                variant="outline" size="icon" className="h-6 w-6"
                title="Editar" aria-label={`Editar ${project.name}`}
                onClick={(e) => { e.stopPropagation(); onEdit(); }}
              >
                <Pencil className="h-3 w-3" />
              </Button>
              </>
            )}
          </div>
          {/* De dónde viene, o a cuántas cuentas se les está enseñando. Sin
              esto, en la cuenta invitada aparecen proyectos que nadie de allí
              creó y no hay forma de saber de quién son. */}
          {project.recibido ? (
            <Badge
              variant="outline"
              className="shrink-0 gap-1 border-sky-500/40 bg-sky-500/10 text-[10px] text-sky-600 dark:text-sky-400"
              title={`Compartido por ${project.deLaCuenta ?? "otra cuenta"}${
                project.puedeEditarTareas ? " · puedes editar" : " · solo lectura"
              }`}
            >
              <Building2 className="h-3 w-3" />
              <span className="max-w-[7rem] truncate">{project.deLaCuenta ?? "Compartido"}</span>
            </Badge>
          ) : (
            project.compartidoCon > 0 && (
              <Badge
                variant="outline"
                className="shrink-0 gap-1 text-[10px] text-muted-foreground"
                title={`Se lo estás enseñando a ${project.compartidoCon} ${
                  project.compartidoCon === 1 ? "cuenta" : "cuentas"
                }`}
              >
                <Share2 className="h-3 w-3" />
                {project.compartidoCon}
              </Badge>
            )
          )}
          <Badge variant="outline" className={cn("shrink-0 text-[10px] uppercase", STATUS_STYLES[project.status])}>
            {PROJECT_STATUS_LABELS[project.status]}
          </Badge>
        </div>

        {project.description && (
          <p className="line-clamp-2 text-xs text-muted-foreground">{project.description}</p>
        )}

        {/* Barra partida por etapas: dice DÓNDE está el trabajo, no solo cuánto
            falta. Cuatro por hacer y nada en curso es un proyecto parado. */}
        <div className="flex flex-col gap-1.5">
          <div className="flex h-1.5 overflow-hidden rounded-full border border-border bg-muted">
            {segments.map((col) => (
              <span
                key={col.status}
                style={{ width: `${(col.count / total) * 100}%`, backgroundColor: col.color }}
              />
            ))}
          </div>
          <div className="flex min-h-[2.2rem] flex-wrap content-start gap-x-2.5 gap-y-1 text-[11px] tabular-nums text-muted-foreground">
            {total === 0 ? (
              <span>Sin tareas todavía</span>
            ) : (
              segments.map((col) => (
                <span key={col.status} className="inline-flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-[2px]" style={{ backgroundColor: col.color }} />
                  <b className="font-semibold text-foreground">{col.count}</b> {col.label.toLowerCase()}
                </span>
              ))
            )}
          </div>
        </div>

        <div className="mt-auto flex items-center justify-between gap-2 pt-0.5">
          <div className="flex items-center">
            {shown.map((member) => {
              const label = personLabel(member);
              return (
                <span
                  key={member.userId}
                  title={label}
                  className={cn(
                    "-mr-1.5 grid h-6 w-6 place-items-center rounded-full border-2 border-card text-[9px] font-semibold text-white",
                    avatarColor(member.userId),
                  )}
                >
                  {initials(label)}
                </span>
              );
            })}
            {rest > 0 && (
              <span className="-mr-1.5 grid h-6 w-6 place-items-center rounded-full border-2 border-card bg-muted text-[9px] font-semibold text-muted-foreground">
                +{rest}
              </span>
            )}
            {project.members.length === 0 && (
              <span className="text-[11px] text-muted-foreground">Sin equipo</span>
            )}
            {/* Quién lo creó, junto a «Sin equipo». Va aquí y no en una fila
                propia porque la tarjeta son tres filas fijas y una cuarta la
                descuadraría (ver la regla de la tarjeta de Diagramas). Con
                equipo, la raya lo separa de los avatares. */}
            {project.createdByName && (
              <span
                className="ml-2 max-w-[9rem] truncate border-l pl-2 text-[11px] text-muted-foreground"
                title={`Creado por ${project.createdByName}`}
              >
                {project.createdByName}
              </span>
            )}
          </div>

          <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium", DUE_TONES[due.tone])}>
            {due.label}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Alta / edición ──────────────────────────────────────────────────────────

function ProjectDialog({
  open,
  project,
  team,
  onClose,
  onSaved,
}: {
  open: boolean;
  project: ProjectData | null;
  team: AdvisorInfo[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<ProjectStatus>("activo");
  const [leadId, setLeadId] = useState<string>("");
  const [dueDate, setDueDate] = useState("");
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  // Se repuebla al abrir: si no, el formulario conserva lo del proyecto anterior.
  useEffect(() => {
    if (!open) return;
    setName(project?.name ?? "");
    setDescription(project?.description ?? "");
    setStatus(project?.status ?? "activo");
    setLeadId(project?.leadId ?? "");
    setDueDate(project?.dueDate ? project.dueDate.slice(0, 10) : "");
    setMemberIds(project?.members.map((m) => m.userId) ?? []);
  }, [open, project]);

  const toggleMember = (id: string) =>
    setMemberIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const handleSave = async () => {
    if (!name.trim()) { toast.error("Ponle un nombre al proyecto."); return; }
    setSaving(true);
    const res = await saveProjectAction({
      id: project?.id,
      name: name.trim(),
      description: description.trim() || null,
      status,
      leadId: leadId || null,
      dueDate: dueDate ? new Date(`${dueDate}T12:00:00`).toISOString() : null,
      memberIds,
    });
    setSaving(false);
    if (!res.success) { toast.error(res.message); return; }
    toast.success(res.message);
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{project ? "Editar proyecto" : "Nuevo proyecto"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="project-name">Nombre</Label>
            <Input
              id="project-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej. Rediseño de la web"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="project-description">Descripción</Label>
            <Textarea
              id="project-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Opcional: en qué consiste."
              rows={2}
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="project-status">Estado</Label>
              <select
                id="project-status"
                value={status}
                onChange={(e) => setStatus(e.target.value as ProjectStatus)}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                {PROJECT_STATUSES.map((s) => (
                  <option key={s} value={s}>{PROJECT_STATUS_LABELS[s]}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="project-due">Fecha límite</Label>
              <Input
                id="project-due"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="project-lead">Responsable</Label>
            <select
              id="project-lead"
              value={leadId}
              onChange={(e) => setLeadId(e.target.value)}
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">Sin asignar</option>
              {team.map((person) => (
                <option key={person.id} value={person.id}>{personLabel(person)}</option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <Label>Equipo</Label>
            {team.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Todavía no tienes a nadie en el equipo. Puedes crear el proyecto igual y añadirlos después.
              </p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {team.map((person) => {
                  const active = memberIds.includes(person.id);
                  return (
                    <button
                      key={person.id}
                      type="button"
                      onClick={() => toggleMember(person.id)}
                      className={cn(
                        "rounded-full border px-3 py-1 text-xs transition-colors",
                        active
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border text-muted-foreground hover:border-primary/50",
                      )}
                    >
                      {personLabel(person)}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button onClick={() => void handleSave()} disabled={saving} className="gap-2">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {project ? "Guardar" : "Crear proyecto"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
