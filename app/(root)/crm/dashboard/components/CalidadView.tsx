"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Download, Loader2, MessageSquare, RefreshCw, Search, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BarraDeAcciones } from "@/components/shared/BarraDeAcciones";
import { PastillaDeFiltro, TONO_TODOS, type TonoDePastilla } from "@/components/shared/PastillaDeFiltro";
import { InsigniaDeLinea } from "@/components/shared/InsigniaDeLinea";
import { laInsigniaDeLaFila } from "@/lib/agenda-de-la-familia";
import { calidadDelCrmAction, evaluarCalidadAhoraAction, type CalidadDelCrm } from "@/actions/calidad-actions";
import { laDuracionLegible, laClaveDelAsesor, UMBRAL_A_MEJORAR } from "@/lib/calidad-de-conversaciones";
import { useExportarConversaciones } from "@/hooks/useExportarConversaciones";
import { MenuDeExportar } from "@/components/shared/MenuDeExportar";
import type { FormatoDeExportacion } from "@/lib/formatos-de-exportacion";
import { cn } from "@/lib/utils";

/**
 * CRM › Calidad: el QA automático de las conversaciones.
 *
 * Arriba, **por asesor**: cuántas conversaciones, su puntaje promedio y sus
 * tiempos promedio de primera respuesta y de resolución. Debajo, **las
 * conversaciones evaluadas**, cada una con su nota y lo que habría que hacer
 * distinto, para abrirla y ver el ejemplo.
 *
 * Ni tarjetas ni fila de métricas encima: la regla de la casa es que una cifra
 * que no filtra no va en la cabecera. Aquí las cifras SON el contenido —la
 * tabla de asesores— y pulsar un asesor filtra la lista de abajo.
 *
 * Nada de esto se calcula en el navegador: los tiempos y el puntaje salen del
 * servidor (`lib/calidad-de-conversaciones.ts`), y aquí solo se filtra lo que
 * ya llegó.
 */
const TONO_A_MEJORAR: TonoDePastilla = { hex: "#DC2626" };

function colorDelPuntaje(p: number | null): string {
    if (p === null) return "text-muted-foreground";
    if (p < UMBRAL_A_MEJORAR) return "text-red-600 dark:text-red-400";
    if (p < 80) return "text-amber-600 dark:text-amber-400";
    return "text-emerald-600 dark:text-emerald-400";
}

const RESOLVIO: Record<string, string> = { si: "Sí", parcial: "Parcial", no: "No" };

export function CalidadView({
    cuentas,
    unificado,
    nombresDeCuenta,
}: {
    cuentas: string[];
    unificado: boolean;
    nombresDeCuenta: Record<string, string>;
}) {
    const [dias, setDias] = useState<"7" | "30" | "90">("30");
    const [datos, setDatos] = useState<CalidadDelCrm | null>(null);
    const [cargando, setCargando] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [soloAMejorar, setSoloAMejorar] = useState(false);
    const [asesor, setAsesor] = useState<string | null>(null);
    const [busqueda, setBusqueda] = useState("");
    const [evaluando, setEvaluando] = useState(false);
    const { exportando, exportar } = useExportarConversaciones();

    const cargar = useCallback(async () => {
        setCargando(true);
        try {
            const r = await calidadDelCrmAction(cuentas, Number(dias));
            if (r.success) {
                setDatos(r.data);
                setError(null);
            } else setError(r.message);
        } catch {
            setError("No se pudo cargar la calidad. Revisa la conexión.");
        } finally {
            setCargando(false);
        }
    }, [cuentas, dias]);

    useEffect(() => {
        void cargar();
    }, [cargar]);

    const evaluarAhora = async () => {
        if (evaluando) return;
        setEvaluando(true);
        try {
            const r = await evaluarCalidadAhoraAction(cuentas);
            if (r.success) toast.success(r.message);
            else toast.error(r.message);
        } catch {
            toast.error("No se pudo pedir la evaluación. Revisa la conexión.");
        } finally {
            setEvaluando(false);
        }
    };

    const conversaciones = useMemo(() => datos?.conversaciones ?? [], [datos]);
    const aMejorar = useMemo(() => conversaciones.filter((c) => c.ejemplo).length, [conversaciones]);
    const visibles = useMemo(() => {
        const q = busqueda.trim().toLowerCase();
        return conversaciones.filter((c) => {
            if (soloAMejorar && !c.ejemplo) return false;
            if (asesor && laClaveDelAsesor(c) !== asesor) return false;
            if (q && !`${c.contacto ?? ""} ${c.remoteJid} ${c.asesorNombre}`.toLowerCase().includes(q)) return false;
            return true;
        });
    }, [conversaciones, soloAMejorar, asesor, busqueda]);
    const asesorElegido = datos?.asesores.find((a) => a.clave === asesor) ?? null;

    const exportarLasDeLaLista = (formato: FormatoDeExportacion) =>
        void exportar(
            visibles.map((c) => ({ instanceName: c.instanceName, remoteJid: c.remoteJid })),
            formato,
        );

    return (
        <div data-vista-calidad className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
            <BarraDeAcciones
                buscador={
                    <div className="relative w-56 sm:w-72">
                        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                            value={busqueda}
                            onChange={(e) => setBusqueda(e.target.value)}
                            placeholder="Buscar contacto o asesor"
                            className="h-9 pl-8"
                        />
                    </div>
                }
                filtros={
                    <>
                        <PastillaDeFiltro
                            valor="todas"
                            rotulo="Todas"
                            activa={!soloAMejorar}
                            alPulsar={() => setSoloAMejorar(false)}
                            tono={TONO_TODOS}
                            cuenta={conversaciones.length}
                            tabular
                        />
                        <PastillaDeFiltro
                            valor="a-mejorar"
                            rotulo="A mejorar"
                            activa={soloAMejorar}
                            alPulsar={() => setSoloAMejorar(true)}
                            tono={TONO_A_MEJORAR}
                            cuenta={aMejorar}
                            title={`Conversaciones con puntaje por debajo de ${UMBRAL_A_MEJORAR}`}
                            tabular
                        />
                        {asesorElegido ? (
                            <button
                                type="button"
                                data-filtro-asesor
                                onClick={() => setAsesor(null)}
                                className="inline-flex h-7 items-center gap-1 rounded-full border border-border px-2.5 text-xs"
                                title="Quitar el filtro de asesor"
                            >
                                {asesorElegido.nombre}
                                <X className="h-3 w-3" />
                            </button>
                        ) : null}
                        <Select value={dias} onValueChange={(v) => setDias(v as "7" | "30" | "90")}>
                            <SelectTrigger className="h-8 w-[8.5rem]" aria-label="Periodo">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="7">Últimos 7 días</SelectItem>
                                <SelectItem value="30">Últimos 30 días</SelectItem>
                                <SelectItem value="90">Últimos 90 días</SelectItem>
                            </SelectContent>
                        </Select>
                    </>
                }
                secundarias={
                    <>
                        <MenuDeExportar onElegir={exportarLasDeLaLista}>
                            <Button
                                type="button"
                                variant="outline"
                                size="icon"
                                aria-label="Exportar las conversaciones de la lista"
                                title="Exportar las conversaciones de la lista"
                                disabled={exportando || visibles.length === 0}
                            >
                                {exportando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                            </Button>
                        </MenuDeExportar>
                        <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            aria-label="Actualizar"
                            title="Actualizar"
                            onClick={() => void cargar()}
                            disabled={cargando}
                        >
                            <RefreshCw className={cn("h-4 w-4", cargando && "animate-spin")} />
                        </Button>
                        <Button type="button" onClick={() => void evaluarAhora()} disabled={evaluando}>
                            {evaluando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                            <span className="hidden sm:inline">Evaluar ahora</span>
                        </Button>
                    </>
                }
            />

            {error ? (
                <p data-error-calidad className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
                    {error}
                </p>
            ) : null}

            {cargando && !datos ? (
                <div className="flex items-center justify-center p-10 text-sm text-muted-foreground">
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Cargando la calidad…
                </div>
            ) : datos && conversaciones.length === 0 ? (
                <div data-calidad-vacia className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
                    Todavía no hay conversaciones evaluadas en este periodo. La IA las revisa en el corte semanal del
                    reporte; pulsa «Evaluar ahora» para no esperar.
                </div>
            ) : datos ? (
                <>
                    <section data-calidad-por-asesor className="rounded-lg border">
                        <h3 className="border-b px-3 py-2 text-sm font-semibold">Por asesor</h3>
                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Asesor</TableHead>
                                        <TableHead className="text-center">Conversaciones</TableHead>
                                        <TableHead className="text-center">Puntaje</TableHead>
                                        <TableHead className="text-center">1.ª respuesta</TableHead>
                                        <TableHead className="text-center">Resolución</TableHead>
                                        <TableHead className="text-center">A mejorar</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {datos.asesores.map((a) => (
                                        <TableRow
                                            key={a.clave}
                                            data-fila-asesor={a.clave}
                                            onClick={() => setAsesor(asesor === a.clave ? null : a.clave)}
                                            className={cn("cursor-pointer", asesor === a.clave && "bg-muted")}
                                            title="Ver solo sus conversaciones"
                                        >
                                            <TableCell className="whitespace-nowrap">{a.nombre}</TableCell>
                                            <TableCell className="text-center tabular-nums">{a.conversaciones}</TableCell>
                                            <TableCell className={cn("text-center font-semibold tabular-nums", colorDelPuntaje(a.puntajePromedio))}>
                                                {a.puntajePromedio ?? "—"}
                                            </TableCell>
                                            <TableCell className="text-center tabular-nums">{laDuracionLegible(a.primeraRespuestaPromedioSeg)}</TableCell>
                                            <TableCell className="text-center tabular-nums">{laDuracionLegible(a.resolucionPromedioSeg)}</TableCell>
                                            <TableCell className="text-center tabular-nums">{a.aMejorar}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    </section>

                    <section data-calidad-conversaciones className="rounded-lg border">
                        <h3 className="border-b px-3 py-2 text-sm font-semibold">
                            Conversaciones {soloAMejorar ? "a mejorar" : "evaluadas"} ({visibles.length})
                        </h3>
                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Contacto</TableHead>
                                        <TableHead>Asesor</TableHead>
                                        <TableHead className="text-center">Puntaje</TableHead>
                                        <TableHead className="text-center">1.ª respuesta</TableHead>
                                        <TableHead className="text-center">Resolución</TableHead>
                                        <TableHead className="text-center">Resolvió</TableHead>
                                        <TableHead className="w-full">Qué mejorar</TableHead>
                                        <TableHead className="text-center">Acciones</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {visibles.map((c) => (
                                        <TableRow key={c.id} data-fila-conversacion={c.id} data-ejemplo={c.ejemplo ? "si" : "no"}>
                                            <TableCell className="whitespace-nowrap">
                                                <span className="inline-flex items-center gap-1.5">
                                                    {c.contacto || c.remoteJid.split("@")[0]}
                                                    {unificado ? (
                                                        // La MISMA marca que Llamadas y la Agenda, con su misma regla.
                                                        <InsigniaDeLinea {...laInsigniaDeLaFila(c.instanceName, nombresDeCuenta[c.cuentaId])} />
                                                    ) : null}
                                                </span>
                                            </TableCell>
                                            <TableCell className="whitespace-nowrap">{c.asesorNombre}</TableCell>
                                            <TableCell className={cn("text-center font-semibold tabular-nums", colorDelPuntaje(c.puntaje))}>
                                                {c.puntaje ?? "—"}
                                            </TableCell>
                                            <TableCell className="text-center tabular-nums">{laDuracionLegible(c.primeraRespuestaSeg)}</TableCell>
                                            <TableCell className="text-center tabular-nums">{laDuracionLegible(c.resolucionSeg)}</TableCell>
                                            <TableCell className="text-center">{c.resolvio ? RESOLVIO[c.resolvio] : "—"}</TableCell>
                                            <TableCell className="min-w-[16rem] text-sm text-muted-foreground">{c.mejora || "—"}</TableCell>
                                            <TableCell>
                                                <div className="flex items-center justify-center gap-1">
                                                    <Button asChild variant="ghost" size="icon" className="h-7 w-7" title="Abrir la conversación">
                                                        <Link
                                                            prefetch={false}
                                                            href={`/chats?jid=${encodeURIComponent(c.remoteJid)}&instance=${encodeURIComponent(c.instanceName)}`}
                                                            aria-label="Abrir la conversación"
                                                        >
                                                            <MessageSquare className="h-4 w-4" />
                                                        </Link>
                                                    </Button>
                                                    <MenuDeExportar
                                                        onElegir={(formato) =>
                                                            void exportar([{ instanceName: c.instanceName, remoteJid: c.remoteJid }], formato)
                                                        }
                                                    >
                                                        <Button
                                                            type="button"
                                                            variant="ghost"
                                                            size="icon"
                                                            className="h-7 w-7"
                                                            title="Exportar la conversación"
                                                            aria-label="Exportar la conversación"
                                                            disabled={exportando}
                                                        >
                                                            <Download className="h-4 w-4" />
                                                        </Button>
                                                    </MenuDeExportar>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    </section>
                </>
            ) : null}

            {datos?.ultimaEvaluacion ? (
                <p className="text-xs text-muted-foreground">
                    Última evaluación: {new Date(datos.ultimaEvaluacion).toLocaleString("es")}. La IA revisa las conversaciones
                    en el corte semanal del reporte y cuando pulsas «Evaluar ahora». El puntaje combina saludo, tono, si se resolvió y los
                    tiempos de primera respuesta y de resolución.
                </p>
            ) : null}
        </div>
    );
}
