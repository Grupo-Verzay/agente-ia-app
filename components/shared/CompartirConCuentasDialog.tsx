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

/** Sin tildes y en minúsculas, para buscar "Audífonos" escribiendo "audifonos". */
function normalizar(texto: string) {
  return texto.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

export type PermisoCompartido = 'lectura' | 'edicion';

export type CuentaDestino = {
  id: string;
  name: string | null;
  email: string;
  company: string;
  compartido: boolean;
  /** Con qué permiso se le comparte hoy. `lectura` si aún no se le comparte. */
  permiso: PermisoCompartido;
};

export type CompartirCon = { accountUserId: string; permiso: PermisoCompartido };

/**
 * A qué otras cuentas se les enseña esto.
 *
 * Es distinto de la visibilidad con el equipo: aquella reparte dentro de una
 * misma cuenta, y esto cruza a la cuenta de un cliente.
 *
 * Cada cuenta lleva su propio permiso. En "Solo lectura" lo ve y nada más; en
 * "Puede editar" trabaja sobre lo mismo, no sobre una copia, y lo que haga lo
 * ves tú.
 *
 * Antes esto era un interruptor a secas y todo lo compartido era de lectura. Se
 * compartía creyendo que el cliente podía editar —la visibilidad de la tarjeta
 * dice "Editable", pero eso es para el equipo de uno—, el cliente trabajaba
 * encima y no se guardaba nada.
 *
 * ## Es UNO, no uno por pantalla
 *
 * Lo usan Diagramas y Proyectos. Lo que cambia entre los dos son los datos, y
 * entran por `cargar` y `guardar` —las acciones de cada uno—; el buscador, el
 * interruptor por cuenta, el selector de permiso y el «N de M cuentas» son los
 * mismos. Con dos copias, el día que se afine algo se afina en una y la otra se
 * queda atrás, y eso no se ve como un error sino como «en Proyectos funciona
 * distinto».
 */
export function CompartirConCuentasDialog({
  open,
  setOpen,
  titulo,
  queSeVe,
  cargar,
  guardar,
  onSaved,
}: {
  open: boolean;
  setOpen: (open: boolean) => void;
  /** El nombre de lo que se comparte, para la cabecera. */
  titulo: string;
  /** Dónde lo verán: «Diagramas», «Proyectos». */
  queSeVe: string;
  cargar: () => Promise<{ ok: boolean; cuentas: CuentaDestino[]; message?: string }>;
  guardar: (destinos: CompartirCon[]) => Promise<{ ok: boolean; message?: string }>;
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
    let vivo = true;
    setLoading(true);
    setBusqueda('');
    cargar()
      .then((res) => {
        if (!vivo) return;
        setCuentas(res.cuentas);
        setElegidas(new Map(res.cuentas.filter((c) => c.compartido).map((c) => [c.id, c.permiso])));
        if (!res.ok && res.message) toast.error(res.message);
      })
      .catch((error) => {
        // Sin esto el diálogo se queda en «Cargando cuentas…» para siempre: una
        // acción no solo devuelve un fallo, puede reventar.
        console.warn('[compartir] no se pudieron cargar las cuentas', error);
        if (vivo) toast.error('No se pudieron cargar las cuentas.');
      })
      .finally(() => {
        if (vivo) setLoading(false);
      });
    return () => {
      vivo = false;
    };
    // `cargar` llega nueva en cada render del padre; depender de ella volvería a
    // pedir la lista sin parar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

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

  const alGuardar = () => {
    startSaving(async () => {
      const res = await guardar(
        [...elegidas].map(([accountUserId, permiso]) => ({ accountUserId, permiso })),
      ).catch((error) => {
        console.warn('[compartir] no se pudo guardar', error);
        return { ok: false, message: 'No se pudo guardar con quién se comparte.' };
      });
      if (!res.ok) {
        toast.error(res.message ?? 'No se pudo guardar con quién se comparte.');
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
            Compartir — {titulo}
          </DialogTitle>
          <DialogDescription>
            Lo verán en su propio listado de {queSeVe}. En <strong>Solo lectura</strong> lo miran y
            nada más; en <strong>Puede editar</strong> trabajan sobre esto mismo y sus cambios te
            llegan a ti.
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
                              onClick={() => setElegidas((prev) => new Map(prev).set(c.id, op))}
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
          <span className="text-xs tabular-nums text-muted-foreground">
            {loading ? '' : `${elegidas.size} de ${cuentas.length} cuentas`}
          </span>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button variant="save" onClick={alGuardar} disabled={loading || saving}>
              {saving ? 'Guardando…' : 'Guardar'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
