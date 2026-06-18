"use client";

import { useEffect, useState } from "react";
import { Check, Star, Calendar, ExternalLink, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import Link from "next/link";
import type { SubscriptionPlanItem } from "@/actions/subscription-plan-actions";
import type { PlanDetailData } from "@/actions/plan-detail-actions";

const PLAN_LABELS: Record<string, string> = {
  lite: "Lite", basico: "Básico", intermedio: "Intermedio",
  avanzado: "Avanzado", enterprise: "Enterprise", personalizado: "Planes mixtos",
};

const PLAN_GRADIENTS: Record<string, string> = {
  lite: "from-slate-500 to-slate-600",
  basico: "from-emerald-500 to-emerald-600",
  intermedio: "from-blue-500 to-blue-600",
  avanzado: "from-violet-500 to-violet-600",
  enterprise: "from-amber-500 to-amber-600",
  personalizado: "from-rose-500 to-rose-600",
};

type Props = {
  plan: SubscriptionPlanItem;
  checkoutUrl: string | null;
  onClose: () => void;
};

export function PlanDetailModal({ plan, checkoutUrl, onClose }: Props) {
  const [detail, setDetail] = useState<PlanDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const gradient = PLAN_GRADIENTS[plan.plan] ?? "from-blue-500 to-blue-600";
  const planLabel = PLAN_LABELS[plan.plan] ?? plan.plan;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    import("@/actions/plan-detail-actions").then(({ getPlanDetailBySlug }) =>
      getPlanDetailBySlug(plan.plan, plan.assistanceType)
    ).then((res) => {
      if (!cancelled) {
        setDetail(res.data ?? null);
        setLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, [plan.plan, plan.assistanceType]);

  const ctaUrl = detail?.ctaButtonUrl ?? checkoutUrl;
  const ctaText = detail?.ctaButtonText ?? "Comenzar ahora";
  const meetingUrl = detail?.meetingUrl;
  const secondaryUrl = detail?.ctaSecondaryUrl ?? meetingUrl;
  const secondaryText = detail?.ctaSecondaryText ?? (meetingUrl ? "Agendar demo" : null);

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div
        className="relative z-10 flex max-h-[90dvh] w-full flex-col overflow-hidden rounded-t-2xl sm:max-w-lg sm:rounded-2xl bg-[#0d1420] border border-white/10 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className={cn("relative px-5 pb-4 pt-5 bg-gradient-to-br opacity-90", gradient, "bg-opacity-20")}>
          <div className={cn("absolute inset-0 bg-gradient-to-br opacity-15", gradient)} />
          <div className="relative flex items-start justify-between gap-3">
            <div>
              {plan.isPopular && (
                <Badge className={cn("mb-2 bg-gradient-to-r text-white border-0 text-[10px]", gradient)}>
                  <Star className="mr-1 h-2.5 w-2.5" /> Popular
                </Badge>
              )}
              <h2 className="text-xl font-bold text-white">Plan {planLabel}</h2>
              <div className="mt-1 flex items-baseline gap-1.5">
                <span className="text-2xl font-bold text-white">${plan.priceUSD}</span>
                <span className="text-sm text-white/60">USD/mes · {plan.credits.toLocaleString()} créditos</span>
              </div>
              {plan.description && <p className="mt-1.5 text-xs text-white/70">{plan.description}</p>}
            </div>
            <button onClick={onClose} className="shrink-0 rounded-full p-1.5 text-white/60 hover:bg-white/10 hover:text-white">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Body scroll */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
            </div>
          ) : (
            <div className="space-y-5 px-5 py-5">
              {/* Features del plan base */}
              {plan.features.length > 0 && (
                <div>
                  <p className="mb-2.5 text-xs font-semibold uppercase tracking-wider text-slate-500">Qué incluye</p>
                  <ul className="space-y-1.5">
                    {plan.features.map((f, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-slate-300">
                        <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" />{f}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Stats si hay */}
              {(detail?.stats ?? []).length > 0 && (
                <div className="grid grid-cols-2 gap-3">
                  {(detail!.stats as Array<{ value: string; label: string }>).map((s, i) => (
                    <div key={i} className="rounded-lg border border-white/10 bg-white/[0.03] p-3 text-center">
                      <div className="text-lg font-bold text-white">{s.value}</div>
                      <div className="text-[11px] text-slate-500">{s.label}</div>
                    </div>
                  ))}
                </div>
              )}

              {/* Hero image si hay */}
              {detail?.heroImageUrl && (
                <div className="overflow-hidden rounded-lg border border-white/10">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={detail.heroImageUrl} alt={`Plan ${planLabel}`} className="w-full object-cover" />
                </div>
              )}

              {/* Primeras 2 secciones de funciones */}
              {(detail?.featureSections as Array<{ title: string; description: string; imageUrl?: string }> ?? [])
                .slice(0, 2)
                .map((sec, i) => (
                  <div key={i} className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
                    <h3 className="mb-1 text-sm font-semibold text-white">{sec.title}</h3>
                    <p className="text-xs text-slate-400 leading-relaxed">{sec.description}</p>
                  </div>
                ))}

              {/* Enlace a página completa si hay más contenido */}
              <Link href={`/planes/${plan.plan}?tipo=${plan.assistanceType}`} className="block">
                <div className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-slate-400 hover:bg-white/[0.06] hover:text-white transition-colors">
                  <span>Ver toda la información del plan</span>
                  <ExternalLink className="h-3.5 w-3.5" />
                </div>
              </Link>
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="shrink-0 border-t border-white/10 px-5 py-4 space-y-2">
          {ctaUrl && (
            <a href={ctaUrl} target="_blank" rel="noopener noreferrer" className="block">
              <Button className={cn("w-full bg-gradient-to-r border-0 text-white hover:opacity-90", gradient)}>
                {ctaText}
              </Button>
            </a>
          )}
          {secondaryUrl && secondaryText && (
            <a href={secondaryUrl} target="_blank" rel="noopener noreferrer" className="block">
              <Button variant="outline" className="w-full border-white/20 bg-transparent text-white hover:bg-white/10 gap-2">
                <Calendar className="h-4 w-4" /> {secondaryText}
              </Button>
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
