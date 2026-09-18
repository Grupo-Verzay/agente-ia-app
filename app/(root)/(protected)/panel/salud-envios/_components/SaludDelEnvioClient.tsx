"use client";

import { useState, useTransition } from "react";
import { AlertTriangle, CheckCircle2, RefreshCw, XCircle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import {
    NOMBRE_DEL_PROVEEDOR,
    NOMBRE_DEL_TIPO,
    PROVEEDORES,
} from "@/lib/salud-del-envio";
import { leerLaSaludDelEnvio, type VistaDeLaSalud } from "@/actions/salud-del-envio-actions";

const VENTANAS = [1, 3, 7, 14, 30];

/** «Todos» es una cadena y no `""`: Radix no admite un `SelectItem` vacío. */
const TODOS = "__todos__";

function laFecha(valor: Date | string) {
    const fecha = valor instanceof Date ? valor : new Date(valor);
    return fecha.toLocaleString("es-CO", {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
    });
}

export function SaludDelEnvioClient({ inicial }: { inicial: VistaDeLaSalud }) {
    const [vista, setVista] = useState(inicial);
    const [dias, setDias] = useState(String(inicial.dias));
    const [proveedor, setProveedor] = useState(TODOS);
    const [cuentaId, setCuentaId] = useState(TODOS);
    const [estado, setEstado] = useState(TODOS);
    const [cargando, empezar] = useTransition();
    const [fallo, setFallo] = useState<string | null>(null);

    const pedir = (cambios: Partial<Record<"dias" | "proveedor" | "cuentaId" | "estado", string>>) => {
        const siguiente = { dias, proveedor, cuentaId, estado, ...cambios };
        setDias(siguiente.dias);
        setProveedor(siguiente.proveedor);
        setCuentaId(siguiente.cuentaId);
        setEstado(siguiente.estado);

        empezar(async () => {
            // Ninguna llamada a una acción puede dejar el botón colgado: una
            // acción no solo devuelve un fallo, puede reventar, y entonces el
            // `await` se rompe y nada vuelve a su sitio.
            try {
                const datos = await leerLaSaludDelEnvio({
                    dias: Number(siguiente.dias),
                    proveedor: siguiente.proveedor === TODOS ? null : siguiente.proveedor,
                    cuentaId: siguiente.cuentaId === TODOS ? null : siguiente.cuentaId,
                    estado: siguiente.estado === TODOS ? null : siguiente.estado,
                });
                if (!datos) {
                    setFallo("No se pudo leer el registro de envíos. Vuelve a intentarlo.");
                    return;
                }
                setFallo(null);
                setVista(datos);
            } catch (error) {
                setFallo(error instanceof Error ? error.message : "No se pudo leer el registro.");
            }
        });
    };

    return (
        <div className="flex h-full min-h-0 flex-col gap-4 overflow-y-auto p-4">
            {/* ── Los avisos destacados ───────────────────────────────────── */}
            {vista.avisos.length > 0 && (
                <div className="flex flex-col gap-2">
                    {vista.avisos.map((aviso) => (
                        <div
                            key={`${aviso.proveedor}-${aviso.clase}`}
                            className="flex items-start gap-3 rounded-lg border border-red-500/40 bg-red-500/10 p-3"
                        >
                            <AlertTriangle className="mt-0.5 size-5 shrink-0 text-red-500" />
                            <div className="min-w-0">
                                <p className="text-sm font-semibold text-red-600 dark:text-red-400">
                                    {aviso.clase === "sin_acierto"
                                        ? "Un proveedor no está entregando"
                                        : "Demasiados envíos rebotando"}
                                </p>
                                <p className="text-sm text-muted-foreground">{aviso.texto}</p>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* ── El resumen por proveedor ────────────────────────────────── */}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {vista.resumen.length === 0 ? (
                    <p className="text-sm text-muted-foreground sm:col-span-2 lg:col-span-4">
                        No hay ningún envío automático en esta ventana. Eso puede ser normal —o la
                        señal de que nada está saliendo—: amplía los días para distinguirlo.
                    </p>
                ) : (
                    vista.resumen.map((r) => (
                        <div key={r.proveedor} className="rounded-lg border p-3">
                            <p className="text-sm font-semibold">
                                {NOMBRE_DEL_PROVEEDOR[r.proveedor]}
                            </p>
                            <div className="mt-2 flex items-baseline gap-3">
                                <span className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                                    {r.salieron}
                                </span>
                                <span className="text-xs text-muted-foreground">salieron</span>
                                <span
                                    className={cn(
                                        "text-2xl font-bold",
                                        r.fallaron > 0
                                            ? "text-red-600 dark:text-red-400"
                                            : "text-muted-foreground",
                                    )}
                                >
                                    {r.fallaron}
                                </span>
                                <span className="text-xs text-muted-foreground">fallaron</span>
                            </div>
                            <p className="mt-1 text-xs text-muted-foreground">
                                {/* Sin intentos no hay tasa: un «0 %» diría que todo va bien,
                                    que es el peor número posible en esta pantalla. */}
                                {r.tasaDeFallo === null
                                    ? "Sin envíos todavía"
                                    : `${Math.round(r.tasaDeFallo * 100)} % de fallo`}
                                {r.ultimoBueno
                                    ? ` · último correcto ${laFecha(r.ultimoBueno)}`
                                    : " · ningún envío correcto"}
                            </p>
                        </div>
                    ))
                )}
            </div>

            {/* ── Los filtros ─────────────────────────────────────────────── */}
            <div className="flex flex-wrap items-center gap-2">
                <Select value={dias} onValueChange={(v) => pedir({ dias: v })}>
                    <SelectTrigger className="w-[9rem]">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {VENTANAS.filter((d) => d <= vista.maximoDeDias).map((d) => (
                            <SelectItem key={d} value={String(d)}>
                                {d === 1 ? "Último día" : `Últimos ${d} días`}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>

                <Select value={proveedor} onValueChange={(v) => pedir({ proveedor: v })}>
                    <SelectTrigger className={cn("w-[11rem]", proveedor !== TODOS && "text-blue-600")}>
                        <SelectValue placeholder="Proveedor" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value={TODOS}>Todos los proveedores</SelectItem>
                        {PROVEEDORES.map((p) => (
                            <SelectItem key={p} value={p}>
                                {NOMBRE_DEL_PROVEEDOR[p]}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>

                <Select value={cuentaId} onValueChange={(v) => pedir({ cuentaId: v })}>
                    <SelectTrigger className={cn("w-[14rem]", cuentaId !== TODOS && "text-blue-600")}>
                        <SelectValue placeholder="Cuenta" />
                    </SelectTrigger>
                    <SelectContent
                        style={{
                            maxHeight:
                                "min(70vh, var(--radix-select-content-available-height))",
                        }}
                    >
                        <SelectItem value={TODOS}>Todas las cuentas</SelectItem>
                        {/* Solo las que aparecen en la ventana: un filtro que ofrece
                            algo tiene que poder enseñarlo. */}
                        {vista.cuentas.map((c) => (
                            <SelectItem key={c.id} value={c.id}>
                                {c.nombre ?? c.id}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>

                <Select value={estado} onValueChange={(v) => pedir({ estado: v })}>
                    <SelectTrigger className={cn("w-[10rem]", estado !== TODOS && "text-blue-600")}>
                        <SelectValue placeholder="Estado" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value={TODOS}>Todos</SelectItem>
                        <SelectItem value="salio">Salieron</SelectItem>
                        <SelectItem value="fallo">Fallaron</SelectItem>
                    </SelectContent>
                </Select>

                <Button
                    variant="outline"
                    size="sm"
                    disabled={cargando}
                    onClick={() => pedir({})}
                    className="shrink-0"
                >
                    {/* Que se vea que se pulsó, antes de que el servidor conteste. */}
                    <RefreshCw className={cn("mr-2 size-4", cargando && "animate-spin")} />
                    {cargando ? "Cargando…" : "Actualizar"}
                </Button>
            </div>

            {fallo && (
                <p className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-sm text-amber-700 dark:text-amber-400">
                    {fallo}
                </p>
            )}

            {/* ── La lista ────────────────────────────────────────────────── */}
            <div className="overflow-x-auto rounded-lg border">
                {/* Dos cosas que van juntas y cada una arregla una punta.
                    `table-fixed`: con el reparto automatico un destinatario como
                    `573001112233@s.whatsapp.net` es un token sin espacios, su
                    ancho minimo manda sobre el `w-*` declarado, `truncate` no
                    llega a recortar nada y la tabla se sale de su caja (medido:
                    1233 px dentro de 1216).
                    Y `min-w-[60rem]` con el scroll del padre: fijado el reparto,
                    en una ventana estrecha lo que se encoge es la ULTIMA
                    columna, y esa es el MOTIVO — medido a 1024 px se quedaba en
                    94 px, que para leer por que reboto un mensaje es lo mismo
                    que no enseñarlo. Son las seis fijas (44rem) mas las 16rem
                    del motivo: por debajo de ahi la tabla se desplaza, que es
                    preferible a recortar justo lo que se viene a leer. */}
                <Table className="min-w-[60rem] table-fixed">
                    <TableHeader>
                        <TableRow>
                            {/* Los anchos estan medidos, no a ojo: con los de la
                                primera version el MOTIVO —que es a lo que se
                                viene a esta pantalla— se quedaba en 156 px, la
                                columna mas estrecha de las siete. Se aprieta lo
                                que se lee de un vistazo para que el motivo
                                respire. */}
                            <TableHead className="w-[6.5rem]">Fecha</TableHead>
                            <TableHead className="w-[7rem]">Tipo</TableHead>
                            <TableHead className="w-[8rem]">Proveedor</TableHead>
                            <TableHead className="w-[9rem]">Cuenta</TableHead>
                            <TableHead className="w-[8rem]">Destinatario</TableHead>
                            <TableHead className="w-[5.5rem]">Estado</TableHead>
                            <TableHead className="min-w-[16rem]">Motivo</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {vista.envios.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">
                                    No hay envíos que coincidan con el filtro.
                                </TableCell>
                            </TableRow>
                        ) : (
                            vista.envios.map((e) => (
                                <TableRow key={e.id}>
                                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                                        {laFecha(e.creadoEn)}
                                    </TableCell>
                                    <TableCell className="text-sm">{NOMBRE_DEL_TIPO[e.tipo]}</TableCell>
                                    <TableCell className="text-sm">
                                        {NOMBRE_DEL_PROVEEDOR[e.proveedor]}
                                        {e.linea && (
                                            <span className="block text-xs text-muted-foreground">
                                                {e.linea}
                                            </span>
                                        )}
                                    </TableCell>
                                    <TableCell className="truncate text-sm" title={e.cuentaNombre ?? e.cuentaId ?? ""}>
                                        {/* La cuenta puede haberse eliminado —no hay clave
                                            foránea a propósito—; entonces queda su id. */}
                                        {e.cuentaNombre ?? e.cuentaId ?? "—"}
                                    </TableCell>
                                    <TableCell className="truncate text-xs text-muted-foreground" title={e.destinatario ?? ""}>
                                        {e.destinatario ?? "—"}
                                    </TableCell>
                                    <TableCell>
                                        {e.salio ? (
                                            <Badge variant="outline" className="border-emerald-500/40 text-emerald-600 dark:text-emerald-400">
                                                <CheckCircle2 className="mr-1 size-3" />
                                                Salió
                                            </Badge>
                                        ) : (
                                            <Badge variant="outline" className="border-red-500/40 text-red-600 dark:text-red-400">
                                                <XCircle className="mr-1 size-3" />
                                                Falló
                                            </Badge>
                                        )}
                                    </TableCell>
                                    <TableCell className="text-xs text-muted-foreground">
                                        {e.motivo ?? ""}
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </div>

            {vista.alTope && (
                <p className="text-xs text-muted-foreground">
                    {/* Lo que se recorta, se dice: sin esto, «faltan envíos» y «esta
                        ventana es grande» se ven exactamente igual. */}
                    La lista viene al tope ({vista.tope} filas). Acota los días o usa un filtro para
                    ver el resto.
                </p>
            )}

            <p className="text-xs text-muted-foreground">
                Se guardan los últimos {vista.maximoDeDias} días. Los envíos que hace una persona a
                mano —el chat de Chats, el modo dueño— no entran aquí: esto es lo que sale solo.
            </p>
        </div>
    );
}
