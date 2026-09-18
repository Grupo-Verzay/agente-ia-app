"use client";

import { useMemo, useState } from "react";
import {
    DndContext,
    PointerSensor,
    closestCenter,
    useSensor,
    useSensors,
    useDroppable,
    type DragEndEvent,
} from "@dnd-kit/core";
import { CalendarDays, Plus, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import {
    ColumnaOrdenable,
    TarjetaDelTablero,
    useOrdenDeColumna,
} from "@/components/shared/OrdenDeColumna";
import { cn } from "@/lib/utils";
import {
    loQueCabeEnElCalendario,
    repartirEnColumnas,
    type FilaDeLista,
    type Vista,
} from "@/lib/documentacion";
import { ordenarLaColumna } from "@/lib/orden-del-tablero";

/**
 * Las tres vistas de una lista. **El dato es UNO**: estas tres funciones pintan
 * las MISMAS filas, sin ninguna copia ni ninguna tabla de eventos al lado.
 *
 * De ahí sale lo que se pidió —«la misma lista se ve como tabla, como tablero o
 * como calendario, sin duplicar el dato»— y también lo que evita: en cuanto hay
 * dos copias, el calendario y la tabla empiezan a no coincidir y no hay forma de
 * saber cuál miente.
 */

type Props = {
    documentoId: string;
    vista: Vista;
    filas: FilaDeLista[];
    estados: string[];
    posiciones: Record<string, number>;
    puedeEditar: boolean;
    alCrear: (estado: string) => void;
    alMover: (filaId: string, estado: string) => void;
    alEditar: (fila: FilaDeLista) => void;
    alBorrar: (filaId: string) => void;
};

export function VistasDeLista(props: Props) {
    if (props.vista === "tablero") return <VistaDeTablero {...props} />;
    if (props.vista === "calendario") return <VistaDeCalendario {...props} />;
    return <VistaDeTabla {...props} />;
}

/* ──────────────────────────────── Tabla ─────────────────────────────────── */

function VistaDeTabla({ filas, estados, puedeEditar, alCrear, alEditar, alBorrar }: Props) {
    return (
        <div className="flex min-h-0 flex-1 flex-col gap-3">
            {puedeEditar && (
                <div>
                    <Button size="sm" variant="outline" onClick={() => alCrear(estados[0])}>
                        <Plus className="mr-2 size-4" />
                        Añadir fila
                    </Button>
                </div>
            )}
            <div className="overflow-x-auto rounded-lg border">
                {/* Los anchos estan MEDIDOS, y el `min-w` es su suma.
                    Con `table-fixed`, el ancho total manda sobre el declarado de
                    cada columna: con `min-w-[48rem]` las cuatro fijas (29rem) le
                    dejaban al TITULO 224 px en vez de las 18rem que pone ahi
                    abajo, o sea que la columna que de verdad se lee salia la mas
                    apretada.
                    45rem = 29 fijas + 16 para el titulo, y ese numero sale de
                    MEDIR y no de redondear: a 1280 el documento se queda con
                    734 px utiles —768 menos el `p-4` de su caja y menos los 2 px
                    del borde—, asi que con 47rem la tabla se desplazaba 16 px y
                    con 46rem, 2. Un scroll que no aporta nada y que hace parecer
                    que algo esta roto. Por debajo de 45rem si se desplaza, que
                    es preferible a aplastar justo lo que se viene a leer. */}
                <Table className="min-w-[45rem] table-fixed">
                    <TableHeader>
                        <TableRow>
                            <TableHead className="min-w-[18rem]">Título</TableHead>
                            <TableHead className="w-[8rem]">Estado</TableHead>
                            <TableHead className="w-[7rem]">Fecha</TableHead>
                            <TableHead className="w-[9rem]">Asignado</TableHead>
                            <TableHead className="w-[5rem]" />
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {filas.length === 0 ? (
                            <TableRow>
                                <TableCell
                                    colSpan={5}
                                    className="py-8 text-center text-sm text-muted-foreground"
                                >
                                    Esta lista está vacía.
                                </TableCell>
                            </TableRow>
                        ) : (
                            filas.map((fila) => (
                                <TableRow key={fila.id}>
                                    <TableCell
                                        className="cursor-pointer truncate text-sm"
                                        title={fila.titulo}
                                        onClick={() => alEditar(fila)}
                                    >
                                        {fila.titulo}
                                    </TableCell>
                                    <TableCell>
                                        <Badge variant="outline">{fila.estado}</Badge>
                                    </TableCell>
                                    <TableCell className="text-xs text-muted-foreground">
                                        {laFecha(fila.fecha) ?? "—"}
                                    </TableCell>
                                    <TableCell className="truncate text-xs text-muted-foreground">
                                        {fila.asignadoNombre ?? "—"}
                                    </TableCell>
                                    <TableCell>
                                        {puedeEditar && (
                                            <Button
                                                size="icon"
                                                variant="ghost"
                                                onClick={() => alBorrar(fila.id)}
                                                title="Borrar la fila"
                                            >
                                                <Trash2 className="size-4" />
                                            </Button>
                                        )}
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </div>
        </div>
    );
}

/* ─────────────────────────────── Tablero ────────────────────────────────── */

function VistaDeTablero({
    documentoId,
    filas,
    estados,
    posiciones,
    puedeEditar,
    alCrear,
    alMover,
    alEditar,
}: Props) {
    // El orden dentro de una columna va por el tablero COMPARTIDO, el mismo de
    // Proyectos y de Tickets. Un mecanismo propio para lo mismo es uno que se
    // afina y otro que se queda atrás.
    const orden = useOrdenDeColumna("documentacion", documentoId, puedeEditar);

    const sensores = useSensors(
        // 6 px antes de arrastrar: sin eso, un clic para abrir una fila empieza
        // un arrastre y la fila no se abre nunca.
        useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    );

    const columnas = useMemo(() => {
        const repartidas = repartirEnColumnas(filas, estados);
        // El MISMO colocador de los otros dos tableros: lo que no tiene
        // posicion va primero, y lo colocado a mano detras. Asi una lista que
        // nadie ha arrastrado sale exactamente como salia.
        const conLasDeEncima: Record<string, number> = { ...posiciones };
        for (const c of repartidas) {
            for (const f of c.filas) {
                const suya = orden.posicionDe(f.id, posiciones[f.id]);
                if (typeof suya === "number") conLasDeEncima[f.id] = suya;
            }
        }
        return repartidas.map((c) => ({
            ...c,
            filas: ordenarLaColumna(c.filas, conLasDeEncima, (f) => f.id),
        }));
    }, [filas, estados, orden, posiciones]);

    const alSoltar = (evento: DragEndEvent) => {
        const { active, over } = evento;
        if (!over) return;

        // **Se busca la fila por su `id`**, que es el único canal que no se
        // puede perder: sin él dnd-kit no arrastra nada. No se le cuelga un
        // `data` a la tarjeta — ese segundo canal es justo lo que un refactor
        // se deja, y su pérdida rompió los dos tableros en silencio.
        const arrastrada = filas.find((f) => String(f.id) === String(active.id));
        if (!arrastrada) {
            console.warn("[documentacion] se solto una fila que no esta en la lista", {
                id: String(active.id),
            });
            return;
        }

        const sobre = String(over.id);
        const columnaDestino = estados.includes(sobre)
            ? sobre
            : filas.find((f) => String(f.id) === sobre)?.estado;
        if (!columnaDestino) return;

        if (columnaDestino !== arrastrada.estado) {
            alMover(arrastrada.id, columnaDestino);
            return;
        }

        // Misma columna: es un reorden.
        const deLaColumna = columnas.find((c) => c.estado === columnaDestino)?.filas ?? [];
        const ids = deLaColumna.map((f) => f.id);
        const desde = ids.indexOf(arrastrada.id);
        const hasta = ids.indexOf(sobre);
        if (desde < 0 || hasta < 0 || desde === hasta) return;
        const movidos = [...ids];
        movidos.splice(hasta, 0, movidos.splice(desde, 1)[0]);
        void orden.reordenar(movidos);
    };

    return (
        <DndContext sensors={sensores} collisionDetection={closestCenter} onDragEnd={alSoltar}>
            <div className="flex min-h-0 flex-1 gap-3 overflow-x-auto pb-2">
                {columnas.map((columna) => (
                    <Columna
                        key={columna.estado}
                        estado={columna.estado}
                        cuantas={columna.filas.length}
                        puedeEditar={puedeEditar}
                        alCrear={alCrear}
                    >
                        <ColumnaOrdenable ids={columna.filas.map((f) => f.id)}>
                            {columna.filas.map((fila) => (
                                <TarjetaDelTablero
                                    key={fila.id}
                                    id={fila.id}
                                    puedeArrastrar={puedeEditar}
                                    onClick={() => alEditar(fila)}
                                >
                                    {(arrastrando) => (
                                        <div
                                            className={cn(
                                                "rounded-md border bg-background p-2 text-sm",
                                                arrastrando && "opacity-60",
                                            )}
                                        >
                                            <p className="line-clamp-2 min-h-[2.75em] leading-snug">
                                                {fila.titulo}
                                            </p>
                                            {fila.fecha && (
                                                <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                                                    <CalendarDays className="size-3" />
                                                    {laFecha(fila.fecha)}
                                                </p>
                                            )}
                                        </div>
                                    )}
                                </TarjetaDelTablero>
                            ))}
                        </ColumnaOrdenable>
                    </Columna>
                ))}
            </div>
        </DndContext>
    );
}

function Columna({
    estado,
    cuantas,
    puedeEditar,
    alCrear,
    children,
}: {
    estado: string;
    cuantas: number;
    puedeEditar: boolean;
    alCrear: (estado: string) => void;
    children: React.ReactNode;
}) {
    // La columna es también un destino: sin esto, soltar en el hueco de abajo
    // de una columna vacía no hace nada y parece que el tablero está roto.
    const { setNodeRef, isOver } = useDroppable({ id: estado });

    return (
        <div
            ref={setNodeRef}
            className={cn(
                "flex w-64 shrink-0 flex-col gap-2 rounded-lg border bg-muted/30 p-2",
                isOver && "ring-2 ring-primary/40",
            )}
        >
            <div className="flex items-center justify-between px-1">
                <p className="text-sm font-medium">{estado}</p>
                <span className="text-xs text-muted-foreground">{cuantas}</span>
            </div>
            <div className="flex min-h-[3rem] flex-col gap-2">{children}</div>
            {puedeEditar && (
                <Button
                    size="sm"
                    variant="ghost"
                    className="justify-start text-muted-foreground"
                    onClick={() => alCrear(estado)}
                >
                    <Plus className="mr-1 size-4" />
                    Añadir
                </Button>
            )}
        </div>
    );
}

/* ────────────────────────────── Calendario ──────────────────────────────── */

function VistaDeCalendario({ filas, alEditar }: Props) {
    const [mes, setMes] = useState(() => {
        const hoy = new Date();
        return new Date(hoy.getFullYear(), hoy.getMonth(), 1);
    });

    // **Las dos mitades**: lo que cabe, y cuántas se quedan fuera. Una fila sin
    // fecha no cabe en un calendario y eso no tiene vuelta; lo que no puede
    // pasar es que desaparezca en silencio.
    const { conFecha, sinFecha } = useMemo(() => loQueCabeEnElCalendario(filas), [filas]);

    const dias = useMemo(() => diasDelMes(mes), [mes]);
    const porDia = useMemo(() => {
        const mapa = new Map<string, FilaDeLista[]>();
        for (const fila of conFecha) {
            const llave = llaveDelDia(fila.fecha as Date);
            const lista = mapa.get(llave) ?? [];
            lista.push(fila);
            mapa.set(llave, lista);
        }
        return mapa;
    }, [conFecha]);

    return (
        <div className="flex min-h-0 flex-1 flex-col gap-3">
            <div className="flex items-center gap-2">
                <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setMes(new Date(mes.getFullYear(), mes.getMonth() - 1, 1))}
                >
                    Anterior
                </Button>
                <p className="min-w-[10rem] text-center text-sm font-medium">
                    {mes.toLocaleDateString("es-CO", { month: "long", year: "numeric" })}
                </p>
                <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setMes(new Date(mes.getFullYear(), mes.getMonth() + 1, 1))}
                >
                    Siguiente
                </Button>
            </div>

            {sinFecha > 0 && (
                <p className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-700 dark:text-amber-400">
                    {/* Si no suma, se dice. Sin esto, 60 filas con 20 fechas
                        enseñan 20 y desde fuera se lee como que se perdieron 40. */}
                    {sinFecha === 1
                        ? "1 fila no tiene fecha y no sale en el calendario."
                        : `${sinFecha} filas no tienen fecha y no salen en el calendario.`}{" "}
                    Están todas en la vista de tabla.
                </p>
            )}

            <div className="overflow-x-auto">
                <div className="grid min-w-[42rem] grid-cols-7 gap-px rounded-lg border bg-border">
                    {["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map((d) => (
                        <div key={d} className="bg-muted/50 p-2 text-center text-xs font-medium">
                            {d}
                        </div>
                    ))}
                    {dias.map((dia, i) => {
                        const deEseDia = dia ? (porDia.get(llaveDelDia(dia)) ?? []) : [];
                        return (
                            <div
                                key={dia ? llaveDelDia(dia) : `hueco-${i}`}
                                className={cn(
                                    "min-h-[5.5rem] bg-background p-1.5",
                                    !dia && "bg-muted/20",
                                )}
                            >
                                {dia && (
                                    <>
                                        <p className="mb-1 text-xs text-muted-foreground">
                                            {dia.getDate()}
                                        </p>
                                        <div className="flex flex-col gap-1">
                                            {deEseDia.map((fila) => (
                                                <button
                                                    key={fila.id}
                                                    type="button"
                                                    onClick={() => alEditar(fila)}
                                                    className="truncate rounded bg-primary/10 px-1.5 py-0.5 text-left text-xs text-primary"
                                                    title={fila.titulo}
                                                >
                                                    {fila.titulo}
                                                </button>
                                            ))}
                                        </div>
                                    </>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}

/* ──────────────────────────────── Fechas ────────────────────────────────── */

function laFecha(fecha: Date | null): string | null {
    if (!fecha) return null;
    const d = fecha instanceof Date ? fecha : new Date(fecha);
    if (isNaN(d.getTime())) return null;
    return d.toLocaleDateString("es-CO", { day: "2-digit", month: "short" });
}

function llaveDelDia(fecha: Date): string {
    const d = fecha instanceof Date ? fecha : new Date(fecha);
    return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

/**
 * Los huecos del mes, empezando en LUNES.
 *
 * `getDay()` devuelve 0 para domingo, así que sin el ajuste el mes entero sale
 * corrido un día — y eso no se ve como un error de cálculo: se ve como que las
 * fechas están mal guardadas.
 */
function diasDelMes(mes: Date): Array<Date | null> {
    const primero = new Date(mes.getFullYear(), mes.getMonth(), 1);
    const ultimo = new Date(mes.getFullYear(), mes.getMonth() + 1, 0);
    const desplazamiento = (primero.getDay() + 6) % 7;

    const dias: Array<Date | null> = [];
    for (let i = 0; i < desplazamiento; i++) dias.push(null);
    for (let d = 1; d <= ultimo.getDate(); d++) {
        dias.push(new Date(mes.getFullYear(), mes.getMonth(), d));
    }
    // Se completa la última semana para que la rejilla no quede dentada.
    while (dias.length % 7 !== 0) dias.push(null);
    return dias;
}
