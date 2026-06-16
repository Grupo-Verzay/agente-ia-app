"use client";

import { useCallback, useEffect, useState } from "react";
import { Plan } from "@prisma/client";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Pencil, Loader2, Star, Globe, Save, Calendar, FileSpreadsheet, MessageCircle, Instagram, Facebook, Palette, Type, Image } from "lucide-react";
import {
  getMyResellerPlans,
  upsertResellerPlan,
  toggleResellerPlanActive,
  updateResellerProfile,
  type ResellerPlanItem,
  type ResellerProfileData,
  type TestimonialData,
  type StatData,
} from "@/actions/reseller-plan-actions";
import { type SubscriptionPlanItem, getAllSubscriptionPlans } from "@/actions/subscription-plan-actions";
import { PLAN_LABELS, PLANS } from "@/types/plans";

const ASSISTANCE_TYPES = ["IA", "HUMANO"] as const;
type BillingPeriod = "monthly" | "quarterly" | "yearly";

type EditForm = {
  plan: Plan;
  assistanceType: string;
  priceMonthly: number;
  priceQuarterly: number;
  priceYearly: number;
  credits: number;
  features: string;
  description: string;
  isPopular: boolean;
  isActive: boolean;
  color: string;
  order: number;
  checkoutUrlMonthly: string;
  checkoutUrlQuarterly: string;
  checkoutUrlYearly: string;
};

export function MisPlanes() {
  const [resellerPlans, setResellerPlans] = useState<ResellerPlanItem[]>([]);
  const [masterPlans, setMasterPlans] = useState<SubscriptionPlanItem[]>([]);
  const [profile, setProfile] = useState<ResellerProfileData | null>(null);
  const [loading, setLoading] = useState(true);

  const [editOpen, setEditOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<EditForm | null>(null);
  const [period, setPeriod] = useState<BillingPeriod>("monthly");

  const [slugInput, setSlugInput] = useState("");
  const [businessNameInput, setBusinessNameInput] = useState("");
  const [meetingUrlInput, setMeetingUrlInput] = useState("");
  const [sheetsUrlInput, setSheetsUrlInput] = useState("");
  const [whatsappInput, setWhatsappInput] = useState("");
  const [primaryColorInput, setPrimaryColorInput] = useState("");
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
  const [savingProfile, setSavingProfile] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [myRes, masterRes] = await Promise.all([
        getMyResellerPlans(),
        getAllSubscriptionPlans(),
      ]);
      if (myRes.success) {
        setResellerPlans(myRes.data);
        setProfile(myRes.profile);
        setSlugInput(myRes.profile?.slug ?? "");
        setBusinessNameInput(myRes.profile?.businessName ?? "");
        setMeetingUrlInput(myRes.profile?.meetingUrl ?? "");
        setSheetsUrlInput(myRes.profile?.sheetsUrl ?? "");
        setWhatsappInput(myRes.profile?.whatsappNumber ?? "");
        setPrimaryColorInput(myRes.profile?.primaryColor ?? "");
        setHeadlineInput(myRes.profile?.headline ?? "");
        setSubheadlineInput(myRes.profile?.subheadline ?? "");
        setLogoUrlInput(myRes.profile?.logoUrl ?? "");
        setInstagramInput(myRes.profile?.instagram ?? "");
        setFacebookInput(myRes.profile?.facebook ?? "");
        setVideoUrlInput(myRes.profile?.videoUrl ?? "");
        setCtaHeadlineInput(myRes.profile?.ctaHeadline ?? "");
        setCtaSubtitleInput(myRes.profile?.ctaSubtitle ?? "");
        if (myRes.profile?.testimonials?.length) setTestimonialInputs(myRes.profile.testimonials);
        if (myRes.profile?.stats?.length) setStatInputs(myRes.profile.stats);
      }
      if (masterRes.success) setMasterPlans(masterRes.data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void fetchData(); }, [fetchData]);

  const getResellerPlan = (plan: Plan, type: string) =>
    resellerPlans.find((p) => p.plan === plan && p.assistanceType === type);

  const getMasterPlan = (plan: Plan, type: string) =>
    masterPlans.find((p) => p.plan === plan && p.assistanceType === type);

  const openEdit = (plan: Plan, type: string) => {
    const rp = getResellerPlan(plan, type);
    const mp = getMasterPlan(plan, type);
    setForm({
      plan,
      assistanceType: type,
      priceMonthly: rp?.priceMonthly ?? mp?.priceUSD ?? 0,
      priceQuarterly: rp?.priceQuarterly ?? mp?.priceQuarterly ?? 0,
      priceYearly: rp?.priceYearly ?? mp?.priceYearly ?? 0,
      credits: rp?.credits ?? mp?.credits ?? 0,
      features: (rp?.features ?? mp?.features ?? []).join("\n"),
      description: rp?.description ?? mp?.description ?? "",
      isPopular: rp?.isPopular ?? mp?.isPopular ?? false,
      isActive: rp?.isActive ?? true,
      color: rp?.color ?? mp?.color ?? "",
      order: rp?.order ?? mp?.order ?? PLANS.indexOf(plan),
      checkoutUrlMonthly: rp?.checkoutUrlMonthly ?? mp?.checkoutUrlMonthly ?? "",
      checkoutUrlQuarterly: rp?.checkoutUrlQuarterly ?? mp?.checkoutUrlQuarterly ?? "",
      checkoutUrlYearly: rp?.checkoutUrlYearly ?? mp?.checkoutUrlYearly ?? "",
    });
    setEditOpen(true);
  };

  const handleSave = async () => {
    if (!form) return;
    setSaving(true);
    const res = await upsertResellerPlan({
      ...form,
      features: form.features.split("\n").map((f) => f.trim()).filter(Boolean),
      description: form.description || undefined,
      color: form.color || undefined,
      priceQuarterly: form.priceQuarterly || null,
      priceYearly: form.priceYearly || null,
      checkoutUrlMonthly: form.checkoutUrlMonthly || undefined,
      checkoutUrlQuarterly: form.checkoutUrlQuarterly || undefined,
      checkoutUrlYearly: form.checkoutUrlYearly || undefined,
    });
    if (res.success) {
      toast.success(res.message);
      setEditOpen(false);
      void fetchData();
    } else {
      toast.error(res.message);
    }
    setSaving(false);
  };

  const handleToggle = async (id: string, current: boolean) => {
    const res = await toggleResellerPlanActive(id, !current);
    if (res.success) void fetchData();
    else toast.error("Error al cambiar estado");
  };

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
    });
    if (res.success) {
      toast.success(res.message);
      void fetchData();
    } else {
      toast.error(res.message);
    }
    setSavingProfile(false);
  };

  return (
    <div className="flex flex-col gap-6 p-4 h-full overflow-y-auto">

      {/* Header */}
      <div>
        <h2 className="text-lg font-semibold">Mi Landing Page y Planes</h2>
        <p className="text-sm text-muted-foreground">
          Configura el link de tu landing page, nombre, WhatsApp, agenda, precios y características de tus planes personalizados.
        </p>
      </div>

      {/* Perfil público */}
      <Card>
        <CardHeader className="pb-2 pt-4">
          <CardTitle className="flex items-center gap-2 text-base">
            <Globe className="h-4 w-4" />
            Página pública
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 pb-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-sm">Slug (URL)</Label>
              <div className="flex items-center gap-1 rounded-md border border-border bg-muted/30 px-2">
                <span className="text-sm text-muted-foreground whitespace-nowrap">/r/</span>
                <Input
                  className="border-0 bg-transparent p-0 text-sm focus-visible:ring-0"
                  placeholder="mi-empresa"
                  value={slugInput}
                  onChange={(e) => setSlugInput(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Nombre del negocio</Label>
              <Input
                placeholder="Mi Empresa S.A."
                value={businessNameInput}
                onChange={(e) => setBusinessNameInput(e.target.value)}
              />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5 text-sm">
                <MessageCircle className="h-3.5 w-3.5 text-green-500" /> Número WhatsApp
              </Label>
              <Input
                placeholder="ej. 573001234567"
                value={whatsappInput}
                onChange={(e) => setWhatsappInput(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Botón flotante de contacto en tu landing.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5 text-sm">
                <Calendar className="h-3.5 w-3.5 text-blue-500" /> Link de agenda / reunión
              </Label>
              <Input
                placeholder="https://calendly.com/tu-nombre"
                value={meetingUrlInput}
                onChange={(e) => setMeetingUrlInput(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Botón &quot;Agendar asesoría&quot; en tu landing pública.
              </p>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5 text-sm">
              <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-500" /> Google Sheets (tus leads)
            </Label>
            <Input
              placeholder="https://docs.google.com/spreadsheets/d/..."
              value={sheetsUrlInput}
              onChange={(e) => setSheetsUrlInput(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Los registros de tu landing llegarán aquí también.
            </p>
          </div>

          {/* ── Identidad visual ── */}
          <div className="border-t border-border pt-4 space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Identidad visual</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5 text-sm">
                  <Image className="h-3.5 w-3.5 text-violet-500" /> Logo (URL de imagen)
                </Label>
                <Input
                  placeholder="https://mi-empresa.com/logo.png"
                  value={logoUrlInput}
                  onChange={(e) => setLogoUrlInput(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">Reemplaza el ícono de robot en navbar y footer.</p>
              </div>
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5 text-sm">
                  <Palette className="h-3.5 w-3.5 text-pink-500" /> Color primario
                </Label>
                <div className="flex gap-2">
                  <input
                    type="color"
                    value={primaryColorInput || "#2563eb"}
                    onChange={(e) => setPrimaryColorInput(e.target.value)}
                    className="h-9 w-14 cursor-pointer rounded-md border border-border bg-transparent p-0.5"
                  />
                  <Input
                    placeholder="#2563eb"
                    value={primaryColorInput}
                    onChange={(e) => setPrimaryColorInput(e.target.value)}
                  />
                </div>
                <p className="text-xs text-muted-foreground">Color de botones y acentos en tu landing.</p>
              </div>
            </div>
          </div>

          {/* ── Textos del hero ── */}
          <div className="border-t border-border pt-4 space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Textos del hero</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5 text-sm">
                  <Type className="h-3.5 w-3.5 text-blue-500" /> Headline principal
                </Label>
                <Input
                  placeholder="Automatiza tu WhatsApp con estructura profesional"
                  value={headlineInput}
                  onChange={(e) => setHeadlineInput(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">Subtítulo</Label>
                <Input
                  placeholder="Transforma tus mensajes en un sistema automático de ventas..."
                  value={subheadlineInput}
                  onChange={(e) => setSubheadlineInput(e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* ── Redes sociales ── */}
          <div className="border-t border-border pt-4 space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Redes sociales</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5 text-sm">
                  <Instagram className="h-3.5 w-3.5 text-pink-500" /> Instagram
                </Label>
                <Input
                  placeholder="https://instagram.com/tu-empresa"
                  value={instagramInput}
                  onChange={(e) => setInstagramInput(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5 text-sm">
                  <Facebook className="h-3.5 w-3.5 text-blue-500" /> Facebook
                </Label>
                <Input
                  placeholder="https://facebook.com/tu-empresa"
                  value={facebookInput}
                  onChange={(e) => setFacebookInput(e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* ── Video ── */}
          <div className="border-t border-border pt-4 space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Video de presentación</p>
            <div className="space-y-1.5">
              <Label className="text-sm">URL YouTube / Vimeo</Label>
              <Input
                placeholder="https://www.youtube.com/watch?v=..."
                value={videoUrlInput}
                onChange={(e) => setVideoUrlInput(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">Aparece después de los 3 pasos en tu landing.</p>
            </div>
          </div>

          {/* ── CTA final ── */}
          <div className="border-t border-border pt-4 space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">CTA final</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-sm">Título</Label>
                <Input
                  placeholder="¿Listo para empezar?"
                  value={ctaHeadlineInput}
                  onChange={(e) => setCtaHeadlineInput(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">Subtítulo</Label>
                <Input
                  placeholder="Configúralo en 5 minutos..."
                  value={ctaSubtitleInput}
                  onChange={(e) => setCtaSubtitleInput(e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* ── Estadísticas del hero ── */}
          <div className="border-t border-border pt-4 space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Estadísticas del hero</p>
            <div className="grid grid-cols-2 gap-3">
              {statInputs.map((s, i) => (
                <div key={i} className="space-y-1.5 rounded-lg border border-border p-2.5">
                  <Input
                    placeholder={["+500", "1M+", "4.9★", "+40%"][i]}
                    value={s.value}
                    onChange={(e) => {
                      const next = [...statInputs];
                      next[i] = { ...next[i], value: e.target.value };
                      setStatInputs(next);
                    }}
                  />
                  <Input
                    placeholder={["Negocios activos", "Mensajes respondidos", "Calificación promedio", "Aumento en ventas"][i]}
                    value={s.label}
                    onChange={(e) => {
                      const next = [...statInputs];
                      next[i] = { ...next[i], label: e.target.value };
                      setStatInputs(next);
                    }}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* ── Testimonios ── */}
          <div className="border-t border-border pt-4 space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Testimonios</p>
            <div className="space-y-3">
              {testimonialInputs.map((t, i) => (
                <div key={i} className="rounded-lg border border-border p-3 space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">Testimonio {i + 1}</p>
                  <Input
                    placeholder="Frase del cliente..."
                    value={t.quote}
                    onChange={(e) => { const n = [...testimonialInputs]; n[i] = { ...n[i], quote: e.target.value }; setTestimonialInputs(n); }}
                  />
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
              Tu landing pública: 👉{" "}
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

      {/* Planes */}
      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Cargando...
        </div>
      ) : (
        <div className="space-y-6">
          {ASSISTANCE_TYPES.map((type) => (
            <div key={type}>
              <h3 className="mb-3 text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                Asistencia {type}
              </h3>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {PLANS.map((plan) => {
                  const rp = getResellerPlan(plan, type);
                  const mp = getMasterPlan(plan, type);
                  const priceDisplay = rp?.priceMonthly ?? mp?.priceUSD ?? 0;
                  const credits = rp?.credits ?? mp?.credits ?? 0;
                  const isCustomized = !!rp;
                  return (
                    <Card key={plan} className="relative border-border">
                      {(rp?.isPopular || (!rp && mp?.isPopular)) && (
                        <span className="absolute -top-2 left-3 flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold text-primary-foreground">
                          <Star className="h-2.5 w-2.5" /> Popular
                        </span>
                      )}
                      <CardHeader className="pb-2 pt-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <CardTitle className="text-sm">{PLAN_LABELS[plan]}</CardTitle>
                            {isCustomized && (
                              <Badge variant="outline" className="text-[10px] h-4 px-1 border-primary/50 text-primary">
                                Personalizado
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            {rp && (
                              <Switch
                                checked={rp.isActive}
                                onCheckedChange={() => void handleToggle(rp.id, rp.isActive)}
                              />
                            )}
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7"
                              onClick={() => openEdit(plan, type)}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="pt-0 pb-3">
                        <div className="space-y-1">
                          <div className="flex items-baseline gap-1">
                            <span className="text-xl font-bold">${priceDisplay}</span>
                            <span className="text-xs text-muted-foreground">USD/mes</span>
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {credits.toLocaleString()} créditos
                          </div>
                          {rp && !rp.isActive && (
                            <Badge variant="secondary" className="text-[10px]">Inactivo</Badge>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Dialog edición */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="flex h-[585px] max-w-md flex-col">
          <DialogHeader>
            <DialogTitle>
              Editar Plan — {form ? `${PLAN_LABELS[form.plan]} (${form.assistanceType})` : ""}
            </DialogTitle>
          </DialogHeader>
          {form && (
            <div className="flex-1 space-y-4 overflow-y-auto py-2 pr-1">

              {/* Selector período */}
              <div className="flex rounded-lg border border-border overflow-hidden">
                {([ ["monthly", "Mensual"], ["quarterly", "Trimestral"], ["yearly", "Anual"] ] as [BillingPeriod, string][]).map(([p, label]) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPeriod(p)}
                    className={`flex-1 py-1.5 text-xs font-medium transition-colors ${period === p ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {/* Precio + Créditos */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Precio (USD/mes)</Label>
                  {period === "monthly" && (
                    <Input type="number" min={0} step={0.01} value={form.priceMonthly}
                      onChange={(e) => setForm({ ...form, priceMonthly: parseFloat(e.target.value) || 0 })} />
                  )}
                  {period === "quarterly" && (
                    <Input type="number" min={0} step={0.01} value={form.priceQuarterly}
                      onChange={(e) => setForm({ ...form, priceQuarterly: parseFloat(e.target.value) || 0 })} />
                  )}
                  {period === "yearly" && (
                    <Input type="number" min={0} step={0.01} value={form.priceYearly}
                      onChange={(e) => setForm({ ...form, priceYearly: parseFloat(e.target.value) || 0 })} />
                  )}
                </div>
                <div className="space-y-1">
                  <Label>Créditos</Label>
                  <Input type="number" min={0} value={form.credits}
                    onChange={(e) => setForm({ ...form, credits: parseInt(e.target.value) || 0 })} />
                </div>
              </div>

              <div className="space-y-1">
                <Label>Descripción breve</Label>
                <Input value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="Ideal para pequeños negocios..." />
              </div>

              <div className="space-y-1">
                <Label>Características (una por línea)</Label>
                <Textarea rows={4} value={form.features}
                  onChange={(e) => setForm({ ...form, features: e.target.value })}
                  placeholder={"Asistente IA 24/7\nSoporte básico\n1 instancia WhatsApp"} />
              </div>

              <div className="space-y-1">
                <Label>Link de pago</Label>
                {period === "monthly" && (
                  <Input value={form.checkoutUrlMonthly}
                    onChange={(e) => setForm({ ...form, checkoutUrlMonthly: e.target.value })}
                    placeholder="https://checkout.stripe.com/..." />
                )}
                {period === "quarterly" && (
                  <Input value={form.checkoutUrlQuarterly}
                    onChange={(e) => setForm({ ...form, checkoutUrlQuarterly: e.target.value })}
                    placeholder="https://checkout.stripe.com/..." />
                )}
                {period === "yearly" && (
                  <Input value={form.checkoutUrlYearly}
                    onChange={(e) => setForm({ ...form, checkoutUrlYearly: e.target.value })}
                    placeholder="https://checkout.stripe.com/..." />
                )}
                <p className="text-[11px] text-muted-foreground">El botón "Comenzar ahora" usará este link si está configurado.</p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Color (hex o nombre)</Label>
                  <Input value={form.color}
                    onChange={(e) => setForm({ ...form, color: e.target.value })}
                    placeholder="#F59E0B" />
                </div>
                <div className="space-y-1">
                  <Label>Orden</Label>
                  <Input type="number" value={form.order}
                    onChange={(e) => setForm({ ...form, order: parseInt(e.target.value) || 0 })} />
                </div>
              </div>

              <div className="flex items-center justify-between pt-1">
                <label className="flex items-center gap-2 text-sm">
                  <Switch checked={form.isPopular} onCheckedChange={(v) => setForm({ ...form, isPopular: v })} />
                  Popular
                </label>
                <label className="flex items-center gap-2 text-sm">
                  Activo
                  <Switch checked={form.isActive} onCheckedChange={(v) => setForm({ ...form, isActive: v })} />
                </label>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
