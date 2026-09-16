import { AlertTriangle, Building2, Clock, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";
import {
    diasPorPersona,
    enPalabras,
    MINUTOS_DE_UNA_JORNADA,
    totalPorPersona,
    type CierreConTiempo,
} from "@/lib/tiempo-de-tarea";
import {
    porCuentaYTipo,
    totalesPorTipo,
    type CuentaConSusTipos,
} from "@/lib/tipo-de-trabajo";

/**
 * Cuánto trabajo lleva cada cuenta y cada persona.
 *
 * Sale del tiempo que se registra al cerrar cada tarea, así que **empieza
 * vacío**: solo cuenta lo cerrado desde que esto existe. Las tareas que ya
 * estaban cerradas no tienen tiempo y no lo van a tener nunca —nadie vuelve a
 * abrir una tarea para apuntarlo—, y eso se dice en vez de dejar pensar que la
 * gente no trabajó.
 *
 * **La puerta no está aquí**: `leerElTrabajo` devuelve `null` a quien no
 * administra la cuenta, así que esto ni se pinta. Importa más que de costumbre
 * porque la marca de las ocho horas **la persona no la ve**, y eso es parte del
 * encargo: es un dato de gestión, y enseñárselo a quien lo produce lo convierte
 * en otra cosa.
 */
export function RepartoDelTrabajo({ cierres }: { cierres: CierreConTiempo[] }) {
    if (cierres.length === 0) {
        return (
            <Marco>
                <p className="text-sm text-muted-foreground">
                    Todavía no hay ninguna tarea cerrada con su tiempo registrado. Se va llenando
                    a medida que el equipo cierra tareas.
                </p>
            </Marco>
        );
    }

    const porCuenta = porCuentaYTipo(cierres);
    const totales = totalesPorTipo(cierres);
    const porPersona = totalPorPersona(cierres);
    const excedidos = diasPorPersona(cierres).filter((d) => d.pasado);
    const internas = cierres.filter((c) => !c.clienteId);

    return (
        <Marco>
            <div className="grid gap-4 lg:grid-cols-2">
                <Columna
                    icono={<Building2 className="h-4 w-4" />}
                    titulo="Por cuenta: montaje y soporte"
                >
                    {/* Sin ninguna cuenta no se dice que no hay ninguna: eso
                        era una frase que ocupaba el sitio de la tabla para
                        contar lo que el conteo de abajo ya dice. Si no hay
                        tabla, el dato ES el conteo de las internas. */}
                    {porCuenta.length > 0 && <TablaDeTipos filas={porCuenta} />}
                    {/* Las internas no se reparten entre cuentas, pero tampoco
                        se esconden: sin esto, la suma de la tabla no cuadra con
                        el total y parece que faltan tareas.
                        El «Y» delante solo cuando hay tabla a la que sumarse:
                        suelto, una frase que empieza por «Y» se lee como si se
                        hubiera perdido lo de antes. */}
                    {internas.length > 0 && (
                        <p
                            className={cn(
                                "text-xs text-muted-foreground",
                                porCuenta.length > 0 && "mt-2",
                            )}
                        >
                            {porCuenta.length > 0 ? "Y " : ""}
                            {internas.length}{" "}
                            {internas.length === 1 ? "tarea interna" : "tareas internas"} sin
                            cuenta ({enPalabras(internas.reduce((t, c) => t + c.minutos, 0))}).
                        </p>
                    )}
                    {/* Lo que no se rellenó no se esconde. Sin esto, dos cuentas
                        con el mismo trabajo salen con cifras distintas solo
                        porque en una se puso el tipo y en la otra no, y eso no
                        se ve por ningún lado. */}
                    {totales.sinTipo.tareas > 0 && (
                        <p className="mt-1 text-xs text-amber-600">
                            {totales.sinTipo.tareas}{" "}
                            {totales.sinTipo.tareas === 1 ? "tarea cerrada" : "tareas cerradas"} sin
                            tipo de trabajo ({enPalabras(totales.sinTipo.minutos)}). Mientras haya
                            tareas sin tipo, el reparto entre montaje y soporte se queda corto.
                        </p>
                    )}
                </Columna>

                <Columna icono={<UserRound className="h-4 w-4" />} titulo="Por persona">
                    <Tabla
                        filas={porPersona.map((p) => ({
                            id: p.id,
                            nombre: p.nombre ?? p.id,
                            tareas: p.tareas,
                            minutos: p.minutos,
                        }))}
                    />
                </Columna>
            </div>

            {excedidos.length > 0 && (
                <div className="mt-4 rounded-lg border border-amber-300/70 bg-amber-50/60 p-3 dark:border-amber-800/70 dark:bg-amber-950/30">
                    <p className="flex items-center gap-2 text-sm font-medium text-amber-700 dark:text-amber-400">
                        <AlertTriangle className="h-4 w-4 shrink-0" />
                        Días por encima de {MINUTOS_DE_UNA_JORNADA / 60} horas
                    </p>
                    <ul className="mt-2 space-y-1">
                        {excedidos.map((d) => (
                            <li
                                key={`${d.personaId}::${d.dia}`}
                                className="flex flex-wrap items-baseline gap-x-2 text-sm"
                            >
                                <span className="font-medium">
                                    {d.personaNombre ?? d.personaId}
                                </span>
                                <span className="text-muted-foreground">{enFecha(d.dia)}</span>
                                <span className="tabular-nums">{enPalabras(d.minutos)}</span>
                                <span className="text-xs text-muted-foreground">
                                    en {d.tareas} {d.tareas === 1 ? "tarea" : "tareas"}
                                </span>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </Marco>
    );
}

/**
 * `YYYY-MM-DD` a algo que se lee.
 *
 * Se parte a mano en vez de `new Date(dia)`: esa cadena se interpreta como UTC
 * y al pintarla en una zona por detrás sale **el día anterior**, que en una
 * lista de días concretos es justo el error que nadie revisa.
 */
function enFecha(dia: string): string {
    const [anio, mes, d] = dia.split("-").map(Number);
    return new Date(anio, mes - 1, d).toLocaleDateString("es-ES", {
        day: "numeric",
        month: "short",
    });
}

function Marco({ children }: { children: React.ReactNode }) {
    return (
        <section className="shrink-0 rounded-xl border bg-card p-4">
            <header className="mb-3 flex flex-wrap items-center gap-2">
                <Clock className="h-[21px] w-[21px] shrink-0 text-muted-foreground" />
                <h2 className="text-[19px] font-semibold">Reparto del trabajo</h2>
                <span className="text-xs text-muted-foreground">interno</span>
            </header>
            {children}
        </section>
    );
}

function Columna({
    icono,
    titulo,
    children,
}: {
    icono: React.ReactNode;
    titulo: string;
    children: React.ReactNode;
}) {
    return (
        <div className="min-w-0">
            <p className="mb-2 flex items-center gap-2 text-sm font-medium text-muted-foreground">
                {icono}
                {titulo}
            </p>
            {children}
        </div>
    );
}

/**
 * Una fila por cuenta, con montaje y soporte en columnas.
 *
 * Es la tabla que contesta la pregunta entera —cuánto cuesta entregar un
 * cliente y cuánto mantenerlo— y por eso van en la MISMA fila: en dos tablas
 * separadas habría que buscar la cuenta dos veces y compararla de memoria.
 *
 * Un cero se pinta apagado y no en blanco: un hueco se lee como «no se sabe»,
 * y aquí sí se sabe — es cero.
 */
function TablaDeTipos({ filas }: { filas: CuentaConSusTipos[] }) {
    const haySinTipo = filas.some((f) => f.sinTipo.tareas > 0);
    return (
        <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
            <table className="w-full min-w-[24rem] text-sm">
                <thead>
                    <tr className="border-b text-left text-xs text-muted-foreground">
                        <th className="py-1.5 pr-3 font-medium">Cuenta</th>
                        <th className="py-1.5 pr-3 font-medium">Montaje</th>
                        <th className="py-1.5 pr-3 font-medium">Soporte</th>
                        {haySinTipo && <th className="py-1.5 font-medium">Sin tipo</th>}
                    </tr>
                </thead>
                <tbody>
                    {filas.map((f) => (
                        <tr key={f.id} className="border-b last:border-0">
                            <td className="py-1.5 pr-3">
                                <span
                                    className="block max-w-[13rem] truncate"
                                    title={f.nombre ?? f.id}
                                >
                                    {f.nombre ?? f.id}
                                </span>
                                <span className="text-xs text-muted-foreground">
                                    {f.total.tareas}{" "}
                                    {f.total.tareas === 1 ? "tarea" : "tareas"}
                                </span>
                            </td>
                            <Casilla dato={f.montaje} />
                            <Casilla dato={f.soporte} />
                            {haySinTipo && <Casilla dato={f.sinTipo} />}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

function Casilla({ dato }: { dato: { tareas: number; minutos: number } }) {
    if (dato.tareas === 0) {
        return <td className="py-1.5 pr-3 tabular-nums text-muted-foreground/50">—</td>;
    }
    return (
        <td className="py-1.5 pr-3 tabular-nums">
            {enPalabras(dato.minutos)}
            <span className="ml-1 text-xs text-muted-foreground">({dato.tareas})</span>
        </td>
    );
}

function Tabla({
    filas,
}: {
    filas: { id: string; nombre: string; tareas: number; minutos: number }[];
}) {
    return (
        <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
            <table className="w-full min-w-[20rem] text-sm">
                <thead>
                    <tr className="border-b text-left text-xs text-muted-foreground">
                        <th className="py-1.5 pr-3 font-medium">Nombre</th>
                        <th className="py-1.5 pr-3 font-medium">Tareas</th>
                        <th className="py-1.5 font-medium">Tiempo</th>
                    </tr>
                </thead>
                <tbody>
                    {filas.map((f) => (
                        <tr key={f.id} className="border-b last:border-0">
                            <td className="py-1.5 pr-3">
                                <span className="block max-w-[13rem] truncate" title={f.nombre}>
                                    {f.nombre}
                                </span>
                            </td>
                            <td className="py-1.5 pr-3 tabular-nums text-muted-foreground">
                                {f.tareas}
                            </td>
                            <td className="py-1.5 tabular-nums">{enPalabras(f.minutos)}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
