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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Pencil, Loader2, Star, ArrowLeft, Users, Store, ExternalLink, ListChecks } from "lucide-react";
import {
  getAllSubscriptionPlans,
  guardarLaPlantillaDeFunciones,
  upsertSubscriptionPlan,
  toggleSubscriptionPlanActive,
  type PlantillaDelPanel,
  type SubscriptionPlanItem,
} from "@/actions/subscription-plan-actions";
import { PLAN_LABELS, PLANS } from "@/types/plans";
import { elEnlaceDeLaPaginaDelPlan, recordarLaAsistencia } from "@/lib/enlaces-de-planes";
import {
  elNombreDelPlan,
  elTutorialQueSeGuarda,
  lasFuncionesDelPlan,
  lasFuncionesQueSeEnsenan,
  losAvisosDelTexto,
  losDatosDelPlan,
  losFeaturesDeLasFunciones,
  type FuncionDelPlan,
} from "@/lib/pagina-de-plan";
import { MODULOS_CON_GUIA } from "@/lib/introduccion-de-la-guia";
import {
  conLaPlantilla,
  elEditorConLaPlantillaNueva,
  emparejar,
  type Audiencia,
  type FuncionDeLaPlantilla,
} from "@/lib/plantilla-de-funciones";
import { FuncionesDelPlanEditor } from "./FuncionesDelPlanEditor";
import { PlantillaDeFuncionesDialog } from "./PlantillaDeFuncionesDialog";
import { UsdRateCard } from "./UsdRateCard";
import dynamic from "next/dynamic";
const PlanDetailTab = dynamic(() => import("./PlanDetailTab").then(m => m.PlanDetailTab), { ssr: false });

const ASSISTANCE_TYPES = ["IA", "HUMANO"] as const;
type BillingPeriod = "monthly" | "quarterly" | "yearly";

const defaultPrices: Record<Plan, Record<string, number>> = {
  lite:          { IA: 19, HUMANO: 29 },
  basico:        { IA: 39, HUMANO: 49 },
  intermedio:    { IA: 59, HUMANO: 99 },
  avanzado:      { IA: 79, HUMANO: 149 },
  enterprise:    { IA: 99, HUMANO: 199 },
  personalizado: { IA: 0,  HUMANO: 0 },
};

const defaultCredits: Record<Plan, Record<string, number>> = {
  lite:          { IA: 1000,  HUMANO: 3000 },
  basico:        { IA: 3000,  HUMANO: 5000 },
  intermedio:    { IA: 5000,  HUMANO: 12000 },
  avanzado:      { IA: 8000,  HUMANO: 20000 },
  enterprise:    { IA: 10000, HUMANO: 30000 },
  personalizado: { IA: 0,     HUMANO: 0 },
};

type EditForm = {
  plan: Plan;
  assistanceType: string;
  isResellerPlan: boolean;
  priceUSD: number;
  priceCop: number;
  priceWholesale: number;
  priceQuarterly: number;
  priceYearly: number;
  credits: number;
  /**
   * Las funciones del plan, cada una con su interruptor, su categoría, su
   * descripción y su tutorial. Son lo que enseña la página pública del plan y
   * la tarjeta de la landing: `features` se rehace con las ENCENDIDAS al guardar.
   */
  funciones: FuncionDelPlan[];
  /**
   * La versión de la plantilla maestra con la que se armó `funciones`. Va al
   * guardar: si la plantilla cambió en otra pestaña desde entonces, el plan no
   * se guarda encima (`null`: el panel no tenía plantilla y no se comprueba).
   */
  versionDeLaPlantilla: number | null;
  description: string;
  isPopular: boolean;
  isActive: boolean;
  color: string;
  order: number;
  checkoutUrlMonthly: string;
  checkoutUrlQuarterly: string;
  checkoutUrlYearly: string;
  name: string;
};

export function PlanesMain() {
  const [audience, setAudience] = useState<"client" | "reseller" | null>(null);
  const [period, setPeriod] = useState<BillingPeriod>("monthly");

  const [plans, setPlans] = useState<SubscriptionPlanItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<EditForm | null>(null);
  const [dialogTab, setDialogTab] = useState<"config" | "detail">("config");
  const [dialogPlanId, setDialogPlanId] = useState<string | null>(null);
  // La plantilla maestra de cada audiencia: el inventario completo de
  // funciones que comparten sus planes (`lib/plantilla-de-funciones.ts`).
  const [plantillas, setPlantillas] = useState<Partial<Record<Audiencia, PlantillaDelPanel>>>({});
  const [plantillaOpen, setPlantillaOpen] = useState(false);

  const fetchPlans = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getAllSubscriptionPlans();
      if (res.success) setPlans(res.data);
      if ("plantillas" in res) setPlantillas(res.plantillas ?? {});
    } catch (e) {
      console.error("Error cargando planes:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void fetchPlans(); }, [fetchPlans]);

  const isReseller = audience === "reseller";
  const audienciaDe = (reseller: boolean): Audiencia => (reseller ? "reseller" : "cliente");
  /** La plantilla de la audiencia que se está mirando (la del botón de arriba). */
  const plantillaDeLaVista = audience ? plantillas[audienciaDe(isReseller)] ?? null : null;
  /** La plantilla del plan que está abierto en el editor. */
  const plantillaDelForm = form ? plantillas[audienciaDe(form.isResellerPlan)] ?? null : null;

  /**
   * Las funciones del plan con el inventario completo de su plantilla: arriba
   * las encendidas en su orden, detrás todas las demás apagadas. Un plan que
   * todavía no existe nace con todas apagadas.
   */
  const lasFuncionesConLaPlantilla = (
    propias: readonly FuncionDelPlan[],
    plantilla: readonly FuncionDeLaPlantilla[] | null | undefined,
  ): FuncionDelPlan[] =>
    plantilla ? conLaPlantilla(emparejar(propias, plantilla), plantilla) : [...propias];

  const getPlan = (plan: Plan, type: string) =>
    plans.find((p) => p.plan === plan && p.assistanceType === type && p.isResellerPlan === isReseller);

  /**
   * Nombre a mostrar de un plan.
   *
   * El campo "Nombre" del editor ya se guardaba, pero las tarjetas seguian
   * pintando la etiqueta fija del codigo: se podia renombrar un plan y no se
   * notaba en ninguna parte, que es lo mismo que no poder renombrarlo.
   *
   * La etiqueta fija se conserva como respaldo para los planes que nadie ha
   * renombrado, y por eso el campo puede dejarse vacio.
   */
  const nombreDePlan = (plan: Plan, type: string) =>
    getPlan(plan, type)?.name?.trim() || PLAN_LABELS[plan] || plan;

  const openEdit = (plan: Plan, type: string) => {
    const existing = getPlan(plan, type);
    setForm({
      plan,
      assistanceType: type,
      isResellerPlan: isReseller,
      priceUSD: existing?.priceUSD ?? defaultPrices[plan][type],
      priceCop: existing?.priceCop ?? 0,
      priceWholesale: existing?.priceWholesale ?? 0,
      priceQuarterly: existing?.priceQuarterly ?? 0,
      priceYearly: existing?.priceYearly ?? 0,
      credits: existing?.credits ?? defaultCredits[plan][type],
      // Un plan guardado antes de las funciones con categoría las trae deducidas
      // de `features`, en su mismo orden.
      funciones: lasFuncionesConLaPlantilla(
        existing?.funciones ?? lasFuncionesDelPlan(existing?.features ?? [], null),
        plantillas[audienciaDe(isReseller)]?.plantilla,
      ),
      versionDeLaPlantilla: plantillas[audienciaDe(isReseller)]?.version ?? null,
      description: existing?.description ?? "",
      isPopular: existing?.isPopular ?? false,
      isActive: existing?.isActive ?? true,
      color: existing?.color ?? "",
      order: existing?.order ?? PLANS.indexOf(plan),
      checkoutUrlMonthly: existing?.checkoutUrlMonthly ?? "",
      checkoutUrlQuarterly: existing?.checkoutUrlQuarterly ?? "",
      checkoutUrlYearly: existing?.checkoutUrlYearly ?? "",
      name: existing?.name ?? "",
    });
    setDialogPlanId(existing?.id ?? null);
    setDialogTab("config");
    setEditOpen(true);
  };

  const handleSave = async () => {
    if (!form) return;
    setSaving(true);
    // Un tutorial a medio escribir no se guarda: solo una guía publicada o un
    // enlace https completo. Lo que no sirve se queda «sin tutorial».
    const funciones = form.funciones.map((f) => ({
      ...f,
      tutorial: elTutorialQueSeGuarda(f.tutorial, MODULOS_CON_GUIA),
    }));
    try {
      const res = await upsertSubscriptionPlan({
        ...form,
        funciones,
        features: losFeaturesDeLasFunciones(funciones),
        description: form.description || undefined,
        color: form.color || undefined,
        // 0 es "sin precio en pesos": vuelve a la conversión desde dólares.
        priceCop: form.priceCop || null,
        priceWholesale: form.priceWholesale || null,
        priceQuarterly: form.priceQuarterly || null,
        priceYearly: form.priceYearly || null,
        checkoutUrlMonthly: form.checkoutUrlMonthly || undefined,
        checkoutUrlQuarterly: form.checkoutUrlQuarterly || undefined,
        checkoutUrlYearly: form.checkoutUrlYearly || undefined,
        name: form.name || null,
        versionDeLaPlantilla: form.versionDeLaPlantilla,
      });
      if (res.success) {
        toast.success(res.message);
        setEditOpen(false);
        void fetchPlans();
      } else {
        toast.error(res.message);
        // El plan pudo guardarse aunque sus funciones no: se recarga para que la
        // tarjeta diga lo que de verdad quedó.
        void fetchPlans();
      }
    } catch (e) {
      console.error("[planes] no se pudo guardar el plan", e);
      toast.error("No se pudo guardar el plan. Revisa la conexión y vuelve a intentarlo.");
    } finally {
      setSaving(false);
    }
  };

  /**
   * Los datos con los que se revisan los textos de este plan MIENTRAS se
   * editan: el nombre, los créditos y el precio del formulario, no los
   * guardados. Así un aviso de «dice 12.000 créditos y el plan tiene 8.000»
   * sale en cuanto se cambian los créditos, antes de guardar.
   *
   * Los nombres en uso son los de los planes de clientes —los que tienen página
   * pública—, con el de este plan tal cual está en el formulario.
   */
  const datosDelFormulario = form
    ? losDatosDelPlan(
        {
          plan: form.plan,
          name: form.name,
          credits: form.credits,
          priceUSD: form.priceUSD,
          assistanceType: form.assistanceType,
        },
        [
          ...plans
            .filter(
              (p) =>
                !p.isResellerPlan &&
                !(!form.isResellerPlan && p.plan === form.plan && p.assistanceType === form.assistanceType),
            )
            .map(elNombreDelPlan),
          ...(form.isResellerPlan ? [] : [elNombreDelPlan({ plan: form.plan, name: form.name })]),
        ],
      )
    : null;

  /**
   * Guarda la plantilla maestra de la audiencia que se está mirando. Llega a
   * todos sus planes; si hay un plan abierto en el editor, su lista se pone al
   * día con la plantilla nueva sin perder lo que se había tocado en él.
   */
  const guardarLaPlantilla = async (lista: FuncionDeLaPlantilla[]): Promise<boolean> => {
    const audiencia = audienciaDe(isReseller);
    const actual = plantillas[audiencia];
    if (!actual) return false;
    try {
      const res = await guardarLaPlantillaDeFunciones(audiencia, lista, actual.version);
      if (!res.success) {
        toast.error(res.message);
        // Si cambió en otra pestaña, se recarga para que se vea la de ahora.
        void fetchPlans();
        return false;
      }
      toast.success(res.message);
      const nueva = res.plantilla;
      setPlantillas((antes) => ({ ...antes, [audiencia]: nueva }));
      setForm((f) =>
        f && audienciaDe(f.isResellerPlan) === audiencia
          ? {
              ...f,
              funciones: elEditorConLaPlantillaNueva(f.funciones, actual.plantilla, nueva.plantilla),
              versionDeLaPlantilla: nueva.version,
            }
          : f,
      );
      void fetchPlans();
      return true;
    } catch (e) {
      console.error("[planes] no se pudo guardar la plantilla de funciones", e);
      toast.error("No se pudo guardar la plantilla. Revisa la conexión y vuelve a intentarlo.");
      return false;
    }
  };

  const handleToggle = async (id: string, current: boolean) => {
    const res = await toggleSubscriptionPlanActive(id, !current);
    if (res.success) void fetchPlans();
    else toast.error("Error al cambiar estado");
  };

  const handleSeedAll = async () => {
    setSaving(true);
    for (const plan of PLANS) {
      for (const type of ASSISTANCE_TYPES) {
        const existing = getPlan(plan, type);
        await upsertSubscriptionPlan({
          plan,
          assistanceType: type,
          priceUSD: existing?.priceUSD ?? defaultPrices[plan][type],
          credits: existing?.credits ?? defaultCredits[plan][type],
          features: existing?.features ?? [],
          description: existing?.description ?? undefined,
          isPopular: existing?.isPopular ?? false,
          isActive: existing?.isActive ?? true,
          color: existing?.color ?? undefined,
          order: existing?.order ?? PLANS.indexOf(plan),
        });
      }
    }
    toast.success("Planes inicializados");
    void fetchPlans();
    setSaving(false);
  };

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden">

      {/* Sticky header */}
      <div className="sticky top-0 z-10 bg-muted/60 border-b border-border/40 px-4 pt-4 pb-3 shrink-0 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          {audience !== null && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setAudience(null)}
              className="h-8 w-8 text-muted-foreground hover:text-foreground shrink-0"
              title="Volver"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
          )}
          <h2 className="text-lg font-semibold">Planes</h2>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {audience === "client" && plans.filter((p) => !p.isResellerPlan).length === 0 && !loading && (
            <Button size="sm" onClick={handleSeedAll} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Inicializar planes"}
            </Button>
          )}
          {plantillaDeLaVista && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPlantillaOpen(true)}
              className="gap-2 text-xs h-8"
              data-abrir-plantilla-de-funciones
            >
              <ListChecks className="h-3.5 w-3.5" />
              Plantilla de funciones
            </Button>
          )}
          <Button
            variant={audience === "client" ? "default" : "outline"}
            size="sm"
            onClick={() => setAudience("client")}
            className="gap-2 text-xs h-8"
          >
            <Users className="h-3.5 w-3.5" />
            Clientes directos
          </Button>
          <Button
            variant={audience === "reseller" ? "default" : "outline"}
            size="sm"
            onClick={() => setAudience("reseller")}
            className="gap-2 text-xs h-8"
          >
            <Store className="h-3.5 w-3.5" />
            Resellers
          </Button>
        </div>
      </div>

      {/* Contenido */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {audience === null ? (
          <div className="flex flex-col justify-center min-h-[60vh]">
            <div className="w-full space-y-5 py-6">
              <div className="text-center space-y-1 mb-2">
                <h3 className="text-lg font-semibold">¿Qué planes deseas configurar?</h3>
                <p className="text-sm text-muted-foreground">Elige el tipo de planes a gestionar</p>
              </div>

              {loading ? (
                <div className="flex justify-center py-10">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-5">
                  <Card
                    className="cursor-pointer group hover:border-primary/50 hover:shadow-lg transition-all duration-200 border-l-4 border-l-primary/40"
                    onClick={() => setAudience("client")}
                  >
                    <CardContent className="p-8 flex flex-col gap-5 h-full">
                      <div className="flex items-center gap-4">
                        <div className="h-14 w-14 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0 group-hover:bg-primary/20 transition-colors">
                          <Users className="h-7 w-7 text-primary" />
                        </div>
                        <h4 className="font-semibold text-lg leading-snug">Clientes directos</h4>
                      </div>
                      <div className="flex-1 space-y-2">
                        <p className="text-sm text-muted-foreground">
                          Planes para usuarios finales que contratan el servicio directamente.
                        </p>
                        <ul className="space-y-2 pt-2">
                          <li className="flex items-start gap-2 text-sm text-muted-foreground">
                            <span className="text-primary font-bold mt-0.5 shrink-0">✓</span>
                            Asistencia IA y Humano en distintos rangos de precio
                          </li>
                          <li className="flex items-start gap-2 text-sm text-muted-foreground">
                            <span className="text-primary font-bold mt-0.5 shrink-0">✓</span>
                            Precios mensuales, trimestrales y anuales por plan
                          </li>
                          <li className="flex items-start gap-2 text-sm text-muted-foreground">
                            <span className="text-primary font-bold mt-0.5 shrink-0">✓</span>
                            Links de pago configurables por periodo
                          </li>
                        </ul>
                      </div>
                      <div className="flex items-center justify-between gap-4 pt-6 border-t border-border/50">
                        <p className="text-xs text-muted-foreground truncate">
                          {plans.filter((p) => !p.isResellerPlan && p.isActive).length} planes activos configurados
                        </p>
                        <span className="inline-flex items-center gap-1.5 text-sm font-medium text-primary shrink-0 group-hover:gap-3 transition-all whitespace-nowrap">
                          <ArrowLeft className="h-4 w-4 rotate-180" />
                          Ver planes
                        </span>
                      </div>
                    </CardContent>
                  </Card>

                  <Card
                    className="cursor-pointer group hover:border-violet-500/50 hover:shadow-lg transition-all duration-200 border-l-4 border-l-violet-500/40"
                    onClick={() => setAudience("reseller")}
                  >
                    <CardContent className="p-8 flex flex-col gap-5 h-full">
                      <div className="flex items-center gap-4">
                        <div className="h-14 w-14 rounded-2xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center shrink-0 group-hover:bg-violet-500/20 transition-colors">
                          <Store className="h-7 w-7 text-violet-600 dark:text-violet-400" />
                        </div>
                        <h4 className="font-semibold text-lg leading-snug">Resellers</h4>
                      </div>
                      <div className="flex-1 space-y-2">
                        <p className="text-sm text-muted-foreground">
                          Packs para revendedores que distribuyen el servicio a sus propios clientes.
                        </p>
                        <ul className="space-y-2 pt-2">
                          <li className="flex items-start gap-2 text-sm text-muted-foreground">
                            <span className="text-violet-500 font-bold mt-0.5 shrink-0">✓</span>
                            Packs de 5, 10 y 25 usuarios por volumen
                          </li>
                          <li className="flex items-start gap-2 text-sm text-muted-foreground">
                            <span className="text-violet-500 font-bold mt-0.5 shrink-0">✓</span>
                            Precios especiales para distribuidores
                          </li>
                          <li className="flex items-start gap-2 text-sm text-muted-foreground">
                            <span className="text-violet-500 font-bold mt-0.5 shrink-0">✓</span>
                            Links de pago por pack configurables
                          </li>
                        </ul>
                      </div>
                      <div className="flex items-center justify-between gap-4 pt-6 border-t border-border/50">
                        <p className="text-xs text-muted-foreground truncate">
                          {plans.filter((p) => p.isResellerPlan && p.isActive).length} planes activos configurados
                        </p>
                        <span className="inline-flex items-center gap-1.5 text-sm font-medium text-violet-600 dark:text-violet-400 shrink-0 group-hover:gap-3 transition-all whitespace-nowrap">
                          <ArrowLeft className="h-4 w-4 rotate-180" />
                          Ver planes
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {loading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Cargando...
              </div>
            ) : isReseller && plans.filter((p) => p.isResellerPlan).length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-10 text-center text-muted-foreground">
                <p className="text-sm font-medium">No hay planes de Reseller configurados</p>
                <p className="text-xs max-w-xs">Haz clic en el ícono de editar en cualquier plan para configurar precios, créditos y links de pago para resellers.</p>
                <Button size="sm" variant="outline" onClick={() => openEdit(PLANS[0], "IA")}>
                  Configurar primer plan Reseller
                </Button>
              </div>
            ) : (
              <div className="space-y-6">
                {!isReseller && <UsdRateCard />}
                {ASSISTANCE_TYPES.map((type) => (
                  <div key={type}>
                    <h3 className="mb-3 text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                      Asistencia {type}
                    </h3>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {PLANS.map((plan) => {
                        const p = getPlan(plan, type);
                        return (
                          <Card key={plan} className="relative border-border">
                            {p?.isPopular && (
                              <span className="absolute -top-2 left-3 flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold text-primary-foreground">
                                <Star className="h-2.5 w-2.5" /> Popular
                              </span>
                            )}
                            <CardHeader className="pb-2 pt-4">
                              <div className="flex items-center justify-between">
                                <CardTitle className="text-sm">{nombreDePlan(plan, type)}</CardTitle>
                                <div className="flex items-center gap-2">
                                  {p && (
                                    <Switch
                                      checked={p.isActive}
                                      onCheckedChange={() => void handleToggle(p.id, p.isActive)}
                                    />
                                  )}
                                  {/* La página pública solo existe para un plan de clientes activo. */}
                                  {p && !isReseller && p.isActive && (
                                    <a
                                      href={elEnlaceDeLaPaginaDelPlan(plan)}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      onClick={() => recordarLaAsistencia(type)}
                                      className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                                      title="Ver página pública del plan"
                                      aria-label="Ver página pública del plan"
                                      data-ver-pagina-publica
                                    >
                                      <ExternalLink className="h-3.5 w-3.5" />
                                    </a>
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
                              {p ? (
                                <div className="space-y-1">
                                  <div className="flex items-baseline gap-1">
                                    <span className="text-xl font-bold">${p.priceUSD}</span>
                                    <span className="text-xs text-muted-foreground">USD/mes</span>
                                  </div>
                                  <div className="text-xs text-muted-foreground">
                                    {p.credits.toLocaleString()} créditos
                                  </div>
                                  {!p.isActive && (
                                    <Badge variant="secondary" className="text-[10px]">Inactivo</Badge>
                                  )}
                                </div>
                              ) : (
                                <p className="text-xs text-muted-foreground italic">Sin configurar</p>
                              )}
                            </CardContent>
                          </Card>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="flex max-w-2xl flex-col">
          <DialogHeader>
            <DialogTitle>
              {form ? `${form.name?.trim() || PLAN_LABELS[form.plan]} · ${form.assistanceType} · ${form.isResellerPlan ? "Resellers" : "Clientes"}` : "Editar Plan"}
            </DialogTitle>
          </DialogHeader>

          {/* Tabs */}
          <div className="flex shrink-0 rounded-lg border border-border overflow-hidden">
            <button
              type="button"
              onClick={() => setDialogTab("config")}
              className={`flex-1 py-1.5 text-xs font-medium transition-colors ${dialogTab === "config" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
            >
              Configuración
            </button>
            {/*
              Un plan de reseller no tiene página pública: su detalle no se enseña
              en ninguna parte, así que no se ofrece editar algo que nadie ve.
            */}
            <button
              type="button"
              onClick={() => setDialogTab("detail")}
              disabled={!dialogPlanId || !!form?.isResellerPlan}
              data-pestana-detalle
              className={`flex-1 py-1.5 text-xs font-medium transition-colors disabled:opacity-40 ${dialogTab === "detail" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
              title={
                form?.isResellerPlan
                  ? "Los planes de reseller no tienen página pública"
                  : !dialogPlanId
                    ? "Guarda primero el plan para editar el detalle"
                    : undefined
              }
            >
              Página de detalle
            </button>
          </div>

          {form && dialogTab === "config" && (
            <div className="flex-1 space-y-4 overflow-y-auto py-2 pr-1">

              <div className="flex rounded-lg border border-border overflow-hidden">
                {(form.isResellerPlan
                  ? [["monthly", "Pack 5"], ["quarterly", "Pack 10"], ["yearly", "Pack 25"]]
                  : [["monthly", "Mensual"], ["quarterly", "Trimestral"], ["yearly", "Anual"]]
                ).map(([p, label]) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPeriod(p as BillingPeriod)}
                    className={`flex-1 py-1.5 text-xs font-medium transition-colors ${period === p ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>{form.isResellerPlan ? "Precio público (USD/pack)" : "Precio público (USD/mes)"}</Label>
                  {period === "monthly" && (
                    <Input type="number" min={0} step={0.01} value={form.priceUSD}
                      onChange={(e) => setForm({ ...form, priceUSD: parseFloat(e.target.value) || 0 })} />
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

              {period === "monthly" && (
                <div className="space-y-1">
                  <Label>Precio de cobro (COP/mes)</Label>
                  <Input type="number" min={0} step={1} value={form.priceCop}
                    onChange={(e) => setForm({ ...form, priceCop: parseInt(e.target.value) || 0 })}
                    placeholder="349000" />
                  <p className="text-[11px] text-muted-foreground">
                    Es lo que se le cobra al cliente, tal cual. Déjalo en 0 para que se
                    calcule desde el precio en dólares con la tasa — así sale 346.500 en vez
                    de 349.000, y cambia solo cada vez que muevas la tasa.
                  </p>
                </div>
              )}

              {!form.isResellerPlan && form.assistanceType === "IA" && (
                <div className="space-y-1">
                  <Label>Precio mayorista reseller (USD/mes)</Label>
                  <Input type="number" min={0} step={0.01} value={form.priceWholesale}
                    onChange={(e) => setForm({ ...form, priceWholesale: parseFloat(e.target.value) || 0 })}
                    placeholder="0.00" />
                  <p className="text-[11px] text-muted-foreground">Precio que cobras al reseller por cada licencia activa de este plan.</p>
                </div>
              )}

              <div className="space-y-1">
                <Label>Nombre del plan (visible en la landing)</Label>
                <Input value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder={PLAN_LABELS[form.plan] ?? form.plan} />
                <p className="text-[11px] text-muted-foreground">Si se deja vacío se usa el nombre predeterminado: {PLAN_LABELS[form.plan] ?? form.plan}</p>
              </div>

              <div className="space-y-1">
                <Label>Descripción breve</Label>
                <Input value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="Ideal para pequeños negocios..." />
                {/* La misma regla que la página: lo que contradice al plan no sale. */}
                {datosDelFormulario && form.description.trim() &&
                  losAvisosDelTexto(form.description, datosDelFormulario).map((a) => (
                    <p key={a} className="text-[11px] text-amber-600 dark:text-amber-400" data-aviso-de-descripcion>
                      No sale en la página: {a}
                    </p>
                  ))}
              </div>
              {datosDelFormulario && (
                <FuncionesDelPlanEditor
                  funciones={form.funciones}
                  onChange={(funciones) => setForm({ ...form, funciones })}
                  datos={datosDelFormulario}
                  plantilla={plantillaDelForm?.plantilla ?? null}
                  onEditarPlantilla={plantillaDelForm ? () => setPlantillaOpen(true) : undefined}
                />
              )}

              <div className="space-y-1">
                <Label>
                  {form.isResellerPlan
                    ? `Link de pago · ${period === "monthly" ? "Pack 5" : period === "quarterly" ? "Pack 10" : "Pack 25"}`
                    : `Link de pago · ${period === "monthly" ? "Mensual" : period === "quarterly" ? "Trimestral" : "Anual"}`}
                </Label>
                {period === "monthly" && (
                  <>
                    <Input value={form.checkoutUrlMonthly}
                      onChange={(e) => setForm({ ...form, checkoutUrlMonthly: e.target.value })}
                      placeholder="\u{1F449} realizarpago.com/plan-1" />
                    <p className="text-[11px] text-muted-foreground">
                      Sale tal cual en los avisos de cobro por WhatsApp de los clientes con este
                      plan, con lo que escribas aquí —emoji incluido—. Si un cliente tiene su
                      propio medio de pago en su ficha, manda el suyo.
                    </p>
                  </>
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
                <p className="text-[11px] text-muted-foreground">Cada periodo tiene su propio link. Sin link configurado, el botón lleva al registro interno.</p>
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

          {dialogTab === "detail" && dialogPlanId && form && !form.isResellerPlan && datosDelFormulario && (
            <div className="flex-1 overflow-y-auto py-2 pr-1">
              <PlanDetailTab
                subscriptionPlanId={dialogPlanId}
                datos={datosDelFormulario}
                enlaceDeLaPagina={elEnlaceDeLaPaginaDelPlan(form.plan)}
                asistenciaDeLaPagina={form.assistanceType}
                planActivo={form.isActive}
                funcionesQueSalen={lasFuncionesQueSeEnsenan(form.funciones, datosDelFormulario, new Map())}
              />
            </div>
          )}

          {dialogTab === "config" && (
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditOpen(false)}>Cancelar</Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                Guardar
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>

      {/*
        La plantilla de la audiencia que se mira: se abre desde la barra de
        arriba y desde el candado de una función en el editor de un plan.
      */}
      {plantillaDeLaVista && (
        <PlantillaDeFuncionesDialog
          open={plantillaOpen}
          onOpenChange={setPlantillaOpen}
          titulo={isReseller ? "Resellers" : "Clientes directos"}
          plantilla={plantillaDeLaVista.plantilla}
          encendidas={plantillaDeLaVista.encendidas}
          totalDePlanes={plans.filter((p) => p.isResellerPlan === isReseller).length}
          onGuardar={guardarLaPlantilla}
        />
      )}
    </div>
  );
}
