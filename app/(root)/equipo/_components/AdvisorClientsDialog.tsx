"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Building2, Loader2, Search } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { getAdvisorClients, setAdvisorClients, type ClienteAsignable } from "@/actions/team-actions";

/** Sin tildes y en minúsculas, para buscar "Audífonos" escribiendo "audifonos". */
function normalizar(texto: string) {
  return texto.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/**
 * Los clientes que le tocan a una persona del equipo.
 *
 * Con uno marcado, su listado de Clientes muestra solo esos y puede entrar a
 * configurarlos. Sin ninguno, no ve ninguno: es la forma de que ayude en una
 * cuenta concreta sin darle rol de admin y con él la plataforma entera.
 */
export function AdvisorClientsDialog({
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
  const [clientes, setClientes] = useState<ClienteAsignable[]>([]);
  const [asignados, setAsignados] = useState<Set<string>>(new Set());
  const [busqueda, setBusqueda] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, startSaving] = useTransition();

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setBusqueda("");
    getAdvisorClients(advisorId)
      .then((res) => {
        const lista = res.success ? res.data ?? [] : [];
        setClientes(lista);
        setAsignados(new Set(lista.filter((c) => c.asignado).map((c) => c.id)));
        if (!res.success) toast.error(res.message);
      })
      .finally(() => setLoading(false));
  }, [open, advisorId]);

  const consulta = normalizar(busqueda.trim());
  const visibles = useMemo(
    () =>
      consulta
        ? clientes.filter((c) =>
            normalizar(`${c.company} ${c.name ?? ""} ${c.email}`).includes(consulta),
          )
        : clientes,
    [clientes, consulta],
  );

  const guardar = () => {
    startSaving(async () => {
      const res = await setAdvisorClients(advisorId, [...asignados]);
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
            <Building2 className="h-4 w-4 text-primary" />
            Clientes asignados — {advisorName}
          </DialogTitle>
          <DialogDescription>
            Solo verá estos en su listado, y solo a estos podrá entrar a configurar.
          </DialogDescription>
        </DialogHeader>

        <div className="relative shrink-0">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por empresa, nombre o correo…"
            className="h-9 pl-8"
          />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          {loading ? (
            <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Cargando clientes…
            </div>
          ) : visibles.length === 0 ? (
            <p className="py-8 text-sm text-muted-foreground">
              {clientes.length === 0 ? "No hay clientes en la cuenta." : "Nada con esa búsqueda."}
            </p>
          ) : (
            <div className="flex flex-col divide-y rounded-lg border border-border/70">
              {visibles.map((c) => (
                <div key={c.id} className="flex items-center justify-between gap-3 px-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{c.company || c.name || c.email}</p>
                    <p className="truncate text-[11px] text-muted-foreground">{c.email}</p>
                  </div>
                  <Switch
                    checked={asignados.has(c.id)}
                    onCheckedChange={(val) =>
                      setAsignados((prev) => {
                        const next = new Set(prev);
                        if (val) next.add(c.id);
                        else next.delete(c.id);
                        return next;
                      })
                    }
                  />
                </div>
              ))}
            </div>
          )}
        </div>

        <DialogFooter className="flex-row items-center justify-between sm:justify-between">
          <span className="text-xs text-muted-foreground tabular-nums">
            {loading ? "" : `${asignados.size} de ${clientes.length} asignados`}
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
