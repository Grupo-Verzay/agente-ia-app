"use client";

import { useState, useEffect } from "react";
import { Check, Zap, Users, Star, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { type SubscriptionPlanItem } from "@/actions/subscription-plan-actions";
import { type PaymentMethodConfigItem } from "@/actions/payment-method-config-actions";
import { Plan } from "@prisma/client";
import { PLAN_LABELS } from "@/types/plans";
import { PaymentModal } from "./PaymentModal";
import { cn } from "@/lib/utils";

type AssistanceType = "IA" | "HUMANO";
type BillingPeriod = "monthly" | "quarterly" | "yearly";

const PRICES: Record<string, Record<string, Record<BillingPeriod, number>>> = {
  IA: {
    lite:       { monthly: 19, quarterly: 17, yearly: 15 },
    basico:     { monthly: 39, quarterly: 30, yearly: 25 },
    intermedio: { monthly: 59, quarterly: 50, yearly: 45 },
    avanzado:   { monthly: 79, quarterly: 65, yearly: 55 },
    enterprise: { monthly: 99, quarterly: 85, yearly: 75 },
  },
  HUMANO: {
    lite:       { monthly: 29, quarterly: 25, yearly: 19 },
    basico:     { monthly: 49, quarterly: 45, yearly: 39 },
    intermedio: { monthly: 99, quarterly: 85, yearly: 79 },
    avanzado:   { monthly: 149, quarterly: 129, yearly: 119 },
    enterprise: { monthly: 199, quarterly: 169, yearly: 149 },
  },
};

interface Props {
  plans: SubscriptionPlanItem[];
  paymentMethods: PaymentMethodConfigItem[];
  defaultPlan?: string;
}

export function PlanesClient({ plans, paymentMethods, defaultPlan }: Props) {
  const [assistanceType, setAssistanceType] = useState<AssistanceType>("IA");
  const [billingPeriod, setBillingPeriod] = useState<BillingPeriod>("yearly");
  const [selectedPlan, setSelectedPlan] = useState<SubscriptionPlanItem | null>(null);
  const [selectedPrice, setSelectedPrice] = useState<number>(0);

  useEffect(() => {
    if (!defaultPlan) return;
    const match = plans.find((p) => p.plan === defaultPlan && p.assistanceType === assistanceType);
    if (match) {
      setSelectedPlan(match);
      setSelectedPrice(PRICES[assistanceType]?.[match.plan]?.[billingPeriod] ?? match.priceUSD);
    }
  }, [defaultPlan, plans, assistanceType]);

  const visiblePlans = plans.filter((p) => p.assistanceType === assistanceType);

  const PLAN_ORDER: Plan[] = ["lite", "basico", "intermedio", "avanzado", "enterprise", "personalizado"];
  const sorted = [...visiblePlans].sort(
    (a, b) => PLAN_ORDER.indexOf(a.plan) - PLAN_ORDER.indexOf(b.plan)
  );

  return (
    <div className="flex min-h-full flex-col">
      {/* Header */}
      <div className="border-b px-4 py-6 text-center">
        <h1 className="text-2xl font-bold">Planes y Precios</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Elige el plan que mejor se adapte a tu negocio
        </p>

        {/* Toggle IA / Humano */}
        <div className="mt-5 inline-flex items-center rounded-full border p-1 bg-muted gap-1">
          <button
            onClick={() => setAssistanceType("IA")}
            className={cn(
              "flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium transition-all",
              assistanceType === "IA"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Zap className="h-3.5 w-3.5" />
            Asistencia IA
          </button>
          <button
            onClick={() => setAssistanceType("HUMANO")}
            className={cn(
              "flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium transition-all",
              assistanceType === "HUMANO"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Users className="h-3.5 w-3.5" />
            Asistencia Humana
          </button>
        </div>

        {assistanceType === "HUMANO" && (
          <p className="mt-2 text-xs text-muted-foreground">
            Incluye configuración personalizada y acompañamiento de nuestro equipo
          </p>
        )}

        {/* Toggle período de facturación */}
        <div className="mt-4 inline-flex items-center rounded-full border p-1 bg-muted gap-1">
          {([
            { value: "monthly",   label: "Mensual",    badge: null      },
            { value: "quarterly", label: "Trimestral", badge: "−14.5%"  },
            { value: "yearly",    label: "Anual",      badge: "−22.5%"  },
          ] as { value: BillingPeriod; label: string; badge: string | null }[]).map((opt) => (
            <button
              key={opt.value}
              onClick={() => setBillingPeriod(opt.value)}
              className={cn(
                "flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium transition-all",
                billingPeriod === opt.value
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {opt.label}
              {opt.badge && (
                <span className="rounded-full bg-green-500/15 px-1.5 py-px text-[9px] font-bold text-green-600">
                  {opt.badge}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Cards */}
      <div className="flex-1 overflow-auto p-4">
        {sorted.length === 0 ? (
          <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
            No hay planes disponibles en este momento.
          </div>
        ) : (
          <div className="mx-auto grid max-w-6xl grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {sorted.map((plan) => {
              const price = PRICES[assistanceType]?.[plan.plan]?.[billingPeriod] ?? plan.priceUSD;
              return (
                <PlanCard
                  key={plan.id}
                  plan={plan}
                  assistanceType={assistanceType}
                  price={price}
                  billingPeriod={billingPeriod}
                  onSelect={() => { setSelectedPlan(plan); setSelectedPrice(price); }}
                />
              );
            })}
          </div>
        )}
      </div>

      {/* Modal de pago */}
      {selectedPlan && (
        <PaymentModal
          plan={selectedPlan}
          price={selectedPrice}
          billingPeriod={billingPeriod}
          paymentMethods={paymentMethods}
          open={!!selectedPlan}
          onClose={() => setSelectedPlan(null)}
        />
      )}
    </div>
  );
}

function PlanCard({
  plan,
  assistanceType,
  price,
  billingPeriod,
  onSelect,
}: {
  plan: SubscriptionPlanItem;
  assistanceType: AssistanceType;
  price: number;
  billingPeriod: BillingPeriod;
  onSelect: () => void;
}) {
  const isCustom = plan.plan === "personalizado";
  const billedNote =
    billingPeriod === "monthly"
      ? "Facturado mensualmente"
      : billingPeriod === "quarterly"
      ? `Facturado $${price * 3} USD cada 3 meses`
      : `Facturado $${price * 12} USD al año`;

  return (
    <div
      className={cn(
        "relative flex flex-col rounded-xl border bg-card p-5 transition-shadow hover:shadow-md",
        plan.isPopular && "border-primary shadow-sm"
      )}
    >
      {plan.isPopular && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
          <Badge className="flex items-center gap-1 bg-primary px-3 text-primary-foreground">
            <Star className="h-3 w-3" /> Popular
          </Badge>
        </div>
      )}

      {/* Plan name + type */}
      <div className="mb-4">
        <div className="flex items-center gap-2">
          <h3 className="text-base font-bold">{PLAN_LABELS[plan.plan as Plan]}</h3>
          <Badge variant="secondary" className="text-[10px] font-normal">
            {assistanceType === "IA" ? (
              <span className="flex items-center gap-1"><Zap className="h-2.5 w-2.5" /> IA</span>
            ) : (
              <span className="flex items-center gap-1"><Users className="h-2.5 w-2.5" /> Humano</span>
            )}
          </Badge>
        </div>
        {plan.description && (
          <p className="mt-1 text-xs text-muted-foreground">{plan.description}</p>
        )}
      </div>

      {/* Price */}
      <div className="mb-4">
        {isCustom ? (
          <div className="text-2xl font-bold text-muted-foreground">A consultar</div>
        ) : (
          <>
            <div className="flex items-baseline gap-1">
              <span className="text-3xl font-bold">${price}</span>
              <span className="text-sm text-muted-foreground">USD/mes</span>
            </div>
            <p className="mt-0.5 text-[11px] text-muted-foreground">{billedNote}</p>
          </>
        )}
        <p className="mt-0.5 text-xs text-muted-foreground">
          {plan.credits.toLocaleString()} créditos incluidos
        </p>
      </div>

      {/* Features */}
      {plan.features.length > 0 && (
        <ul className="mb-5 flex-1 space-y-1.5">
          {plan.features.map((f, i) => (
            <li key={i} className="flex items-start gap-2 text-xs">
              <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
              <span>{f}</span>
            </li>
          ))}
        </ul>
      )}

      {/* CTA */}
      <div className="mt-auto pt-4">
        {isCustom ? (
          <Button
            variant="outline"
            className="w-full gap-2"
            onClick={() => {
              window.open("https://wa.me/573233612620", "_blank");
            }}
          >
            <MessageCircle className="h-4 w-4" />
            Contactar
          </Button>
        ) : (
          <Button
            className={cn("w-full", plan.isPopular && "bg-primary")}
            onClick={onSelect}
          >
            Elegir plan
          </Button>
        )}
      </div>
    </div>
  );
}
