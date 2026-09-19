"use client";

import { useMemo, useState } from "react";
import {
    AlertTriangle,
    CheckCheck,
    FileText,
    History,
    Loader2,
    MoreHorizontal,
    Pencil,
    Plus,
    Receipt,
    RefreshCw,
    Send,
    Settings2,
    Trash2,
    Undo2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { AdjuntoEnElAire } from "@/app/(root)/proyectos/_components/BloqueDeAdjuntos";
import {
    cobrarAhoraAction,
    borrarCobroAction,
    confirmarPagoAction,
    crearCobroAction,
    editarCobroAction,
    laCarteraAction,
    losCiclosAction,
    marcarComprobanteAction,
    volverAPendienteAction,
} from "@/actions/cobros-actions";
import {
    diasQueFaltan,
    ETIQUETA_DE_LA_SITUACION,
    estaVencidaDeVerdad,
    fechaCorta,
    montoConMoneda,
    situacionDelCobro,
    type AdjuntoDeCobro,
    type CicloDeCobro,
    type CobroConAdjuntos,
    type ConfigDeCobros,
    type SituacionDelCobro,
} from "@/lib/cobros";
import { FormularioDeCobro, type DatosDelFormulario } from "./FormularioDeCobro";
import { ConfiguracionDeCobros } from "./ConfiguracionDeCobros";
import { BarraDeAcciones, BotonDeCrear } from '@/components/shared/BarraDeAcciones';

/**
 * Los archivos cuyo último intento falló.
 *
 * Se compara con el último envío bueno y no se mira el fallo a secas: un
 * archivo que falló ayer y salió hoy ya no tiene nada que decir, y dejarlo
 * marcado sería un aviso que no se apaga nunca. Las filas de antes de que esto
 * existiera traen las dos fechas en `null` y no salen: «no se sabe» no es «no
 * salió».
 */
function losQueNoSalieron(adjuntos: AdjuntoDeCobro[]): AdjuntoDeCobro[] {
    return adjuntos.filter((a) => {
        if (!a.ultimoFalloEn) return false;
        if (!a.ultimoEnvioEn) return true;
        return new Date(a.ultimoFalloEn).getTime() > new Date(a.ultimoEnvioEn).getTime();
    });
}

/** El color de cada situación. El rojo se reserva para lo que ya se pasó. */
const COLOR: Record<SituacionDelCobro, string> = {
    comprobante: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
    vencida: "bg-red-500/15 text-red-700 dark:text-red-300",
    porVencer: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
    alDia: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
    sinFecha: "bg-muted text-muted-foreground",
};

/**
 * El orden en que se atiende una cartera, y no es el alfabético.
 *
 * Arriba lo que **pide algo de tu parte** —un comprobante que alguien mandó y
 * nadie ha mirado—, luego lo vencido, luego lo que está a punto. Lo que está al
 * día no necesita que lo mires, así que va al final. Ordenar por nombre
 * obligaría a recorrer la lista entera para encontrar las tres filas que
 * importan hoy.
 */
const PESO: Record<SituacionDelCobro, number> = {
    comprobante: 0,
    vencida: 1,
    porVencer: 2,
    sinFecha: 3,
    alDia: 4,
};

const FILTROS: Array<{ clave: SituacionDelCobro | "todos"; etiqueta: string }> = [
    { clave: "todos", etiqueta: "Todos" },
    { clave: "comprobante", etiqueta: "Comprobantes" },
    { clave: "vencida", etiqueta: "Vencidas" },
    { clave: "porVencer", etiqueta: "Por vencer" },
    { clave: "alDia", etiqueta: "Al día" },
];

function normalizar(texto: string): string {
    return texto
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .toLowerCase();
}

export function CobrosClient({
    cartera: carteraInicial,
    config: configInicial,
    linea,
    puedeBorrar,
}: {
    cartera: CobroConAdjuntos[];
    config: ConfigDeCobros;
    linea: string | null;
    puedeBorrar: boolean;
}) {
    const [cartera, setCartera] = useState(carteraInicial);
    const [config, setConfig] = useState(configInicial);
    const [busqueda, setBusqueda] = useState("");
    const [filtro, setFiltro] = useState<SituacionDelCobro | "todos">("todos");
    const [refrescando, setRefrescando] = useState(false);
    const [ocupada, setOcupada] = useState<string | null>(null);

    const [formAbierto, setFormAbierto] = useState(false);
    const [enEdicion, setEnEdicion] = useState<CobroConAdjuntos | null>(null);
    const [ajustesAbiertos, setAjustesAbiertos] = useState(false);
    const [historial, setHistorial] = useState<{ cobro: CobroConAdjuntos; ciclos: CicloDeCobro[] } | null>(
        null,
    );

    // `ahora` se calcula una vez por pintado y se le pasa a todo: con un
    // `new Date()` dentro de cada fila, dos filas de la misma tabla pueden caer
    // a los lados de la medianoche y contradecirse.
    const ahora = useMemo(() => new Date(), [cartera]);

    const visibles = useMemo(() => {
        const texto = normalizar(busqueda.trim());
        return cartera
            .map((c) => ({ c, situacion: situacionDelCobro({ estado: c.estado, vence: c.vence ? new Date(c.vence) : null }, ahora) }))
            .filter(({ c, situacion }) => {
                if (filtro !== "todos" && situacion !== filtro) return false;
                if (!texto) return true;
                return normalizar(`${c.contactoNombre} ${c.contactoTelefono} ${c.concepto}`).includes(texto);
            })
            .sort((a, b) => {
                const peso = PESO[a.situacion] - PESO[b.situacion];
                if (peso !== 0) return peso;
                const fa = a.c.vence ? new Date(a.c.vence).getTime() : Number.MAX_SAFE_INTEGER;
                const fb = b.c.vence ? new Date(b.c.vence).getTime() : Number.MAX_SAFE_INTEGER;
                return fa - fb;
            });
    }, [cartera, busqueda, filtro, ahora]);

    const conteos = useMemo(() => {
        const base: Record<string, number> = { todos: cartera.length };
        for (const c of cartera) {
            const s = situacionDelCobro({ estado: c.estado, vence: c.vence ? new Date(c.vence) : null }, ahora);
            base[s] = (base[s] ?? 0) + 1;
        }
        return base;
    }, [cartera, ahora]);

    const refrescar = async () => {
        setRefrescando(true);
        try {
            const res = await laCarteraAction();
            if (res.success && res.data) setCartera(res.data);
            else toast.error(res.message ?? "No se pudo actualizar.");
        } catch (error) {
            console.warn("[cobros] no se pudo refrescar la cartera", { error });
            toast.error("No se pudo actualizar.");
        } finally {
            setRefrescando(false);
        }
    };

    /**
     * Cualquier acción sobre una fila pasa por aquí.
     *
     * Marca la fila como ocupada —para que no se pueda pulsar dos veces— y
     * **convierte un revental en un aviso**: una acción no solo devuelve
     * `success: false`, puede romperse, y entonces el `await` no vuelve y el
     * botón se queda girando para siempre sin decir nada.
     */
    const pedir = async (id: string, hacer: () => Promise<{ success: boolean; message?: string }>) => {
        setOcupada(id);
        try {
            const res = await hacer();
            if (!res.success) {
                toast.error(res.message ?? "No se pudo completar.");
                return false;
            }
            return true;
        } catch (error) {
            console.warn("[cobros] una acción no llegó a volver", { id, error });
            toast.error("No se pudo completar.");
            return false;
        } finally {
            setOcupada(null);
        }
    };

    /**
     * «Cobrar ahora», y **lo que pasó con los archivos se dice**.
     *
     * El cobro sale aunque un adjunto no —el texto es lo que hay que entregar—,
     * así que un «Cobro enviado» a secas dejaría al asesor creyendo que el
     * cliente recibió la factura cuando no la recibió. El motivo de cada archivo
     * queda además en su propia fila, debajo del archivo.
     */
    const cobrarAhoraConAviso = async (id: string) => {
        setOcupada(id);
        try {
            const res = await cobrarAhoraAction(id);
            if (!res.success || !res.data) {
                toast.error(res.message ?? "No se pudo enviar.");
                return null;
            }
            const { adjuntosEnviados, adjuntosFallidos } = res.data;
            if (adjuntosFallidos > 0) {
                toast.warning(
                    `Cobro enviado, pero ${adjuntosFallidos} ${adjuntosFallidos === 1 ? "archivo no salió" : "archivos no salieron"}.`,
                );
            } else if (adjuntosEnviados > 0) {
                toast.success(
                    `Cobro enviado con ${adjuntosEnviados} ${adjuntosEnviados === 1 ? "archivo" : "archivos"}.`,
                );
            } else {
                toast.success("Cobro enviado.");
            }
            return res.data;
        } catch (error) {
            console.warn("[cobros] cobrar ahora no llegó a volver", { id, error });
            toast.error("No se pudo enviar.");
            return null;
        } finally {
            setOcupada(null);
        }
    };

    const guardarDelFormulario = async (datos: DatosDelFormulario, enElAire: AdjuntoEnElAire[]) => {
        if (enEdicion) {
            const res = await editarCobroAction(enEdicion.id, datos);
            if (!res.success) {
                toast.error(res.message ?? "No se pudo guardar.");
                return false;
            }
            toast.success("Cobro actualizado.");
            await refrescar();
            return true;
        }

        const res = await crearCobroAction(datos, enElAire);
        if (!res.success) {
            toast.error(res.message ?? "No se pudo crear.");
            return false;
        }
        toast.success("Cobro creado.");
        await refrescar();
        return true;
    };

    const verHistorial = async (cobro: CobroConAdjuntos) => {
        const res = await losCiclosAction(cobro.id);
        if (!res.success || !res.data) {
            toast.error(res.message ?? "No se pudo leer el historial.");
            return;
        }
        setHistorial({ cobro, ciclos: res.data });
    };

    const confirmar = async (cobro: CobroConAdjuntos) => {
        const antes = cobro.estado === "comprobante" ? "comprobante" : "pendiente";
        // Se manda el vencimiento que esta fila tenía cuando se pintó: es la
        // llave del ciclo que se está cerrando, y lo que evita que dos
        // confirmaciones a la vez salten el vencimiento dos veces.
        const ok = await pedir(cobro.id, () => confirmarPagoAction(cobro.id, antes, cobro.vence));
        if (!ok) return;
        toast.success("Pago confirmado. El vencimiento saltó al ciclo siguiente.");
        await refrescar();
    };

    return (
        <div data-full-bleed className="flex h-full min-w-0 w-full flex-col gap-2">
            {/* La barra es `BarraDeAcciones`, como el resto de la plataforma.
                Antes estaba escrita a mano aquí: mismo reparto, pero con el
                botón de crear pegado al buscador en vez de a la derecha. */}
            <BarraDeAcciones
                filtros={
                    <>
                        <Input
                            value={busqueda}
                            onChange={(e) => setBusqueda(e.target.value)}
                            placeholder="Buscar cliente…"
                            className="h-10 w-full shrink-0 sm:w-64"
                        />
                        {FILTROS.map((f) => (
                            <button
                                key={f.clave}
                                type="button"
                                onClick={() => setFiltro(f.clave)}
                                className={cn(
                                    "shrink-0 rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors",
                                    filtro === f.clave
                                        ? "bg-muted text-foreground"
                                        : "text-muted-foreground hover:text-foreground",
                                )}
                            >
                                {f.etiqueta}
                                <span className="ml-1.5 text-xs opacity-70">
                                    {conteos[f.clave] ?? 0}
                                </span>
                            </button>
                        ))}
                    </>
                }
                crear={
                    <BotonDeCrear
                        onClick={() => {
                            setEnEdicion(null);
                            setFormAbierto(true);
                        }}
                    >
                        Nuevo cobro
                    </BotonDeCrear>
                }
                acciones={
                    <div className="flex items-center gap-2">
                        <Button
                            variant="outline"
                            size="icon"
                            className="h-10 w-10 shrink-0"
                            onClick={() => void refrescar()}
                            title="Actualizar"
                            aria-label="Actualizar"
                            disabled={refrescando}
                        >
                            <RefreshCw className={cn("h-4 w-4", refrescando && "animate-spin")} />
                        </Button>
                        <Button
                            variant="outline"
                            size="icon"
                            className="h-10 w-10 shrink-0"
                            onClick={() => setAjustesAbiertos(true)}
                            title="Configuración de cobros"
                            aria-label="Configuración de cobros"
                        >
                            <Settings2 className="h-4 w-4" />
                        </Button>
                    </div>
                }
            />

            {!linea && (
                <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
                    Esta cuenta no tiene una línea de WhatsApp conectada: los cobros no van a salir.
                </p>
            )}

            <div className="min-h-0 flex-1 overflow-auto rounded-lg border">
                <Table>
                    <TableHeader className="sticky top-0 z-10 bg-background">
                        <TableRow>
                            <TableHead>Cliente</TableHead>
                            <TableHead>Concepto</TableHead>
                            <TableHead className="text-right">Monto</TableHead>
                            <TableHead>Vence</TableHead>
                            <TableHead>Estado</TableHead>
                            <TableHead className="text-center">Ciclo</TableHead>
                            <TableHead className="w-10" />
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {visibles.length === 0 && (
                            <TableRow>
                                <TableCell colSpan={7} className="py-10 text-center text-sm text-muted-foreground">
                                    {cartera.length === 0
                                        ? "Todavía no has registrado ningún cobro."
                                        : "Ningún cobro coincide con el filtro."}
                                </TableCell>
                            </TableRow>
                        )}

                        {visibles.map(({ c, situacion }) => {
                            const vence = c.vence ? new Date(c.vence) : null;
                            const faltan = diasQueFaltan(vence, ahora);
                            const pasadaLaGracia = estaVencidaDeVerdad(vence, c.diasDeGracia, ahora);
                            return (
                                <TableRow key={c.id} className={cn(ocupada === c.id && "opacity-60")}>
                                    <TableCell>
                                        <div className="font-medium">{c.contactoNombre}</div>
                                        <div className="text-xs text-muted-foreground">
                                            {c.contactoTelefono}
                                        </div>
                                    </TableCell>
                                    <TableCell className="max-w-[16rem]">
                                        <span className="line-clamp-1" title={c.concepto}>
                                            {c.concepto || "—"}
                                        </span>
                                        {c.adjuntos.length > 0 && (
                                            <span className="mt-0.5 inline-flex items-center gap-1 text-xs text-muted-foreground">
                                                <FileText className="h-3 w-3" />
                                                {c.adjuntos.length}
                                            </span>
                                        )}
                                        {/*
                                          Los archivos que no salieron, y POR QUÉ.
                                          El motivo es propio de ESE archivo —una
                                          dirección que no sirve, un rechazo del
                                          proveedor— y sin él, un adjunto que el
                                          cliente no recibió se lee como que la
                                          función está rota. Misma regla que el
                                          motivo de una nota de voz sin
                                          transcribir: lo que es de esa fila se
                                          explica en esa fila.
                                        */}
                                        {losQueNoSalieron(c.adjuntos).map((a) => (
                                            <span
                                                key={a.id}
                                                className="mt-0.5 flex items-center gap-1 text-xs text-amber-600 dark:text-amber-500"
                                                title={a.ultimoFallo ?? undefined}
                                            >
                                                <AlertTriangle className="h-3 w-3 shrink-0" />
                                                <span className="line-clamp-1">
                                                    No salió: {a.nombre}
                                                </span>
                                            </span>
                                        ))}
                                    </TableCell>
                                    <TableCell className="whitespace-nowrap text-right tabular-nums">
                                        {montoConMoneda(c.monto, c.moneda) || "—"}
                                    </TableCell>
                                    <TableCell className="whitespace-nowrap">
                                        <div>{fechaCorta(vence) || "—"}</div>
                                        {faltan !== null && (
                                            <div className="text-xs text-muted-foreground">
                                                {faltan === 0
                                                    ? "hoy"
                                                    : faltan > 0
                                                      ? `en ${faltan} d`
                                                      : `hace ${Math.abs(faltan)} d`}
                                                {pasadaLaGracia && " · pasó la gracia"}
                                            </div>
                                        )}
                                    </TableCell>
                                    <TableCell>
                                        <span
                                            className={cn(
                                                "inline-flex rounded-full px-2 py-0.5 text-xs font-medium",
                                                COLOR[situacion],
                                            )}
                                        >
                                            {ETIQUETA_DE_LA_SITUACION[situacion]}
                                        </span>
                                    </TableCell>
                                    <TableCell className="text-center text-sm tabular-nums">
                                        <span title={`${c.diasDeLicencia} días de licencia, ${c.diasDeGracia} de gracia`}>
                                            {c.ciclosPagados}
                                        </span>
                                    </TableCell>
                                    <TableCell>
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <Button variant="ghost" size="icon" className="h-8 w-8">
                                                    {ocupada === c.id ? (
                                                        <Loader2 className="h-4 w-4 animate-spin" />
                                                    ) : (
                                                        <MoreHorizontal className="h-4 w-4" />
                                                    )}
                                                </Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent
                                                align="end"
                                                style={{
                                                    maxHeight:
                                                        "min(70vh, var(--radix-dropdown-menu-content-available-height))",
                                                }}
                                                className="overflow-y-auto"
                                            >
                                                <DropdownMenuItem
                                                    onClick={async () => {
                                                        const res = await cobrarAhoraConAviso(c.id);
                                                        // Los archivos se anotan en su fila, así que
                                                        // hay que releer para pintar el aviso de los
                                                        // que no salieron.
                                                        if (res && res.adjuntosFallidos > 0) await refrescar();
                                                    }}
                                                >
                                                    <Send className="mr-2 h-4 w-4" />
                                                    Cobrar ahora
                                                </DropdownMenuItem>

                                                {c.estado === "pendiente" ? (
                                                    <DropdownMenuItem
                                                        onClick={async () => {
                                                            const ok = await pedir(c.id, () =>
                                                                marcarComprobanteAction(c.id),
                                                            );
                                                            if (ok) await refrescar();
                                                        }}
                                                    >
                                                        <Receipt className="mr-2 h-4 w-4" />
                                                        Llegó el comprobante
                                                    </DropdownMenuItem>
                                                ) : (
                                                    <DropdownMenuItem
                                                        onClick={async () => {
                                                            const ok = await pedir(c.id, () =>
                                                                volverAPendienteAction(c.id),
                                                            );
                                                            if (ok) await refrescar();
                                                        }}
                                                    >
                                                        <Undo2 className="mr-2 h-4 w-4" />
                                                        No era: volver a pendiente
                                                    </DropdownMenuItem>
                                                )}

                                                <DropdownMenuItem onClick={() => void confirmar(c)}>
                                                    <CheckCheck className="mr-2 h-4 w-4" />
                                                    Confirmar pago
                                                </DropdownMenuItem>

                                                <DropdownMenuSeparator />

                                                <DropdownMenuItem onClick={() => void verHistorial(c)}>
                                                    <History className="mr-2 h-4 w-4" />
                                                    Historial de ciclos
                                                </DropdownMenuItem>
                                                <DropdownMenuItem
                                                    onClick={() => {
                                                        setEnEdicion(c);
                                                        setFormAbierto(true);
                                                    }}
                                                >
                                                    <Pencil className="mr-2 h-4 w-4" />
                                                    Editar
                                                </DropdownMenuItem>

                                                {puedeBorrar && (
                                                    <>
                                                        <DropdownMenuSeparator />
                                                        <DropdownMenuItem
                                                            className="text-destructive focus:text-destructive"
                                                            onClick={async () => {
                                                                const ok = await pedir(c.id, () =>
                                                                    borrarCobroAction(c.id),
                                                                );
                                                                if (ok) {
                                                                    toast.success("Cobro eliminado.");
                                                                    setCartera((prev) =>
                                                                        prev.filter((x) => x.id !== c.id),
                                                                    );
                                                                }
                                                            }}
                                                        >
                                                            <Trash2 className="mr-2 h-4 w-4" />
                                                            Eliminar
                                                        </DropdownMenuItem>
                                                    </>
                                                )}
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    </TableCell>
                                </TableRow>
                            );
                        })}
                    </TableBody>
                </Table>
            </div>

            <FormularioDeCobro
                abierto={formAbierto}
                cobro={enEdicion}
                userId={config.ownerId}
                onCerrar={() => {
                    setFormAbierto(false);
                    setEnEdicion(null);
                }}
                onGuardar={guardarDelFormulario}
            />

            <ConfiguracionDeCobros
                abierto={ajustesAbiertos}
                config={config}
                linea={linea}
                onCerrar={() => setAjustesAbiertos(false)}
                onGuardado={setConfig}
            />

            {historial && (
                <HistorialDeCiclos
                    cobro={historial.cobro}
                    ciclos={historial.ciclos}
                    onCerrar={() => setHistorial(null)}
                />
            )}
        </div>
    );
}

/**
 * El historial de ciclos: lo que recuerda cuánto lleva pagando este cliente.
 *
 * Es un `Dialog` de verdad, no un `div` con fondo oscuro puesto a mano. Aquello
 * se cerraba solo con el clic de fuera: sin Escape, sin foco atrapado dentro y
 * sin que un lector de pantalla supiera que se había abierto nada. Y es el
 * tercer diálogo de Cobros, así que con el componente comparte también el pie
 * —`DialogFooter`, con «Cerrar» donde va—.
 */
function HistorialDeCiclos({
    cobro,
    ciclos,
    onCerrar,
}: {
    cobro: CobroConAdjuntos;
    ciclos: CicloDeCobro[];
    onCerrar: () => void;
}) {
    return (
        <Dialog open onOpenChange={(v) => !v && onCerrar()}>
            <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-md">
                <DialogHeader>
                    <DialogTitle className="text-base">Ciclos pagados</DialogTitle>
                    <DialogDescription>{cobro.contactoNombre}</DialogDescription>
                </DialogHeader>

                {ciclos.length === 0 ? (
                    <p className="py-6 text-center text-sm text-muted-foreground">
                        Todavía no se ha confirmado ningún pago.
                    </p>
                ) : (
                    <ul className="space-y-2">
                        {ciclos.map((ciclo) => (
                            <li key={ciclo.id} className="rounded-md border px-3 py-2 text-sm">
                                <div className="flex items-center justify-between">
                                    <span className="font-medium">
                                        {montoConMoneda(ciclo.monto, ciclo.moneda) || "—"}
                                    </span>
                                    <span className="text-xs text-muted-foreground">
                                        {fechaCorta(new Date(ciclo.confirmadaEn))}
                                    </span>
                                </div>
                                <div className="text-xs text-muted-foreground">
                                    Venció {fechaCorta(ciclo.vencia ? new Date(ciclo.vencia) : null) || "—"} ·
                                    saltó a {fechaCorta(new Date(ciclo.siguienteVence))}
                                </div>
                            </li>
                        ))}
                    </ul>
                )}

                <DialogFooter className="pt-2">
                    <Button variant="outline" onClick={onCerrar}>
                        Cerrar
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
