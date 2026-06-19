"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Loader2, Globe, Save, Calendar, FileSpreadsheet, MessageCircle,
  Instagram, Facebook, Palette, Type, Image, ChevronDown, ArrowLeft, Store,
} from "lucide-react";
import { getSiteConfig, updateSiteConfig } from "@/actions/admin/site-config-actions";
import type { TestimonialData, StatData } from "@/actions/reseller-plan-actions";

export function VerzayLanding() {
  const [section, setSection] = useState<"client" | "reseller" | null>(null);

  const [whatsappInput, setWhatsappInput] = useState("");
  const [meetingInput, setMeetingInput] = useState("");
  const [sheetsInput, setSheetsInput] = useState("");
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
  const [savingConfig, setSavingConfig] = useState(false);
  const [loading, setLoading] = useState(true);
  const [resellerWhatsappInput, setResellerWhatsappInput] = useState("");
  const [resellerLogoUrlInput, setResellerLogoUrlInput] = useState("");
  const [resellerMeetingUrlInput, setResellerMeetingUrlInput] = useState("");
  const [savingReseller, setSavingReseller] = useState(false);
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    basicos: true, identidad: false, hero: false, redes: false,
    video: false, cta: false, stats: false, testimonios: false,
  });
  const toggle = (k: string) => setOpenSections(p => ({ ...p, [k]: !p[k] }));

  useEffect(() => {
    getSiteConfig().then((cfg) => {
      setWhatsappInput(cfg.whatsappNumber ?? "");
      setMeetingInput(cfg.meetingUrl ?? "");
      setSheetsInput(cfg.sheetsUrl ?? "");
      setPrimaryColorInput(cfg.primaryColor ?? "");
      setBgColorInput(cfg.bgColor ?? "");
      setHeadlineInput(cfg.headline ?? "");
      setSubheadlineInput(cfg.subheadline ?? "");
      setLogoUrlInput(cfg.logoUrl ?? "");
      setInstagramInput(cfg.instagram ?? "");
      setFacebookInput(cfg.facebook ?? "");
      setVideoUrlInput(cfg.videoUrl ?? "");
      setCtaHeadlineInput(cfg.ctaHeadline ?? "");
      setCtaSubtitleInput(cfg.ctaSubtitle ?? "");
      if (cfg.testimonials?.length) {
        setTestimonialInputs([
          cfg.testimonials[0] ?? { quote: "", name: "", city: "", business: "", metric: "" },
          cfg.testimonials[1] ?? { quote: "", name: "", city: "", business: "", metric: "" },
          cfg.testimonials[2] ?? { quote: "", name: "", city: "", business: "", metric: "" },
        ]);
      }
      if (cfg.stats?.length) {
        setStatInputs([
          cfg.stats[0] ?? { value: "", label: "" },
          cfg.stats[1] ?? { value: "", label: "" },
          cfg.stats[2] ?? { value: "", label: "" },
          cfg.stats[3] ?? { value: "", label: "" },
        ]);
      }
      setResellerWhatsappInput(cfg.resellerWhatsappNumber ?? "");
      setResellerLogoUrlInput(cfg.resellerLogoUrl ?? "");
      setResellerMeetingUrlInput(cfg.resellerMeetingUrl ?? "");
      setLoading(false);
    });
  }, []);

  const handleSaveConfig = async () => {
    setSavingConfig(true);
    const res = await updateSiteConfig({
      whatsappNumber: whatsappInput || null,
      meetingUrl: meetingInput || null,
      sheetsUrl: sheetsInput || null,
      primaryColor: primaryColorInput || null,
      bgColor: bgColorInput || null,
      headline: headlineInput || null,
      subheadline: subheadlineInput || null,
      logoUrl: logoUrlInput || null,
      instagram: instagramInput || null,
      facebook: facebookInput || null,
      videoUrl: videoUrlInput || null,
      ctaHeadline: ctaHeadlineInput || null,
      ctaSubtitle: ctaSubtitleInput || null,
      testimonials: testimonialInputs.some((t) => t.quote) ? testimonialInputs : null,
      stats: statInputs.some((s) => s.value) ? statInputs : null,
      resellerWhatsappNumber: resellerWhatsappInput || null,
      resellerLogoUrl: resellerLogoUrlInput || null,
      resellerMeetingUrl: resellerMeetingUrlInput || null,
    });
    if (res.success) toast.success(res.message);
    else toast.error(res.message);
    setSavingConfig(false);
  };

  const handleSaveReseller = async () => {
    setSavingReseller(true);
    const res = await updateSiteConfig({
      whatsappNumber: whatsappInput || null,
      meetingUrl: meetingInput || null,
      sheetsUrl: sheetsInput || null,
      primaryColor: primaryColorInput || null,
      bgColor: bgColorInput || null,
      headline: headlineInput || null,
      subheadline: subheadlineInput || null,
      logoUrl: logoUrlInput || null,
      instagram: instagramInput || null,
      facebook: facebookInput || null,
      videoUrl: videoUrlInput || null,
      ctaHeadline: ctaHeadlineInput || null,
      ctaSubtitle: ctaSubtitleInput || null,
      testimonials: testimonialInputs.some((t) => t.quote) ? testimonialInputs : null,
      stats: statInputs.some((s) => s.value) ? statInputs : null,
      resellerWhatsappNumber: resellerWhatsappInput || null,
      resellerLogoUrl: resellerLogoUrlInput || null,
      resellerMeetingUrl: resellerMeetingUrlInput || null,
    });
    if (res.success) toast.success(res.message);
    else toast.error(res.message);
    setSavingReseller(false);
  };

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden">

      {/* Sticky header */}
      <div className="sticky top-0 z-10 bg-muted/60 border-b border-border/40 px-4 pt-4 pb-3 shrink-0 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          {section !== null && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setSection(null)}
              className="h-8 w-8 text-muted-foreground hover:text-foreground shrink-0"
              title="Volver"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
          )}
          <h2 className="text-lg font-semibold">Landing Page</h2>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant={section === "client" ? "default" : "outline"}
            size="sm"
            onClick={() => setSection("client")}
            className="gap-2 text-xs h-8"
          >
            <Globe className="h-3.5 w-3.5" />
            Clientes directos
          </Button>
          <Button
            variant={section === "reseller" ? "default" : "outline"}
            size="sm"
            onClick={() => setSection("reseller")}
            className="gap-2 text-xs h-8"
          >
            <Store className="h-3.5 w-3.5" />
            Resellers
          </Button>
        </div>
      </div>

      {/* Contenido */}
      <div className="flex-1 min-h-0 overflow-y-auto">

        {section === null ? (
          /* Pantalla de selección */
          <div className="flex flex-col justify-center min-h-[60vh]">
            <div className="w-full space-y-5 py-6">
              <div className="text-center space-y-1 mb-2">
                <h3 className="text-lg font-semibold">¿Qué landing deseas configurar?</h3>
                <p className="text-sm text-muted-foreground">Elige la página pública a gestionar</p>
              </div>

              {loading ? (
                <div className="flex justify-center py-10">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-5">
                  <Card
                    className="cursor-pointer group hover:border-primary/50 hover:shadow-lg transition-all duration-200 border-l-4 border-l-primary/40"
                    onClick={() => setSection("client")}
                  >
                    <CardContent className="p-8 flex flex-col gap-5 h-full">
                      <div className="flex items-center gap-4">
                        <div className="h-14 w-14 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0 group-hover:bg-primary/20 transition-colors">
                          <Globe className="h-7 w-7 text-primary" />
                        </div>
                        <h4 className="font-semibold text-lg leading-snug">Landing Verzay</h4>
                      </div>
                      <div className="flex-1 space-y-2">
                        <p className="text-sm text-muted-foreground">
                          Página pública principal para captar clientes directos.
                        </p>
                        <ul className="space-y-2 pt-2">
                          <li className="flex items-start gap-2 text-sm text-muted-foreground">
                            <span className="text-primary font-bold mt-0.5 shrink-0">✓</span>
                            Identidad visual: logo, colores y tipografía
                          </li>
                          <li className="flex items-start gap-2 text-sm text-muted-foreground">
                            <span className="text-primary font-bold mt-0.5 shrink-0">✓</span>
                            Textos del hero, CTA y sección de video
                          </li>
                          <li className="flex items-start gap-2 text-sm text-muted-foreground">
                            <span className="text-primary font-bold mt-0.5 shrink-0">✓</span>
                            Estadísticas, testimonios y redes sociales
                          </li>
                        </ul>
                      </div>
                      <div className="flex items-center justify-between gap-4 pt-6 border-t border-border/50">
                        <a
                          href="https://agente.ia-app.com/inicio"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-blue-500 hover:underline truncate"
                          onClick={(e) => e.stopPropagation()}
                        >
                          agente.ia-app.com/inicio
                        </a>
                        <span className="inline-flex items-center gap-1.5 text-sm font-medium text-primary shrink-0 group-hover:gap-3 transition-all whitespace-nowrap">
                          <ArrowLeft className="h-4 w-4 rotate-180" />
                          Configurar
                        </span>
                      </div>
                    </CardContent>
                  </Card>

                  <Card
                    className="cursor-pointer group hover:border-violet-500/50 hover:shadow-lg transition-all duration-200 border-l-4 border-l-violet-500/40"
                    onClick={() => setSection("reseller")}
                  >
                    <CardContent className="p-8 flex flex-col gap-5 h-full">
                      <div className="flex items-center gap-4">
                        <div className="h-14 w-14 rounded-2xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center shrink-0 group-hover:bg-violet-500/20 transition-colors">
                          <Store className="h-7 w-7 text-violet-600 dark:text-violet-400" />
                        </div>
                        <h4 className="font-semibold text-lg leading-snug">Landing Resellers</h4>
                      </div>
                      <div className="flex-1 space-y-2">
                        <p className="text-sm text-muted-foreground">
                          Página exclusiva para captar revendedores y distribuidores.
                        </p>
                        <ul className="space-y-2 pt-2">
                          <li className="flex items-start gap-2 text-sm text-muted-foreground">
                            <span className="text-violet-500 font-bold mt-0.5 shrink-0">✓</span>
                            Logo y link de reunión exclusivos para resellers
                          </li>
                          <li className="flex items-start gap-2 text-sm text-muted-foreground">
                            <span className="text-violet-500 font-bold mt-0.5 shrink-0">✓</span>
                            WhatsApp diferenciado para distribuidores
                          </li>
                          <li className="flex items-start gap-2 text-sm text-muted-foreground">
                            <span className="text-violet-500 font-bold mt-0.5 shrink-0">✓</span>
                            Precios gestionados desde Admin → Planes
                          </li>
                        </ul>
                      </div>
                      <div className="flex items-center justify-between gap-4 pt-6 border-t border-border/50">
                        <a
                          href="https://agente.ia-app.com/resellers"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-blue-500 hover:underline truncate"
                          onClick={(e) => e.stopPropagation()}
                        >
                          agente.ia-app.com/resellers
                        </a>
                        <span className="inline-flex items-center gap-1.5 text-sm font-medium text-violet-600 dark:text-violet-400 shrink-0 group-hover:gap-3 transition-all whitespace-nowrap">
                          <ArrowLeft className="h-4 w-4 rotate-180" />
                          Configurar
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}
            </div>
          </div>

        ) : section === "client" ? (
          /* ── Landing Clientes directos ── */
          <div>
            <Card>
              <CardHeader className="pb-2 pt-4">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Globe className="h-4 w-4" /> Página pública principal
                </CardTitle>
              </CardHeader>
              <CardContent className="pb-4 divide-y divide-border">

                <div>
                  <button type="button" className="flex w-full items-center justify-between py-3" onClick={() => toggle('basicos')}>
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Datos básicos</p>
                    <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform duration-200", openSections.basicos && "-rotate-180")} />
                  </button>
                  <div className={cn(openSections.basicos ? "pb-3 space-y-4" : "hidden")}>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label className="flex items-center gap-1.5 text-sm"><MessageCircle className="h-3.5 w-3.5 text-green-500" /> Número WhatsApp</Label>
                        <Input placeholder="ej. 573233612620" value={whatsappInput} onChange={(e) => setWhatsappInput(e.target.value)} />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="flex items-center gap-1.5 text-sm"><Calendar className="h-3.5 w-3.5 text-blue-500" /> Link de agenda / reunión</Label>
                        <Input placeholder="https://verzay.com/agendar-una-reunion" value={meetingInput} onChange={(e) => setMeetingInput(e.target.value)} />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="flex items-center gap-1.5 text-sm"><FileSpreadsheet className="h-3.5 w-3.5 text-emerald-500" /> Google Sheets (leads del sitio)</Label>
                      <Input placeholder="https://docs.google.com/spreadsheets/d/..." value={sheetsInput} onChange={(e) => setSheetsInput(e.target.value)} />
                    </div>
                  </div>
                </div>

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
                        <p className="text-xs text-muted-foreground">Color de botones y acentos en la landing.</p>
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="flex items-center gap-1.5 text-sm"><Image className="h-3.5 w-3.5 text-violet-500" /> Logo (URL de imagen)</Label>
                      <Input placeholder="https://verzay.com/logo.png" value={logoUrlInput} onChange={(e) => setLogoUrlInput(e.target.value)} />
                      <p className="text-xs text-muted-foreground">Reemplaza el ícono de robot en navbar y footer.</p>
                    </div>
                  </div>
                </div>

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

                <div>
                  <button type="button" className="flex w-full items-center justify-between py-3" onClick={() => toggle('redes')}>
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Redes sociales</p>
                    <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform duration-200", openSections.redes && "-rotate-180")} />
                  </button>
                  <div className={cn(openSections.redes ? "pb-3 space-y-3" : "hidden")}>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label className="flex items-center gap-1.5 text-sm"><Instagram className="h-3.5 w-3.5 text-pink-500" /> Instagram</Label>
                        <Input placeholder="https://instagram.com/verzay" value={instagramInput} onChange={(e) => setInstagramInput(e.target.value)} />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="flex items-center gap-1.5 text-sm"><Facebook className="h-3.5 w-3.5 text-blue-500" /> Facebook</Label>
                        <Input placeholder="https://facebook.com/verzay" value={facebookInput} onChange={(e) => setFacebookInput(e.target.value)} />
                      </div>
                    </div>
                  </div>
                </div>

                <div>
                  <button type="button" className="flex w-full items-center justify-between py-3" onClick={() => toggle('video')}>
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Video de presentación</p>
                    <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform duration-200", openSections.video && "-rotate-180")} />
                  </button>
                  <div className={cn(openSections.video ? "pb-3 space-y-3" : "hidden")}>
                    <div className="space-y-1.5">
                      <Label className="text-sm">URL YouTube / Vimeo</Label>
                      <Input placeholder="https://www.youtube.com/watch?v=..." value={videoUrlInput} onChange={(e) => setVideoUrlInput(e.target.value)} />
                      <p className="text-xs text-muted-foreground">Aparece después de los 3 pasos en la landing.</p>
                    </div>
                  </div>
                </div>

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

                <div className="flex items-center justify-between gap-4 pt-1">
                  <p className="text-sm text-muted-foreground">
                    Landing pública:{" "}
                    <a href="https://agente.ia-app.com/inicio" target="_blank" rel="noopener noreferrer" className="font-medium text-blue-500 hover:text-blue-400 hover:underline">
                      agente.ia-app.com/inicio
                    </a>
                  </p>
                  <Button size="sm" onClick={handleSaveConfig} disabled={savingConfig} className="shrink-0 gap-1.5 bg-green-600 hover:bg-green-700 text-white">
                    {savingConfig ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                    Guardar
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

        ) : (
          /* ── Landing Resellers ── */
          <div>
            <Card>
              <CardHeader className="pb-2 pt-4">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Store className="h-4 w-4 text-violet-500" /> Landing Resellers
                </CardTitle>
              </CardHeader>
              <CardContent className="pb-4 space-y-4">
                <p className="text-xs text-muted-foreground">
                  Configuración específica para la página{" "}
                  <a href="https://agente.ia-app.com/resellers" target="_blank" rel="noopener noreferrer" className="font-medium text-blue-500 hover:underline">
                    /resellers
                  </a>. Los campos no configurados aquí usarán los valores de la landing principal.
                </p>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label className="flex items-center gap-1.5 text-sm">
                      <Image className="h-3.5 w-3.5 text-violet-500" /> Logo (URL)
                    </Label>
                    <Input placeholder="https://... (vacío = usa el logo principal)" value={resellerLogoUrlInput} onChange={(e) => setResellerLogoUrlInput(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="flex items-center gap-1.5 text-sm">
                      <Calendar className="h-3.5 w-3.5 text-blue-500" /> Link de reunión / agenda
                    </Label>
                    <Input placeholder="https://... (vacío = usa el link principal)" value={resellerMeetingUrlInput} onChange={(e) => setResellerMeetingUrlInput(e.target.value)} />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label className="flex items-center gap-1.5 text-sm">
                    <MessageCircle className="h-3.5 w-3.5 text-green-500" /> WhatsApp exclusivo para resellers
                  </Label>
                  <Input placeholder="ej. 573001234567 (vacío = usa el número principal)" value={resellerWhatsappInput} onChange={(e) => setResellerWhatsappInput(e.target.value)} />
                </div>

                <div className="flex items-center justify-between gap-4 pt-1 border-t border-border">
                  <p className="text-sm text-muted-foreground">
                    Los precios se gestionan en{" "}
                    <a href="/admin/planes" className="font-medium text-blue-500 hover:underline">
                      Admin → Planes → Resellers
                    </a>.
                  </p>
                  <Button size="sm" onClick={handleSaveReseller} disabled={savingReseller} className="shrink-0 gap-1.5 bg-green-600 hover:bg-green-700 text-white">
                    {savingReseller ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                    Guardar
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
