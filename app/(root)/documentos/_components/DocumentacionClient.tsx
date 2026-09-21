"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
    DndContext,
    MeasuringStrategy,
    PointerSensor,
    closestCenter,
    useSensor,
    useSensors,
    type DragEndEvent,
} from "@dnd-kit/core";
import {
    Archive,
    ArchiveRestore,
    Building2,
    Download,
    FolderPlus,
    History,
    Layers,
    Loader2,
    Pin,
    PinOff,
    Search,
    Shield,
    Trash2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
    alternarEnElArbol,
    desplegarEnElArbol,
    guardarLoPlegado,
    loPlegado,
    type QueSePliega,
} from "@/lib/plegado-del-arbol";
import {
    SUELTOS,
    agruparElArbol,
    laColumnaDelEspacio,
} from "@/lib/carpetas-de-documentacion";
import {
    NOMBRE_DEL_TIPO_DE_MENCION,
    NOMBRE_DE_LA_VISTA,
    VISTAS,
    type FilaDeLista,
    type TipoDeMencion,
    type Vista,
} from "@/lib/documentacion";
import { comoMarkdown, comoTextoPlano, nombreDeArchivo } from "@/lib/exportar-documento";
import { moverEnLaColumna, ordenarLaColumna, resolverElArrastre } from "@/lib/orden-del-tablero";
import { ColumnaOrdenable, useOrdenDeColumna } from "@/components/shared/OrdenDeColumna";
import { CarpetaDelArbol } from "@/components/documentacion/CarpetaDelArbol";
import { EspaciosSueltos } from "@/components/documentacion/EspaciosSueltos";
import { CompartirConCuentas } from "@/components/documentacion/CompartirConCuentas";
import { EditorDeDocumento } from "@/components/documentacion/EditorDeDocumento";
import { VistasDeLista } from "@/components/documentacion/VistasDeLista";
import { HistorialDeVersiones } from "@/components/documentacion/HistorialDeVersiones";
import { PermisosDelObjeto } from "@/components/documentacion/PermisosDelObjeto";
import { DialogoDeFila } from "@/components/documentacion/DialogoDeFila";
import { CarpetaDialog, NuevoEspacioDialog } from "@/components/documentacion/Dialogos";
import { EspacioDelArbol } from "@/components/documentacion/EspacioDelArbol";
import {
    abrirDocumentoAction,
    archivarDocumentoAction,
    borrarDocumentoAction,
    borrarFilaAction,
    buscarAction,
    crearFilaAction,
    editarFilaAction,
    fijarDocumentoAction,
    guardarDocumentoAction,
    leerElArbolAction,
    losDocumentosQueNombranAction,
    moverEspacioACarpetaAction,
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
    const [verCuentas, setVerCuentas] = useState(false);
    const [verArchivados, setVerArchivados] = useState(false);
    const [creandoCarpeta, setCreandoCarpeta] = useState(false);
    const [filaEnCurso, setFilaEnCurso] = useState<FilaDeLista | "nueva" | null>(null);
    const [estadoDeLaNueva, setEstadoDeLaNueva] = useState("");

    const contenidoRef = useRef<unknown>(null);
    contenidoRef.current = contenido;

    /* ── Qué está plegado: espacios y carpetas ───────────────────────────── */

    /**
     * Se arranca **sin nada plegado**, que es lo mismo que pinta el servidor, y
     * lo guardado se aplica después de montar. Leerlo al pintar sería tocar
     * `localStorage` durante el render —donde no existe en el servidor— y las
     * dos salidas no coincidirían: una hidratación rota.
     *
     * Son **dos conjuntos y dos llaves**: plegar la carpeta «Operaciones» no
     * puede plegar el espacio que se llame igual, y con un solo conjunto los
     * ids de las dos capas se mezclarían.
     */
    const [plegados, setPlegados] = useState<ReadonlySet<string>>(() => new Set<string>());
    const [carpetasPlegadas, setCarpetasPlegadas] = useState<ReadonlySet<string>>(
        () => new Set<string>(),
    );

    useEffect(() => {
        setPlegados(loPlegado("espacios", cuentaId, personaId));
        setCarpetasPlegadas(loPlegado("carpetas", cuentaId, personaId));
    }, [cuentaId, personaId]);

    /**
     * Alternar uno, y **guardar aquí dentro**.
     *
     * Lo guardado NO se escribe desde un efecto sobre el conjunto: ese efecto
     * correría también en el montaje, con el conjunto vacío del arranque, y
     * **borraría la preferencia guardada** antes de que la hidratación de
     * arriba llegara a leerla. Se escribe solo donde de verdad cambia algo.
     *
     * Y las dos capas van por la MISMA función: con una copia para cada una, el
     * día que se afine algo —el guardado, el saneado— se afina en una y la otra
     * se queda atrás.
     */
    const alternarPlegado = useCallback(
        (que: QueSePliega, id: string) => {
            const poner = que === "espacios" ? setPlegados : setCarpetasPlegadas;
            poner((prev) => {
                const nuevo = alternarEnElArbol(prev, id);
                guardarLoPlegado(que, cuentaId, personaId, nuevo);
                return nuevo;
            });
        },
        [cuentaId, personaId],
    );

    /**
     * El espacio del documento abierto se despliega solo. **Y su carpeta**: sin
     * esa mitad, abrir un documento de un espacio que vive dentro de una
     * carpeta plegada desplegaría el espacio… dentro de una carpeta que sigue
     * cerrada, o sea nada visible.
     *
     * Es un cambio de estado de verdad —se quita del conjunto—, **no una
     * expansión forzada al pintar**: forzándola, mientras ese documento
     * estuviera abierto el clic en la cabecera no haría nada visible y no
     * habría forma de plegar eso. Se sale plegándolo, como cualquier otro.
     *
     * Depende **solo** de lo abierto: con el conjunto en la lista, plegarlo a
     * mano lo volvería a desplegar en el acto.
     */
    const espacioAbiertoId = abierto?.espacioId ?? null;
    const carpetaDelAbiertoId = espacioAbiertoId
        ? (arbol?.enCarpeta?.[espacioAbiertoId] ?? null)
        : null;
    useEffect(() => {
        if (!espacioAbiertoId) return;
        setPlegados((prev) => {
            const nuevo = desplegarEnElArbol(prev, espacioAbiertoId);
            if (!nuevo) return prev;
            guardarLoPlegado("espacios", cuentaId, personaId, nuevo);
            return nuevo;
        });
    }, [espacioAbiertoId, cuentaId, personaId]);

    useEffect(() => {
        if (!carpetaDelAbiertoId) return;
        setCarpetasPlegadas((prev) => {
            const nuevo = desplegarEnElArbol(prev, carpetaDelAbiertoId);
            if (!nuevo) return prev;
            guardarLoPlegado("carpetas", cuentaId, personaId, nuevo);
            return nuevo;
        });
    }, [carpetaDelAbiertoId, cuentaId, personaId]);

    /* ── Refrescar el árbol ──────────────────────────────────────────────── */

    const refrescarArbol = useCallback(async () => {
        try {
            const nuevo = await leerElArbolAction({ verArchivados });
            if (nuevo) setArbol(nuevo);
        } catch (error) {
            // Un árbol que no se refresca en silencio se lee como que lo que
            // acabas de crear no se creó.
            console.warn("[documentacion] no se pudo refrescar el arbol", error);
        }
    }, [verArchivados]);

    /**
     * Los archivados se piden al SERVIDOR, no se filtran al pintar.
     *
     * Un filtro que vive un paso después del servidor no es un filtro: lo que
     * viaja es la lista entera, que es la regla que ya costó una vuelta en
     * `/schedule/[userId]`. Por eso encender el interruptor recarga el árbol.
     */
    const yaCargoUnaVez = useRef(false);
    useEffect(() => {
        if (!yaCargoUnaVez.current) {
            // El servidor ya pintó el árbol sin archivados: pedirlo otra vez al
            // montar sería una consulta cara por cada carga de la pantalla.
            yaCargoUnaVez.current = true;
            return;
        }
        void refrescarArbol();
    }, [verArchivados, refrescarArbol]);

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

    /* ── Fijar, archivar y exportar ──────────────────────────────────────── */

    const fijar = useCallback(async () => {
        if (!abierto) return;
        const valor = !abierto.fijado;
        // Se pinta al momento y se devuelve si el servidor dice que no: la
        // misma regla que mover una fila o borrar un chat.
        setAbierto((prev) => (prev ? { ...prev, fijado: valor } : prev));
        const res = await pedir(() => fijarDocumentoAction({ id: abierto.id, fijado: valor }));
        if (!res.success) {
            setAbierto((prev) => (prev ? { ...prev, fijado: !valor } : prev));
            toast.error(res.message ?? "No se pudo fijar el documento.");
            return;
        }
        void refrescarArbol();
    }, [abierto, refrescarArbol]);

    const archivar = useCallback(async () => {
        if (!abierto) return;
        const archivando = !abierto.archivadoEn;
        const antes = abierto.archivadoEn;
        setAbierto((prev) =>
            prev ? { ...prev, archivadoEn: archivando ? new Date() : null } : prev,
        );
        const res = await pedir(() =>
            archivarDocumentoAction({ id: abierto.id, archivado: archivando }),
        );
        if (!res.success) {
            setAbierto((prev) => (prev ? { ...prev, archivadoEn: antes } : prev));
            toast.error(res.message ?? "No se pudo archivar el documento.");
            return;
        }
        toast.success(archivando ? "Archivado." : "Devuelto al árbol.");
        void refrescarArbol();
    }, [abierto, refrescarArbol]);

    /**
     * Exportar: **en el navegador y sin ninguna acción nueva**.
     *
     * El cuerpo y las filas ya están cargados —es lo que se está leyendo—, así
     * que una acción de servidor para esto sería un viaje para devolver lo que
     * el navegador ya tiene, y encima una puerta más que mantener. Es
     * exactamente como exporta Notas, con el mismo `lib/exportar-documento.ts`.
     */
    const exportar = useCallback(
        (formato: "md" | "txt") => {
            if (!abierto) return;
            const doc = {
                titulo,
                contenido: contenidoRef.current ?? abierto.contenido,
                filas: abierto.tipo === "lista" ? abierto.filas : undefined,
            };
            const texto = formato === "md" ? comoMarkdown(doc) : comoTextoPlano(doc);
            const blob = new Blob([texto], {
                type: formato === "md" ? "text/markdown" : "text/plain",
            });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = nombreDeArchivo(titulo, formato);
            a.click();
            URL.revokeObjectURL(url);
        },
        [abierto, titulo],
    );

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

    /* ── El orden de los ESPACIOS ────────────────────────────────────────── */

    /**
     * El árbol se coloca con el mismo mecanismo que los documentos de dentro
     * (`orden_en_tablero`), pero con `tableroId` = **la cuenta**: un espacio
     * compartido sale en el árbol de las dos cuentas y cada una lo pone donde
     * quiera. Ver la nota de `TIPOS_DE_TABLERO`.
     */
    const puedeMandarEnElArbol = Boolean(arbol?.puedeMandarEnElArbol);
    const ordenDelArbol = useOrdenDeColumna("arbol", cuentaId, puedeMandarEnElArbol);
    const ordenDeLasCarpetas = useOrdenDeColumna("carpetas", cuentaId, puedeMandarEnElArbol);

    const sensores = useSensors(
        // 6 px antes de arrastrar, igual que dentro de un espacio: sin eso un
        // clic en el asa empezaría un arrastre de un píxel.
        useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    );

    /**
     * Los espacios con lo que se acaba de mover encima, sin esperar al
     * servidor, **y sus posiciones efectivas**.
     *
     * Las posiciones salen de aquí y no se recalculan al mover de carpeta: hace
     * falta saber cuál es la última de la columna de destino, y `posicionDe`
     * devuelve `null` para todo lo que nadie haya arrastrado. Con esos `null`,
     * el espacio movido caería arriba del todo de su carpeta nueva en vez de al
     * final.
     */
    const { espacios, posiciones } = useMemo(() => {
        const lista = arbol?.espacios ?? [];
        const encima: Record<string, number> = {};
        let hayAlgo = false;
        lista.forEach((e, i) => {
            const suya = ordenDelArbol.posicionDe(e.espacio.id, null);
            if (typeof suya === "number") {
                encima[e.espacio.id] = suya;
                hayAlgo = true;
            } else {
                // Los que no se han tocado conservan el sitio que traían.
                encima[e.espacio.id] = i;
            }
        });
        return {
            espacios: hayAlgo ? ordenarLaColumna(lista, encima, (e) => e.espacio.id) : lista,
            posiciones: encima,
        };
    }, [arbol, ordenDelArbol]);

    /** Las carpetas, con lo que se acaba de mover encima. */
    const carpetas = useMemo(() => {
        const lista = arbol?.carpetas ?? [];
        const encima: Record<string, number> = {};
        let hayAlgo = false;
        lista.forEach((c, i) => {
            const suya = ordenDeLasCarpetas.posicionDe(c.id, null);
            if (typeof suya === "number") {
                encima[c.id] = suya;
                hayAlgo = true;
            } else encima[c.id] = i;
        });
        return hayAlgo ? ordenarLaColumna(lista, encima, (c) => c.id) : lista;
    }, [arbol, ordenDeLasCarpetas]);

    /* ── En qué carpeta está cada espacio ────────────────────────────────── */

    /**
     * Lo que se acaba de mover, encima de lo que dice el servidor.
     *
     * `null` significa **suelto**, y por eso el valor admite `null` en vez de
     * borrarse de la lista: sin él no habría forma de decir «sácalo de la
     * carpeta» por encima de un `enCarpeta` del servidor que todavía dice que
     * está dentro.
     */
    const [enCarpetaEncima, setEnCarpetaEncima] = useState<Record<string, string | null>>({});

    /**
     * Si se está arrastrando un espacio ahora mismo. Solo sirve para enseñar la
     * zona de «sin carpeta» mientras dura el arrastre: el resto del tiempo esa
     * franja no tiene nada que hacer ahí y confunde.
     */
    const [arrastrandoEspacio, setArrastrandoEspacio] = useState(false);

    const enCarpeta = useMemo(() => {
        const mapa: Record<string, string> = { ...(arbol?.enCarpeta ?? {}) };
        for (const [espacioId, carpetaId] of Object.entries(enCarpetaEncima)) {
            if (carpetaId) mapa[espacioId] = carpetaId;
            else delete mapa[espacioId];
        }
        return mapa;
    }, [arbol, enCarpetaEncima]);

    /** El árbol ya repartido: cada carpeta con lo suyo, y los sueltos al final. */
    const agrupado = useMemo(
        () =>
            agruparElArbol({
                carpetas,
                espacios,
                idDelEspacio: (e) => e.espacio.id,
                enCarpeta,
            }),
        [carpetas, espacios, enCarpeta],
    );

    /** Los ids de cada columna: cada carpeta, y los sueltos. */
    const idsPorColumna = useMemo(() => {
        const mapa: Record<string, string[]> = {
            [SUELTOS]: agrupado.sueltos.map((e) => e.espacio.id),
        };
        for (const c of agrupado.carpetas) {
            mapa[c.carpeta.id] = c.espacios.map((e) => e.espacio.id);
        }
        return mapa;
    }, [agrupado]);

    const columnas = useMemo(
        () => [...carpetas.map((c) => c.id), SUELTOS],
        [carpetas],
    );

    /**
     * Mover un espacio a otra carpeta —o sacarlo fuera con `null`—, en pantalla
     * primero y avisando después.
     *
     * Si el servidor dice que no, se devuelve tal cual estaba: es la misma
     * regla que mover a una carpeta en Proyectos y que borrar un chat.
     */
    const moverACarpeta = useCallback(
        async (espacioId: string, carpetaId: string | null, idsDelDestino: string[]) => {
            const antes = enCarpetaEncima;
            setEnCarpetaEncima((prev) => ({ ...prev, [espacioId]: carpetaId }));
            // Y al final de su columna nueva, también en pantalla: sin esto se
            // quedaría con el número de la columna anterior y aparecería en
            // mitad de la nueva. Es lo mismo que hace un tablero al cambiar de
            // columna.
            ordenDelArbol.ponerAlFinal(
                espacioId,
                idsDelDestino.map((id) => posiciones[id] ?? null),
            );

            const res = await pedir(() =>
                moverEspacioACarpetaAction({ espacioId, carpetaId }),
            );
            if (!res.success) {
                setEnCarpetaEncima(antes);
                toast.error(res.message ?? "No se pudo mover el espacio.");
            }
        },
        [enCarpetaEncima, ordenDelArbol, posiciones],
    );

    /**
     * Soltar un espacio.
     *
     * Reutiliza `resolverElArrastre`, el de los dos tableros: aquí las carpetas
     * son **columnas** y los espacios **tarjetas**, y los sueltos son una
     * columna más con el centinela `SUELTOS`. Escribir aquí una decisión propia
     * sería una tercera copia de la misma pregunta.
     */
    const soltarEspacio = useCallback(
        (evento: DragEndEvent) => {
            const { active, over } = evento;
            if (!over) return;
            const arrastrada = String(active.id);
            const soltadaSobre = String(over.id);

            const columnaDeLaArrastrada = laColumnaDelEspacio(arrastrada, enCarpeta, carpetas);
            if (!(idsPorColumna[columnaDeLaArrastrada] ?? []).includes(arrastrada)) {
                // Un manejador que se rinde en silencio se lee como «el espacio
                // no se queda donde lo dejo».
                console.warn("[documentacion] se solto un espacio que no esta en el arbol", {
                    arrastrada,
                    soltadaSobre,
                });
                return;
            }

            const resultado = resolverElArrastre({
                arrastrada,
                soltadaSobre,
                columnaDeLaArrastrada,
                columnas,
                idsPorColumna,
            });
            if (resultado.que === "nada") return;
            if (resultado.que === "reordenar") {
                void ordenDelArbol.reordenar(resultado.ids);
                return;
            }
            void moverACarpeta(
                arrastrada,
                resultado.columna === SUELTOS ? null : resultado.columna,
                idsPorColumna[resultado.columna] ?? [],
            );
        },
        [carpetas, columnas, enCarpeta, idsPorColumna, moverACarpeta, ordenDelArbol],
    );

    /**
     * Subir y bajar un espacio, **dentro de su grupo**.
     *
     * Va por el MISMO camino que el arrastre —se calcula la lista entera y se
     * guarda entera— y no con un intercambio de dos posiciones: con la lista
     * completa cada escritura es una foto coherente, que es lo que hace que dos
     * personas reordenando a la vez acaben en un orden que vio alguien.
     *
     * Y la lista es la de SU columna, no la del árbol entero: el número es del
     * tablero y la comparación es de la columna, que es la regla de los dos
     * tableros aplicada aquí.
     */
    const moverEspacio = useCallback(
        (espacioId: string, hacia: -1 | 1) => {
            const columna = laColumnaDelEspacio(espacioId, enCarpeta, carpetas);
            const ids = idsPorColumna[columna] ?? [];
            const desde = ids.indexOf(espacioId);
            const hasta = desde + hacia;
            if (desde < 0 || hasta < 0 || hasta >= ids.length) return;
            void ordenDelArbol.reordenar(moverEnLaColumna(ids, espacioId, ids[hasta]));
        },
        [carpetas, enCarpeta, idsPorColumna, ordenDelArbol],
    );

    /** Subir y bajar una carpeta, por el mismo camino. */
    const moverCarpeta = useCallback(
        (carpetaId: string, hacia: -1 | 1) => {
            const ids = carpetas.map((c) => c.id);
            const desde = ids.indexOf(carpetaId);
            const hasta = desde + hacia;
            if (desde < 0 || hasta < 0 || hasta >= ids.length) return;
            void ordenDeLasCarpetas.reordenar(moverEnLaColumna(ids, carpetaId, ids[hasta]));
        },
        [carpetas, ordenDeLasCarpetas],
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

    /**
     * Una fila de espacio, la pinten las carpetas o los sueltos.
     *
     * Está escrita una vez a propósito: son catorce props y la mitad —quién
     * puede ordenar, qué está plegado, a dónde van Subir y Bajar— tienen que
     * decir exactamente lo mismo en los dos sitios. Con dos copias, el día que
     * se añada una el otro sitio se queda atrás y eso no se ve como un error:
     * se ve como que «los espacios dentro de una carpeta no hacen lo mismo».
     *
     * `esElPrimero` y `esElUltimo` son **de su grupo**, no del árbol: Subir en
     * el primero de una carpeta no tiene a dónde ir.
     */
    const pintarEspacio = (
        entrada: ArbolDeDocumentacion["espacios"][number],
        i: number,
        cuantos: number,
    ) => (
        <EspacioDelArbol
            key={entrada.espacio.id}
            entrada={entrada}
            plantillas={arbol.plantillas}
            abiertoId={abierto?.id ?? null}
            plegado={plegados.has(entrada.espacio.id)}
            puedeOrdenarElArbol={arbol.puedeMandarEnElArbol}
            esElPrimero={i === 0}
            esElUltimo={i === cuantos - 1}
            alAlternar={() => alternarPlegado("espacios", entrada.espacio.id)}
            alSubir={() => moverEspacio(entrada.espacio.id, -1)}
            alBajar={() => moverEspacio(entrada.espacio.id, 1)}
            alAbrir={(id) => void abrir(id)}
            alRefrescar={refrescarArbol}
        />
    );

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
                    <div className="flex gap-2">
                        <NuevoEspacioDialog
                            alCrear={refrescarArbol}
                            disparador={
                                <Button
                                    size="sm"
                                    variant="outline"
                                    className="min-w-0 flex-1 justify-start"
                                >
                                    <Layers className="mr-2 size-4 shrink-0" />
                                    <span className="truncate">Nuevo espacio</span>
                                </Button>
                            }
                        />
                        {/* Crear una carpeta es de quien manda en el árbol: la
                            agrupación la ve el equipo entero. El botón no se
                            pinta en gris, se QUITA — una opción apagada invita
                            a preguntar por qué no se puede. */}
                        {arbol.puedeMandarEnElArbol && (
                            <Button
                                size="sm"
                                variant="outline"
                                className="shrink-0"
                                title="Nueva carpeta"
                                aria-label="Nueva carpeta"
                                onClick={() => setCreandoCarpeta(true)}
                            >
                                <FolderPlus className="size-4" />
                            </Button>
                        )}
                    </div>
                    <CarpetaDialog
                        carpetaId={null}
                        abierto={creandoCarpeta}
                        onAbiertoChange={setCreandoCarpeta}
                        alGuardar={refrescarArbol}
                    />
                    {/* Archivar sin forma de volver a lo archivado sería
                        perderlo. El interruptor va aquí, en la cabecera del
                        árbol, y no dentro de cada espacio: lo que se busca al
                        encenderlo es «dónde está aquello», y eso no se sabe de
                        qué espacio era. */}
                    <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
                        <input
                            type="checkbox"
                            checked={verArchivados}
                            onChange={(e) => setVerArchivados(e.target.checked)}
                        />
                        Ver archivados
                    </label>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto p-2">
                    {resultados !== null ? (
                        <Resultados
                            resultados={resultados}
                            buscando={buscando}
                            alAbrir={(id) => void abrir(id)}
                        />
                    ) : espacios.length === 0 && carpetas.length === 0 ? (
                        <p className="p-3 text-sm text-muted-foreground">
                            Todavía no hay espacios. Crea el primero y todo lo de la empresa vivirá
                            aquí en vez de en archivos sueltos.
                        </p>
                    ) : (
                        /* **UN solo `DndContext`** para las dos capas: dentro
                           hay varios `SortableContext` —uno por carpeta y otro
                           para los sueltos—, que es como funciona cualquier
                           tablero. Lo que no puede haber es dos contextos
                           anidados: se roban los eventos y el cambio de columna
                           dejaría de funcionar.

                           El de los documentos de cada espacio es harina de
                           otro costal: lo monta el espacio y ningún nodo
                           pertenece a los dos. */
                        <DndContext
                            sensors={sensores}
                            collisionDetection={closestCenter}
                            // La zona de «sin carpeta» crece al empezar a
                            // arrastrar: `Always` la vuelve a medir durante el
                            // arrastre para que sea un destino de su tamaño nuevo.
                            measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
                            onDragStart={() => setArrastrandoEspacio(true)}
                            onDragCancel={() => setArrastrandoEspacio(false)}
                            onDragEnd={(evento) => {
                                setArrastrandoEspacio(false);
                                soltarEspacio(evento);
                            }}
                        >
                            {agrupado.carpetas.map(({ carpeta, espacios: dentro }, i) => (
                                <CarpetaDelArbol
                                    key={carpeta.id}
                                    carpeta={carpeta}
                                    cuantosEspacios={dentro.length}
                                    plegado={carpetasPlegadas.has(carpeta.id)}
                                    puedeMandar={arbol.puedeMandarEnElArbol}
                                    esLaPrimera={i === 0}
                                    esLaUltima={i === agrupado.carpetas.length - 1}
                                    alAlternar={() => alternarPlegado("carpetas", carpeta.id)}
                                    alSubir={() => moverCarpeta(carpeta.id, -1)}
                                    alBajar={() => moverCarpeta(carpeta.id, 1)}
                                    alRefrescar={refrescarArbol}
                                >
                                    <ColumnaOrdenable ids={dentro.map((e) => e.espacio.id)}>
                                        {dentro.map((entrada, j) =>
                                            pintarEspacio(entrada, j, dentro.length),
                                        )}
                                    </ColumnaOrdenable>
                                </CarpetaDelArbol>
                            ))}

                            <EspaciosSueltos
                                id={SUELTOS}
                                hayCarpetas={agrupado.carpetas.length > 0}
                                vacio={agrupado.sueltos.length === 0}
                                arrastrando={arrastrandoEspacio}
                            >
                                <ColumnaOrdenable
                                    ids={agrupado.sueltos.map((e) => e.espacio.id)}
                                >
                                    {agrupado.sueltos.map((entrada, i) =>
                                        pintarEspacio(entrada, i, agrupado.sueltos.length),
                                    )}
                                </ColumnaOrdenable>
                            </EspaciosSueltos>
                        </DndContext>
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

                            {/* Exportar sale SIEMPRE, también en uno recibido de
                                solo lectura: bajarse una copia de lo que ya se
                                está leyendo no cambia nada de nadie. Es lo
                                mismo que hace Notas. */}
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button
                                        size="icon"
                                        variant="ghost"
                                        className="shrink-0"
                                        title="Exportar"
                                        aria-label="Exportar"
                                    >
                                        <Download className="size-4" />
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                    <DropdownMenuItem onSelect={() => exportar("md")}>
                                        Markdown (.md)
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onSelect={() => exportar("txt")}>
                                        Texto (.txt)
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>

                            {abierto.puedeEditar && (
                                <Button
                                    size="icon"
                                    variant="ghost"
                                    className="shrink-0"
                                    title={abierto.fijado ? "Quitar de arriba" : "Fijar arriba"}
                                    aria-label={abierto.fijado ? "Quitar de arriba" : "Fijar arriba"}
                                    onClick={() => void fijar()}
                                >
                                    {abierto.fijado ? (
                                        <PinOff className="size-4 text-amber-500" />
                                    ) : (
                                        <Pin className="size-4" />
                                    )}
                                </Button>
                            )}

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
                                        title="Compartir con otra cuenta"
                                        aria-label="Compartir con otra cuenta"
                                        onClick={() => setVerCuentas(true)}
                                    >
                                        <Building2 className="size-4" />
                                    </Button>
                                    <Button
                                        size="icon"
                                        variant="ghost"
                                        className="shrink-0"
                                        title={
                                            abierto.archivadoEn
                                                ? "Devolver al árbol"
                                                : "Archivar el documento"
                                        }
                                        aria-label={
                                            abierto.archivadoEn
                                                ? "Devolver al árbol"
                                                : "Archivar el documento"
                                        }
                                        onClick={() => void archivar()}
                                    >
                                        {abierto.archivadoEn ? (
                                            <ArchiveRestore className="size-4" />
                                        ) : (
                                            <Archive className="size-4" />
                                        )}
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

                        {abierto.archivadoEn && (
                            <p className="border-b bg-muted/50 p-2 text-sm text-muted-foreground">
                                Este documento está archivado: no sale en el árbol ni en la
                                búsqueda. Sigue entero y vuelve con «Devolver al árbol».
                            </p>
                        )}

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

            {abierto && (
                <CompartirConCuentas
                    abierto={verCuentas}
                    setAbierto={setVerCuentas}
                    objetoTipo="documento"
                    objetoId={abierto.id}
                    nombre={abierto.titulo}
                    alGuardar={refrescarArbol}
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
