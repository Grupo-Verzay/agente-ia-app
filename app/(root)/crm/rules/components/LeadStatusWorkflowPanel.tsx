"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Loader2, X, Zap } from "lucide-react";
import {
  getLeadStatusWorkflowConfigs,
  upsertLeadStatusWorkflowConfig,
  deleteLeadStatusWorkflowConfig,
  type LeadStatusWorkflowConfigItem,
} from "@/actions/lead-status-workflow-config-actions";
import { getWorkFlowByUser } from "@/actions/workflow-actions";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const LEAD_STATUSES = [
  { value: "FRIO",       label: "Frío",       color: "bg-blue-100 text-blue-700 border-blue-200" },
  { value: "TIBIO",      label: "Tibio",      color: "bg-amber-100 text-amber-700 border-amber-200" },
  { value: "CALIENTE",   label: "Caliente",   color: "bg-red-100 text-red-700 border-red-200" },
  { value: "FINALIZADO", label: "Finalizado", color: "bg-green-100 text-green-700 border-green-200" },
  { value: "DESCARTADO", label: "Descartado", color: "bg-slate-100 text-slate-600 border-slate-200" },
] as const;

type LeadStatusValue = typeof LEAD_STATUSES[number]["value"];

export function LeadStatusWorkflowPanel({ userId }: { userId: string }) {
  const [configs, setConfigs] = useState<LeadStatusWorkflowConfigItem[]>([]);
  const [workflows, setWorkflows] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
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
      <div className="flex flex-1 items-center justify-center gap-2 text-muted-foreground text-sm">
        <Loader2 className="h-4 w-4 animate-spin" />
        Cargando configuración...
      </div>
    );
  }

  return (
    <div className="flex flex-1 min-h-0 flex-col overflow-y-auto p-6 gap-6">
      <div className="space-y-1">
        <h3 className="text-base font-semibold flex items-center gap-2">
          <Zap className="h-4 w-4 text-primary" />
          Flujos por estado de lead
        </h3>
        <p className="text-sm text-muted-foreground">
          Cuando un lead cambia a este estado, el flujo se dispara automáticamente.
          Solo se ejecuta una vez por estado por lead.
        </p>
      </div>

      <div className="space-y-3">
        {LEAD_STATUSES.map(({ value, label, color }) => {
          const config = getConfig(value);
          return (
            <div
              key={value}
              className="flex items-center gap-3 rounded-lg border bg-card p-4"
            >
              <Badge variant="outline" className={cn("shrink-0 w-24 justify-center text-xs font-medium border", color)}>
                {label}
              </Badge>

              <div className="flex-1 min-w-0">
                {workflows.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Sin flujos disponibles</p>
                ) : (
                  <Select
                    value={config?.workflowId ?? ""}
                    onValueChange={(id) => handleSelect(value, id)}
                    disabled={isPending}
                  >
                    <SelectTrigger className="h-9 text-sm">
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

              {config && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                  onClick={() => handleRemove(value)}
                  disabled={isPending}
                  title="Quitar flujo"
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          );
        })}
      </div>

      <p className="text-xs text-muted-foreground">
        Si el lead vuelve a un estado ya ejecutado, el flujo <strong>no</strong> se vuelve a disparar.
        Al cambiar de estado, los mensajes pendientes del flujo anterior se cancelan automáticamente.
      </p>
    </div>
  );
}
