"use client";

import { useEffect, useState } from "react";
import { Loader2, Radio, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { guardarConfigAction } from "@/actions/cobros-actions";
import {
    VARIABLES_DEL_MENSAJE,
    type ConfigDeCobros,
    type Hito,
} from "@/lib/cobros";

const TITULO_DEL_HITO: Record<Hito, string> = {
    antes: "Días antes de vencer",
    elDia: "El día del vencimiento",
    despues: "Días después de vencido",
};

/**
 * Los ajustes de la cartera: datos de pago, los tres mensajes y cuándo salen.
 *
 * **La línea se enseña aquí, arriba del todo.** Una cuenta con dos líneas
 * conectadas no tiene por qué adivinar por cuál salen los cobros, y una cuenta
 * sin ninguna necesita saber por qué no le sale ni un mensaje: sin eso, el
 * síntoma es «configuré todo y a mis clientes no les llega nada», que es de lo
 * más difícil de diagnosticar desde fuera.
 */
export function ConfiguracionDeCobros({
    abierto,
    config,
    linea,
    onCerrar,
    onGuardado,
}: {
    abierto: boolean;
    config: ConfigDeCobros;
    linea: string | null;
    onCerrar: () => void;
    onGuardado: (config: ConfigDeCobros) => void;
}) {
    const [datosDePago, setDatosDePago] = useState(config.datosDePago);
    const [mensajes, setMensajes] = useState(config.mensajes);
    const [diasAntes, setDiasAntes] = useState(String(config.recordatorios.diasAntes ?? ""));
    const [elDia, setElDia] = useState(config.recordatorios.elDia);
    const [diasDespues, setDiasDespues] = useState(String(config.recordatorios.diasDespues ?? ""));
    const [guardando, setGuardando] = useState(false);

    useEffect(() => {
        if (!abierto) return;
        setDatosDePago(config.datosDePago);
        setMensajes(config.mensajes);
        setDiasAntes(String(config.recordatorios.diasAntes ?? ""));
        setElDia(config.recordatorios.elDia);
        setDiasDespues(String(config.recordatorios.diasDespues ?? ""));
    }, [abierto, config]);

    const guardar = async () => {
        setGuardando(true);
        try {
            // Un campo vacío es «ese aviso no sale», que **no es lo mismo que
            // cero**: cero sería el propio día del vencimiento, que tiene su
            // propio interruptor.
            const comoDias = (valor: string) => {
                const texto = valor.trim();
                if (!texto) return null;
                const n = Math.trunc(Number(texto));
                return Number.isFinite(n) && n >= 1 ? n : null;
            };

            const res = await guardarConfigAction({
                datosDePago,
                mensajes,
                recordatorios: {
                    diasAntes: comoDias(diasAntes),
                    elDia,
                    diasDespues: comoDias(diasDespues),
                },
            });
            if (!res.success || !res.data) {
                toast.error(res.message ?? "No se pudo guardar.");
                return;
            }
            toast.success("Configuración guardada.");
            onGuardado(res.data);
            onCerrar();
        } catch (error) {
            // Una acción no solo devuelve `success: false`: puede **reventar**, y
            // entonces el `await` se rompe y el botón se queda en «Guardando…»
            // para siempre, sin un solo error en pantalla.
            console.warn("[cobros] no se pudo guardar la configuración", { error });
            toast.error("No se pudo guardar la configuración.");
        } finally {
            setGuardando(false);
        }
    };

    return (
        <Dialog open={abierto} onOpenChange={(v) => !v && onCerrar()}>
            <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-2xl">
                <DialogHeader>
                    <DialogTitle>Configuración de cobros</DialogTitle>
                </DialogHeader>

                <div className="space-y-4">
                    {linea ? (
                        <p className="flex items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2 text-sm">
                            <Radio className="h-4 w-4 shrink-0 text-emerald-600" />
                            <span>
                                Los cobros salen por tu línea <b>{linea}</b>.
                            </span>
                        </p>
                    ) : (
                        <p className="flex items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
                            <TriangleAlert className="h-4 w-4 shrink-0 text-amber-600" />
                            <span>
                                Esta cuenta no tiene una línea de WhatsApp conectada, así que{" "}
                                <b>no saldrá ningún cobro</b>. Conéctala en Conexión.
                            </span>
                        </p>
                    )}

                    <div className="space-y-1.5">
                        <Label htmlFor="cobros-pago">Cómo te pagan</Label>
                        <Textarea
                            id="cobros-pago"
                            value={datosDePago}
                            onChange={(e) => setDatosDePago(e.target.value)}
                            rows={3}
                            placeholder={"Ej.:\nNequi 3001234567\nBancolombia ahorros 123-456789-00"}
                        />
                        <p className="text-xs text-muted-foreground">
                            Escríbelo como quieras: número de cuenta, enlace, lo que uses. Sale en
                            el mensaje como <code>{"{pago}"}</code>. No verificamos pagos ni nos
                            conectamos con ninguna pasarela.
                        </p>
                    </div>

                    <div className="space-y-2">
                        <Label>Cuándo se recuerda</Label>
                        <div className="grid gap-3 sm:grid-cols-3">
                            <div className="space-y-1.5">
                                <Label htmlFor="cobros-antes" className="text-xs font-normal text-muted-foreground">
                                    Días antes
                                </Label>
                                <Input
                                    id="cobros-antes"
                                    type="number"
                                    min={1}
                                    max={365}
                                    value={diasAntes}
                                    onChange={(e) => setDiasAntes(e.target.value)}
                                    placeholder="No avisar"
                                />
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-xs font-normal text-muted-foreground">
                                    El día que vence
                                </Label>
                                <div className="flex h-10 items-center">
                                    <Switch checked={elDia} onCheckedChange={setElDia} />
                                </div>
                            </div>
                            <div className="space-y-1.5">
                                <Label htmlFor="cobros-despues" className="text-xs font-normal text-muted-foreground">
                                    Días después
                                </Label>
                                <Input
                                    id="cobros-despues"
                                    type="number"
                                    min={1}
                                    max={365}
                                    value={diasDespues}
                                    onChange={(e) => setDiasDespues(e.target.value)}
                                    placeholder="No avisar"
                                />
                            </div>
                        </div>
                        <p className="text-xs text-muted-foreground">
                            Son tres avisos y solo tres. Dejar un campo en blanco apaga ese aviso.
                            Los recordatorios <b>paran</b> en cuanto marcas que llegó el comprobante,
                            y no vuelven hasta el ciclo siguiente.
                        </p>
                    </div>

                    <div className="space-y-3">
                        <div>
                            <Label>Los mensajes</Label>
                            <p className="mt-1 text-xs text-muted-foreground">
                                Puedes usar:{" "}
                                {VARIABLES_DEL_MENSAJE.map((v) => (
                                    <code key={v.clave} className="mr-1.5 rounded bg-muted px-1">
                                        {`{${v.clave}}`}
                                    </code>
                                ))}
                            </p>
                        </div>
                        {(Object.keys(TITULO_DEL_HITO) as Hito[]).map((hito) => (
                            <div key={hito} className="space-y-1.5">
                                <Label htmlFor={`cobros-msg-${hito}`} className="text-xs font-normal text-muted-foreground">
                                    {TITULO_DEL_HITO[hito]}
                                </Label>
                                <Textarea
                                    id={`cobros-msg-${hito}`}
                                    value={mensajes[hito]}
                                    onChange={(e) =>
                                        setMensajes((prev) => ({ ...prev, [hito]: e.target.value }))
                                    }
                                    rows={8}
                                    className="font-mono text-xs"
                                />
                            </div>
                        ))}
                    </div>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                    <Button type="button" variant="outline" onClick={onCerrar} disabled={guardando}>
                        Cancelar
                    </Button>
                    <Button type="button" onClick={() => void guardar()} disabled={guardando}>
                        {guardando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        {guardando ? "Guardando…" : "Guardar"}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
