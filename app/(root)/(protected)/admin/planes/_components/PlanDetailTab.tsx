"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type CollisionDetection,
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
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  GripVertical,
  Loader2,
  Plus,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { recordarLaAsistencia } from "@/lib/enlaces-de-planes";
import { ImageUploader } from "@/components/ui/image-uploader";
import { VideoUploader } from "@/components/ui/video-uploader";
import {
  getPlanDetailBySubscriptionPlanId,
  upsertPlanDetail,
  type UpsertPlanDetailInput,
} from "@/actions/plan-detail-actions";
import { elDibujoDelRecuadro } from "@/components/shared/DibujoDelRecuadro";
import {
  elMasCercanoEnVertical,
  elOrdenAlMover,
  elOrdenAlSoltar,
  laMarcaDeLaCaida,
} from "@/lib/bloques-del-formulario-del-plan";
import {
  BLOQUES_DE_LA_PAGINA,
  DATOS_QUE_SE_PUEDEN_USAR,
  ICONOS_DE_RECUADRO,
  PARA_QUIEN_DE_FABRICA,
  TOPES_DEL_RECUADRO,
  TOPE_DE_RECUADROS,
  TOPE_DEL_CASO,
  TOPE_DEL_PARA_QUIEN,
  TITULO_DEL_TODO_INCLUIDO,
  TOPE_DEL_TEXTO_DEL_TODO_INCLUIDO,
  TOPE_DEL_TITULO_DEL_TODO_INCLUIDO,
  comoEnlaceDelBoton,
  comoOrdenDeBloques,
  elVideoDelPlan,
  esLaListaDeFabrica,
  laListaDeRecuadros,
  losAvisosDelBoton,
  losAvisosDelParaQuien,
  losAvisosDelTodoIncluido,
  losAvisosDelTexto,
  elTextoDelBotonDelPlan,
  losRecuadrosDeFabrica,
  revisarLosRecuadros,
  unRecuadroNuevo,
  type BloqueDeLaPagina,
  type DatosDelPlan,
  type FuncionQueSeEnsena,
  type IconoDeRecuadro,
  type ParaQuienDelPlan,
  type RecuadroDeCapacidad,
  type TarjetaDeCapacidad,
  type TodoIncluidoDelPlan,
} from "@/lib/pagina-de-plan";

/**
 * Lo que es SOLO de un plan en su página pública: el ORDEN de sus bloques, el
 * video (enlace o archivo subido), «para quién es este plan» con su caso
 * típico, los recuadros del resumen de capacidad (cuántos, en qué orden y qué
 * dato destaca cada uno), sus preguntas frecuentes, «Todo incluido, sin
 * sorpresas» (título y texto libre de lo que trae sin costo adicional), los
 * botones de comenzar y el título de la pestaña.
 *
 * **Los bloques del formulario van en el MISMO orden que la página**, y cada
 * uno se arrastra entero por su asa (o se sube y se baja): moverlo aquí es
 * moverlo en la página. Antes iban en un orden fijo y el orden se elegía en una
 * lista aparte, así que con un orden distinto al de fábrica había que saltar
 * arriba y abajo para editar la página de arriba a abajo. La lista «Orden de la
 * página» se queda como índice: dice el orden de un vistazo, mueve lo mismo y
 * lleva a cada bloque. Las reglas de mover son UNA, en
 * `lib/bloques-del-formulario-del-plan.ts`, para el índice y para los bloques.
 *
 * Todo lo demás de la página —el nombre, el precio, los créditos, el tope del
 * catálogo y las funciones, una tarjeta por función en el orden en que se
 * arrastran— sale de la pestaña Configuración, en vivo. Por eso aquí ya no hay hero, ni
 * galería, ni estadísticas, ni testimonios, ni secciones de marketing: la
 * página no los enseña. Lo que hubiera guardado se conserva (guardar solo
 * manda los campos de abajo, `upsertPlanDetail` no toca los demás).
 *
 * Cada texto se revisa contra el plan TAL CUAL está en el formulario: uno que
 * diga otros créditos o llame al plan por un nombre viejo no sale en la página,
 * y aquí se dice por qué.
 */

type Pregunta = { id: string; question: string; answer: string };

type Detalle = {
  videoUrl: string;
  videoTitle: string;
  videoThumbnailUrl: string;
  ctaButtonText: string;
  ctaButtonUrl: string;
  ctaSecondaryText: string;
  ctaSecondaryUrl: string;
  meetingUrl: string;
  whatsappMessage: string;
  metaTitle: string;
  metaDescription: string;
  ogImageUrl: string;
};

const VACIO: Detalle = {
  videoUrl: "",
  videoTitle: "",
  videoThumbnailUrl: "",
  ctaButtonText: "",
  ctaButtonUrl: "",
  ctaSecondaryText: "",
  ctaSecondaryUrl: "",
  meetingUrl: "",
  whatsappMessage: "",
  metaTitle: "",
  metaDescription: "",
  ogImageUrl: "",
};

/** El aire que se deja encima de un bloque al ir a él desde el índice. */
const AIRE_AL_IR_A_UN_BLOQUE = 8;

let siguiente = 0;
function nuevoId(): string {
  siguiente += 1;
  return `p-${Date.now().toString(36)}-${siguiente}`;
}

function texto(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function nombreDelBloque(clave: BloqueDeLaPagina): string {
  return BLOQUES_DE_LA_PAGINA.find((b) => b.clave === clave)?.nombre ?? clave;
}

/**
 * El contenedor que desplaza a `nodo`: el primer antepasado con scroll propio
 * que de verdad desplaza (en el panel, el cuerpo de la ventana de Planes), y si
 * no hay ninguno, la página. Nada de `scrollIntoView`, que mueve TODOS los
 * antepasados y haría saltar la ventana entera.
 */
function elQueDesplaza(nodo: HTMLElement): HTMLElement {
  for (let p = nodo.parentElement; p; p = p.parentElement) {
    const { overflowY } = getComputedStyle(p);
    if ((overflowY === "auto" || overflowY === "scroll") && p.scrollHeight > p.clientHeight) return p;
  }
  return (document.scrollingElement as HTMLElement | null) ?? document.documentElement;
}

/** Desplaza lo justo para que `nodo` quede con su borde de arriba en `arriba` (coordenadas de la ventana). */
function dejarArriba(nodo: HTMLElement, arriba: number, suave = false) {
  const s = elQueDesplaza(nodo);
  const delta = nodo.getBoundingClientRect().top - arriba;
  if (!delta) return;
  if (s === document.scrollingElement || s === document.documentElement) {
    window.scrollTo({ top: window.scrollY + delta, behavior: suave ? "smooth" : "auto" });
  } else {
    s.scrollTo({ top: s.scrollTop + delta, behavior: suave ? "smooth" : "auto" });
  }
}

function Bloque({ titulo, ayuda, children }: { titulo: string; ayuda?: ReactNode; children: ReactNode }) {
  return (
    <section className="space-y-3 rounded-lg border border-border p-3">
      <div className="space-y-0.5">
        <h3 className="text-sm font-semibold">{titulo}</h3>
        {ayuda && <p className="text-[11px] text-muted-foreground">{ayuda}</p>}
      </div>
      {children}
    </section>
  );
}

function Avisos({ avisos }: { avisos: string[] }) {
  if (avisos.length === 0) return null;
  return (
    <ul className="space-y-0.5" data-aviso-del-detalle>
      {avisos.map((a) => (
        <li key={a} className="flex items-start gap-1 text-[11px] text-amber-600 dark:text-amber-400">
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
          <span>{a}</span>
        </li>
      ))}
    </ul>
  );
}

/** Los avisos de un texto que se enseña en la página: contradice al plan, o nombra otro. */
function avisosDelTexto(valor: string, datos: DatosDelPlan): string[] {
  const t = valor.trim();
  if (!t) return [];
  const avisos = [...losAvisosDelTexto(t, datos), ...losAvisosDelBoton(t, datos)];
  return avisos.length ? [`No sale en la página: ${[...new Set(avisos)].join(" ")}`] : [];
}

function avisosDelEnlace(valor: string): string[] {
  return valor.trim() && !comoEnlaceDelBoton(valor)
    ? ["Este enlace no sirve (tiene que empezar por https:// o por /): no se usa."]
    : [];
}

export function PlanDetailTab({
  subscriptionPlanId,
  datos,
  enlaceDeLaPagina,
  asistenciaDeLaPagina,
  planActivo,
  funcionesQueSalen,
}: {
  subscriptionPlanId: string;
  datos: DatosDelPlan;
  /** `/planes/nivel-N`: la modalidad no va en la dirección (`lib/enlaces-de-planes.ts`). */
  enlaceDeLaPagina: string;
  /** La modalidad de este plan; se apunta en la cookie al abrir la página. */
  asistenciaDeLaPagina?: string;
  planActivo: boolean;
  /**
   * Las funciones que salen en «Qué incluye», tal cual están en la pestaña
   * Configuración (sin guardar todavía también). Se enseñan aquí, en su sitio
   * del orden, para que el formulario se lea como la página; se editan allí.
   */
  funcionesQueSalen?: readonly FuncionQueSeEnsena[];
}) {
  const [form, setForm] = useState<Detalle>(VACIO);
  const [paraQuien, setParaQuien] = useState<ParaQuienDelPlan>({ paraQuien: "", caso: "" });
  const [todoIncluido, setTodoIncluido] = useState<TodoIncluidoDelPlan>({ titulo: "", texto: "" });
  const [orden, setOrden] = useState<BloqueDeLaPagina[]>(() => comoOrdenDeBloques(null));
  /**
   * Los recuadros tal cual llegaron de la base (`null`: sin tocar) y, aparte,
   * los que se están escribiendo (`null` mientras no se toque nada). Sin
   * tocar, la lista se arma con el plan del formulario y guardar NO la manda:
   * así un plan sin recuadros escritos sigue diciendo sus datos de hoy.
   */
  const [recuadrosGuardados, setRecuadrosGuardados] = useState<unknown>(null);
  const [recuadrosEscritos, setRecuadrosEscritos] = useState<RecuadroDeCapacidad[] | null>(null);
  const [preguntas, setPreguntas] = useState<Pregunta[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  /** El bloque que se arrastra y sobre cuál caería, para pintar la raya de la caída. */
  const [arrastrado, setArrastrado] = useState<BloqueDeLaPagina | null>(null);
  const [sobre, setSobre] = useState<BloqueDeLaPagina | null>(null);
  /** El nodo de cada bloque del formulario: para medirlo en vivo, ir a él y anclarlo. */
  const nodos = useRef(new Map<BloqueDeLaPagina, HTMLElement>());
  /**
   * El bloque que se acaba de mover y dónde tiene que quedar en la pantalla
   * (su borde de arriba). Sin esto, al soltar un bloque largo la lista se
   * reordena y el que se movió se va de la vista: se perdería de vista
   * justo lo que se acaba de colocar.
   */
  const ancla = useRef<{ clave: BloqueDeLaPagina; arriba: number } | null>(null);

  useEffect(() => {
    if (!subscriptionPlanId) return;
    let vivo = true;
    setLoading(true);
    getPlanDetailBySubscriptionPlanId(subscriptionPlanId)
      .then((res) => {
        if (!vivo) return;
        const d = (res.success && res.data ? res.data : null) as Record<string, unknown> | null;
        setForm({
          videoUrl: texto(d?.videoUrl),
          videoTitle: texto(d?.videoTitle),
          videoThumbnailUrl: texto(d?.videoThumbnailUrl),
          ctaButtonText: texto(d?.ctaButtonText),
          ctaButtonUrl: texto(d?.ctaButtonUrl),
          ctaSecondaryText: texto(d?.ctaSecondaryText),
          ctaSecondaryUrl: texto(d?.ctaSecondaryUrl),
          meetingUrl: texto(d?.meetingUrl),
          whatsappMessage: texto(d?.whatsappMessage),
          metaTitle: texto(d?.metaTitle),
          metaDescription: texto(d?.metaDescription),
          ogImageUrl: texto(d?.ogImageUrl),
        });
        setParaQuien({ paraQuien: res.paraQuien?.paraQuien ?? "", caso: res.paraQuien?.caso ?? "" });
        setTodoIncluido({ titulo: res.todoIncluido?.titulo ?? "", texto: res.todoIncluido?.texto ?? "" });
        setOrden(comoOrdenDeBloques(res.orden));
        setRecuadrosGuardados(res.recuadros ?? null);
        setRecuadrosEscritos(null);
        const faqs = Array.isArray(d?.faqs) ? (d!.faqs as unknown[]) : [];
        setPreguntas(
          faqs.map((f) => {
            const o = (f && typeof f === "object" ? f : {}) as Record<string, unknown>;
            return { id: nuevoId(), question: texto(o.question), answer: texto(o.answer) };
          }),
        );
      })
      .catch((e) => {
        console.error("[planes] no se pudo leer el detalle del plan", e);
        toast.error("No se pudo leer el detalle de este plan.");
      })
      .finally(() => {
        if (vivo) setLoading(false);
      });
    return () => {
      vivo = false;
    };
  }, [subscriptionPlanId]);

  // Después de mover un bloque, se deja donde estaba en la pantalla (antes de pintar: sin salto).
  useLayoutEffect(() => {
    const a = ancla.current;
    if (!a) return;
    ancla.current = null;
    const nodo = nodos.current.get(a.clave);
    if (nodo) dejarArriba(nodo, a.arriba);
  }, [orden]);

  const cambiar = (clave: keyof Detalle, valor: string) => setForm((f) => ({ ...f, [clave]: valor }));

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  /* ─── El índice «Orden de la página» ─── */

  const alSoltarEnElIndice = (e: DragEndEvent) =>
    setOrden((lista) => [...elOrdenAlSoltar(lista, e.active.id as BloqueDeLaPagina, (e.over?.id as BloqueDeLaPagina) ?? null)]);

  /** Subir y bajar: lo mismo que arrastrar, para el teclado y el táctil. */
  const moverEnElIndice = (bloque: BloqueDeLaPagina, paso: -1 | 1) =>
    setOrden((lista) => [...elOrdenAlMover(lista, bloque, paso)]);

  /** Lleva el formulario al bloque, sin mover la ventana entera, y le da el foco. */
  const irAlBloque = (clave: BloqueDeLaPagina) => {
    const nodo = nodos.current.get(clave);
    if (!nodo) return;
    const s = elQueDesplaza(nodo);
    const arribaDelQueDesplaza =
      s === document.scrollingElement || s === document.documentElement ? 0 : s.getBoundingClientRect().top;
    dejarArriba(nodo, arribaDelQueDesplaza + AIRE_AL_IR_A_UN_BLOQUE, true);
    nodo.focus({ preventScroll: true });
  };

  /* ─── Los bloques del formulario ─── */

  /**
   * Qué bloque está debajo: el de la ALTURA del puntero (con el teclado, la del
   * centro de lo que se arrastra), midiendo los bloques en vivo. Por el centro,
   * como en una lista de filas iguales, soltar al principio de un bloque largo
   * caería en el de al lado.
   */
  const porLaAltura: CollisionDetection = (args) => {
    const y = args.pointerCoordinates?.y ?? args.collisionRect.top + args.collisionRect.height / 2;
    const cajas = args.droppableContainers.flatMap((c) => {
      const r = nodos.current.get(c.id as BloqueDeLaPagina)?.getBoundingClientRect() ?? args.droppableRects.get(c.id);
      return r ? [{ id: c.id, top: r.top, bottom: r.bottom }] : [];
    });
    const id = elMasCercanoEnVertical(cajas, y);
    const contenedor = id === null ? undefined : args.droppableContainers.find((c) => c.id === id);
    return contenedor ? [{ id: contenedor.id, data: { droppableContainer: contenedor, value: 0 } }] : [];
  };

  const terminarElArrastre = () => {
    setArrastrado(null);
    setSobre(null);
  };

  const alSoltarUnBloqueDelFormulario = (e: DragEndEvent) => {
    const activo = e.active.id as BloqueDeLaPagina;
    const destino = (e.over?.id as BloqueDeLaPagina) ?? null;
    const arriba = e.active.rect.current.translated?.top;
    terminarElArrastre();
    const nuevo = elOrdenAlSoltar(orden, activo, destino);
    if (nuevo === orden) return;
    // Queda donde se soltó: el borde de arriba de lo que se arrastraba.
    if (typeof arriba === "number") ancla.current = { clave: activo, arriba };
    setOrden([...nuevo]);
  };

  const moverElBloqueDelFormulario = (clave: BloqueDeLaPagina, paso: -1 | 1) => {
    const nuevo = elOrdenAlMover(orden, clave, paso);
    if (nuevo === orden) return;
    // El bloque se queda quieto en la pantalla (y su flecha bajo el puntero): se mueven los demás.
    const arriba = nodos.current.get(clave)?.getBoundingClientRect().top;
    if (typeof arriba === "number") ancla.current = { clave, arriba };
    setOrden([...nuevo]);
  };

  /* ─── Recuadros y preguntas ─── */

  const recuadros = recuadrosEscritos ?? laListaDeRecuadros(recuadrosGuardados, datos);

  /** Cualquier cambio arranca de la lista que se está viendo y la deja «tocada». */
  const tocarLosRecuadros = (cambio: (lista: RecuadroDeCapacidad[]) => RecuadroDeCapacidad[]) =>
    setRecuadrosEscritos((escritos) => cambio(escritos ?? laListaDeRecuadros(recuadrosGuardados, datos)));

  const cambiarRecuadro = (id: string, patch: Partial<RecuadroDeCapacidad>) =>
    tocarLosRecuadros((lista) => lista.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  const moverRecuadro = (id: string, paso: -1 | 1) =>
    tocarLosRecuadros((lista) => {
      const de = lista.findIndex((r) => r.id === id);
      const a = de + paso;
      return de < 0 || a < 0 || a >= lista.length ? lista : arrayMove(lista, de, a);
    });

  const alSoltarUnRecuadro = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    tocarLosRecuadros((lista) => {
      const de = lista.findIndex((r) => r.id === active.id);
      const a = lista.findIndex((r) => r.id === over.id);
      return de < 0 || a < 0 ? lista : arrayMove(lista, de, a);
    });
  };

  const alSoltar = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    setPreguntas((lista) => {
      const de = lista.findIndex((p) => p.id === active.id);
      const a = lista.findIndex((p) => p.id === over.id);
      return de < 0 || a < 0 ? lista : arrayMove(lista, de, a);
    });
  };

  const handleSave = async () => {
    setSaving(true);
    // Solo lo de esta pestaña: lo demás que hubiera guardado se queda como está.
    const datosAGuardar: Partial<UpsertPlanDetailInput> = {
      ...form,
      paraQuien: paraQuien.paraQuien,
      caso: paraQuien.caso,
      todoIncluidoTitulo: todoIncluido.titulo,
      todoIncluidoTexto: todoIncluido.texto,
      orden,
      // Solo si se tocaron: sin tocar, la página sigue armándolos con el plan.
      ...(recuadrosEscritos ? { recuadros: recuadrosEscritos } : {}),
      faqs: preguntas
        .map((p) => ({ question: p.question.trim(), answer: p.answer.trim() }))
        .filter((p) => p.question || p.answer),
    };
    try {
      const res = await upsertPlanDetail(subscriptionPlanId, datosAGuardar);
      if (res.success) {
        toast.success(res.message);
        if (recuadrosEscritos) {
          // Lo que dice lo de fábrica se guardó como «sin tocar» (la acción lo
          // decide igual): desde ahora sigue al plan.
          setRecuadrosGuardados(esLaListaDeFabrica(recuadrosEscritos, datos) ? null : recuadrosEscritos);
          setRecuadrosEscritos(null);
        }
      } else toast.error(res.message);
    } catch (e) {
      console.error("[planes] no se pudo guardar el detalle del plan", e);
      toast.error("No se pudo guardar el detalle. Revisa la conexión y vuelve a intentarlo.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const video = form.videoUrl.trim() ? elVideoDelPlan(form.videoUrl) : null;
  const sinPrecio = datos.precioUSD <= 0;
  const deFabrica =
    (PARA_QUIEN_DE_FABRICA as Record<string, ParaQuienDelPlan>)[datos.plan] ?? PARA_QUIEN_DE_FABRICA.personalizado;
  const avisosDelParaQuien = losAvisosDelParaQuien(paraQuien, datos);
  const avisosDelTodoIncluido = losAvisosDelTodoIncluido(todoIncluido, datos);
  const aviso = (lista: string[]) => (lista.length ? [`No sale en la página (sale el de fábrica): ${lista.join(" ")}`] : []);
  const revisados = revisarLosRecuadros(recuadros, datos);
  const cuantosSalen = revisados.filter((r) => r.comoSale).length;
  const sonLosDeFabrica = esLaListaDeFabrica(recuadros, datos);
  const datosQueSePuedenUsar = DATOS_QUE_SE_PUEDEN_USAR.map((d) => d.clave).join(", ");
  /** Por qué un bloque no va a salir aunque esté en el orden. */
  const porQueNoSale: Partial<Record<BloqueDeLaPagina, string>> = {
    ...(video ? {} : { video: "Sin video: no sale." }),
    ...(cuantosSalen > 0 ? {} : { capacidad: "Sin recuadros con dato: no sale." }),
    ...(funcionesQueSalen && funcionesQueSalen.length === 0
      ? { funciones: "Sin funciones encendidas que listar: no sale." }
      : {}),
    ...(preguntas.some((p) => p.question.trim() && p.answer.trim()) ? {} : { preguntas: "Sin preguntas: no sale." }),
    ...(!todoIncluido.texto.trim()
      ? { incluido: "Sin texto: no sale." }
      : avisosDelTodoIncluido.texto.length > 0
        ? { incluido: "El texto contradice al plan: no sale." }
        : {}),
  };
  const marca = laMarcaDeLaCaida(orden, arrastrado, sobre);

  /** Cada bloque de la página: su título, su ayuda y lo que se edita. El ORDEN lo pone `orden`. */
  const bloques: Record<BloqueDeLaPagina, { titulo: string; ayuda: ReactNode; cuerpo: ReactNode }> = {
    video: {
      titulo: "Video del plan",
      ayuda: "Pega un enlace de YouTube, Vimeo, Loom o Google Drive, o sube el archivo de video.",
      cuerpo: (
        <>
          <div className="space-y-1">
            <Label>Subir el video como archivo</Label>
            <VideoUploader value={form.videoUrl} onChange={(url) => cambiar("videoUrl", url)} />
          </div>
          <div className="space-y-1">
            <Label>O pega el enlace del video</Label>
            <Input
              value={form.videoUrl}
              onChange={(e) => cambiar("videoUrl", e.target.value)}
              placeholder="https://www.youtube.com/watch?v=..."
              data-campo-del-detalle="videoUrl"
            />
            {!form.videoUrl.trim() ? (
              <p className="text-[11px] text-muted-foreground">Sin video: la página sale sin él.</p>
            ) : video ? (
              <p className="flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400" data-video-valido>
                <CheckCircle2 className="h-3 w-3" /> Se enseña en la página.
              </p>
            ) : (
              <Avisos avisos={["Este enlace no es un video que se pueda enseñar: la página sale sin video."]} />
            )}
          </div>
          <div className="space-y-1">
            <Label>Título del video</Label>
            <Input
              value={form.videoTitle}
              onChange={(e) => cambiar("videoTitle", e.target.value)}
              placeholder={`Así funciona el plan ${datos.nombre}`}
              data-campo-del-detalle="videoTitle"
            />
            <Avisos avisos={avisosDelTexto(form.videoTitle, datos)} />
          </div>
          <div className="space-y-1">
            <Label>Miniatura del video (opcional)</Label>
            <ImageUploader
              value={form.videoThumbnailUrl}
              onChange={(url) => cambiar("videoThumbnailUrl", url)}
              placeholder="Subir miniatura"
            />
          </div>
        </>
      ),
    },
    paraquien: {
      titulo: "Para quién es este plan",
      ayuda: (
        <>
          Si lo dejas vacío sale el texto de fábrica de este nivel. Puedes escribir {datosQueSePuedenUsar} y salen con
          el dato de hoy.
        </>
      ),
      cuerpo: (
        <>
          <div className="space-y-1">
            <Label>Para quién es</Label>
            <Textarea
              rows={2}
              maxLength={TOPE_DEL_PARA_QUIEN}
              value={paraQuien.paraQuien}
              onChange={(e) => setParaQuien((p) => ({ ...p, paraQuien: e.target.value }))}
              placeholder={deFabrica.paraQuien}
              data-campo-del-detalle="paraQuien"
            />
            <Avisos avisos={aviso(avisosDelParaQuien.paraQuien)} />
          </div>
          <div className="space-y-1">
            <Label>Un caso típico de negocio</Label>
            <Textarea
              rows={3}
              maxLength={TOPE_DEL_CASO}
              value={paraQuien.caso}
              onChange={(e) => setParaQuien((p) => ({ ...p, caso: e.target.value }))}
              placeholder={deFabrica.caso}
              data-campo-del-detalle="caso"
            />
            <Avisos avisos={aviso(avisosDelParaQuien.caso)} />
          </div>
        </>
      ),
    },
    capacidad: {
      titulo: `Resumen de capacidad (${recuadros.length} de ${TOPE_DE_RECUADROS} recuadros)`,
      ayuda: (
        <>
          Tú decides cuántos recuadros salen en el resumen de este plan, en qué orden y qué dato destaca cada uno; no
          dependen de las funciones. Un recuadro sin dato no sale, y nunca sale «No incluido». Puedes escribir{" "}
          {datosQueSePuedenUsar} y salen con el dato de hoy.
        </>
      ),
      cuerpo: (
        <>
          {recuadros.length === 0 ? (
            <p className="text-[11px] text-muted-foreground" data-sin-recuadros>
              Sin recuadros: el resumen de capacidad no sale en la página.
            </p>
          ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={alSoltarUnRecuadro}>
              <SortableContext items={recuadros.map((r) => r.id)} strategy={verticalListSortingStrategy}>
                <ol className="space-y-2" data-lista-de-recuadros>
                  {revisados.map(({ recuadro, motivos, comoSale }, i) => (
                    <FilaDeRecuadro
                      key={recuadro.id}
                      recuadro={recuadro}
                      posicion={i + 1}
                      motivos={motivos}
                      comoSale={comoSale}
                      primero={i === 0}
                      ultimo={i === recuadros.length - 1}
                      onCambiar={(patch) => cambiarRecuadro(recuadro.id, patch)}
                      onSubir={() => moverRecuadro(recuadro.id, -1)}
                      onBajar={() => moverRecuadro(recuadro.id, 1)}
                      onQuitar={() => tocarLosRecuadros((lista) => lista.filter((r) => r.id !== recuadro.id))}
                    />
                  ))}
                </ol>
              </SortableContext>
            </DndContext>
          )}
          {recuadros.length > 0 && cuantosSalen === 0 && (
            <Avisos avisos={["Ningún recuadro tiene dato: el resumen de capacidad no sale en la página."]} />
          )}
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="gap-1"
              disabled={recuadros.length >= TOPE_DE_RECUADROS}
              onClick={() => tocarLosRecuadros((lista) => [...lista, unRecuadroNuevo(lista)])}
              data-agregar-recuadro
            >
              <Plus className="h-3.5 w-3.5" /> Agregar recuadro
            </Button>
            {!sonLosDeFabrica && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="text-xs"
                onClick={() => setRecuadrosEscritos(losRecuadrosDeFabrica(datos))}
                data-restaurar-recuadros
              >
                Volver a los de fábrica
              </Button>
            )}
            {recuadros.length >= TOPE_DE_RECUADROS && (
              <span className="text-[11px] text-muted-foreground">Caben {TOPE_DE_RECUADROS} como mucho.</span>
            )}
          </div>
        </>
      ),
    },
    funciones: {
      titulo: "Qué incluye",
      ayuda:
        "Una tarjeta por función encendida, en el orden en que las arrastras en la pestaña Configuración. Se editan allí: guarda antes este detalle si cambias de pestaña.",
      cuerpo: funcionesQueSalen ? (
        funcionesQueSalen.length > 0 ? (
          <ol className="space-y-1" data-funciones-que-salen>
            {funcionesQueSalen.map((f, i) => (
              <li key={f.id} className="flex items-start gap-2 text-xs" data-funcion-que-sale>
                <span className="w-4 shrink-0 text-center text-[11px] tabular-nums text-muted-foreground">{i + 1}</span>
                <span className="min-w-0 flex-1 break-words">{f.nombre}</span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-[11px] text-muted-foreground" data-sin-funciones>
            Ninguna función encendida se lista: la página no enseña esta sección.
          </p>
        )
      ) : (
        <p className="text-[11px] text-muted-foreground">Se arma sola con las funciones de la pestaña Configuración.</p>
      ),
    },
    preguntas: {
      titulo: `Preguntas frecuentes (${preguntas.length})`,
      ayuda: (
        <>
          Solo las de este plan. Se ordenan arrastrando por el asa. Puedes escribir {datosQueSePuedenUsar} y salen con
          el dato de hoy.
        </>
      ),
      cuerpo: (
        <>
          {preguntas.length === 0 ? (
            <p className="text-[11px] text-muted-foreground">Sin preguntas: la página no enseña esa sección.</p>
          ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={alSoltar}>
              <SortableContext items={preguntas.map((p) => p.id)} strategy={verticalListSortingStrategy}>
                <ul className="space-y-2" data-lista-de-preguntas>
                  {preguntas.map((p) => (
                    <FilaDePregunta
                      key={p.id}
                      pregunta={p}
                      datos={datos}
                      onCambiar={(patch) =>
                        setPreguntas((lista) => lista.map((x) => (x.id === p.id ? { ...x, ...patch } : x)))
                      }
                      onQuitar={() => setPreguntas((lista) => lista.filter((x) => x.id !== p.id))}
                    />
                  ))}
                </ul>
              </SortableContext>
            </DndContext>
          )}
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="gap-1"
            onClick={() => setPreguntas((lista) => [...lista, { id: nuevoId(), question: "", answer: "" }])}
            data-agregar-pregunta
          >
            <Plus className="h-3.5 w-3.5" /> Agregar pregunta
          </Button>
        </>
      ),
    },
    incluido: {
      titulo: "Todo incluido, sin sorpresas",
      ayuda: (
        <>
          Lo que este plan trae sin costo adicional. Cada línea sale como una tarjeta, entera y a la vista, sin
          desplegar nada, entre las preguntas frecuentes y el precio; es aparte de «Qué incluye», que lista las
          funciones. Sin texto no sale. Puedes escribir {datosQueSePuedenUsar} y salen con el dato de hoy.
        </>
      ),
      cuerpo: (
        <>
          <div className="space-y-1">
            <Label>Título</Label>
            <Input
              maxLength={TOPE_DEL_TITULO_DEL_TODO_INCLUIDO}
              value={todoIncluido.titulo}
              onChange={(e) => setTodoIncluido((t) => ({ ...t, titulo: e.target.value }))}
              placeholder={TITULO_DEL_TODO_INCLUIDO}
              data-campo-del-detalle="todoIncluidoTitulo"
            />
            <Avisos
              avisos={
                avisosDelTodoIncluido.titulo.length
                  ? [`No sale en la página (sale «${TITULO_DEL_TODO_INCLUIDO}»): ${avisosDelTodoIncluido.titulo.join(" ")}`]
                  : []
              }
            />
          </div>
          <div className="space-y-1">
            <Label>Qué incluye sin costo adicional (una línea por tarjeta)</Label>
            <Textarea
              rows={6}
              maxLength={TOPE_DEL_TEXTO_DEL_TODO_INCLUIDO}
              value={todoIncluido.texto}
              onChange={(e) => setTodoIncluido((t) => ({ ...t, texto: e.target.value }))}
              placeholder={"Instalación y configuración inicial\nImplementación sin pagos extra ocultos\nCapacitación de tu equipo en sesión en vivo\nSoporte por WhatsApp y actualizaciones"}
              data-campo-del-detalle="todoIncluidoTexto"
            />
            <Avisos
              avisos={
                avisosDelTodoIncluido.texto.length
                  ? [`No sale en la página: ${avisosDelTodoIncluido.texto.join(" ")}`]
                  : []
              }
            />
          </div>
        </>
      ),
    },
    comenzar: {
      titulo: "Comenzar",
      ayuda: sinPrecio
        ? "El precio en blanco y, debajo, el botón verde «Comenzar con el plan X», una sola vez, aquí. Este plan no tiene precio: el botón abre WhatsApp con el mensaje de abajo, salvo que le pongas un enlace propio."
        : "El precio en blanco y, debajo, el botón verde «Comenzar con el plan X», una sola vez, aquí. Sin enlace propio, el botón lleva al registro con este plan elegido.",
      cuerpo: (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label>Botón principal</Label>
              {/* El texto es fijo y sale del nombre del plan: «Comenzar con el plan X». */}
              <div
                className="flex h-10 items-center rounded-md border border-dashed px-3 text-sm text-muted-foreground"
                data-texto-del-boton-principal
              >
                {elTextoDelBotonDelPlan(datos)}
              </div>
            </div>
            <div className="space-y-1">
              <Label>Enlace propio (opcional)</Label>
              <Input
                value={form.ctaButtonUrl}
                onChange={(e) => cambiar("ctaButtonUrl", e.target.value)}
                placeholder="https://..."
                data-campo-del-detalle="ctaButtonUrl"
              />
              <Avisos avisos={avisosDelEnlace(form.ctaButtonUrl)} />
            </div>
            <div className="space-y-1">
              <Label>Texto del segundo botón</Label>
              <Input
                value={form.ctaSecondaryText}
                onChange={(e) => cambiar("ctaSecondaryText", e.target.value)}
                placeholder="Agendar una demo"
              />
              <Avisos avisos={avisosDelTexto(form.ctaSecondaryText, datos)} />
            </div>
            <div className="space-y-1">
              <Label>Enlace del segundo botón</Label>
              <Input
                value={form.ctaSecondaryUrl}
                onChange={(e) => cambiar("ctaSecondaryUrl", e.target.value)}
                placeholder="https://cal.com/..."
              />
              <Avisos avisos={avisosDelEnlace(form.ctaSecondaryUrl)} />
            </div>
          </div>
          <div className="space-y-1">
            <Label>Enlace para agendar una reunión</Label>
            <Input
              value={form.meetingUrl}
              onChange={(e) => cambiar("meetingUrl", e.target.value)}
              placeholder="https://cal.com/tu-usuario/30min"
            />
            <p className="text-[11px] text-muted-foreground">
              Si el segundo botón no tiene enlace, usa este. Sin ninguno de los dos, no sale.
            </p>
            <Avisos avisos={avisosDelEnlace(form.meetingUrl)} />
          </div>
          {sinPrecio && (
            <div className="space-y-1">
              <Label>Mensaje de WhatsApp</Label>
              <Textarea
                rows={2}
                value={form.whatsappMessage}
                onChange={(e) => cambiar("whatsappMessage", e.target.value)}
                placeholder={`Hola, me interesa el plan ${datos.nombre}`}
              />
              <Avisos avisos={avisosDelTexto(form.whatsappMessage, datos)} />
            </div>
          )}
        </>
      ),
    },
  };

  return (
    <div className="space-y-3" data-detalle-del-plan>
      <Bloque
        titulo="Orden de la página"
        ayuda="Es el orden de los bloques de abajo, que es el de la página. Muévelos aquí o arrastrando cada bloque por su asa; pulsa un nombre para ir a él."
      >
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={alSoltarEnElIndice}>
          <SortableContext items={orden} strategy={verticalListSortingStrategy}>
            <ol className="space-y-1.5" data-orden-de-bloques>
              {orden.map((clave, i) => {
                const b = BLOQUES_DE_LA_PAGINA.find((x) => x.clave === clave)!;
                return (
                  <FilaDeBloque
                    key={clave}
                    clave={clave}
                    posicion={i + 1}
                    nombre={b.nombre}
                    ayuda={porQueNoSale[clave] ?? b.ayuda}
                    noSale={Boolean(porQueNoSale[clave])}
                    primero={i === 0}
                    ultimo={i === orden.length - 1}
                    onIr={() => irAlBloque(clave)}
                    onSubir={() => moverEnElIndice(clave, -1)}
                    onBajar={() => moverEnElIndice(clave, 1)}
                  />
                );
              })}
            </ol>
          </SortableContext>
        </DndContext>
      </Bloque>

      <DndContext
        sensors={sensors}
        collisionDetection={porLaAltura}
        onDragStart={(e) => {
          setArrastrado(e.active.id as BloqueDeLaPagina);
          setSobre(e.active.id as BloqueDeLaPagina);
        }}
        onDragOver={(e) => setSobre((e.over?.id as BloqueDeLaPagina) ?? null)}
        onDragEnd={alSoltarUnBloqueDelFormulario}
        onDragCancel={terminarElArrastre}
      >
        {/* Sin estrategia que desplace: los bloques miden muy distinto y verlos
            correrse mientras se arrastra marea; lo dice la raya de la caída. */}
        <SortableContext items={orden} strategy={() => null}>
          <div className="space-y-3" data-bloques-del-formulario>
            {orden.map((clave, i) => (
              <BloqueOrdenable
                key={clave}
                clave={clave}
                posicion={i + 1}
                titulo={bloques[clave].titulo}
                ayuda={bloques[clave].ayuda}
                noSale={porQueNoSale[clave]}
                primero={i === 0}
                ultimo={i === orden.length - 1}
                caida={marca?.bloque === clave ? marca.lado : null}
                registrar={(nodo) => {
                  if (nodo) nodos.current.set(clave, nodo);
                  else nodos.current.delete(clave);
                }}
                onSubir={() => moverElBloqueDelFormulario(clave, -1)}
                onBajar={() => moverElBloqueDelFormulario(clave, 1)}
              >
                {bloques[clave].cuerpo}
              </BloqueOrdenable>
            ))}
          </div>
        </SortableContext>
        {/* En un portal: la ventana de Planes lleva `transform`, y un `fixed`
            dentro de ella se colocaría contra la ventana y no contra la pantalla. */}
        {createPortal(
          <DragOverlay dropAnimation={null} zIndex={1000} style={{ height: "auto", pointerEvents: "none" }}>
            {arrastrado ? (
              <div
                className="flex items-center gap-2 rounded-lg border border-primary bg-background px-3 py-2 shadow-lg"
                data-bloque-arrastrado={arrastrado}
              >
                <GripVertical className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold tabular-nums text-primary">
                  {orden.indexOf(arrastrado) + 1}
                </span>
                <span className="truncate text-sm font-semibold">{bloques[arrastrado].titulo}</span>
              </div>
            ) : null}
          </DragOverlay>,
          document.body,
        )}
      </DndContext>

      <Bloque titulo="Pestaña del navegador y redes" ayuda="Lo que se ve en la pestaña y al compartir el enlace.">
        <div className="space-y-1">
          <Label>Título</Label>
          <Input
            value={form.metaTitle}
            onChange={(e) => cambiar("metaTitle", e.target.value)}
            placeholder={`Plan ${datos.nombre}`}
          />
          <Avisos avisos={avisosDelTexto(form.metaTitle, datos)} />
        </div>
        <div className="space-y-1">
          <Label>Descripción</Label>
          <Textarea
            rows={2}
            value={form.metaDescription}
            onChange={(e) => cambiar("metaDescription", e.target.value)}
            placeholder="Si se deja vacía, se usa la descripción del plan."
          />
          <Avisos avisos={avisosDelTexto(form.metaDescription, datos)} />
        </div>
        <div className="space-y-1">
          <Label>Imagen al compartir (opcional)</Label>
          <ImageUploader value={form.ogImageUrl} onChange={(url) => cambiar("ogImageUrl", url)} placeholder="Subir imagen" />
        </div>
      </Bloque>

      {/* El pie: a la izquierda la página pública (o por qué no se ve), a la derecha Guardar. */}
      <div className="flex items-center justify-between gap-3 pt-1" data-pie-del-detalle>
        {planActivo ? (
          <a
            href={enlaceDeLaPagina}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => recordarLaAsistencia(asistenciaDeLaPagina)}
            className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
            data-ver-pagina-publica
          >
            Ver página pública <ExternalLink className="h-3.5 w-3.5" />
          </a>
        ) : (
          <span className="text-xs text-amber-600 dark:text-amber-400">
            El plan está apagado: su página no se ve hasta encenderlo.
          </span>
        )}
        <Button onClick={handleSave} disabled={saving} className="shrink-0" data-guardar-detalle>
          {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
          Guardar
        </Button>
      </div>
    </div>
  );
}

/**
 * Un bloque grande del formulario, que se arrastra ENTERO por el asa de su
 * cabecera (o se sube y se baja con las flechas). No se desplaza mientras se
 * arrastra: lo que se mueve es una tarjeta con su nombre, y una raya dice dónde
 * va a caer. El asa es la única que arrastra: el resto del bloque son campos, y
 * con los oyentes en todo el bloque cada clic en un campo competiría con un
 * arrastre.
 */
function BloqueOrdenable({
  clave,
  posicion,
  titulo,
  ayuda,
  noSale,
  primero,
  ultimo,
  caida,
  registrar,
  onSubir,
  onBajar,
  children,
}: {
  clave: BloqueDeLaPagina;
  posicion: number;
  titulo: string;
  ayuda: ReactNode;
  noSale?: string;
  primero: boolean;
  ultimo: boolean;
  caida: "antes" | "despues" | null;
  registrar: (nodo: HTMLElement | null) => void;
  onSubir: () => void;
  onBajar: () => void;
  children: ReactNode;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, isDragging } = useSortable({ id: clave });
  const nombre = nombreDelBloque(clave);
  return (
    <section
      ref={(nodo) => {
        setNodeRef(nodo);
        registrar(nodo);
      }}
      tabIndex={-1}
      className={`relative space-y-3 rounded-lg border border-border p-3 outline-none transition-opacity focus-visible:ring-2 focus-visible:ring-primary/40 ${isDragging ? "opacity-40" : ""}`}
      data-bloque-del-formulario={clave}
    >
      {caida && (
        <div
          aria-hidden
          className={`pointer-events-none absolute inset-x-0 h-1 rounded-full bg-primary ${caida === "antes" ? "-top-2" : "-bottom-2"}`}
          data-marca-de-caida={caida}
        />
      )}
      <div className="flex items-start gap-2">
        <button
          type="button"
          ref={setActivatorNodeRef}
          className="mt-px h-6 w-5 shrink-0 cursor-grab touch-none text-muted-foreground hover:text-foreground active:cursor-grabbing"
          title="Arrastrar el bloque para cambiar su sitio en la página"
          aria-label={`Arrastrar el bloque ${nombre}`}
          data-arrastrar-bloque-del-formulario
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <span
          className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-semibold tabular-nums text-muted-foreground"
          title={`Sale en el puesto ${posicion} de la página`}
          data-puesto-del-bloque
        >
          {posicion}
        </span>
        <div className="min-w-0 flex-1 space-y-0.5">
          <h3 className="text-sm font-semibold">{titulo}</h3>
          {ayuda && <p className="text-[11px] text-muted-foreground">{ayuda}</p>}
          {noSale && (
            <p className="flex items-start gap-1 text-[11px] text-amber-600 dark:text-amber-400" data-bloque-no-sale>
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
              <span>{noSale}</span>
            </p>
          )}
        </div>
        {/* Lo que no se puede mover no se pinta apagado: se quita. */}
        <div className="flex shrink-0 items-center">
          {!primero && (
            <button
              type="button"
              onClick={onSubir}
              className="h-6 w-6 text-muted-foreground hover:text-foreground"
              title="Subir el bloque"
              aria-label={`Subir el bloque ${nombre}`}
              data-subir-bloque-del-formulario
            >
              <ChevronUp className="mx-auto h-4 w-4" />
            </button>
          )}
          {!ultimo && (
            <button
              type="button"
              onClick={onBajar}
              className="h-6 w-6 text-muted-foreground hover:text-foreground"
              title="Bajar el bloque"
              aria-label={`Bajar el bloque ${nombre}`}
              data-bajar-bloque-del-formulario
            >
              <ChevronDown className="mx-auto h-4 w-4" />
            </button>
          )}
        </div>
      </div>
      {children}
    </section>
  );
}

function FilaDeBloque({
  clave,
  posicion,
  nombre,
  ayuda,
  noSale,
  primero,
  ultimo,
  onIr,
  onSubir,
  onBajar,
}: {
  clave: BloqueDeLaPagina;
  posicion: number;
  nombre: string;
  ayuda: string;
  noSale: boolean;
  primero: boolean;
  ultimo: boolean;
  onIr: () => void;
  onSubir: () => void;
  onBajar: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: clave });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex items-center gap-2 rounded-md border border-border bg-background px-2 py-1.5 ${isDragging ? "z-10 opacity-80 shadow-md" : ""}`}
      data-bloque-del-orden={clave}
    >
      <button
        type="button"
        className="h-6 w-5 shrink-0 cursor-grab touch-none text-muted-foreground hover:text-foreground"
        title="Arrastrar para reordenar"
        aria-label={`Arrastrar ${nombre}`}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <span className="w-4 shrink-0 text-center text-[11px] tabular-nums text-muted-foreground">{posicion}</span>
      <div className="min-w-0 flex-1">
        <button
          type="button"
          onClick={onIr}
          className="block max-w-full truncate text-left text-xs font-medium hover:underline"
          title={`Ir al bloque ${nombre}`}
          data-ir-al-bloque={clave}
        >
          {nombre}
        </button>
        <p
          className={`truncate text-[11px] ${noSale ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"}`}
          title={ayuda}
        >
          {ayuda}
        </p>
      </div>
      {/* Lo que no se puede mover no se pinta apagado: se quita. */}
      <div className="flex shrink-0 items-center">
        {!primero && (
          <button
            type="button"
            onClick={onSubir}
            className="h-6 w-6 text-muted-foreground hover:text-foreground"
            title="Subir"
            aria-label={`Subir ${nombre}`}
            data-subir-bloque
          >
            <ChevronUp className="mx-auto h-4 w-4" />
          </button>
        )}
        {!ultimo && (
          <button
            type="button"
            onClick={onBajar}
            className="h-6 w-6 text-muted-foreground hover:text-foreground"
            title="Bajar"
            aria-label={`Bajar ${nombre}`}
            data-bajar-bloque
          >
            <ChevronDown className="mx-auto h-4 w-4" />
          </button>
        )}
      </div>
    </li>
  );
}

function FilaDeRecuadro({
  recuadro: r,
  posicion,
  motivos,
  comoSale,
  primero,
  ultimo,
  onCambiar,
  onSubir,
  onBajar,
  onQuitar,
}: {
  recuadro: RecuadroDeCapacidad;
  posicion: number;
  motivos: string[];
  comoSale: TarjetaDeCapacidad | null;
  primero: boolean;
  ultimo: boolean;
  onCambiar: (patch: Partial<RecuadroDeCapacidad>) => void;
  onSubir: () => void;
  onBajar: () => void;
  onQuitar: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: r.id });
  const nombre = r.titulo.trim() || r.valor.trim() || `el recuadro ${posicion}`;
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex gap-2 rounded-md border border-border bg-background p-2 ${isDragging ? "z-10 opacity-80 shadow-md" : ""}`}
      data-recuadro={r.id}
    >
      <div className="flex shrink-0 flex-col items-center gap-1 pt-0.5">
        <button
          type="button"
          className="h-6 w-5 cursor-grab touch-none text-muted-foreground hover:text-foreground"
          title="Arrastrar para reordenar"
          aria-label={`Arrastrar ${nombre}`}
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <span className="text-[11px] tabular-nums text-muted-foreground">{posicion}</span>
      </div>
      <div className="min-w-0 flex-1 space-y-2">
        <div className="space-y-1">
          <Label className="text-[11px]">Icono</Label>
          <div className="flex flex-wrap gap-1" role="group" aria-label="Icono del recuadro" data-iconos-del-recuadro>
            {ICONOS_DE_RECUADRO.map((icono) => {
              const Dibujo = elDibujoDelRecuadro(icono.clave);
              const puesto = r.icono === icono.clave;
              return (
                <button
                  key={icono.clave}
                  type="button"
                  onClick={() => onCambiar({ icono: icono.clave as IconoDeRecuadro })}
                  className={`flex h-7 w-7 items-center justify-center rounded-md border ${
                    puesto
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:text-foreground"
                  }`}
                  title={icono.nombre}
                  aria-label={`Icono: ${icono.nombre}`}
                  aria-pressed={puesto}
                  data-icono-del-recuadro={icono.clave}
                >
                  <Dibujo className="h-3.5 w-3.5" />
                </button>
              );
            })}
          </div>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <div className="space-y-1">
            <Label className="text-[11px]">Título</Label>
            <Input
              value={r.titulo}
              maxLength={TOPES_DEL_RECUADRO.titulo}
              onChange={(e) => onCambiar({ titulo: e.target.value })}
              placeholder="Créditos de IA"
              className="h-8 text-xs"
              data-campo-del-recuadro="titulo"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-[11px]">Dato que destaca</Label>
            <Input
              value={r.valor}
              maxLength={TOPES_DEL_RECUADRO.valor}
              onChange={(e) => onCambiar({ valor: e.target.value })}
              placeholder="{creditos}"
              className="h-8 text-xs"
              data-campo-del-recuadro="valor"
            />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label className="text-[11px]">Detalle (opcional)</Label>
            <Input
              value={r.detalle}
              maxLength={TOPES_DEL_RECUADRO.detalle}
              onChange={(e) => onCambiar({ detalle: e.target.value })}
              placeholder="Incluidos cada mes con tu plan"
              className="h-8 text-xs"
              data-campo-del-recuadro="detalle"
            />
          </div>
        </div>
        {comoSale ? (
          <p className="flex items-start gap-1 text-[11px] text-emerald-600 dark:text-emerald-400" data-recuadro-sale>
            <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0" />
            <span>
              Sale así: <strong>{comoSale.valor}</strong>
              {comoSale.titulo ? ` · ${comoSale.titulo}` : ""}
            </span>
          </p>
        ) : (
          <div data-recuadro-no-sale>
            <Avisos avisos={[`No sale en la página: ${motivos.join(" ")}`]} />
          </div>
        )}
      </div>
      {/* Lo que no se puede mover no se pinta apagado: se quita. */}
      <div className="flex shrink-0 flex-col items-center">
        {!primero && (
          <button
            type="button"
            onClick={onSubir}
            className="h-6 w-6 text-muted-foreground hover:text-foreground"
            title="Subir"
            aria-label={`Subir ${nombre}`}
            data-subir-recuadro
          >
            <ChevronUp className="mx-auto h-4 w-4" />
          </button>
        )}
        {!ultimo && (
          <button
            type="button"
            onClick={onBajar}
            className="h-6 w-6 text-muted-foreground hover:text-foreground"
            title="Bajar"
            aria-label={`Bajar ${nombre}`}
            data-bajar-recuadro
          >
            <ChevronDown className="mx-auto h-4 w-4" />
          </button>
        )}
        <button
          type="button"
          onClick={onQuitar}
          className="h-6 w-6 text-muted-foreground hover:text-destructive"
          title="Quitar recuadro"
          aria-label={`Quitar ${nombre}`}
          data-quitar-recuadro
        >
          <Trash2 className="mx-auto h-4 w-4" />
        </button>
      </div>
    </li>
  );
}

function FilaDePregunta({
  pregunta: p,
  datos,
  onCambiar,
  onQuitar,
}: {
  pregunta: Pregunta;
  datos: DatosDelPlan;
  onCambiar: (patch: Partial<Pregunta>) => void;
  onQuitar: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: p.id });
  const q = p.question.trim();
  const a = p.answer.trim();
  // La MISMA regla que la página (`revisarLasPreguntas`): una pregunta puede
  // nombrar otro plan de hoy («¿puedo pasar al plan X?»); lo que no puede es
  // decir otros créditos o un nombre que ya no existe.
  const avisos =
    q && a
      ? (() => {
          const de = losAvisosDelTexto(`${q}\n${a}`, datos);
          return de.length ? [`No sale en la página: ${de.join(" ")}`] : [];
        })()
      : q || a
        ? ["Le falta la pregunta o la respuesta: no sale en la página."]
        : [];

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex gap-2 rounded-md border border-border bg-background p-2 ${isDragging ? "z-10 opacity-80 shadow-md" : ""}`}
      data-pregunta={p.id}
    >
      <button
        type="button"
        className="mt-1.5 h-6 w-5 shrink-0 cursor-grab touch-none text-muted-foreground hover:text-foreground"
        title="Arrastrar para reordenar"
        aria-label="Arrastrar pregunta"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <div className="min-w-0 flex-1 space-y-1.5">
        <Input
          value={p.question}
          onChange={(e) => onCambiar({ question: e.target.value })}
          placeholder="¿Cómo funciona…?"
          data-pregunta-texto
        />
        <Textarea
          rows={2}
          value={p.answer}
          onChange={(e) => onCambiar({ answer: e.target.value })}
          placeholder="La respuesta"
          data-respuesta-texto
        />
        <Avisos avisos={avisos} />
      </div>
      <button
        type="button"
        onClick={onQuitar}
        className="mt-1.5 h-6 w-6 shrink-0 text-muted-foreground hover:text-destructive"
        title="Quitar pregunta"
        aria-label="Quitar pregunta"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </li>
  );
}
