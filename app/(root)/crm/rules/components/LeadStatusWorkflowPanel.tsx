"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  ArrowRight, CheckCircle2, Flame, Loader2, Snowflake, XCircle, Zap,
} from "lucide-react";
import {
  getLeadStatusWorkflowConfigs,
  upsertLeadStatusWorkflowConfig,
  deleteLeadStatusWorkflowConfig,
  type LeadStatusWorkflowConfigItem,
} from "@/actions/lead-status-workflow-config-actions";
import { getWorkFlowByUser } from "@/actions/workflow-actions";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const LEAD_STATUSES = [
  {
    value:   "FRIO",
    label:   "Frío",
    icon:    <Snowflake className="h-4 w-4" />,
    iconCn:  "text-blue-500",
    rowCn:   "border-blue-100 bg-blue-50/40",
    labelCn: "text-blue-700 font-semibold",
  },
  {
    value:   "TIBIO",
    label:   "Tibio",
    icon:    <Flame className="h-4 w-4" />,
    iconCn:  "text-amber-400",
    rowCn:   "border-amber-100 bg-amber-50/40",
    labelCn: "text-amber-700 font-semibold",
  },
  {
    value:   "CALIENTE",
    label:   "Caliente",
    icon:    <Flame className="h-4 w-4" />,
    iconCn:  "text-red-500",
    rowCn:   "border-red-100 bg-red-50/40",
    labelCn: "text-red-600 font-semibold",
  },
  {
    value:   "FINALIZADO",
    label:   "Finalizado",
    icon:    <CheckCircle2 className="h-4 w-4" />,
    iconCn:  "text-green-500",
    rowCn:   "border-green-100 bg-green-50/40",
    labelCn: "text-green-700 font-semibold",
  },
  {
    value:   "DESCARTADO",
    label:   "Descartado",
    icon:    <XCircle className="h-4 w-4" />,
    iconCn:  "text-slate-400",
    rowCn:   "border-slate-200 bg-slate-50/40",
    labelCn: "text-slate-500 font-semibold",
  },
] as const;

type LeadStatusValue = typeof LEAD_STATUSES[number]["value"];

export function LeadStatusWorkflowPanel({ userId, filterStatus }: { userId: string; filterStatus?: LeadStatusValue }) {
  const [configs, setConfigs]   = useState<LeadStatusWorkflowConfigItem[]>([]);
  const [workflows, setWorkflows] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading]   = useState(true);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    async function load() {
      setLoading(true);
      const [cfgRes, wfRes] = await Promise.all([
        getLeadStatusWorkflowConfigs(),
        getWorkFlowByUser(userId),
      ]);
      if (cfgRes.success) setConfigs(cfgRes.data);
      if (wfRes.success && wfRes.data) setWorkflows(wfRes.data);
      setLoading(false);
    }
    load();
  }, [userId]);

  const getConfig = (status: LeadStatusValue) =>
    configs.find((c) => c.leadStatus === status);

  const handleSelect = (status: LeadStatusValue, workflowId: string) => {
    startTransition(async () => {
      const res = await upsertLeadStatusWorkflowConfig(status, workflowId);
      if (!res.success) return toast.error(res.error ?? "Error al guardar.");
      const wf = workflows.find((w) => w.id === workflowId);
      setConfigs((prev) => {
        const next = prev.filter((c) => c.leadStatus !== status);
        if (wf) next.push({ id: "", leadStatus: status, workflowId, workflow: wf });
        return next;
      });
      toast.success("Configuración guardada.");
    });
  };

  const handleRemove = (status: LeadStatusValue) => {
    startTransition(async () => {
      const res = await deleteLeadStatusWorkflowConfig(status);
      if (!res.success) return toast.error(res.error ?? "Error al eliminar.");
      setConfigs((prev) => prev.filter((c) => c.leadStatus !== status));
      toast.success("Flujo desvinculado.");
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-6 text-muted-foreground text-sm">
        <Loader2 className="h-4 w-4 animate-spin" />
        Cargando configuración...
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {/* Tabla compacta */}
      <div className="rounded-lg border border-border/70 overflow-hidden divide-y divide-border bg-muted/20">
        {LEAD_STATUSES.filter(s => !filterStatus || s.value === filterStatus).map(({ value, label, icon, iconCn, rowCn, labelCn }) => {
          const config = getConfig(value);
          return (
            <div key={value} className={cn("flex items-center gap-3 px-4 py-3", rowCn)}>

              {/* Ícono + label del estado */}
              <div className="flex items-center gap-2 w-28 shrink-0">
                <span className={iconCn}>{icon}</span>
                <span className={cn("text-sm", labelCn)}>{label}</span>
              </div>

              {/* Flecha + texto intermedio */}
              <div className="flex items-center gap-1.5 shrink-0 text-muted-foreground">
                <ArrowRight className="h-3.5 w-3.5" />
                <span className="text-xs">Disparar flujo:</span>
              </div>

              {/* Selector */}
              <div className="flex-1 min-w-0">
                {workflows.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Sin flujos disponibles</p>
                ) : (
                  <Select
                    value={config?.workflowId ?? ""}
                    onValueChange={(id) => handleSelect(value, id)}
                    disabled={isPending}
                  >
                    <SelectTrigger className="h-8 text-sm bg-background">
                      <SelectValue placeholder="Seleccionar flujo..." />
                    </SelectTrigger>
                    <SelectContent>
                      {workflows.map((wf) => (
                        <SelectItem key={wf.id} value={wf.id}>
                          {wf.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>

              {/* Quitar */}
              {config ? (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                  onClick={() => handleRemove(value)}
                  disabled={isPending}
                  title="Quitar flujo"
                >
                  <XCircle className="h-4 w-4" />
                </Button>
              ) : (
                <div className="h-7 w-7 shrink-0" />
              )}
            </div>
          );
        })}
      </div>

      <p className="text-[11px] text-muted-foreground px-1">
        Se ejecuta solo una vez por estado. Al cambiar de estado, los mensajes pendientes del flujo anterior se cancelan.
      </p>
    </div>
  );
}
