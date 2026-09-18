"use client";

import { useState, useTransition } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
    NOMBRE_DE_ACCION,
    NOMBRE_DE_SECCION,
    SECCIONES,
    TIPOS_DE_ACCION,
    comoRato,
} from "@/lib/actividad-del-equipo";
import {
    leerLaActividad,
    type ActividadDelEquipo,
} from "@/actions/actividad-del-equipo-actions";

/**
 * La pantalla. Dos capas: **dónde** pasó la jornada y **qué** hizo en ella.
 *
 * La tercera —cómo acabó cada cosa— se está guardando desde el primer día y no
 * se pinta: sin meses detrás, un porcentaje contra nada no dice nada. Se avisa
 * en el pie para que no parezca que falta.
 */
export function ActividadClient({ inicial }: { inicial: ActividadDelEquipo | null }) {
    const [datos, setDatos] = useState(inicial);
    const [desde, setDesde] = useState(inicial?.desde ?? "");
    const [hasta, setHasta] = useState(inicial?.hasta ?? "");
    const [cargando, empezar] = useTransition();

    if (!datos) {
        return (
            <div className="flex h-full items-center justify-center p-8">
                <p className="text-sm text-muted-foreground">
                    No se pudo cargar la actividad. Vuelve a intentarlo en un momento.
                </p>
            </div>
        );
    }

    const recargar = () => {
        empezar(async () => {
            try {
                const nuevos = await leerLaActividad({ desde, hasta });
                if (nuevos) setDatos(nuevos);
            } catch (error) {
                // Un botón que no dice nada al fallar se lee como un botón roto.
                console.warn("[actividad] no se pudo recargar", error);
            }
        });
    };

    const hayTiempo = datos.personas.some((p) => p.segundos > 0);

    return (
        <div className="flex h-full min-h-0 flex-col gap-4 p-4">
            <header className="flex flex-wrap items-end gap-3">
                <div className="mr-auto">
                    <h1 className="text-lg font-semibold">Actividad del equipo</h1>
                    <p className="text-xs text-muted-foreground">
                        {datos.soloLaMia
                            ? "Tu jornada: dónde pasaste el tiempo y qué hiciste."
                            : "Dónde pasa la jornada cada persona y qué hizo en ella."}
                    </p>
                </div>

                <div className="flex items-end gap-2">
                    <div className="grid gap-1">
                        <Label htmlFor="actividad-desde" className="text-xs">
                            Desde
                        </Label>
                        <Input
                            id="actividad-desde"
                            type="date"
                            value={desde}
                            onChange={(e) => setDesde(e.target.value)}
                            className="h-9 w-[9.5rem]"
                        />
                    </div>
                    <div className="grid gap-1">
                        <Label htmlFor="actividad-hasta" className="text-xs">
                            Hasta
                        </Label>
                        <Input
                            id="actividad-hasta"
                            type="date"
                            value={hasta}
                            onChange={(e) => setHasta(e.target.value)}
                            className="h-9 w-[9.5rem]"
                        />
                    </div>
                    <Button onClick={recargar} disabled={cargando} className="h-9 gap-2">
                        {/* Que se vea que se pulsó, antes de que el servidor
                            conteste: un botón que no cambia se pulsa cinco veces. */}
                        {cargando ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                            <RefreshCw className="h-4 w-4" />
                        )}
                        {cargando ? "Cargando…" : "Ver"}
                    </Button>
                </div>
            </header>

            {!hayTiempo && (
                <p className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-xs text-muted-foreground">
                    Todavía no hay tiempo registrado en este rango. El contador empieza a
                    medir en cuanto alguien del equipo abre la plataforma; lo de antes de
                    hoy no se puede recuperar.
                </p>
            )}

            <div className="min-h-0 flex-1 overflow-auto rounded-md border">
                <table className="w-full min-w-[56rem] border-collapse text-sm">
                    <thead className="sticky top-0 z-10 bg-muted/95 backdrop-blur">
                        <tr className="text-left">
                            <th className="px-3 py-2 font-medium">Persona</th>
                            <th className="px-3 py-2 text-right font-medium">Total</th>
                            {SECCIONES.map((s) => (
                                <th key={s} className="px-3 py-2 text-right font-medium">
                                    {NOMBRE_DE_SECCION[s]}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {datos.personas.map((p) => (
                            <tr key={p.personaId} className="border-t">
                                <td className="max-w-[14rem] truncate px-3 py-2" title={p.personaNombre ?? p.personaId}>
                                    {p.personaNombre ?? "Sin nombre"}
                                </td>
                                <td className="px-3 py-2 text-right font-medium tabular-nums">
                                    {comoRato(p.segundos)}
                                </td>
                                {SECCIONES.map((s) => (
                                    <td
                                        key={s}
                                        className={cn(
                                            "px-3 py-2 text-right tabular-nums",
                                            p.porSeccion[s] === 0 && "text-muted-foreground/40",
                                        )}
                                    >
                                        {comoRato(p.porSeccion[s])}
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <div className="min-h-0 shrink-0 overflow-auto rounded-md border">
                <table className="w-full min-w-[56rem] border-collapse text-sm">
                    <thead className="sticky top-0 z-10 bg-muted/95 backdrop-blur">
                        <tr className="text-left">
                            <th className="px-3 py-2 font-medium">Persona</th>
                            {TIPOS_DE_ACCION.map((t) => (
                                <th key={t} className="px-3 py-2 text-right font-medium">
                                    {NOMBRE_DE_ACCION[t]}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {datos.personas.map((p) => (
                            <tr key={p.personaId} className="border-t">
                                <td className="max-w-[14rem] truncate px-3 py-2" title={p.personaNombre ?? p.personaId}>
                                    {p.personaNombre ?? "Sin nombre"}
                                </td>
                                {TIPOS_DE_ACCION.map((t) => (
                                    <td
                                        key={t}
                                        className={cn(
                                            "px-3 py-2 text-right tabular-nums",
                                            p.acciones[t] === 0 && "text-muted-foreground/40",
                                        )}
                                    >
                                        {p.acciones[t]}
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <p className="shrink-0 text-[11px] leading-relaxed text-muted-foreground">
                Se cuenta el tiempo con la pestaña delante y con actividad: cinco minutos
                sin tocar nada dejan de contar, y una pestaña de fondo no cuenta. Con
                varias pestañas abiertas cuenta aquella donde se tocó algo por última
                vez, así que un rato no se cuenta dos veces. El desenlace de cada acción
                —cuánto tardó en cerrarse un ticket, si un cobro se pagó— ya se está
                guardando, y se enseñará cuando haya meses con los que comparar.
            </p>
        </div>
    );
}
