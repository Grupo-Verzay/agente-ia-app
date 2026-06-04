"use client";

import type React from "react";
import type { Plan } from "@prisma/client";
import { Bot, Building2, Crown, Rocket, Sparkles, Star, Zap } from "lucide-react";

import { cn } from "@/lib/utils";
import { PLAN_LABELS } from "@/types/plans";

type PlanBadgeDisplayProps = {
  plan?: Plan | string | null;
  className?: string;
  iconClassName?: string;
  showLabel?: boolean;
};

const PLAN_ICON_CONFIG: Record<string, { icon: React.ElementType; className: string }> = {
  basico: { icon: Bot, className: "bg-slate-100 text-slate-700" },
  lite: { icon: Zap, className: "bg-sky-100 text-sky-700" },
  unico: { icon: Star, className: "bg-amber-100 text-amber-700" },
  intermedio: { icon: Sparkles, className: "bg-emerald-100 text-emerald-700" },
  avanzado: { icon: Rocket, className: "bg-blue-100 text-blue-700" },
  enterprise: { icon: Building2, className: "bg-indigo-100 text-indigo-700" },
  personalizado: { icon: Crown, className: "bg-violet-100 text-violet-700" },
};

export function getPlanLabel(plan?: Plan | string | null) {
  return PLAN_LABELS[plan as Plan] ?? "Basico";
}

export function PlanBadgeDisplay({
  plan,
  className,
  iconClassName,
  showLabel = false,
}: PlanBadgeDisplayProps) {
  const key = plan ?? "basico";
  const config = PLAN_ICON_CONFIG[key] ?? PLAN_ICON_CONFIG.basico;
  const Icon = config.icon;

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <span
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
          config.className,
          iconClassName,
        )}
      >
        <Icon className="h-4 w-4" />
      </span>
      {showLabel && <span className="truncate">{getPlanLabel(plan)}</span>}
    </div>
  );
}
