"use client";

import { useCallback, useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Loader2, Globe, Save, Calendar, FileSpreadsheet, MessageCircle,
  Instagram, Facebook, Palette, Type, Image, ChevronDown,
} from "lucide-react";
import {
  getMyResellerPlans,
  updateResellerProfile,
  type ResellerProfileData,
  type TestimonialData,
  type StatData,
} from "@/actions/reseller-plan-actions";

export function MiLanding() {
  const [profile, setProfile] = useState<ResellerProfileData | null>(null);
  const [loading, setLoading] = useState(true);

  const [slugInput, setSlugInput] = useState("");
  const [businessNameInput, setBusinessNameInput] = useState("");
  const [meetingUrlInput, setMeetingUrlInput] = useState("");
  const [sheetsUrlInput, setSheetsUrlInput] = useState("");
  const [whatsappInput, setWhatsappInput] = useState("");
  const [primaryColorInput, setPrimaryColorInput] = useState("");
  const [bgColorInput, setBgColorInput] = useState("");
  const [headlineInput, setHeadlineInput] = useState("");
  const [subheadlineInput, setSubheadlineInput] = useState("");
  const [logoUrlInput, setLogoUrlInput] = useState("");
  const [instagramInput, setInstagramInput] = useState("");
  const [facebookInput, setFacebookInput] = useState("");
  const [videoUrlInput, setVideoUrlInput] = useState("");
  const [ctaHeadlineInput, setCtaHeadlineInput] = useState("");
  const [ctaSubtitleInput, setCtaSubtitleInput] = useState("");
  const [testimonialInputs, setTestimonialInputs] = useState<TestimonialData[]>([
    { quote: "", name: "", city: "", business: "", metric: "" },
    { quote: "", name: "", city: "", business: "", metric: "" },
    { quote: "", name: "", city: "", business: "", metric: "" },
  ]);
  const [statInputs, setStatInputs] = useState<StatData[]>([
    { value: "", label: "" }, { value: "", label: "" },
    { value: "", label: "" }, { value: "", label: "" },
  ]);
  const [showAssistanceIA, setShowAssistanceIA] = useState(true);
  const [showAssistanceHUMANO, setShowAssistanceHUMANO] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    basicos: true, identidad: false, hero: false, redes: false,
    video: false, cta: false, stats: false, testimonios: false, planes: false,
  });
  const toggle = (k: string) => setOpenSections(p => ({ ...p, [k]: !p[k] }));

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getMyResellerPlans();
      if (res.success) {
        setProfile(res.profile);
        setSlugInput(res.profile?.slug ?? "");
        setBusinessNameInput(res.profile?.businessName ?? "");
        setMeetingUrlInput(res.profile?.meetingUrl ?? "");
        setSheetsUrlInput(res.profile?.sheetsUrl ?? "");
        setWhatsappInput(res.profile?.whatsappNumber ?? "");
        setPrimaryColorInput(res.profile?.primaryColor ?? "");
        setBgColorInput(res.profile?.bgColor ?? "");
        setHeadlineInput(res.profile?.headline ?? "");
        setSubheadlineInput(res.profile?.subheadline ?? "");
        setLogoUrlInput(res.profile?.logoUrl ?? "");
        setInstagramInput(res.profile?.instagram ?? "");
        setFacebookInput(res.profile?.facebook ?? "");
        setVideoUrlInput(res.profile?.videoUrl ?? "");
        setCtaHeadlineInput(res.profile?.ctaHeadline ?? "");
        setCtaSubtitleInput(res.profile?.ctaSubtitle ?? "");
        if (res.profile?.testimonials?.length) setTestimonialInputs(res.profile.testimonials);
        if (res.profile?.stats?.length) setStatInputs(res.profile.stats);
        setShowAssistanceIA(res.profile?.showAssistanceIA ?? true);
        setShowAssistanceHUMANO(res.profile?.showAssistanceHUMANO ?? true);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void fetchData(); }, [fetchData]);

  const handleSaveProfile = async () => {
    if (!slugInput) { toast.error("El slug es requerido"); return; }
    setSavingProfile(true);
    const res = await updateResellerProfile({
      slug: slugInput,
      businessName: businessNameInput,
      meetingUrl: meetingUrlInput,
      sheetsUrl: sheetsUrlInput,
      whatsappNumber: whatsappInput,
      primaryColor: primaryColorInput,
      bgColor: bgColorInput,
      headline: headlineInput,
      subheadline: subheadlineInput,
      logoUrl: logoUrlInput,
      instagram: instagramInput,
      facebook: facebookInput,
      videoUrl: videoUrlInput,
      ctaHeadline: ctaHeadlineInput,
      ctaSubtitle: ctaSubtitleInput,
      testimonials: testimonialInputs,
      stats: statInputs,
      showAssistanceIA,
      showAssistanceHUMANO,
    });
    if (res.success) {
      toast.success(res.message);
      void fetchData();
    } else {
      toast.error(res.message);
    }
    setSavingProfile(false);
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Cargando...
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden">

      {/* Sticky header */}
      <div className="sticky top-0 z-10 bg-muted/60 border-b border-border/40 px-4 pt-4 pb-3 shrink-0">
        <h2 className="text-lg font-semibold">Mi Landing Page</h2>
        <p className="text-sm text-muted-foreground">
          Configura el contenido y apariencia de tu página pública.
        </p>
      </div>

      {/* Contenido */}
      <div className="flex-1 min-h-0 overflow-y-auto py-4">
      {/* Página pública */}
      <Card>
        <CardHeader className="pb-2 pt-4">
          <CardTitle className="flex items-center gap-2 text-base">
            <Globe className="h-4 w-4" />
            Página pública
          </CardTitle>
        </CardHeader>
        <CardContent className="pb-4 divide-y divide-border">

          {/* ── Datos básicos ── */}
          <div>
            <button type="button" className="flex w-full items-center justify-between py-3" onClick={() => toggle('basicos')}>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Datos básicos</p>
              <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform duration-200", openSections.basicos && "-rotate-180")} />
            </button>
            <div className={cn(openSections.basicos ? "pb-3 space-y-4" : "hidden")}>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-sm">Slug (URL)</Label>
                  <div className="flex items-center gap-1 rounded-md border border-border bg-muted/30 px-2">
                    <span className="text-sm text-muted-foreground whitespace-nowrap">/r/</span>
                    <Input className="border-0 bg-transparent p-0 text-sm focus-visible:ring-0" placeholder="mi-empresa" value={slugInput} onChange={(e) => setSlugInput(e.target.value)} />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm">Nombre del negocio</Label>
                  <Input placeholder="Mi Empresa S.A." value={businessNameInput} onChange={(e) => setBusinessNameInput(e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="flex items-center gap-1.5 text-sm"><MessageCircle className="h-3.5 w-3.5 text-green-500" /> Número WhatsApp</Label>
                  <Input placeholder="ej. 573001234567" value={whatsappInput} onChange={(e) => setWhatsappInput(e.target.value)} />
                  <p className="text-xs text-muted-foreground">Botón flotante de contacto en tu landing.</p>
                </div>
                <div className="space-y-1.5">
                  <Label className="flex items-center gap-1.5 text-sm"><Calendar className="h-3.5 w-3.5 text-blue-500" /> Link de agenda / reunión</Label>
                  <Input placeholder="https://calendly.com/tu-nombre" value={meetingUrlInput} onChange={(e) => setMeetingUrlInput(e.target.value)} />
                  <p className="text-xs text-muted-foreground">Botón &quot;Agendar asesoría&quot; en tu landing pública.</p>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5 text-sm"><FileSpreadsheet className="h-3.5 w-3.5 text-emerald-500" /> Google Sheets (tus leads)</Label>
                <Input placeholder="https://docs.google.com/spreadsheets/d/..." value={sheetsUrlInput} onChange={(e) => setSheetsUrlInput(e.target.value)} />
                <p className="text-xs text-muted-foreground">Los registros de tu landing llegarán aquí también.</p>
              </div>
            </div>
          </div>

          {/* ── Identidad visual ── */}
          <div>
            <button type="button" className="flex w-full items-center justify-between py-3" onClick={() => toggle('identidad')}>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Identidad visual</p>
              <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform duration-200", openSections.identidad && "-rotate-180")} />
            </button>
            <div className={cn(openSections.identidad ? "pb-3 space-y-3" : "hidden")}>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="flex items-center gap-1.5 text-sm"><Palette className="h-3.5 w-3.5 text-slate-400" /> Color de fondo</Label>
                  <div className="flex gap-2">
                    <input type="color" value={bgColorInput || "#0f172a"} onChange={(e) => setBgColorInput(e.target.value)} className="h-9 w-14 cursor-pointer rounded-md border border-border bg-transparent p-0.5" />
                    <Input placeholder="#0f172a" value={bgColorInput} onChange={(e) => setBgColorInput(e.target.value)} />
                  </div>
                  <p className="text-xs text-muted-foreground">Color del fondo oscuro de toda la landing.</p>
                </div>
                <div className="space-y-1.5">
                  <Label className="flex items-center gap-1.5 text-sm"><Palette className="h-3.5 w-3.5 text-pink-500" /> Color primario</Label>
                  <div className="flex gap-2">
                    <input type="color" value={primaryColorInput || "#2563eb"} onChange={(e) => setPrimaryColorInput(e.target.value)} className="h-9 w-14 cursor-pointer rounded-md border border-border bg-transparent p-0.5" />
                    <Input placeholder="#2563eb" value={primaryColorInput} onChange={(e) => setPrimaryColorInput(e.target.value)} />
                  </div>
                  <p className="text-xs text-muted-foreground">Color de botones y acentos en tu landing.</p>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5 text-sm"><Image className="h-3.5 w-3.5 text-violet-500" /> Logo (URL de imagen)</Label>
                <Input placeholder="https://mi-empresa.com/logo.png" value={logoUrlInput} onChange={(e) => setLogoUrlInput(e.target.value)} />
                <p className="text-xs text-muted-foreground">Reemplaza el ícono de robot en navbar y footer.</p>
              </div>
            </div>
          </div>

          {/* ── Textos del hero ── */}
          <div>
            <button type="button" className="flex w-full items-center justify-between py-3" onClick={() => toggle('hero')}>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Textos del hero</p>
              <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform duration-200", openSections.hero && "-rotate-180")} />
            </button>
            <div className={cn(openSections.hero ? "pb-3 space-y-3" : "hidden")}>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="flex items-center gap-1.5 text-sm"><Type className="h-3.5 w-3.5 text-blue-500" /> Headline principal</Label>
                  <Input placeholder="Automatiza tu WhatsApp con estructura profesional" value={headlineInput} onChange={(e) => setHeadlineInput(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm">Subtítulo</Label>
                  <Input placeholder="Transforma tus mensajes en un sistema automático de ventas..." value={subheadlineInput} onChange={(e) => setSubheadlineInput(e.target.value)} />
                </div>
              </div>
            </div>
          </div>

          {/* ── Redes sociales ── */}
          <div>
            <button type="button" className="flex w-full items-center justify-between py-3" onClick={() => toggle('redes')}>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Redes sociales</p>
              <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform duration-200", openSections.redes && "-rotate-180")} />
            </button>
            <div className={cn(openSections.redes ? "pb-3 space-y-3" : "hidden")}>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="flex items-center gap-1.5 text-sm"><Instagram className="h-3.5 w-3.5 text-pink-500" /> Instagram</Label>
                  <Input placeholder="https://instagram.com/tu-empresa" value={instagramInput} onChange={(e) => setInstagramInput(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label className="flex items-center gap-1.5 text-sm"><Facebook className="h-3.5 w-3.5 text-blue-500" /> Facebook</Label>
                  <Input placeholder="https://facebook.com/tu-empresa" value={facebookInput} onChange={(e) => setFacebookInput(e.target.value)} />
                </div>
              </div>
            </div>
          </div>

          {/* ── Video ── */}
          <div>
            <button type="button" className="flex w-full items-center justify-between py-3" onClick={() => toggle('video')}>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Video de presentación</p>
              <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform duration-200", openSections.video && "-rotate-180")} />
            </button>
            <div className={cn(openSections.video ? "pb-3 space-y-3" : "hidden")}>
              <div className="space-y-1.5">
                <Label className="text-sm">URL YouTube / Vimeo</Label>
                <Input placeholder="https://www.youtube.com/watch?v=..." value={videoUrlInput} onChange={(e) => setVideoUrlInput(e.target.value)} />
                <p className="text-xs text-muted-foreground">Aparece después de los 3 pasos en tu landing.</p>
              </div>
            </div>
          </div>

          {/* ── CTA final ── */}
          <div>
            <button type="button" className="flex w-full items-center justify-between py-3" onClick={() => toggle('cta')}>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">CTA final</p>
              <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform duration-200", openSections.cta && "-rotate-180")} />
            </button>
            <div className={cn(openSections.cta ? "pb-3 space-y-3" : "hidden")}>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-sm">Título</Label>
                  <Input placeholder="¿Listo para empezar?" value={ctaHeadlineInput} onChange={(e) => setCtaHeadlineInput(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm">Subtítulo</Label>
                  <Input placeholder="Configúralo en 5 minutos..." value={ctaSubtitleInput} onChange={(e) => setCtaSubtitleInput(e.target.value)} />
                </div>
              </div>
            </div>
          </div>

          {/* ── Estadísticas del hero ── */}
          <div>
            <button type="button" className="flex w-full items-center justify-between py-3" onClick={() => toggle('stats')}>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Estadísticas del hero</p>
              <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform duration-200", openSections.stats && "-rotate-180")} />
            </button>
            <div className={cn(openSections.stats ? "pb-3 space-y-3" : "hidden")}>
              <div className="grid grid-cols-2 gap-3">
                {statInputs.map((s, i) => (
                  <div key={i} className="space-y-1.5 rounded-lg border border-border p-2.5">
                    <Input placeholder={["+500", "1M+", "4.9★", "+40%"][i]} value={s.value} onChange={(e) => { const next = [...statInputs]; next[i] = { ...next[i], value: e.target.value }; setStatInputs(next); }} />
                    <Input placeholder={["Negocios activos", "Mensajes respondidos", "Calificación promedio", "Aumento en ventas"][i]} value={s.label} onChange={(e) => { const next = [...statInputs]; next[i] = { ...next[i], label: e.target.value }; setStatInputs(next); }} />
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ── Testimonios ── */}
          <div>
            <button type="button" className="flex w-full items-center justify-between py-3" onClick={() => toggle('testimonios')}>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Testimonios</p>
              <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform duration-200", openSections.testimonios && "-rotate-180")} />
            </button>
            <div className={cn(openSections.testimonios ? "pb-3 space-y-3" : "hidden")}>
              {testimonialInputs.map((t, i) => (
                <div key={i} className="rounded-lg border border-border p-3 space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">Testimonio {i + 1}</p>
                  <Input placeholder="Frase del cliente..." value={t.quote} onChange={(e) => { const n = [...testimonialInputs]; n[i] = { ...n[i], quote: e.target.value }; setTestimonialInputs(n); }} />
                  <div className="grid grid-cols-2 gap-2">
                    <Input placeholder="Nombre" value={t.name} onChange={(e) => { const n = [...testimonialInputs]; n[i] = { ...n[i], name: e.target.value }; setTestimonialInputs(n); }} />
                    <Input placeholder="Ciudad, País" value={t.city} onChange={(e) => { const n = [...testimonialInputs]; n[i] = { ...n[i], city: e.target.value }; setTestimonialInputs(n); }} />
                    <Input placeholder="Negocio / empresa" value={t.business} onChange={(e) => { const n = [...testimonialInputs]; n[i] = { ...n[i], business: e.target.value }; setTestimonialInputs(n); }} />
                    <Input placeholder="Métrica (+40% ventas)" value={t.metric} onChange={(e) => { const n = [...testimonialInputs]; n[i] = { ...n[i], metric: e.target.value }; setTestimonialInputs(n); }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ── Sección de planes ── */}
          <div>
            <button type="button" className="flex w-full items-center justify-between py-3" onClick={() => toggle('planes')}>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Sección de planes</p>
              <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform duration-200", openSections.planes && "-rotate-180")} />
            </button>
            <div className={cn(openSections.planes ? "pb-3 space-y-3" : "hidden")}>
              <p className="text-sm text-muted-foreground">
                Controla qué tipos de asistencia aparecen en la sección de precios de tu landing.
              </p>
              <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2.5">
                <Label className="text-sm">Mostrar Asistencia IA</Label>
                <Switch checked={showAssistanceIA} onCheckedChange={setShowAssistanceIA} />
              </div>
              <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2.5">
                <Label className="text-sm">Mostrar Asistencia Humana</Label>
                <Switch checked={showAssistanceHUMANO} onCheckedChange={setShowAssistanceHUMANO} />
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between gap-4 pt-1">
            <p className="text-sm text-muted-foreground">
              Tu landing:{" "}
              <a
                href={`https://agente.ia-app.com/r/${slugInput || profile?.slug || "tu-slug"}`}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-blue-500 hover:text-blue-400 hover:underline"
              >
                agente.ia-app.com/r/{slugInput || profile?.slug || "tu-slug"}
              </a>
            </p>
            <Button
              size="sm"
              onClick={handleSaveProfile}
              disabled={savingProfile}
              className="shrink-0 gap-1.5 bg-green-600 hover:bg-green-700 text-white"
            >
              {savingProfile ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              Guardar
            </Button>
          </div>
        </CardContent>
      </Card>
      </div>
    </div>
  );
}
