"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, Loader2, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ImageUploader } from "@/components/ui/image-uploader";
import {
  getPlanDetailBySubscriptionPlanId,
  upsertPlanDetail,
  type PlanDetailData,
  type FeatureSection,
  type GalleryImage,
  type FaqItem,
  type StatItem,
  type TestimonialItem,
  type UpsertPlanDetailInput,
} from "@/actions/plan-detail-actions";

const EMPTY_DETAIL: UpsertPlanDetailInput = {
  heroTitle: null, heroSubtitle: null, heroImageUrl: null, heroBadge: null,
  videoUrl: null, videoTitle: null, videoThumbnailUrl: null,
  featureSections: [], galleryImages: [], faqs: [], stats: [], testimonials: [],
  meetingUrl: null, demoUrl: null, whatsappMessage: null,
  ctaTitle: null, ctaSubtitle: null, ctaButtonText: null, ctaButtonUrl: null,
  ctaSecondaryText: null, ctaSecondaryUrl: null,
  metaTitle: null, metaDescription: null, ogImageUrl: null,
};

function Section({ title, children, defaultOpen = false }: {
  title: string; children: React.ReactNode; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-lg border border-border">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-3 py-2.5 text-sm font-medium"
      >
        {title}
        {open ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
      </button>
      {open && <div className="border-t border-border px-3 pb-3 pt-2.5 space-y-3">{children}</div>}
    </div>
  );
}

function str(v: string | null | undefined) { return v ?? ""; }

export function PlanDetailTab({ subscriptionPlanId }: { subscriptionPlanId: string }) {
  const [form, setForm] = useState<UpsertPlanDetailInput>(EMPTY_DETAIL);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!subscriptionPlanId) return;
    setLoading(true);
    getPlanDetailBySubscriptionPlanId(subscriptionPlanId).then((res) => {
      if (res.success && res.data) setForm(res.data as UpsertPlanDetailInput);
      else setForm(EMPTY_DETAIL);
      setLoading(false);
    });
  }, [subscriptionPlanId]);

  const set = (key: keyof UpsertPlanDetailInput, val: unknown) =>
    setForm((f) => ({ ...f, [key]: val }));

  // ── Feature Sections ──
  const addSection = () => set("featureSections", [...form.featureSections, {
    title: "", description: "", imageUrl: "", imageAlt: "", layout: "right", badge: ""
  } as FeatureSection]);
  const removeSection = (i: number) =>
    set("featureSections", form.featureSections.filter((_, idx) => idx !== i));
  const updateSection = (i: number, patch: Partial<FeatureSection>) =>
    set("featureSections", form.featureSections.map((s, idx) => idx === i ? { ...s, ...patch } : s));

  // ── Gallery ──
  const addGallery = () => set("galleryImages", [...form.galleryImages, { url: "", caption: "", alt: "" } as GalleryImage]);
  const removeGallery = (i: number) =>
    set("galleryImages", form.galleryImages.filter((_, idx) => idx !== i));
  const updateGallery = (i: number, patch: Partial<GalleryImage>) =>
    set("galleryImages", form.galleryImages.map((g, idx) => idx === i ? { ...g, ...patch } : g));

  // ── FAQs ──
  const addFaq = () => set("faqs", [...form.faqs, { question: "", answer: "" } as FaqItem]);
  const removeFaq = (i: number) => set("faqs", form.faqs.filter((_, idx) => idx !== i));
  const updateFaq = (i: number, patch: Partial<FaqItem>) =>
    set("faqs", form.faqs.map((f, idx) => idx === i ? { ...f, ...patch } : f));

  // ── Stats ──
  const addStat = () => set("stats", [...form.stats, { value: "", label: "" } as StatItem]);
  const removeStat = (i: number) => set("stats", form.stats.filter((_, idx) => idx !== i));
  const updateStat = (i: number, patch: Partial<StatItem>) =>
    set("stats", form.stats.map((s, idx) => idx === i ? { ...s, ...patch } : s));

  // ── Testimonials ──
  const addTest = () => set("testimonials", [...form.testimonials, {
    name: "", role: "", company: "", text: "", avatarUrl: "", rating: 5
  } as TestimonialItem]);
  const removeTest = (i: number) =>
    set("testimonials", form.testimonials.filter((_, idx) => idx !== i));
  const updateTest = (i: number, patch: Partial<TestimonialItem>) =>
    set("testimonials", form.testimonials.map((t, idx) => idx === i ? { ...t, ...patch } : t));

  const handleSave = async () => {
    setSaving(true);
    const res = await upsertPlanDetail(subscriptionPlanId, form);
    if (res.success) toast.success(res.message);
    else toast.error(res.message);
    setSaving(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-3">

      {/* ── HERO ── */}
      <Section title="Hero" defaultOpen>
        <div className="space-y-2">
          <Label>Título del hero</Label>
          <Input value={str(form.heroTitle)} onChange={(e) => set("heroTitle", e.target.value || null)} placeholder="Todo lo que incluye el plan Avanzado" />
        </div>
        <div className="space-y-2">
          <Label>Subtítulo / descripción larga</Label>
          <Textarea rows={2} value={str(form.heroSubtitle)} onChange={(e) => set("heroSubtitle", e.target.value || null)} placeholder="Automatiza tu WhatsApp con IA..." />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label>Badge (ej. &quot;Más popular&quot;)</Label>
            <Input value={str(form.heroBadge)} onChange={(e) => set("heroBadge", e.target.value || null)} placeholder="Más popular" />
          </div>
        </div>
        <div className="space-y-2">
          <Label>Imagen banner</Label>
          <ImageUploader value={str(form.heroImageUrl)} onChange={(url) => set("heroImageUrl", url || null)} placeholder="Subir imagen banner" />
        </div>
      </Section>

      {/* ── VIDEO ── */}
      <Section title="Video">
        <div className="space-y-2">
          <Label>URL del video (YouTube / Vimeo embed)</Label>
          <Input value={str(form.videoUrl)} onChange={(e) => set("videoUrl", e.target.value || null)} placeholder="https://www.youtube.com/embed/..." />
        </div>
        <div className="space-y-2">
          <Label>Título del video</Label>
          <Input value={str(form.videoTitle)} onChange={(e) => set("videoTitle", e.target.value || null)} placeholder="Mira cómo funciona en 2 minutos" />
        </div>
        <div className="space-y-2">
          <Label>Thumbnail custom del video</Label>
          <ImageUploader value={str(form.videoThumbnailUrl)} onChange={(url) => set("videoThumbnailUrl", url || null)} placeholder="Subir thumbnail" />
        </div>
      </Section>

      {/* ── SECCIONES DE FUNCIONES ── */}
      <Section title={`Secciones de funciones (${form.featureSections.length})`}>
        {form.featureSections.map((sec, i) => (
          <div key={i} className="rounded-md border border-border p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">Sección {i + 1}</span>
              <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => removeSection(i)}>
                <Trash2 className="h-3 w-3 text-destructive" />
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Título</Label>
                <Input value={sec.title} onChange={(e) => updateSection(i, { title: e.target.value })} placeholder="Función destacada" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Badge (opcional)</Label>
                <Input value={sec.badge ?? ""} onChange={(e) => updateSection(i, { badge: e.target.value })} placeholder="Nuevo" />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Descripción</Label>
              <Textarea rows={2} value={sec.description} onChange={(e) => updateSection(i, { description: e.target.value })} placeholder="Describe esta función..." />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Alt de imagen</Label>
                <Input value={sec.imageAlt} onChange={(e) => updateSection(i, { imageAlt: e.target.value })} placeholder="Descripción de la imagen" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Layout</Label>
                <Select value={sec.layout} onValueChange={(v) => updateSection(i, { layout: v as "left" | "right" })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="right">Imagen a la derecha</SelectItem>
                    <SelectItem value="left">Imagen a la izquierda</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Imagen de la sección</Label>
              <ImageUploader value={sec.imageUrl} onChange={(url) => updateSection(i, { imageUrl: url })} placeholder="Subir imagen de la sección" />
            </div>
          </div>
        ))}
        <Button type="button" size="sm" variant="outline" className="w-full gap-2" onClick={addSection}>
          <Plus className="h-3.5 w-3.5" /> Agregar sección
        </Button>
      </Section>

      {/* ── GALERÍA ── */}
      <Section title={`Galería de imágenes (${form.galleryImages.length})`}>
        <div className="grid grid-cols-2 gap-2">
          {form.galleryImages.map((img, i) => (
            <div key={i} className="space-y-1">
              <ImageUploader value={img.url} onChange={(url) => updateGallery(i, { url })} placeholder="Subir imagen" />
              <Input value={img.caption} onChange={(e) => updateGallery(i, { caption: e.target.value })} placeholder="Caption" className="text-xs h-7" />
              <div className="flex justify-end">
                <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => removeGallery(i)}>
                  <Trash2 className="h-3 w-3 text-destructive" />
                </Button>
              </div>
            </div>
          ))}
        </div>
        <Button type="button" size="sm" variant="outline" className="w-full gap-2" onClick={addGallery}>
          <Plus className="h-3.5 w-3.5" /> Agregar imagen
        </Button>
      </Section>

      {/* ── FAQs ── */}
      <Section title={`Preguntas frecuentes (${form.faqs.length})`}>
        {form.faqs.map((faq, i) => (
          <div key={i} className="rounded-md border border-border p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">Pregunta {i + 1}</span>
              <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => removeFaq(i)}>
                <Trash2 className="h-3 w-3 text-destructive" />
              </Button>
            </div>
            <Input value={faq.question} onChange={(e) => updateFaq(i, { question: e.target.value })} placeholder="¿Cómo funciona...?" />
            <Textarea rows={2} value={faq.answer} onChange={(e) => updateFaq(i, { answer: e.target.value })} placeholder="Respuesta detallada..." />
          </div>
        ))}
        <Button type="button" size="sm" variant="outline" className="w-full gap-2" onClick={addFaq}>
          <Plus className="h-3.5 w-3.5" /> Agregar pregunta
        </Button>
      </Section>

      {/* ── STATS ── */}
      <Section title={`Estadísticas (${form.stats.length})`}>
        <div className="grid grid-cols-2 gap-2">
          {form.stats.map((stat, i) => (
            <div key={i} className="space-y-1 rounded-md border border-border p-2">
              <Input value={stat.value} onChange={(e) => updateStat(i, { value: e.target.value })} placeholder="500+" />
              <Input value={stat.label} onChange={(e) => updateStat(i, { label: e.target.value })} placeholder="Clientes activos" />
              <div className="flex justify-end">
                <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => removeStat(i)}>
                  <Trash2 className="h-3 w-3 text-destructive" />
                </Button>
              </div>
            </div>
          ))}
        </div>
        <Button type="button" size="sm" variant="outline" className="w-full gap-2" onClick={addStat} disabled={form.stats.length >= 4}>
          <Plus className="h-3.5 w-3.5" /> Agregar stat (máx 4)
        </Button>
      </Section>

      {/* ── TESTIMONIOS ── */}
      <Section title={`Testimonios (${form.testimonials.length})`}>
        {form.testimonials.map((t, i) => (
          <div key={i} className="rounded-md border border-border p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">Testimonio {i + 1}</span>
              <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => removeTest(i)}>
                <Trash2 className="h-3 w-3 text-destructive" />
              </Button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <Input value={t.name} onChange={(e) => updateTest(i, { name: e.target.value })} placeholder="Nombre" />
              <Input value={t.role} onChange={(e) => updateTest(i, { role: e.target.value })} placeholder="Cargo" />
              <Input value={t.company} onChange={(e) => updateTest(i, { company: e.target.value })} placeholder="Empresa" />
            </div>
            <Textarea rows={2} value={t.text} onChange={(e) => updateTest(i, { text: e.target.value })} placeholder="Texto del testimonio..." />
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Rating (1-5)</Label>
                <Select value={String(t.rating)} onValueChange={(v) => updateTest(i, { rating: Number(v) })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[5, 4, 3, 2, 1].map((r) => (
                      <SelectItem key={r} value={String(r)}>{r} estrellas</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Avatar</Label>
                <ImageUploader value={t.avatarUrl ?? ""} onChange={(url) => updateTest(i, { avatarUrl: url })} placeholder="Subir avatar" />
              </div>
            </div>
          </div>
        ))}
        <Button type="button" size="sm" variant="outline" className="w-full gap-2" onClick={addTest}>
          <Plus className="h-3.5 w-3.5" /> Agregar testimonio
        </Button>
      </Section>

      {/* ── LINKS DE ACCIÓN ── */}
      <Section title="Links de acción">
        <div className="space-y-2">
          <Label>Link de reunión (Calendly / Cal.com)</Label>
          <Input value={str(form.meetingUrl)} onChange={(e) => set("meetingUrl", e.target.value || null)} placeholder="https://cal.com/tu-usuario/30min" />
        </div>
        <div className="space-y-2">
          <Label>Link de demo interactivo</Label>
          <Input value={str(form.demoUrl)} onChange={(e) => set("demoUrl", e.target.value || null)} placeholder="https://demo.tuapp.com" />
        </div>
        <div className="space-y-2">
          <Label>Mensaje pre-escrito de WhatsApp</Label>
          <Textarea rows={2} value={str(form.whatsappMessage)} onChange={(e) => set("whatsappMessage", e.target.value || null)} placeholder="Hola! Me interesa el plan Avanzado, ¿puedes darme más información?" />
        </div>
      </Section>

      {/* ── CTA FINAL ── */}
      <Section title="CTA final">
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label className="text-xs">Título</Label>
            <Input value={str(form.ctaTitle)} onChange={(e) => set("ctaTitle", e.target.value || null)} placeholder="¿Listo para empezar?" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Subtítulo</Label>
            <Input value={str(form.ctaSubtitle)} onChange={(e) => set("ctaSubtitle", e.target.value || null)} placeholder="Sin contratos, cancela cuando quieras" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label className="text-xs">Texto botón principal</Label>
            <Input value={str(form.ctaButtonText)} onChange={(e) => set("ctaButtonText", e.target.value || null)} placeholder="Comenzar ahora" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">URL botón principal</Label>
            <Input value={str(form.ctaButtonUrl)} onChange={(e) => set("ctaButtonUrl", e.target.value || null)} placeholder="https://checkout..." />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label className="text-xs">Texto enlace secundario</Label>
            <Input value={str(form.ctaSecondaryText)} onChange={(e) => set("ctaSecondaryText", e.target.value || null)} placeholder="Agendar una demo" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">URL enlace secundario</Label>
            <Input value={str(form.ctaSecondaryUrl)} onChange={(e) => set("ctaSecondaryUrl", e.target.value || null)} placeholder="https://cal.com/..." />
          </div>
        </div>
      </Section>

      {/* ── SEO ── */}
      <Section title="SEO">
        <div className="space-y-2">
          <Label>Meta título</Label>
          <Input value={str(form.metaTitle)} onChange={(e) => set("metaTitle", e.target.value || null)} placeholder="Plan Avanzado | Agente IA" />
        </div>
        <div className="space-y-2">
          <Label>Meta descripción</Label>
          <Textarea rows={2} value={str(form.metaDescription)} onChange={(e) => set("metaDescription", e.target.value || null)} placeholder="Automatiza tu WhatsApp con IA. Incluye CRM, agenda, seguimientos y más." />
        </div>
        <div className="space-y-2">
          <Label>OG Image (para redes sociales)</Label>
          <ImageUploader value={str(form.ogImageUrl)} onChange={(url) => set("ogImageUrl", url || null)} placeholder="Subir imagen OG" />
        </div>
      </Section>

      {/* ── GUARDAR ── */}
      <Button onClick={handleSave} disabled={saving} className="w-full">
        {saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Guardando...</> : "Guardar detalle"}
      </Button>
    </div>
  );
}
