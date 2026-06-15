"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, Star, Zap, Users, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { type SubscriptionPlanItem } from "@/actions/subscription-plan-actions";

type BillingPeriod = "monthly" | "quarterly" | "yearly";
type AssistanceType = "IA" | "HUMANO";

const PLAN_LABELS: Record<string, string> = {
  lite: "Lite",
  basico: "Básico",
  intermedio: "Intermedio",
  avanzado: "Avanzado",
  enterprise: "Enterprise",
  personalizado: "Agencias",
};
const PLAN_ORDER = ["lite", "basico", "intermedio", "avanzado", "enterprise", "personalizado"];

interface Props {
  plans: SubscriptionPlanItem[];
  businessName: string | null;
  slug: string;
}

export function ResellerLandingClient({ plans, businessName, slug }: Props) {
  const [assistanceType, setAssistanceType] = useState<AssistanceType>("IA");
  const [billingPeriod, setBillingPeriod] = useState<BillingPeriod>("yearly");

  const visiblePlans = [...plans]
    .filter((p) => p.assistanceType === assistanceType && p.isActive)
    .sort((a, b) => {
      const ai = PLAN_ORDER.indexOf(a.plan);
      const bi = PLAN_ORDER.indexOf(b.plan);
      return ai - bi;
    });

  return (
    <div className="min-h-screen bg-[#060d18] text-white">

      {/* Header */}
      <header className="border-b border-white/10 bg-[#060d18]/80 backdrop-blur-md sticky top-0 z-40">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-6">
          <span className="font-bold text-lg">
            {businessName ?? slug}
          </span>
          <Link href={`/completar-registro`}>
            <Button size="sm" className="bg-blue-600 text-white hover:bg-blue-500 text-xs">
              Comenzar gratis
            </Button>
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="py-16 text-center px-6">
        <h1 className="text-3xl sm:text-4xl font-bold text-white mb-3">
          {businessName ? `Planes de ${businessName}` : "Planes y Precios"}
        </h1>
        <p className="text-slate-400 text-base max-w-lg mx-auto">
          Automatiza tu negocio con inteligencia artificial. Sin contratos. Cancela cuando quieras.
        </p>
      </section>

      {/* Pricing section */}
      <section className="pb-20 px-6">
        <div className="mx-auto max-w-5xl">

          {/* Controls */}
          <div className="mb-8 flex flex-col items-center gap-3">
            {/* Billing period */}
            <div className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 p-1">
              {([
                { value: "monthly",   label: "Mensual",    badge: null },
                { value: "quarterly", label: "Trimestral", badge: "−14%" },
                { value: "yearly",    label: "Anual",      badge: "−22%" },
              ] as { value: BillingPeriod; label: string; badge: string | null }[]).map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setBillingPeriod(opt.value)}
                  className={cn(
                    "flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-medium transition-all",
                    billingPeriod === opt.value ? "bg-blue-600 text-white" : "text-slate-400 hover:text-white"
                  )}
                >
                  {opt.label}
                  {opt.badge && (
                    <span className={cn(
                      "rounded-full px-1.5 py-px text-[9px] font-bold",
                      billingPeriod === opt.value ? "bg-green-400/20 text-green-300" : "bg-green-500/15 text-green-500"
                    )}>
                      {opt.badge}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* Assistance toggle */}
            <div className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 p-1">
              <button
                onClick={() => setAssistanceType("IA")}
                className={cn("flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium transition-all",
                  assistanceType === "IA" ? "bg-slate-700 text-white" : "text-slate-400 hover:text-white")}
              >
                <Zap className="h-3.5 w-3.5" /> Asistencia IA
              </button>
              <button
                onClick={() => setAssistanceType("HUMANO")}
                className={cn("flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium transition-all",
                  assistanceType === "HUMANO" ? "bg-slate-700 text-white" : "text-slate-400 hover:text-white")}
              >
                <Users className="h-3.5 w-3.5" /> Asistencia Humana
              </button>
            </div>

            <p className="text-xs text-slate-500">Precios en USD · Sin tarjeta de crédito requerida</p>
          </div>

          {/* Plan cards */}
          {visiblePlans.length === 0 ? (
            <p className="text-center text-slate-500 py-12">Planes próximamente disponibles.</p>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {visiblePlans.map((plan) => (
                <PlanCard
                  key={plan.id}
                  plan={plan}
                  assistanceType={assistanceType}
                  billingPeriod={billingPeriod}
                />
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/10 py-8 text-center text-xs text-slate-600 px-6">
        {businessName && <p className="mb-1 font-medium text-slate-500">{businessName}</p>}
        <p>Powered by <span className="text-slate-400">Verzay IA</span></p>
      </footer>
    </div>
  );
}

function PlanCard({ plan, assistanceType, billingPeriod }: {
  plan: SubscriptionPlanItem;
  assistanceType: AssistanceType;
  billingPeriod: BillingPeriod;
}) {
  const isCustom = plan.plan === "personalizado";
  const price = billingPeriod === "monthly"
    ? plan.priceUSD
    : billingPeriod === "quarterly"
    ? (plan.priceQuarterly ?? plan.priceUSD)
    : (plan.priceYearly ?? plan.priceUSD);

  const checkoutUrl = billingPeriod === "monthly"
    ? plan.checkoutUrlMonthly
    : billingPeriod === "quarterly"
    ? (plan.checkoutUrlQuarterly ?? plan.checkoutUrlMonthly)
    : (plan.checkoutUrlYearly ?? plan.checkoutUrlMonthly);

  const billedNote = billingPeriod === "monthly"
    ? "Facturado mensualmente"
    : billingPeriod === "quarterly"
    ? `Facturado $${(price * 3).toFixed(0)} cada 3 meses`
    : `Facturado $${(price * 12).toFixed(0)} al año`;

  return (
    <div className={cn(
      "relative flex flex-col rounded-xl border p-5 transition-all hover:bg-white/[0.07]",
      plan.isPopular ? "border-blue-500/50 bg-white/[0.07] shadow-lg shadow-blue-500/10" : "border-white/10 bg-white/5"
    )}>
      {plan.isPopular && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
          <Badge className="flex items-center gap-1 bg-blue-600 px-3 text-xs text-white">
            <Star className="h-3 w-3" /> Popular
          </Badge>
        </div>
      )}
      <div className="mb-3">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-bold text-white">{PLAN_LABELS[plan.plan] ?? plan.plan}</h3>
          <Badge variant="outline" className="border-white/20 text-[10px] text-slate-400">
            {assistanceType === "IA"
              ? <span className="flex items-center gap-1"><Zap className="h-2.5 w-2.5" />IA</span>
              : <span className="flex items-center gap-1"><Users className="h-2.5 w-2.5" />Humano</span>}
          </Badge>
        </div>
        {plan.description && <p className="mt-1 text-xs text-slate-500">{plan.description}</p>}
      </div>

      <div className="mb-4">
        {isCustom ? (
          <div className="text-2xl font-bold text-slate-400">A consultar</div>
        ) : (
          <>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold text-white">${price}</span>
              <span className="text-sm text-slate-400">USD/mes</span>
            </div>
            <p className="mt-0.5 text-xs text-slate-500">{billedNote}</p>
          </>
        )}
        <p className="mt-0.5 text-xs text-slate-500">{plan.credits.toLocaleString()} créditos incluidos</p>
      </div>

      {plan.features.length > 0 && (
        <ul className="mb-5 flex-1 space-y-1.5">
          {plan.features.map((f, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-slate-300">
              <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-blue-400" />{f}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-auto">
        {isCustom ? (
          <a href="https://wa.me/573233612620" target="_blank" rel="noopener noreferrer">
            <Button variant="outline" className="w-full gap-2 border-white/20 bg-transparent text-white hover:bg-white/10">
              <MessageCircle className="h-4 w-4" /> Contactar
            </Button>
          </a>
        ) : checkoutUrl ? (
          <a href={checkoutUrl} target="_blank" rel="noopener noreferrer">
            <Button className={cn("w-full", plan.isPopular
              ? "bg-blue-600 text-white hover:bg-blue-500"
              : "border border-white/10 bg-white/10 text-white hover:bg-white/20")}>
              Comenzar ahora
            </Button>
          </a>
        ) : (
          <Link href={`/completar-registro?plan=${plan.plan}`}>
            <Button className={cn("w-full", plan.isPopular
              ? "bg-blue-600 text-white hover:bg-blue-500"
              : "border border-white/10 bg-white/10 text-white hover:bg-white/20")}>
              Comenzar ahora
            </Button>
          </Link>
        )}
      </div>
    </div>
  );
}
