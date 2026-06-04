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
    startTransition(() => {
      void (async () => {
      const res = await upsertLeadStatusWorkflowConfig(status, workflowId);
      if (!res.success) return toast.error(res.error ?? "Error al guardar.");
      const wf = workflows.find((w) => w.id === workflowId);
      setConfigs((prev) => {
        const next = prev.filter((c) => c.leadStatus !== status);
        if (wf) next.push({ id: "", leadStatus: status, workflowId, workflow: wf });
        return next;
      });
      toast.success("Configuración guardada.");
      })();
    });
  };

  const handleRemove = (status: LeadStatusValue) => {
    startTransition(() => {
      void (async () => {
      const res = await deleteLeadStatusWorkflowConfig(status);
      if (!res.success) return toast.error(res.error ?? "Error al eliminar.");
      setConfigs((prev) => prev.filter((c) => c.leadStatus !== status));
      toast.success("Flujo desvinculado.");
      })();
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
      <div className="rounded-xl border border-border/70 overflow-hidden divide-y divide-border/70 bg-muted/20">
        {LEAD_STATUSES.filter(s => !filterStatus || s.value === filterStatus).map(({ value, label, icon, iconCn, rowCn, labelCn }) => {
          const config = getConfig(value);
          return (
            <div key={value} className={cn("flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center", rowCn)}>

              <div className="flex min-w-0 items-center gap-2">
                <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-background/80", iconCn)}>
                  {icon}
                </span>
                <div className="flex min-w-0 items-center gap-1.5 text-sm leading-5">
                  <span className={cn("shrink-0 font-semibold", labelCn)}>{label}</span>
                  <span className="truncate text-[14px] font-normal leading-5 text-muted-foreground">disparar un flujo</span>
                  <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                </div>
              </div>

              {workflows.length === 0 ? (
                <p className="text-sm text-muted-foreground sm:ml-auto">Sin flujos</p>
              ) : (
                <div className="flex w-full items-center gap-1 sm:ml-auto sm:w-auto">
                  <Select
                    value={config?.workflowId ?? ""}
                    onValueChange={(id) => handleSelect(value, id)}
                    disabled={isPending}
                  >
                    <SelectTrigger className="h-8 w-full bg-background text-sm sm:w-64 sm:shrink-0">
                      <SelectValue placeholder="Seleciona flujo para estado" />
                    </SelectTrigger>
                    <SelectContent className="max-w-[288px]">
                      {workflows.map((wf) => (
                        <SelectItem key={wf.id} value={wf.id} className="truncate text-sm">
                          {wf.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {config && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                      onClick={() => handleRemove(value)}
                      disabled={isPending}
                      title="Quitar flujo"
                    >
                      <XCircle className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <p className="px-1 text-xs leading-5 text-muted-foreground">
        Se ejecuta solo una vez al cambiar de estado, los mensajes pendientes del flujo anterior se cancelan.
      </p>
    </div>
  );
}
