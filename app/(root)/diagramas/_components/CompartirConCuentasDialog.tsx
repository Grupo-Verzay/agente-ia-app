'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { Building2, Loader2, Search } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import {
  getFlowShareTargetsAction,
  setFlowSharesAction,
  type CuentaDestino,
  type PermisoCompartido,
} from '@/actions/flow-actions';

/** Sin tildes y en minúsculas, para buscar "Audífonos" escribiendo "audifonos". */
function normalizar(texto: string) {
  return texto.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/**
 * A qué otras cuentas se les enseña este diagrama.
 *
 * Es distinto de la visibilidad: aquella reparte dentro del equipo de una misma
 * cuenta, y esto cruza a la cuenta de un cliente.
 *
 * Cada cuenta lleva su propio permiso. En "Solo lectura" lo ve y saca su copia;
 * en "Puede editar" trabaja sobre el mismo diagrama, no sobre una copia, y lo
 * que escriba lo ves tú.
 *
 * Antes esto era un interruptor a secas y todo lo compartido era de lectura.
 * Se compartia creyendo que el cliente podia editar -la visibilidad de la
 * tarjeta dice "Editable", pero eso es para el equipo de uno-, el cliente
 * trabajaba encima y no se guardaba nada.
 */
export function CompartirConCuentasDialog({
  open,
  setOpen,
  flowId,
  flowName,
  onSaved,
}: {
  open: boolean;
  setOpen: (open: boolean) => void;
  flowId: string;
  flowName: string;
  onSaved: () => void;
}) {
  const [cuentas, setCuentas] = useState<CuentaDestino[]>([]);
  // Cuenta -> permiso. Que no esté en el mapa significa que no se le comparte.
  const [elegidas, setElegidas] = useState<Map<string, PermisoCompartido>>(new Map());
  const [busqueda, setBusqueda] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, startSaving] = useTransition();

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setBusqueda('');
    getFlowShareTargetsAction(flowId)
      .then((res) => {
        const lista = res.success ? res.data : [];
        setCuentas(lista);
        setElegidas(new Map(lista.filter((c) => c.compartido).map((c) => [c.id, c.permiso])));
        if (!res.success) toast.error(res.message);
      })
      .finally(() => setLoading(false));
  }, [open, flowId]);

  const consulta = normalizar(busqueda.trim());
  const visibles = useMemo(
    () =>
      consulta
        ? cuentas.filter((c) =>
            normalizar(`${c.company} ${c.name ?? ''} ${c.email}`).includes(consulta),
          )
        : cuentas,
    [cuentas, consulta],
  );

  const guardar = () => {
    startSaving(async () => {
      const res = await setFlowSharesAction(
        flowId,
        [...elegidas].map(([accountUserId, permiso]) => ({ accountUserId, permiso })),
      );
      if (!res.success) {
        toast.error(res.message);
        return;
      }
      const conEdicion = [...elegidas.values()].filter((p) => p === 'edicion').length;
      toast.success(
        elegidas.size === 0
          ? 'Ya no se comparte con ninguna cuenta.'
          : `Compartido con ${elegidas.size} ${elegidas.size === 1 ? 'cuenta' : 'cuentas'}` +
            (conEdicion > 0 ? `, ${conEdicion} con permiso de edición.` : '.'),
      );
      setOpen(false);
      onSaved();
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-primary" />
            Compartir — {flowName}
          </DialogTitle>
          <DialogDescription>
            Lo verán en su propio listado de Diagramas. En <strong>Solo lectura</strong> lo miran y
            sacan su copia; en <strong>Puede editar</strong> trabajan sobre este mismo diagrama y sus
            cambios te llegan a ti.
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
              Cargando cuentas…
            </div>
          ) : visibles.length === 0 ? (
            <p className="py-8 text-sm text-muted-foreground">
              {cuentas.length === 0 ? 'No hay otras cuentas.' : 'Nada con esa búsqueda.'}
            </p>
          ) : (
            <div className="flex flex-col divide-y rounded-lg border border-border/70">
              {visibles.map((c) => {
                const permiso = elegidas.get(c.id);
                return (
                  <div key={c.id} className="flex items-center justify-between gap-3 px-3 py-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{c.company || c.name || c.email}</p>
                      <p className="truncate text-[11px] text-muted-foreground">{c.email}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {/* El permiso solo aparece si se le comparte: un selector
                          apagado al lado de un interruptor apagado no dice nada. */}
                      {permiso && (
                        <div className="flex rounded-md border border-border p-0.5">
                          {(['lectura', 'edicion'] as const).map((op) => (
                            <button
                              key={op}
                              type="button"
                              aria-pressed={permiso === op}
                              onClick={() =>
                                setElegidas((prev) => new Map(prev).set(c.id, op))
                              }
                              className={`rounded px-2 py-0.5 text-[11px] font-medium transition-colors ${
                                permiso === op
                                  ? 'bg-primary text-primary-foreground'
                                  : 'text-muted-foreground hover:text-foreground'
                              }`}
                            >
                              {op === 'lectura' ? 'Solo lectura' : 'Puede editar'}
                            </button>
                          ))}
                        </div>
                      )}
                      <Switch
                        checked={Boolean(permiso)}
                        onCheckedChange={(val) =>
                          setElegidas((prev) => {
                            const next = new Map(prev);
                            if (val) next.set(c.id, 'lectura');
                            else next.delete(c.id);
                            return next;
                          })
                        }
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <DialogFooter className="flex-row items-center justify-between sm:justify-between">
          <span className="text-xs text-muted-foreground tabular-nums">
            {loading ? '' : `${elegidas.size} de ${cuentas.length} cuentas`}
          </span>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button variant="save" onClick={guardar} disabled={loading || saving}>
              {saving ? 'Guardando…' : 'Guardar'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
