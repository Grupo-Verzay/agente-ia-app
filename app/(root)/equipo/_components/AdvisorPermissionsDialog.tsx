"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { getAllModules } from "@/actions/module-actions";
import { getAdvisorDeniedItems, updateAdvisorDeniedItems } from "@/actions/team-actions";
import type { ModuleWithItems } from "@/schema/module";

/**
 * Qué apartados ve una persona del equipo dentro de la cuenta.
 *
 * Se marca lo que SÍ ve, que es como lo lee quien lo configura, y se guarda lo
 * que NO: así un apartado nuevo le aparece solo, sin tener que volver aquí a
 * habilitárselo persona por persona.
 */
export function AdvisorPermissionsDialog({
  open,
  setOpen,
  advisorId,
  advisorName,
}: {
  open: boolean;
  setOpen: (open: boolean) => void;
  advisorId: string;
  advisorName: string;
}) {
  const [modules, setModules] = useState<ModuleWithItems[]>([]);
  const [denied, setDenied] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [saving, startSaving] = useTransition();

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    Promise.all([getAllModules(), getAdvisorDeniedItems(advisorId)])
      .then(([mods, negados]) => {
        setModules((mods.data ?? []).filter((m) => (m.moduleItems ?? []).length > 0));
        setDenied(new Set(negados.success ? negados.data ?? [] : []));
      })
      .finally(() => setLoading(false));
  }, [open, advisorId]);

  const totalItems = useMemo(
    () => modules.reduce((n, m) => n + (m.moduleItems ?? []).length, 0),
    [modules],
  );
  const permitidos = totalItems - [...denied].filter((id) =>
    modules.some((m) => (m.moduleItems ?? []).some((it) => it.id === id)),
  ).length;

  const toggle = (id: string, visible: boolean) => {
    setDenied((prev) => {
      const next = new Set(prev);
      if (visible) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleModulo = (mod: ModuleWithItems, visible: boolean) => {
    setDenied((prev) => {
      const next = new Set(prev);
      for (const it of mod.moduleItems ?? []) {
        if (visible) next.delete(it.id);
        else next.add(it.id);
      }
      return next;
    });
  };

  const guardar = () => {
    startSaving(async () => {
      const res = await updateAdvisorDeniedItems(advisorId, [...denied]);
      if (!res.success) {
        toast.error(res.message);
        return;
      }
      toast.success(res.message);
      setOpen(false);
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-primary" />
            Permisos — {advisorName}
          </DialogTitle>
          <DialogDescription>
            Lo que apagues no lo ve, ni entrando por la dirección directa.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          {loading ? (
            <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Cargando apartados…
            </div>
          ) : modules.length === 0 ? (
            <p className="py-8 text-sm text-muted-foreground">
              No hay apartados que configurar.
            </p>
          ) : (
            <div className="flex flex-col gap-4">
              {modules.map((mod) => {
                const items = mod.moduleItems ?? [];
                const algunoVisible = items.some((it) => !denied.has(it.id));
                return (
                  <div key={mod.id} className="rounded-lg border border-border/70">
                    <div className="flex items-center justify-between gap-2 border-b bg-muted/40 px-3 py-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{mod.label}</p>
                        <p className="truncate text-[10px] text-muted-foreground">{mod.route}</p>
                      </div>
                      <Switch
                        checked={algunoVisible}
                        onCheckedChange={(val) => toggleModulo(mod, val)}
                      />
                    </div>
                    <div className="flex flex-col divide-y">
                      {items.map((item) => (
                        <div
                          key={item.id}
                          className="flex items-center justify-between gap-2 px-3 py-2"
                        >
                          <span className="min-w-0 truncate text-sm text-muted-foreground">
                            {item.title}
                          </span>
                          <Switch
                            checked={!denied.has(item.id)}
                            onCheckedChange={(val) => toggle(item.id, val)}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <DialogFooter className="flex-row items-center justify-between sm:justify-between">
          <span className="text-xs text-muted-foreground tabular-nums">
            {loading ? "" : `${permitidos} de ${totalItems} apartados`}
          </span>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button variant="save" onClick={guardar} disabled={loading || saving}>
              {saving ? "Guardando…" : "Guardar"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
