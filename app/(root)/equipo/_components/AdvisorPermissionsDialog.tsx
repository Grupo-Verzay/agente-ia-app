"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Inbox, Loader2, ShieldCheck } from "lucide-react";
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
import { getAdvisorPermissions, updateAdvisorPermissions } from "@/actions/team-actions";
import type { ModuleWithItems } from "@/schema/module";

/**
 * Qué ve una persona del equipo dentro de la cuenta.
 *
 * Se marca lo que SÍ ve, que es como se lee. Por detrás se guarda de dos
 * formas, según el módulo: en los normales lo que se le QUITA -así un apartado
 * nuevo le aparece solo-, y en los "Solo Admin" lo que se le DA -ahí lo normal
 * es no entrar, y un apartado nuevo del Panel no se le abre a nadie solo-.
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
  const [visibles, setVisibles] = useState<Set<string>>(new Set());
  const [tomarSinAsignar, setTomarSinAsignar] = useState(true);
  const [loading, setLoading] = useState(false);
  const [saving, startSaving] = useTransition();

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    Promise.all([getAllModules(), getAdvisorPermissions(advisorId)])
      .then(([mods, permisos]) => {
        const conApartados = (mods.data ?? []).filter((m) => (m.moduleItems ?? []).length > 0);
        setModules(conApartados);

        const p = permisos.success ? permisos.data : undefined;
        const negados = new Set(p?.denied ?? []);
        const concedidos = new Set(p?.granted ?? []);

        // Se pinta lo que ve: en los normales todo menos lo quitado; en los
        // "Solo Admin" solo lo que se le haya dado.
        const encendidos = new Set<string>();
        for (const m of conApartados) {
          for (const it of m.moduleItems ?? []) {
            const ve = m.adminOnly ? concedidos.has(it.id) : !negados.has(it.id);
            if (ve) encendidos.add(it.id);
          }
        }
        setVisibles(encendidos);
        setTomarSinAsignar(p?.canTakeUnassigned ?? true);
      })
      .finally(() => setLoading(false));
  }, [open, advisorId]);

  const totalItems = useMemo(
    () => modules.reduce((n, m) => n + (m.moduleItems ?? []).length, 0),
    [modules],
  );

  const toggle = (id: string, ve: boolean) => {
    setVisibles((prev) => {
      const next = new Set(prev);
      if (ve) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const toggleModulo = (mod: ModuleWithItems, ve: boolean) => {
    setVisibles((prev) => {
      const next = new Set(prev);
      for (const it of mod.moduleItems ?? []) {
        if (ve) next.add(it.id);
        else next.delete(it.id);
      }
      return next;
    });
  };

  const guardar = () => {
    const denied: string[] = [];
    const granted: string[] = [];
    for (const m of modules) {
      for (const it of m.moduleItems ?? []) {
        if (m.adminOnly) {
          if (visibles.has(it.id)) granted.push(it.id);
        } else if (!visibles.has(it.id)) {
          denied.push(it.id);
        }
      }
    }

    startSaving(async () => {
      const res = await updateAdvisorPermissions(advisorId, {
        denied,
        granted,
        canTakeUnassigned: tomarSinAsignar,
      });
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
          ) : (
            <div className="flex flex-col gap-4">
              <div className="flex items-start justify-between gap-3 rounded-lg border border-border/70 bg-muted/40 px-3 py-2.5">
                <div className="flex min-w-0 gap-2">
                  <Inbox className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium">Tomar conversaciones sin asignar</p>
                    <p className="text-[11px] leading-snug text-muted-foreground">
                      Apagado, solo ve las que alguien le asigne.
                    </p>
                  </div>
                </div>
                <Switch checked={tomarSinAsignar} onCheckedChange={setTomarSinAsignar} />
              </div>

              {modules.length === 0 ? (
                <p className="py-4 text-sm text-muted-foreground">
                  No hay apartados que configurar.
                </p>
              ) : (
                modules.map((mod) => {
                  const items = mod.moduleItems ?? [];
                  const algunoVisible = items.some((it) => visibles.has(it.id));
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
                              checked={visibles.has(item.id)}
                              onCheckedChange={(val) => toggle(item.id, val)}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>

        <DialogFooter className="flex-row items-center justify-between sm:justify-between">
          <span className="text-xs text-muted-foreground tabular-nums">
            {loading ? "" : `${visibles.size} de ${totalItems} apartados`}
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
