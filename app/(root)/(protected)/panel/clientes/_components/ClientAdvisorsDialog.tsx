"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Loader2, Search, UserCog } from "lucide-react";
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
import {
  getClientAdvisors,
  setClientAdvisors,
  type MiembroAsignable,
} from "@/actions/team-actions";

/** Sin tildes y en minúsculas, para buscar "Andrés" escribiendo "andres". */
function normalizar(texto: string) {
  return texto.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

const ETIQUETA_ROL: Record<string, string> = {
  administrador: "Administrador",
  agente: "Agente",
};

/**
 * A quién del equipo se le pasa este cliente.
 *
 * Es la misma asignación que se hace desde Equipo, pero mirada al revés: aquí
 * uno está en el listado de Clientes, ve la cuenta y decide quién la atiende.
 * Quien quede marcado la verá en su propio listado y podrá entrar a
 * configurarla, sin que eso le abra el resto de la plataforma.
 */
export function ClientAdvisorsDialog({
  open,
  setOpen,
  clientId,
  clientName,
}: {
  open: boolean;
  setOpen: (open: boolean) => void;
  clientId: string;
  clientName: string;
}) {
  const [miembros, setMiembros] = useState<MiembroAsignable[]>([]);
  const [asignados, setAsignados] = useState<Set<string>>(new Set());
  const [busqueda, setBusqueda] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, startSaving] = useTransition();

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setBusqueda("");
    getClientAdvisors(clientId)
      .then((res) => {
        const lista = res.success ? res.data ?? [] : [];
        setMiembros(lista);
        setAsignados(new Set(lista.filter((m) => m.asignado).map((m) => m.id)));
        if (!res.success) toast.error(res.message);
      })
      .finally(() => setLoading(false));
  }, [open, clientId]);

  const consulta = normalizar(busqueda.trim());
  const visibles = useMemo(
    () =>
      consulta
        ? miembros.filter((m) => normalizar(`${m.name ?? ""} ${m.email}`).includes(consulta))
        : miembros,
    [miembros, consulta],
  );

  const guardar = () => {
    startSaving(async () => {
      const res = await setClientAdvisors(clientId, [...asignados]);
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
            <UserCog className="h-4 w-4 text-primary" />
            Asignar a — {clientName}
          </DialogTitle>
          <DialogDescription>
            Quien quede marcado verá esta cuenta en su listado de Clientes y podrá entrar a
            configurarla.
          </DialogDescription>
        </DialogHeader>

        <div className="relative shrink-0">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por nombre o correo…"
            className="h-9 pl-8"
          />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          {loading ? (
            <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Cargando equipo…
            </div>
          ) : visibles.length === 0 ? (
            <p className="py-8 text-sm text-muted-foreground">
              {miembros.length === 0
                ? "No hay nadie en el equipo todavía."
                : "Nada con esa búsqueda."}
            </p>
          ) : (
            <div className="flex flex-col divide-y rounded-lg border border-border/70">
              {visibles.map((m) => (
                <div key={m.id} className="flex items-center justify-between gap-3 px-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{m.name || m.email}</p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {m.email}
                      {m.advisorRole ? ` · ${ETIQUETA_ROL[m.advisorRole] ?? m.advisorRole}` : ""}
                    </p>
                  </div>
                  <Switch
                    checked={asignados.has(m.id)}
                    onCheckedChange={(val) =>
                      setAsignados((prev) => {
                        const next = new Set(prev);
                        if (val) next.add(m.id);
                        else next.delete(m.id);
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
            {loading ? "" : `${asignados.size} de ${miembros.length} asignados`}
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
