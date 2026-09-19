"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { KeyRound, Loader2, Pencil, Plus, Star, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  actualizarUnaLlaveAction,
  borrarLlavesEnBloqueAction,
  borrarUnaLlaveAction,
  crearUnaLlaveAction,
  leerLasLlavesAction,
  queCuelgaDeLaLlaveAction,
} from "@/actions/llaves-de-verzay-actions";
import {
  cuantasLeQuedan,
  leCabeOtraCuenta,
  type LlaveDeVerzay,
} from "@/lib/llaves-de-verzay-tipos";
import { BarraDeAcciones, BotonDeCrear } from "@/components/shared/BarraDeAcciones";
import {
  AccionesMasivas,
  CasillaDeFila,
  CasillaDeTodos,
  useSeleccionMultiple,
} from "@/components/shared/AccionesMasivas";

/**
 * El registro de llaves de OpenAI de Verzay.
 *
 * ## Ninguna llamada puede dejar un botón colgado
 *
 * Todo pasa por `pedir(...)`, como en `components/shared/Carpetas.tsx`. Una
 * acción de servidor no solo devuelve `success: false`: puede **reventar**, y
 * entonces el `await` se rompe y la línea que apaga el «Guardando…» no llega a
 * ejecutarse. El síntoma no es un error, es un diálogo congelado.
 *
 * ## Lo que se pinta de cada llave
 *
 * El nombre, los últimos cuatro caracteres de la clave —la clave entera **no
 * viaja al navegador**—, cuántas cuentas lleva de su cupo y si es la que recibe
 * a las nuevas. El cupo `0` se enseña como «sin tope», que es lo que significa.
 */

type Borrador = {
  id: string | null;
  nombre: string;
  clave: string;
  cupo: string;
  porDefecto: boolean;
  activa: boolean;
};

const BORRADOR_NUEVO: Borrador = {
  id: null,
  nombre: "",
  clave: "",
  cupo: "0",
  porDefecto: false,
  activa: true,
};

async function pedir<T>(
  hacer: () => Promise<{ success: boolean; message: string; data?: T }>,
): Promise<{ success: boolean; message: string; data?: T }> {
  try {
    return await hacer();
  } catch (error) {
    console.warn("[llaves] la accion reventó", error);
    return {
      success: false,
      message: error instanceof Error ? error.message : "No se pudo completar la acción.",
    };
  }
}

export const LlavesDeVerzay = () => {
  const [llaves, setLlaves] = useState<LlaveDeVerzay[]>([]);
  const [cargando, setCargando] = useState(true);
  const [borrador, setBorrador] = useState<Borrador | null>(null);
  const [guardando, setGuardando] = useState(false);

  const [aBorrar, setABorrar] = useState<{
    id: string;
    nombre: string;
    cuentas: number;
    destinos: Array<{ id: string; nombre: string; libres: number | null }>;
  } | null>(null);
  const [destinoId, setDestinoId] = useState<string>("");
  const [borrando, setBorrando] = useState(false);

  const recargar = useCallback(async () => {
    setCargando(true);
    const res = await pedir(() => leerLasLlavesAction());
    if (res.success && res.data) setLlaves(res.data as LlaveDeVerzay[]);
    else toast.error(res.message);
    setCargando(false);
  }, []);

  useEffect(() => {
    void recargar();
  }, [recargar]);

  // Solo se pueden marcar las que NO tienen cuentas colgando: las otras piden
  // un destino, y eso no se puede preguntar una vez por veinte llaves.
  const {
    seleccionados: seleccionadas,
    alternar: alternarSeleccion,
    alternarTodos: alternarTodas,
    estanTodos: estanTodas,
    limpiar: limpiarSeleccion,
  } = useSeleccionMultiple(llaves.filter((l) => l.cuentas === 0).map((l) => l.id));

  const borrarLasMarcadas = async (ids: string[]) => {
    const res = await borrarLlavesEnBloqueAction(ids);
    if (!res.success && res.borrados === 0) throw new Error(res.message);
    return { fallaron: res.fallaron };
  };

  const hayPorDefectoConSitio = useMemo(
    () => llaves.some((l) => l.porDefecto && leCabeOtraCuenta(l)),
    [llaves],
  );
  const hayAlgunaConSitio = useMemo(() => llaves.some(leCabeOtraCuenta), [llaves]);

  const guardar = async () => {
    if (!borrador) return;
    setGuardando(true);
    const cupo = Number.parseInt(borrador.cupo, 10);
    const datos = {
      nombre: borrador.nombre.trim(),
      cupo: Number.isFinite(cupo) && cupo > 0 ? cupo : 0,
      porDefecto: borrador.porDefecto,
      activa: borrador.activa,
    };

    const res = borrador.id
      ? await pedir(() =>
          actualizarUnaLlaveAction({ ...datos, id: borrador.id!, clave: borrador.clave.trim() }),
        )
      : await pedir(() => crearUnaLlaveAction({ ...datos, clave: borrador.clave.trim() }));

    setGuardando(false);
    if (!res.success) {
      toast.error(res.message);
      return;
    }
    toast.success(res.message);
    setBorrador(null);
    void recargar();
  };

  const abrirElBorrado = async (llave: LlaveDeVerzay) => {
    // Se pregunta ANTES de enseñar el diálogo: el encargo pide avisar cuántas
    // cuentas cuelgan, y ese número es justo lo que decide si se puede borrar.
    const res = await pedir(() => queCuelgaDeLaLlaveAction(llave.id));
    if (!res.success || !res.data) {
      toast.error(res.message);
      return;
    }
    const datos = res.data as {
      nombre: string;
      cuentas: number;
      destinos: Array<{ id: string; nombre: string; libres: number | null }>;
    };
    setABorrar({ id: llave.id, ...datos });
    setDestinoId(datos.destinos[0]?.id ?? "");
  };

  const borrar = async () => {
    if (!aBorrar) return;
    setBorrando(true);
    const res = await pedir(() =>
      borrarUnaLlaveAction({ id: aBorrar.id, destinoId: aBorrar.cuentas > 0 ? destinoId : null }),
    );
    setBorrando(false);
    if (!res.success) {
      toast.error(res.message);
      return;
    }
    toast.success(res.message);
    setABorrar(null);
    void recargar();
  };

  return (
    <div className="flex h-full min-w-0 w-full flex-col gap-4">
      <BarraDeAcciones
        filtros={<>
          <CasillaDeTodos
            estanTodos={estanTodas}
            hayAlguno={seleccionadas.length > 0}
            onCambiar={alternarTodas}
          />
          <div className="flex shrink-0 items-center gap-2">
            <KeyRound className="h-5 w-5 text-muted-foreground" />
            <h2 className="text-lg font-semibold">API keys de Verzay</h2>
          </div>
        </>}
        crear={<BotonDeCrear onClick={() => setBorrador({ ...BORRADOR_NUEVO })}>Nuevo</BotonDeCrear>}
        acciones={
          <AccionesMasivas
            seleccionados={seleccionadas}
            queSon="llaves"
            onEliminar={borrarLasMarcadas}
            onTerminar={() => { limpiarSeleccion(); void recargar(); }}
          />
        }
      />

      <p className="text-xs text-muted-foreground">
        Las cuentas nuevas se crean con la llave marcada <strong>por defecto</strong>. Cuando esa
        llega a su cupo, el reparto pasa solo a la siguiente que tenga sitio. Las cuentas que ya
        existen no se mueven nunca por esto.
      </p>

      {/* Un aviso que se ve, no un fallo silencioso: sin ninguna llave con sitio,
          la próxima cuenta nace sin IA y eso desde fuera parece un bot roto. */}
      {!cargando && llaves.length > 0 && !hayAlgunaConSitio && (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          Ninguna llave tiene cupo libre. Las cuentas nuevas se van a crear sin IA hasta que
          subas un cupo o registres otra llave.
        </p>
      )}
      {!cargando && llaves.length > 0 && hayAlgunaConSitio && !hayPorDefectoConSitio && (
        <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-400">
          La llave por defecto no tiene sitio (o no hay ninguna marcada). Las cuentas nuevas irán
          a la siguiente llave libre.
        </p>
      )}

      {cargando ? (
        <p className="text-sm text-muted-foreground">Cargando llaves…</p>
      ) : llaves.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            Todavía no hay ninguna llave registrada.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 items-start">
          {llaves.map((llave) => {
            const libres = cuantasLeQuedan(llave);
            const llena = !leCabeOtraCuenta(llave);
            return (
              <Card key={llave.id} className="border-border">
                <CardHeader className="pb-2">
                  <div className="flex items-start gap-2">
                    {/* Una llave CON cuentas no se marca: borrarla en bloque
                        las dejaría apuntando a una clave que ya no está, que es
                        justo lo que el diálogo de una en una impide preguntando
                        a dónde pasan. Se dice al posar el cursor. */}
                    <span
                      title={
                        llave.cuentas > 0
                          ? `Tiene ${llave.cuentas} cuenta${llave.cuentas === 1 ? "" : "s"}: elimínala de una en una para elegir a qué llave pasan.`
                          : `Seleccionar ${llave.nombre}`
                      }
                      className={llave.cuentas > 0 ? "cursor-not-allowed opacity-40" : undefined}
                    >
                      <CasillaDeFila
                        marcada={seleccionadas.includes(llave.id)}
                        onCambiar={() => llave.cuentas === 0 && alternarSeleccion(llave.id)}
                        etiqueta={`Seleccionar ${llave.nombre}`}
                        className={llave.cuentas > 0 ? "pointer-events-none" : "mt-1"}
                      />
                    </span>
                    <CardTitle
                      className="text-base min-w-0 flex-1 flex items-center gap-1.5"
                      title={llave.nombre}
                    >
                      {/* La estrella va EN LA MISMA LÍNEA que el nombre, y sin
                          texto al lado. Como etiqueta suelta debajo ocupaba una
                          línea propia y solo la tenía una de las tres tarjetas,
                          así que la rejilla salía escalonada. */}
                      {llave.porDefecto && (
                        <span title="Las cuentas nuevas se crean con esta llave">
                          <Star
                            className="h-4 w-4 shrink-0 fill-amber-400 text-amber-500"
                            aria-label="Llave por defecto"
                          />
                        </span>
                      )}
                      <span className="truncate">{llave.nombre}</span>
                    </CardTitle>
                    <div className="flex shrink-0 items-center gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        title="Editar"
                        onClick={() =>
                          setBorrador({
                            id: llave.id,
                            nombre: llave.nombre,
                            // Vacía a propósito: la clave no viaja al navegador.
                            // Dejarla en blanco conserva la que hay.
                            clave: "",
                            cupo: String(llave.cupo),
                            porDefecto: llave.porDefecto,
                            activa: llave.activa,
                          })
                        }
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-destructive"
                        title="Eliminar"
                        onClick={() => void abrirElBorrado(llave)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                  {/* La fila de estado SIEMPRE ocupa lo mismo, lleve chip o no.
                      Es la misma idea que la tarjeta de Diagramas: una anatomía
                      fija es lo que iguala las alturas sin recortar nada.

                      Y el hueco se reserva con **el mismo chip puesto a
                      invisible**, no con un `min-h` a ojo. Medido: el chip mide
                      20,5 px, así que cualquier número redondo que se escriba
                      aquí se queda corto o largo —y volvería a quedarse el día
                      que alguien toque su tipografía—. Siendo el mismo
                      elemento, las alturas no pueden separarse. */}
                  <div className="flex flex-wrap items-center gap-1.5 pt-1">
                    {llave.activa && !llena && (
                      <span
                        aria-hidden
                        className="invisible rounded-full px-2 py-0.5 text-[11px] font-medium"
                      >
                        &nbsp;
                      </span>
                    )}
                    {!llave.activa && (
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                        Desactivada
                      </span>
                    )}
                    {llave.activa && llena && (
                      <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] font-medium text-destructive">
                        Sin cupo
                      </span>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-1 pb-4 text-sm">
                  <p className="font-mono text-xs text-muted-foreground">····{llave.cola}</p>
                  <p>
                    <strong>{llave.cuentas}</strong>{" "}
                    {llave.cupo > 0 ? (
                      <>
                        de {llave.cupo} cuentas{" "}
                        <span className="text-muted-foreground">
                          ({libres} libre{libres === 1 ? "" : "s"})
                        </span>
                      </>
                    ) : (
                      <>
                        cuenta{llave.cuentas === 1 ? "" : "s"}{" "}
                        <span className="text-muted-foreground">(sin tope)</span>
                      </>
                    )}
                  </p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* ── Alta y edición ─────────────────────────────────────────── */}
      <Dialog open={!!borrador} onOpenChange={(abierto) => !abierto && setBorrador(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{borrador?.id ? "Editar llave" : "Nueva llave"}</DialogTitle>
            <DialogDescription>
              {borrador?.id
                ? "Deja la clave en blanco para conservar la que ya tiene."
                : "La clave de OpenAI que va a pagar el consumo de estas cuentas."}
            </DialogDescription>
          </DialogHeader>

          {borrador && (
            <div className="space-y-4">
              <div className="space-y-1">
                <Label>Nombre</Label>
                <Input
                  value={borrador.nombre}
                  placeholder="Verzay principal"
                  onChange={(e) => setBorrador({ ...borrador, nombre: e.target.value })}
                />
              </div>

              <div className="space-y-1">
                <Label>Clave</Label>
                <Input
                  type="password"
                  autoComplete="off"
                  value={borrador.clave}
                  placeholder={borrador.id ? "Sin cambios" : "sk-…"}
                  onChange={(e) => setBorrador({ ...borrador, clave: e.target.value })}
                />
                {borrador.id && (
                  <p className="text-[11px] text-muted-foreground">
                    Si escribes una clave nueva, las cuentas que ya cuelgan de esta llave pasan a
                    usarla.
                  </p>
                )}
              </div>

              <div className="space-y-1">
                <Label>Cupo de cuentas</Label>
                <Input
                  type="number"
                  min={0}
                  value={borrador.cupo}
                  onChange={(e) => setBorrador({ ...borrador, cupo: e.target.value })}
                />
                <p className="text-[11px] text-muted-foreground">
                  Cuántas cuentas aguanta esta llave. <strong>0 = sin tope.</strong>
                </p>
              </div>

              <div className="flex items-center justify-between gap-3">
                <div>
                  <Label>Por defecto</Label>
                  <p className="text-[11px] text-muted-foreground">
                    Es la que reciben las cuentas nuevas.
                  </p>
                </div>
                <Switch
                  checked={borrador.porDefecto}
                  onCheckedChange={(v) => setBorrador({ ...borrador, porDefecto: v })}
                />
              </div>

              <div className="flex items-center justify-between gap-3">
                <div>
                  <Label>Activa</Label>
                  <p className="text-[11px] text-muted-foreground">
                    Desactivada deja de recibir cuentas nuevas. Las que ya tiene siguen
                    funcionando igual.
                  </p>
                </div>
                <Switch
                  checked={borrador.activa}
                  onCheckedChange={(v) => setBorrador({ ...borrador, activa: v })}
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setBorrador(null)} disabled={guardando}>
              Cancelar
            </Button>
            <Button onClick={() => void guardar()} disabled={guardando}>
              {guardando && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              {guardando ? "Guardando…" : "Guardar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Borrado, con traspaso ──────────────────────────────────── */}
      <Dialog open={!!aBorrar} onOpenChange={(abierto) => !abierto && setABorrar(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Eliminar «{aBorrar?.nombre}»</DialogTitle>
            <DialogDescription>
              {aBorrar?.cuentas
                ? `De esta llave cuelgan ${aBorrar.cuentas} cuenta${aBorrar.cuentas === 1 ? "" : "s"}. Elige a qué llave pasan: sin eso se quedarían sin servicio.`
                : "De esta llave no cuelga ninguna cuenta."}
            </DialogDescription>
          </DialogHeader>

          {!!aBorrar?.cuentas && (
            <div className="space-y-1">
              <Label>Pasar sus cuentas a</Label>
              {aBorrar.destinos.length === 0 ? (
                <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  No hay ninguna otra llave con cupo libre. Sube el cupo de otra o registra una
                  nueva antes de eliminar esta.
                </p>
              ) : (
                <Select value={destinoId} onValueChange={setDestinoId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Elige una llave" />
                  </SelectTrigger>
                  <SelectContent
                    style={{
                      maxHeight: "min(60vh, var(--radix-select-content-available-height))",
                    }}
                  >
                    {aBorrar.destinos.map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.nombre} {d.libres === null ? "(sin tope)" : `(${d.libres} libres)`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setABorrar(null)} disabled={borrando}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={() => void borrar()}
              disabled={borrando || (!!aBorrar?.cuentas && !destinoId)}
            >
              {borrando && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              {borrando ? "Eliminando…" : "Eliminar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
