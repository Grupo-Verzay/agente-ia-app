"use client";

import { useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
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
import { AlertTriangle, CheckCircle2, ExternalLink, GripVertical, Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ImageUploader } from "@/components/ui/image-uploader";
import { VideoUploader } from "@/components/ui/video-uploader";
import {
  getPlanDetailBySubscriptionPlanId,
  upsertPlanDetail,
  type UpsertPlanDetailInput,
} from "@/actions/plan-detail-actions";
import {
  DATOS_QUE_SE_PUEDEN_USAR,
  PARA_QUIEN_DE_FABRICA,
  TOPE_DEL_CASO,
  TOPE_DEL_PARA_QUIEN,
  comoEnlaceDelBoton,
  elVideoDelPlan,
  losAvisosDelBoton,
  losAvisosDelParaQuien,
  losAvisosDelTexto,
  type DatosDelPlan,
  type ParaQuienDelPlan,
} from "@/lib/pagina-de-plan";

/**
 * Lo que es SOLO de un plan en su página pública: el video (enlace o archivo
 * subido), «para quién es este plan» con su caso típico, sus preguntas
 * frecuentes, los botones y el título de la pestaña.
 *
 * Todo lo demás de la página —el nombre, la descripción, el precio, los
 * créditos, el catálogo y las funciones con su categoría y su tutorial— sale
 * de la pestaña Configuración, en vivo. Por eso aquí ya no hay hero, ni
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

/** Lo que se guardaba antes y la página ya no enseña. Solo para avisar que sigue ahí. */
const LO_DE_ANTES = ["testimonials", "galleryImages", "stats", "featureSections"] as const;

let siguiente = 0;
function nuevoId(): string {
  siguiente += 1;
  return `p-${Date.now().toString(36)}-${siguiente}`;
}

function texto(v: unknown): string {
  return typeof v === "string" ? v : "";
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
  planActivo,
}: {
  subscriptionPlanId: string;
  datos: DatosDelPlan;
  enlaceDeLaPagina: string;
  planActivo: boolean;
}) {
  const [form, setForm] = useState<Detalle>(VACIO);
  const [paraQuien, setParaQuien] = useState<ParaQuienDelPlan>({ paraQuien: "", caso: "" });
  const [preguntas, setPreguntas] = useState<Pregunta[]>([]);
  const [hayDeAntes, setHayDeAntes] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

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
        const faqs = Array.isArray(d?.faqs) ? (d!.faqs as unknown[]) : [];
        setPreguntas(
          faqs.map((f) => {
            const o = (f && typeof f === "object" ? f : {}) as Record<string, unknown>;
            return { id: nuevoId(), question: texto(o.question), answer: texto(o.answer) };
          }),
        );
        setHayDeAntes(LO_DE_ANTES.some((k) => Array.isArray(d?.[k]) && (d![k] as unknown[]).length > 0));
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

  const cambiar = (clave: keyof Detalle, valor: string) => setForm((f) => ({ ...f, [clave]: valor }));

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

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
      faqs: preguntas
        .map((p) => ({ question: p.question.trim(), answer: p.answer.trim() }))
        .filter((p) => p.question || p.answer),
    };
    try {
      const res = await upsertPlanDetail(subscriptionPlanId, datosAGuardar);
      if (res.success) toast.success(res.message);
      else toast.error(res.message);
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
  const aviso = (lista: string[]) => (lista.length ? [`No sale en la página (sale el de fábrica): ${lista.join(" ")}`] : []);

  return (
    <div className="space-y-3" data-detalle-del-plan>
      <div className="flex flex-wrap items-start justify-between gap-2 rounded-lg bg-muted/50 p-3">
        <p className="max-w-md text-[11px] text-muted-foreground">
          La página pública se arma sola con lo de la pestaña Configuración: nombre, descripción, precio,
          créditos y las funciones encendidas, con su categoría y su tutorial. Aquí va lo que es solo de este plan.
        </p>
        {planActivo ? (
          <a
            href={enlaceDeLaPagina}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-primary hover:underline"
            data-ver-pagina-publica
          >
            Ver página pública <ExternalLink className="h-3 w-3" />
          </a>
        ) : (
          <span className="shrink-0 text-[11px] text-amber-600 dark:text-amber-400">
            El plan está apagado: su página no se ve hasta encenderlo.
          </span>
        )}
      </div>

      <Bloque
        titulo="Video del plan"
        ayuda="Sale arriba, junto al nombre y el precio. Pega un enlace de YouTube, Vimeo, Loom o Google Drive, o sube el archivo de video."
      >
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
            <p className="text-[11px] text-muted-foreground">Sin video: la página abre sin él.</p>
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
      </Bloque>

      <Bloque
        titulo="Para quién es este plan"
        ayuda={
          <>
            Sale justo debajo del video. Si lo dejas vacío sale el texto de fábrica de este nivel. Puedes escribir{" "}
            {DATOS_QUE_SE_PUEDEN_USAR.map((d) => d.clave).join(", ")} y salen con el dato de hoy.
          </>
        }
      >
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
      </Bloque>

      <Bloque
        titulo={`Preguntas frecuentes (${preguntas.length})`}
        ayuda={
          <>
            Solo las de este plan. Se ordenan arrastrando por el asa. Puedes escribir{" "}
            {DATOS_QUE_SE_PUEDEN_USAR.map((d) => d.clave).join(", ")} y salen con el dato de hoy.
          </>
        }
      >
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
      </Bloque>

      <Bloque
        titulo="Botones"
        ayuda={
          sinPrecio
            ? "Salen una sola vez, al final de la página, después de las preguntas. Este plan no tiene precio: el botón principal abre WhatsApp con el mensaje de abajo, salvo que le pongas un enlace propio."
            : "Salen una sola vez, al final de la página, después de las preguntas. Sin enlace propio, el botón principal lleva al registro con este plan elegido."
        }
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label>Texto del botón principal</Label>
            <Input
              value={form.ctaButtonText}
              onChange={(e) => cambiar("ctaButtonText", e.target.value)}
              placeholder={sinPrecio ? "Contactar" : "Comenzar ahora"}
            />
            <Avisos avisos={avisosDelTexto(form.ctaButtonText, datos)} />
          </div>
          <div className="space-y-1">
            <Label>Enlace propio (opcional)</Label>
            <Input
              value={form.ctaButtonUrl}
              onChange={(e) => cambiar("ctaButtonUrl", e.target.value)}
              placeholder="https://..."
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
      </Bloque>

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

      {hayDeAntes && (
        <p className="text-[11px] text-muted-foreground" data-lo-de-antes>
          Este plan tiene guardados testimonios, galería, estadísticas o secciones de antes. Ya no salen en la
          página; se conservan sin tocar.
        </p>
      )}

      <div className="flex justify-end pt-1">
        <Button onClick={handleSave} disabled={saving} data-guardar-detalle>
          {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
          Guardar detalle
        </Button>
      </div>
    </div>
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
