"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { FolderPlus, History, Loader2, Search, Shield, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
    alternarElEspacio,
    desplegarElEspacio,
    guardarLosEspaciosPlegados,
    losEspaciosPlegados,
} from "@/lib/plegado-de-espacios";
import {
    NOMBRE_DEL_TIPO_DE_MENCION,
    NOMBRE_DE_LA_VISTA,
    VISTAS,
    type FilaDeLista,
    type TipoDeMencion,
    type Vista,
} from "@/lib/documentacion";
import { EditorDeDocumento } from "@/components/documentacion/EditorDeDocumento";
import { VistasDeLista } from "@/components/documentacion/VistasDeLista";
import { HistorialDeVersiones } from "@/components/documentacion/HistorialDeVersiones";
import { PermisosDelObjeto } from "@/components/documentacion/PermisosDelObjeto";
import { DialogoDeFila } from "@/components/documentacion/DialogoDeFila";
import { NuevoEspacioDialog } from "@/components/documentacion/Dialogos";
import { EspacioDelArbol } from "@/components/documentacion/EspacioDelArbol";
import {
    abrirDocumentoAction,
    borrarDocumentoAction,
    borrarFilaAction,
    buscarAction,
    crearFilaAction,
    editarFilaAction,
    guardarDocumentoAction,
    leerElArbolAction,
    losDocumentosQueNombranAction,
    type ArbolDeDocumentacion,
    type DocumentoAbierto,
    type DocumentoQueNombra,
    type ResultadoDeBusqueda,
} from "@/actions/documentacion-actions";
import type { DocumentoEnLista } from "@/lib/documentacion-db";

/**
 * Documentación: el árbol a la izquierda y lo abierto a la derecha.
 *
 * **Ninguna llamada a una acción puede dejar un botón colgado.** Una acción no
 * solo devuelve `success: false`: puede reventar, y entonces el `await` se rompe
 * y la línea que apaga el «Guardando…» no llega a ejecutarse. Van todas por
 * `pedir(...)`, que convierte el fallo en un `success: false` con su aviso —la
 * misma regla que en Carpetas, donde el síntoma no era un error sino un diálogo
 * congelado.
 */
async function pedir<T>(
    llamada: () => Promise<T & { success: boolean; message?: string }>,
): Promise<(T & { success: boolean; message?: string }) | { success: false; message: string }> {
    try {
        return await llamada();
    } catch (error) {
        console.warn("[documentacion] la accion no llego al servidor", error);
        return { success: false, message: "No se pudo completar. Revisa la conexión." };
    }
}

/** Cuánto se espera sin teclear antes de guardar solo. */
const ESPERA_ANTES_DE_GUARDAR = 2500;

export function DocumentacionClient({
    inicial,
    cuentaId,
    personaId,
}: {
    inicial: ArbolDeDocumentacion | null;
    cuentaId: string;
    personaId: string;
}) {
    const router = useRouter();
    const parametros = useSearchParams();
    const [arbol, setArbol] = useState(inicial);
    const [abierto, setAbierto] = useState<DocumentoAbierto | null>(null);
    const [cargando, setCargando] = useState(false);

    const [titulo, setTitulo] = useState("");
    const [contenido, setContenido] = useState<unknown>(null);
    const [sucio, setSucio] = useState(false);
    const [guardando, setGuardando] = useState(false);
    const [conflicto, setConflicto] = useState(false);

    const [texto, setTexto] = useState("");
    const [resultados, setResultados] = useState<ResultadoDeBusqueda[] | null>(null);
    const [buscando, setBuscando] = useState(false);

    const [entrantes, setEntrantes] = useState<DocumentoQueNombra[]>([]);
    const [verHistorial, setVerHistorial] = useState(false);
    const [verPermisos, setVerPermisos] = useState(false);
    const [filaEnCurso, setFilaEnCurso] = useState<FilaDeLista | "nueva" | null>(null);
    const [estadoDeLaNueva, setEstadoDeLaNueva] = useState("");

    const contenidoRef = useRef<unknown>(null);
    contenidoRef.current = contenido;

    /* ── Qué espacios están plegados ─────────────────────────────────────── */

    /**
     * Se arranca **sin nada plegado**, que es lo mismo que pinta el servidor, y
     * lo guardado se aplica después de montar. Leerlo al pintar sería tocar
     * `localStorage` durante el render —donde no existe en el servidor— y las
     * dos salidas no coincidirían: una hidratación rota.
     */
    const [plegados, setPlegados] = useState<ReadonlySet<string>>(() => new Set<string>());

    useEffect(() => {
        setPlegados(losEspaciosPlegados(cuentaId, personaId));
    }, [cuentaId, personaId]);

    /**
     * Alternar uno, y **guardar aquí dentro**.
     *
     * Lo guardado NO se escribe desde un efecto sobre `plegados`: ese efecto
     * correría también en el montaje, con el conjunto vacío del arranque, y
     * **borraría la preferencia guardada** antes de que la hidratación de
     * arriba llegara a leerla. Se escribe solo donde de verdad cambia algo.
     */
    const alternarPlegado = useCallback(
        (espacioId: string) => {
            setPlegados((prev) => {
                const nuevo = alternarElEspacio(prev, espacioId);
                guardarLosEspaciosPlegados(cuentaId, personaId, nuevo);
                return nuevo;
            });
        },
        [cuentaId, personaId],
    );

    /**
     * El espacio del documento abierto se despliega solo.
     *
     * Es un cambio de estado de verdad —se quita del conjunto—, **no una
     * expansión forzada al pintar**: forzándola, mientras ese documento
     * estuviera abierto el clic en la cabecera no haría nada visible y no
     * habría forma de plegar ese espacio. Se sale de él plegándolo, como
     * cualquier otro.
     *
     * Depende **solo** del espacio abierto: con `plegados` en la lista, plegarlo
     * a mano lo volvería a desplegar en el acto.
     */
    const espacioAbiertoId = abierto?.espacioId ?? null;
    useEffect(() => {
        if (!espacioAbiertoId) return;
        setPlegados((prev) => {
            const nuevo = desplegarElEspacio(prev, espacioAbiertoId);
            if (!nuevo) return prev;
            guardarLosEspaciosPlegados(cuentaId, personaId, nuevo);
            return nuevo;
        });
    }, [espacioAbiertoId, cuentaId, personaId]);

    /* ── Refrescar el árbol ──────────────────────────────────────────────── */

    const refrescarArbol = useCallback(async () => {
        try {
            const nuevo = await leerElArbolAction();
            if (nuevo) setArbol(nuevo);
        } catch (error) {
            // Un árbol que no se refresca en silencio se lee como que lo que
            // acabas de crear no se creó.
            console.warn("[documentacion] no se pudo refrescar el arbol", error);
        }
    }, []);

    /* ── Abrir ───────────────────────────────────────────────────────────── */

    const abrir = useCallback(async (id: string) => {
        setCargando(true);
        const res = await pedir(() => abrirDocumentoAction({ id }));
        setCargando(false);

        if (!res.success) {
            toast.error(res.message ?? "No se pudo abrir el documento.");
            return;
        }
        const doc = (res as { data: DocumentoAbierto }).data;
        setAbierto(doc);
        setTitulo(doc.titulo);
        setContenido(doc.contenido);
        setSucio(false);
        setConflicto(false);
        setResultados(null);
    }, []);

    /**
     * `?documento=…` — por donde aterriza un retroenlace.
     *
     * **Solo la primera vez.** Sin el guardián, cada repintado volvería a abrir
     * ese documento y no se podría navegar a ningún otro: es la misma regla que
     * el salto de la campanita al mensaje de un canal.
     */
    const yaAterrizo = useRef(false);
    useEffect(() => {
        if (yaAterrizo.current) return;
        const pedido = parametros.get("documento");
        if (!pedido) return;
        yaAterrizo.current = true;
        void abrir(pedido);
    }, [parametros, abrir]);

    // Los retroenlaces del documento abierto: quién lo nombra a él.
    useEffect(() => {
        if (!abierto) {
            setEntrantes([]);
            return;
        }
        let vivo = true;
        void (async () => {
            const res = await pedir(() =>
                losDocumentosQueNombranAction({ tipo: "documento", refId: abierto.id }),
            );
            if (vivo && res.success) setEntrantes((res as { data: DocumentoQueNombra[] }).data);
        })();
        return () => {
            vivo = false;
        };
    }, [abierto]);

    /* ── Guardar ─────────────────────────────────────────────────────────── */

    const guardar = useCallback(
        async (silencioso: boolean) => {
            if (!abierto?.puedeEditar || conflicto) return;

            setGuardando(true);
            const res = await pedir(() =>
                guardarDocumentoAction({
                    id: abierto.id,
                    titulo,
                    contenido: contenidoRef.current ?? abierto.contenido,
                    versionQueSeVio: abierto.version,
                }),
            );
            setGuardando(false);

            if (!res.success) {
                if ((res as { loCambioOtro?: boolean }).loCambioOtro) {
                    // Se para el guardado automático: reintentar es justo lo que
                    // pisaría el trabajo del otro.
                    setConflicto(true);
                }
                toast.error(res.message ?? "No se pudo guardar.");
                return;
            }

            const datos = (res as { data: { version: number; textoRecortado: boolean } }).data;
            setAbierto((prev) => (prev ? { ...prev, version: datos.version, titulo } : prev));
            setSucio(false);
            if (datos.textoRecortado) {
                // Lo que se recorta, se dice: si no, buscar dentro de este
                // documento devolvería menos de lo que tiene y parecería que el
                // buscador falla.
                toast.warning(
                    "El documento es muy largo: la búsqueda solo alcanza su primera parte.",
                );
            }
            if (!silencioso) toast.success("Guardado.");
            void refrescarArbol();
        },
        [abierto, titulo, conflicto, refrescarArbol],
    );

    // Guardado automático. El servidor no escribe una versión si nada cambió
    // («una versión por CAMBIO, no por guardado»), así que esto no llena el
    // historial de entradas idénticas.
    useEffect(() => {
        if (!sucio || !abierto?.puedeEditar || conflicto) return;
        const reloj = setTimeout(() => void guardar(true), ESPERA_ANTES_DE_GUARDAR);
        return () => clearTimeout(reloj);
    }, [sucio, abierto, conflicto, guardar]);

    /* ── Buscar ──────────────────────────────────────────────────────────── */

    useEffect(() => {
        if (texto.trim().length < 2) {
            setResultados(null);
            return;
        }
        let vivo = true;
        setBuscando(true);
        const reloj = setTimeout(async () => {
            const res = await pedir(() => buscarAction({ texto }));
            if (!vivo) return;
            setBuscando(false);
            if (res.success) setResultados((res as { data: ResultadoDeBusqueda[] }).data);
            else toast.error(res.message ?? "No se pudo buscar.");
        }, 300);
        return () => {
            vivo = false;
            clearTimeout(reloj);
        };
    }, [texto]);

    /* ── Las filas de una lista ──────────────────────────────────────────── */

    const recargarFilas = useCallback(async () => {
        if (!abierto) return;
        const res = await pedir(() => abrirDocumentoAction({ id: abierto.id }));
        if (res.success) {
            const doc = (res as { data: DocumentoAbierto }).data;
            setAbierto((prev) =>
                prev ? { ...prev, filas: doc.filas, posiciones: doc.posiciones } : prev,
            );
        }
    }, [abierto]);

    const moverFila = useCallback(
        async (filaId: string, estado: string) => {
            if (!abierto) return;
            // Se pinta al momento y se devuelve si el servidor dice que no: la
            // misma regla que mover a una carpeta o borrar un chat.
            const antes = abierto.filas;
            setAbierto((prev) =>
                prev
                    ? {
                          ...prev,
                          filas: prev.filas.map((f) => (f.id === filaId ? { ...f, estado } : f)),
                      }
                    : prev,
            );
            const res = await pedir(() => editarFilaAction({ id: filaId, estado }));
            if (!res.success) {
                setAbierto((prev) => (prev ? { ...prev, filas: antes } : prev));
                toast.error(res.message ?? "No se pudo mover la fila.");
                return;
            }
            void recargarFilas();
        },
        [abierto, recargarFilas],
    );

    const borrarFila = useCallback(
        async (filaId: string) => {
            if (!abierto) return;
            const antes = abierto.filas;
            setAbierto((prev) =>
                prev ? { ...prev, filas: prev.filas.filter((f) => f.id !== filaId) } : prev,
            );
            const res = await pedir(() => borrarFilaAction({ id: filaId }));
            if (!res.success) {
                setAbierto((prev) => (prev ? { ...prev, filas: antes } : prev));
                toast.error(res.message ?? "No se pudo borrar la fila.");
            }
        },
        [abierto],
    );

    const cambiarVista = useCallback(
        async (vista: Vista) => {
            if (!abierto) return;
            setAbierto((prev) => (prev ? { ...prev, vista } : prev));
            if (!abierto.puedeEditar) return;
            await pedir(() =>
                guardarDocumentoAction({
                    id: abierto.id,
                    titulo: abierto.titulo,
                    contenido: contenidoRef.current ?? abierto.contenido,
                    vista,
                    versionQueSeVio: abierto.version,
                }),
            );
        },
        [abierto],
    );

    const borrarElAbierto = useCallback(async () => {
        if (!abierto) return;
        const res = await pedir(() => borrarDocumentoAction({ id: abierto.id }));
        if (!res.success) {
            toast.error(res.message ?? "No se pudo borrar.");
            return;
        }
        setAbierto(null);
        toast.success("Documento eliminado.");
        void refrescarArbol();
    }, [abierto, refrescarArbol]);

    /* ── Ir a una mención ────────────────────────────────────────────────── */

    const irAlaMencion = useCallback(
        (tipo: TipoDeMencion, refId: string) => {
            if (tipo === "documento") {
                void abrir(refId);
                return;
            }
            // Las demás viven fuera de esta pantalla, así que se abre la suya
            // **con la ficha ya delante**: las tres leen su parámetro y lo
            // abren al llegar (`useAterrizajeDeMencion`), igual que aquí
            // `?documento=`. Aterrizar en la lista y dejar buscar la fila no
            // es llegar: en una cuenta con cientos de clientes es no llegar.
            const aDonde: Record<Exclude<TipoDeMencion, "documento">, string> = {
                cliente: `/panel/clientes?cliente=${encodeURIComponent(refId)}`,
                tarea: `/tareas?tarea=${encodeURIComponent(refId)}`,
                ticket: `/tickets?ticket=${encodeURIComponent(refId)}`,
            };
            router.push(aDonde[tipo as Exclude<TipoDeMencion, "documento">]);
        },
        [abrir, router],
    );

    const espacioDelAbierto = useMemo(
        () => arbol?.espacios.find((e) => e.espacio.id === abierto?.espacioId),
        [arbol, abierto],
    );

    if (!arbol) {
        return (
            <div className="flex h-full items-center justify-center p-8 text-sm text-muted-foreground">
                No se pudo cargar la documentación.
            </div>
        );
    }

    return (
        <div className="flex h-full min-h-0">
            {/* ── El árbol ──────────────────────────────────────────────── */}
            {/* El arbol no crece hasta `xl`. Medido: con 20rem desde `lg`, a
                1280 el documento se quedaba en 768 px y la tabla se desplazaba
                por 32 px de nada. Quien cede es el arbol, que enseña titulos
                recortados, y no el documento, que es lo que se viene a leer —
                la misma decision que en Chats, donde la conversacion tiene
                suelo y quien cede es la ficha. */}
            <aside className="flex w-[18rem] shrink-0 flex-col border-r xl:w-[20rem]">
                <div className="flex flex-col gap-2 border-b p-3">
                    <div className="relative">
                        <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
                        <Input
                            value={texto}
                            onChange={(e) => setTexto(e.target.value)}
                            placeholder="Buscar en todo el texto…"
                            className="pl-8"
                        />
                    </div>
                    <NuevoEspacioDialog
                        alCrear={refrescarArbol}
                        disparador={
                            <Button size="sm" variant="outline" className="justify-start">
                                <FolderPlus className="mr-2 size-4" />
                                Nuevo espacio
                            </Button>
                        }
                    />
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto p-2">
                    {resultados !== null ? (
                        <Resultados
                            resultados={resultados}
                            buscando={buscando}
                            alAbrir={(id) => void abrir(id)}
                        />
                    ) : arbol.espacios.length === 0 ? (
                        <p className="p-3 text-sm text-muted-foreground">
                            Todavía no hay espacios. Crea el primero y todo lo de la empresa vivirá
                            aquí en vez de en archivos sueltos.
                        </p>
                    ) : (
                        arbol.espacios.map((entrada) => (
                            <EspacioDelArbol
                                key={entrada.espacio.id}
                                entrada={entrada}
                                plantillas={arbol.plantillas}
                                abiertoId={abierto?.id ?? null}
                                plegado={plegados.has(entrada.espacio.id)}
                                alAlternar={() => alternarPlegado(entrada.espacio.id)}
                                alAbrir={(id) => void abrir(id)}
                                alRefrescar={refrescarArbol}
                            />
                        ))
                    )}
                </div>
            </aside>

            {/* ── Lo abierto ────────────────────────────────────────────── */}
            <main className="flex min-h-0 min-w-0 flex-1 flex-col">
                {cargando ? (
                    <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
                        <Loader2 className="mr-2 size-4 animate-spin" />
                        Abriendo…
                    </div>
                ) : !abierto ? (
                    <div className="flex flex-1 items-center justify-center p-8 text-center text-sm text-muted-foreground">
                        Elige un documento, o crea uno nuevo desde el «+» de un espacio.
                    </div>
                ) : (
                    <>
                        <div className="flex flex-wrap items-center gap-2 border-b p-3">
                            <Input
                                value={titulo}
                                onChange={(e) => {
                                    setTitulo(e.target.value);
                                    setSucio(true);
                                }}
                                disabled={!abierto.puedeEditar}
                                className="h-9 min-w-[12rem] flex-1 border-0 text-base font-semibold shadow-none focus-visible:ring-0"
                            />

                            {abierto.tipo === "lista" && (
                                <Select
                                    value={abierto.vista ?? "tabla"}
                                    onValueChange={(v) => void cambiarVista(v as Vista)}
                                >
                                    <SelectTrigger className="w-[9rem] shrink-0">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {VISTAS.map((v) => (
                                            <SelectItem key={v} value={v}>
                                                {NOMBRE_DE_LA_VISTA[v]}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            )}

                            <span className="shrink-0 text-xs text-muted-foreground">
                                {/* Que se vea lo que está pasando, sin tener que
                                    pulsar nada para averiguarlo. */}
                                {guardando
                                    ? "Guardando…"
                                    : sucio
                                      ? "Sin guardar"
                                      : `v${abierto.version}`}
                            </span>

                            <Button
                                size="sm"
                                variant="outline"
                                className="shrink-0"
                                onClick={() => setVerHistorial(true)}
                            >
                                <History className="mr-2 size-4" />
                                Historial
                            </Button>

                            {abierto.puedeGestionar && (
                                <>
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        className="shrink-0"
                                        onClick={() => setVerPermisos(true)}
                                    >
                                        <Shield className="mr-2 size-4" />
                                        Permisos
                                    </Button>
                                    <Button
                                        size="icon"
                                        variant="ghost"
                                        className="shrink-0"
                                        title="Eliminar el documento"
                                        onClick={() => void borrarElAbierto()}
                                    >
                                        <Trash2 className="size-4" />
                                    </Button>
                                </>
                            )}
                        </div>

                        {conflicto && (
                            <p className="border-b border-amber-500/40 bg-amber-500/10 p-2 text-sm text-amber-700 dark:text-amber-400">
                                Alguien guardó este documento mientras lo editabas. Se ha parado el
                                guardado automático para no pisar su cambio: vuelve a abrirlo.
                            </p>
                        )}

                        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
                            {abierto.tipo === "lista" ? (
                                <VistasDeLista
                                    documentoId={abierto.id}
                                    vista={abierto.vista ?? "tabla"}
                                    filas={abierto.filas}
                                    estados={abierto.estados}
                                    posiciones={abierto.posiciones}
                                    puedeEditar={abierto.puedeEditar}
                                    alCrear={(estado) => {
                                        setEstadoDeLaNueva(estado);
                                        setFilaEnCurso("nueva");
                                    }}
                                    alMover={(filaId, estado) => void moverFila(filaId, estado)}
                                    alEditar={(fila) => setFilaEnCurso(fila)}
                                    alBorrar={(filaId) => void borrarFila(filaId)}
                                />
                            ) : (
                                <EditorDeDocumento
                                    key={abierto.id}
                                    contenido={abierto.contenido}
                                    editable={abierto.puedeEditar}
                                    alCambiar={(nuevo) => {
                                        setContenido(nuevo);
                                        setSucio(true);
                                    }}
                                    alPulsarMencion={irAlaMencion}
                                />
                            )}

                            <Enlaces
                                salientes={abierto.menciones}
                                entrantes={entrantes}
                                alAbrirDocumento={(id) => void abrir(id)}
                                alIr={irAlaMencion}
                            />
                        </div>
                    </>
                )}
            </main>

            {abierto && verHistorial && (
                <HistorialDeVersiones
                    documentoId={abierto.id}
                    puedeEditar={abierto.puedeEditar}
                    alCerrar={() => setVerHistorial(false)}
                    alVolver={() => {
                        setVerHistorial(false);
                        void abrir(abierto.id);
                    }}
                />
            )}

            {abierto && verPermisos && (
                <PermisosDelObjeto
                    objetoTipo="documento"
                    objetoId={abierto.id}
                    nombre={abierto.titulo}
                    restringido={abierto.restringido}
                    alCerrar={() => setVerPermisos(false)}
                    alCambiarRestringido={(valor) =>
                        setAbierto((prev) => (prev ? { ...prev, restringido: valor } : prev))
                    }
                />
            )}

            {abierto && filaEnCurso && (
                <DialogoDeFila
                    documentoId={abierto.id}
                    estados={abierto.estados}
                    fila={filaEnCurso === "nueva" ? null : filaEnCurso}
                    estadoInicial={estadoDeLaNueva || abierto.estados[0]}
                    puedeEditar={abierto.puedeEditar}
                    alCerrar={() => setFilaEnCurso(null)}
                    alGuardar={async () => {
                        setFilaEnCurso(null);
                        await recargarFilas();
                    }}
                    crear={crearFilaAction}
                    editar={editarFilaAction}
                />
            )}
        </div>
    );
}

/* ─────────────────────────────── Resultados ─────────────────────────────── */

function Resultados({
    resultados,
    buscando,
    alAbrir,
}: {
    resultados: ResultadoDeBusqueda[];
    buscando: boolean;
    alAbrir: (id: string) => void;
}) {
    if (buscando && resultados.length === 0) {
        return <p className="p-3 text-sm text-muted-foreground">Buscando…</p>;
    }
    if (resultados.length === 0) {
        return (
            <p className="p-3 text-sm text-muted-foreground">
                Nada con ese texto. La búsqueda mira el cuerpo entero, no solo el título.
            </p>
        );
    }
    return (
        <ul className="flex flex-col gap-1">
            {resultados.map((r) => (
                <li key={r.id}>
                    <button
                        type="button"
                        onClick={() => alAbrir(r.id)}
                        className="w-full rounded p-2 text-left hover:bg-muted/60"
                    >
                        <p className="truncate text-sm font-medium">{r.titulo}</p>
                        <p className="line-clamp-2 text-xs text-muted-foreground">{r.extracto}</p>
                        <p className="mt-0.5 text-[11px] text-muted-foreground">
                            {r.espacioNombre}
                        </p>
                    </button>
                </li>
            ))}
        </ul>
    );
}

/* ──────────────────────────────── Enlaces ───────────────────────────────── */

/**
 * Los dos sentidos de una mención, uno al lado del otro.
 *
 * Que estén juntos es la mitad del encargo: lo que este documento nombra, y
 * quién lo nombra a él. Sin el segundo bloque la mención sería un enlace normal
 * y no habría forma de llegar desde la cosa hasta lo que se escribió sobre ella.
 */
function Enlaces({
    salientes,
    entrantes,
    alAbrirDocumento,
    alIr,
}: {
    salientes: Array<{ tipo: TipoDeMencion; refId: string; etiqueta: string }>;
    entrantes: DocumentoQueNombra[];
    alAbrirDocumento: (id: string) => void;
    alIr: (tipo: TipoDeMencion, refId: string) => void;
}) {
    if (salientes.length === 0 && entrantes.length === 0) return null;

    return (
        <div className="grid gap-3 border-t pt-3 md:grid-cols-2">
            {salientes.length > 0 && (
                <div>
                    <p className="mb-1 text-xs font-medium text-muted-foreground">
                        Este documento nombra
                    </p>
                    <ul className="flex flex-wrap gap-1.5">
                        {salientes.map((m) => (
                            <li key={`${m.tipo}-${m.refId}`}>
                                <button
                                    type="button"
                                    onClick={() => alIr(m.tipo, m.refId)}
                                    className="rounded bg-primary/10 px-2 py-0.5 text-xs text-primary"
                                    title={NOMBRE_DEL_TIPO_DE_MENCION[m.tipo]}
                                >
                                    {m.etiqueta}
                                </button>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
            {entrantes.length > 0 && (
                <div>
                    <p className="mb-1 text-xs font-medium text-muted-foreground">
                        Lo nombran desde
                    </p>
                    <ul className="flex flex-col gap-1">
                        {entrantes.map((d) => (
                            <li key={d.id}>
                                <button
                                    type="button"
                                    onClick={() => alAbrirDocumento(d.id)}
                                    className="w-full truncate rounded px-2 py-0.5 text-left text-xs hover:bg-muted"
                                >
                                    {d.titulo}
                                    <span className="ml-1 text-muted-foreground">
                                        · {d.espacioNombre}
                                    </span>
                                </button>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    );
}
