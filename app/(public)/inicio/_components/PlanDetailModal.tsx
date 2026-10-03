"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Star, Calendar, ExternalLink, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import Link from "next/link";
import type { SubscriptionPlanItem } from "@/actions/subscription-plan-actions";
import type { PlanDetailData } from "@/actions/plan-detail-actions";
import {
  elNumero,
  elPrecioQueSeEnsena,
  laDescripcionQueSale,
  losBotonesDelPlan,
  losDatosDelPlan,
} from "@/lib/pagina-de-plan";

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
  /** Los nombres que tienen hoy los planes de la landing: con ellos se sabe si un texto guardado está viejo. */
  nombresEnUso: readonly string[];
  whatsappNumber?: string | null;
  onClose: () => void;
};

/**
 * El resumen de un plan en la landing. Dice lo MISMO que su página
 * (`/planes/<plan>`): el nombre, el precio y los créditos de hoy, las funciones
 * encendidas y los mismos botones (`losBotonesDelPlan`). Las estadísticas, la
 * imagen y las secciones de marketing que enseñaba se fueron con la página: el
 * panel ya no las edita y se quedaban viejas.
 */
export function PlanDetailModal({ plan, nombresEnUso, whatsappNumber, onClose }: Props) {
  const [detail, setDetail] = useState<PlanDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const gradient = PLAN_GRADIENTS[plan.plan] ?? "from-blue-500 to-blue-600";
  const datos = useMemo(() => losDatosDelPlan(plan, nombresEnUso), [plan, nombresEnUso]);
  const precio = elPrecioQueSeEnsena(datos);
  const descripcion = laDescripcionQueSale(plan.description, datos);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    import("@/actions/plan-detail-actions")
      .then(({ getPlanDetailBySlug }) => getPlanDetailBySlug(plan.plan, plan.assistanceType))
      .then((res) => {
        if (!cancelled) setDetail(res.data ?? null);
      })
      .catch((e) => {
        // Sin el detalle, los botones son los de siempre: el modal sigue sirviendo.
        console.warn("[planes] no se pudo leer el detalle del plan para la landing", e);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [plan.plan, plan.assistanceType]);

  const botones = losBotonesDelPlan(detail, datos, { whatsappNumber });

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div
        className="relative z-10 flex max-h-[90dvh] w-full flex-col overflow-hidden rounded-t-2xl sm:max-w-lg sm:rounded-2xl bg-[#0d1420] border border-white/10 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        data-modal-de-plan={plan.plan}
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
              <h2 className="text-xl font-bold text-white">Plan {datos.nombre}</h2>
              <div className="mt-1 flex items-baseline gap-1.5">
                <span className="text-2xl font-bold text-white">{precio.texto}</span>
                <span className="text-sm text-white/60">
                  {precio.aConsultar ? "" : "USD/mes · "}
                  {elNumero(datos.creditos)} créditos
                </span>
              </div>
              {descripcion && <p className="mt-1.5 text-xs text-white/70">{descripcion}</p>}
            </div>
            <button onClick={onClose} aria-label="Cerrar" className="shrink-0 rounded-full p-1.5 text-white/60 hover:bg-white/10 hover:text-white">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Body scroll */}
        <div className="flex-1 overflow-y-auto">
          <div className="space-y-5 px-5 py-5">
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

            <Link href={`/planes/${plan.plan}?tipo=${plan.assistanceType}`} className="block" data-ver-pagina-del-plan>
              <div className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-slate-400 hover:bg-white/[0.06] hover:text-white transition-colors">
                <span>Ver toda la información del plan</span>
                <ExternalLink className="h-3.5 w-3.5" />
              </div>
            </Link>
          </div>
        </div>

        {/* Footer actions: los mismos de la página del plan */}
        <div className="shrink-0 border-t border-white/10 px-5 py-4 space-y-2">
          {loading ? (
            <div className="flex justify-center py-2">
              <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
            </div>
          ) : (
            <>
              <BotonDelModal url={botones.principal.url} externo={botones.principal.externo}>
                <Button className={cn("w-full bg-gradient-to-r border-0 text-white hover:opacity-90", gradient)}>
                  {botones.principal.texto}
                </Button>
              </BotonDelModal>
              {botones.secundario && (
                <BotonDelModal url={botones.secundario.url} externo={botones.secundario.externo}>
                  <Button variant="outline" className="w-full border-white/20 bg-transparent text-white hover:bg-white/10 gap-2">
                    <Calendar className="h-4 w-4" /> {botones.secundario.texto}
                  </Button>
                </BotonDelModal>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/** Lo de la plataforma se abre aquí; una web de fuera, en otra pestaña y sin `window.opener`. */
function BotonDelModal({ url, externo, children }: { url: string; externo: boolean; children: React.ReactNode }) {
  if (externo) {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" className="block">
        {children}
      </a>
    );
  }
  return (
    <Link href={url} className="block">
      {children}
    </Link>
  );
}
