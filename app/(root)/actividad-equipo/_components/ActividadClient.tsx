"use client";

import { Fragment, useMemo, useState, useTransition } from "react";
import { Building2, ChevronDown, Loader2, RefreshCw } from "lucide-react";
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
    repartirEnDosBloques,
    type CuentaConSuGente,
    type JornadaDeUnaPersona,
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
 *
 * Y dos BLOQUES: arriba la casa —lo único que se ve al entrar— y abajo, plegada,
 * la gente de las cuentas cliente. El reparto lo decide `repartirEnDosBloques`,
 * que es puro y mira **la cuenta a la que pertenece cada persona**, no aquella
 * contra la que se guardó su actividad.
 */
export function ActividadClient({ inicial }: { inicial: ActividadDelEquipo | null }) {
    const [datos, setDatos] = useState(inicial);
    const [desde, setDesde] = useState(inicial?.desde ?? "");
    const [hasta, setHasta] = useState(inicial?.hasta ?? "");
    const [cargando, empezar] = useTransition();
    // Clientes arranca CERRADO, como el reparto del trabajo de Proyectos: es un
    // dato que se consulta de vez en cuando, no lo que se viene a ver aquí.
    const [verClientes, setVerClientes] = useState(false);

    const bloques = useMemo(
        () =>
            datos
                ? repartirEnDosBloques(datos.personas, datos.cuentasDeLaFamilia)
                : { familia: [], clientes: [] },
        [datos],
    );

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
    const cuantosClientes = bloques.clientes.reduce((n, c) => n + c.personas.length, 0);

    return (
        <div className="flex h-full min-h-0 flex-col gap-4 overflow-auto p-4">
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

            <TablaDeTiempo personas={bloques.familia} />
            <TablaDeAcciones personas={bloques.familia} />

            {/* La barra de Clientes va DESPUÉS de las dos tablas de la casa, y
                solo se pinta si hay alguien detrás: una barra que se abre y sale
                vacía se lee como que la pantalla está rota. Para quien no es
                súper administrador nunca hay nada aquí —su gente entera cae en
                el bloque de arriba—, así que su pantalla no cambia.

                Es el mismo desplegable que el reparto del trabajo de Proyectos:
                un botón con su `aria-expanded` y el chevron que gira, y el
                contenido **no montado** mientras está cerrado, que es lo que
                hace que tenerlo cerrado no cueste nada. */}
            {bloques.clientes.length > 0 && (
                <div className="shrink-0">
                    <Button
                        type="button"
                        variant="ghost"
                        aria-expanded={verClientes}
                        aria-controls="actividad-de-clientes"
                        onClick={() => setVerClientes((v) => !v)}
                        className="h-10 w-full justify-start gap-2 rounded-md border px-3 text-sm font-medium"
                    >
                        <Building2 className="h-4 w-4 text-muted-foreground" />
                        Clientes
                        <span className="text-xs font-normal text-muted-foreground">
                            {cuantosClientes}{" "}
                            {cuantosClientes === 1 ? "persona" : "personas"} en{" "}
                            {bloques.clientes.length}{" "}
                            {bloques.clientes.length === 1 ? "cuenta" : "cuentas"}
                        </span>
                        <ChevronDown
                            className={cn(
                                "ml-auto h-4 w-4 shrink-0 text-muted-foreground transition-transform",
                                verClientes && "rotate-180",
                            )}
                        />
                    </Button>

                    {verClientes && (
                        <div id="actividad-de-clientes" className="mt-3 flex flex-col gap-4">
                            <TablaDeTiempo personas={aplanar(bloques.clientes)} agrupada />
                            <TablaDeAcciones personas={aplanar(bloques.clientes)} agrupada />
                        </div>
                    )}
                </div>
            )}

            <p className="shrink-0 text-[11px] leading-relaxed text-muted-foreground">
                Se cuenta el tiempo con la pestaña delante y con actividad: cinco minutos
                sin tocar nada dejan de contar, y una pestaña de fondo no cuenta. Con
                varias pestañas abiertas cuenta aquella donde se tocó algo por última
                vez, así que un rato no se cuenta dos veces. La columna «Cuenta» es
                aquella a la que pertenece cada persona, no aquella donde estuviera
                trabajando. El desenlace de cada acción —cuánto tardó en cerrarse un
                ticket, si un cobro se pagó— ya se está guardando, y se enseñará cuando
                haya meses con los que comparar.
            </p>
        </div>
    );
}

/**
 * Los clientes, en una sola lista y ya ordenados por cuenta.
 *
 * Se aplanan aquí y no en el módulo puro porque las dos tablas quieren la misma
 * lista: el agrupado ya viene decidido —el orden de `repartirEnDosBloques`— y lo
 * único que hace falta al pintar es saber cuándo cambia la cuenta para meter su
 * fila de separación.
 */
function aplanar(cuentas: CuentaConSuGente[]): JornadaDeUnaPersona[] {
    return cuentas.flatMap((c) => c.personas);
}

/** ¿Es esta la primera fila de su cuenta? Lo que decide la fila de separación. */
function abreCuenta(personas: JornadaDeUnaPersona[], i: number): boolean {
    return i === 0 || personas[i - 1].cuentaId !== personas[i].cuentaId;
}

function NombreDeCuenta({ persona }: { persona: JornadaDeUnaPersona }) {
    return (
        <span
            className="block max-w-[12rem] truncate text-muted-foreground"
            title={persona.cuentaNombre ?? persona.cuentaId}
        >
            {persona.cuentaNombre ?? "Sin nombre"}
        </span>
    );
}

function Persona({ persona }: { persona: JornadaDeUnaPersona }) {
    return (
        <span
            className="block max-w-[14rem] truncate"
            title={persona.personaNombre ?? persona.personaId}
        >
            {persona.personaNombre ?? "Sin nombre"}
        </span>
    );
}

/** La cabecera de una cuenta dentro de una tabla agrupada. */
function FilaDeCuenta({
    persona,
    columnas,
}: {
    persona: JornadaDeUnaPersona;
    columnas: number;
}) {
    return (
        <tr className="border-t bg-muted/40">
            <td
                colSpan={columnas}
                className="px-3 py-1.5 text-xs font-medium text-muted-foreground"
            >
                {persona.cuentaNombre ?? persona.cuentaId}
            </td>
        </tr>
    );
}

function Vacia({ columnas }: { columnas: number }) {
    return (
        <tr className="border-t">
            <td colSpan={columnas} className="px-3 py-4 text-center text-xs text-muted-foreground">
                No hay nadie en este bloque.
            </td>
        </tr>
    );
}

/** Dónde pasó la jornada: el total y su reparto por sección. */
function TablaDeTiempo({
    personas,
    agrupada = false,
}: {
    personas: JornadaDeUnaPersona[];
    /** Agrupada por cuenta: los clientes. La casa va seguida. */
    agrupada?: boolean;
}) {
    const columnas = 3 + SECCIONES.length;
    return (
        <div className="shrink-0 overflow-auto rounded-md border">
            <table className="w-full min-w-[64rem] border-collapse text-sm">
                <thead className="sticky top-0 z-10 bg-muted/95 backdrop-blur">
                    <tr className="text-left">
                        <th className="px-3 py-2 font-medium">Persona</th>
                        <th className="px-3 py-2 font-medium">Cuenta</th>
                        <th className="px-3 py-2 text-right font-medium">Total</th>
                        {SECCIONES.map((s) => (
                            <th key={s} className="px-3 py-2 text-right font-medium">
                                {NOMBRE_DE_SECCION[s]}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {personas.length === 0 && <Vacia columnas={columnas} />}
                    {personas.map((p, i) => (
                        // Cada fila puede traer delante la cabecera de su cuenta,
                        // así que son DOS `<tr>` y hace falta un `Fragment` con
                        // llave: `<>` no la admite y React se queja por cada fila.
                        <Fragment key={p.personaId}>
                            {agrupada && abreCuenta(personas, i) && (
                                <FilaDeCuenta persona={p} columnas={columnas} />
                            )}
                            <tr className="border-t">
                                <td className="px-3 py-2">
                                    <Persona persona={p} />
                                </td>
                                <td className="px-3 py-2 text-xs">
                                    <NombreDeCuenta persona={p} />
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
                        </Fragment>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

/** Qué hizo en ese tiempo, con lo que la plataforma ya registra. */
function TablaDeAcciones({
    personas,
    agrupada = false,
}: {
    personas: JornadaDeUnaPersona[];
    agrupada?: boolean;
}) {
    const columnas = 2 + TIPOS_DE_ACCION.length;
    return (
        <div className="shrink-0 overflow-auto rounded-md border">
            <table className="w-full min-w-[64rem] border-collapse text-sm">
                <thead className="sticky top-0 z-10 bg-muted/95 backdrop-blur">
                    <tr className="text-left">
                        <th className="px-3 py-2 font-medium">Persona</th>
                        <th className="px-3 py-2 font-medium">Cuenta</th>
                        {TIPOS_DE_ACCION.map((t) => (
                            <th key={t} className="px-3 py-2 text-right font-medium">
                                {NOMBRE_DE_ACCION[t]}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {personas.length === 0 && <Vacia columnas={columnas} />}
                    {personas.map((p, i) => (
                        // Cada fila puede traer delante la cabecera de su cuenta,
                        // así que son DOS `<tr>` y hace falta un `Fragment` con
                        // llave: `<>` no la admite y React se queja por cada fila.
                        <Fragment key={p.personaId}>
                            {agrupada && abreCuenta(personas, i) && (
                                <FilaDeCuenta persona={p} columnas={columnas} />
                            )}
                            <tr className="border-t">
                                <td className="px-3 py-2">
                                    <Persona persona={p} />
                                </td>
                                <td className="px-3 py-2 text-xs">
                                    <NombreDeCuenta persona={p} />
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
                        </Fragment>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
