"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    Building2,
    Hash,
    Loader2,
    Lock,
    MessagesSquare,
    Pencil,
    Plus,
    Send,
    Users,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
    CADA_CUANTO_MS,
    TOPE_DEL_MENSAJE,
    comoSeLlama,
    type MensajeDeEquipo,
    type PersonaMencionable,
} from "@/lib/chat-de-equipo";
import {
    CANAL_GENERAL,
    TOPE_DEL_NOMBRE,
    type CanalDeEquipo,
} from "@/lib/canales-de-equipo";
import {
    abrirDirectoAction,
    crearCanalAction,
    enviarAlEquipoAction,
    hiloDelEquipoAction,
    ponerMiembrosAction,
    renombrarCanalAction,
    type HiloAbierto,
} from "@/actions/chat-de-equipo-actions";

/**
 * El chat del equipo: los canales y el hilo abierto.
 *
 * Lo pintan **los dos sitios**: el panel lateral —que es por donde se usa— y
 * la ruta `/chat-equipo`, para quien la quiera montar como módulo. Con dos
 * copias, el día que se afine algo se afina en una y la otra se queda atrás, y
 * eso no se ve como un error sino como «a veces funciona».
 *
 * # Y aquí se carga TODO
 *
 * El panel no precarga nada y le pasa datos: carga esto, cuando `activo` se
 * pone en `true`. Con la carga en los dos lados habría dos formas de llegar al
 * mismo estado y una acabaría desincronizada al cambiar de canal.
 *
 * # El reloj responde
 *
 * Un `setInterval` montado **una sola vez** que lee todo por referencia. No se
 * vuelve a una cadena de `setTimeout`: si una vuelta no llega a programar la
 * siguiente, el ciclo muere en silencio y el hilo se congela hasta recargar —
 * es la primera regla de Chats de este proyecto, y aquí no hay tiempo real que
 * lo tape.
 *
 * Con la pestaña de fondo no se pregunta —nadie está mirando— y al volver a
 * ella se pregunta de inmediato. Y el `catch` **escribe**: un refresco que
 * falla en silencio no se nota como un error, se nota como un chat que no trae
 * los mensajes de los demás.
 */
export function HiloDelEquipo({
    activo = true,
    canalInicial,
}: {
    /**
     * Si el reloj tiene que correr y si hay que cargar.
     *
     * En la ruta siempre; en el panel, solo con el panel abierto. Esto cuelga
     * del layout, o sea de TODAS las pantallas: un sondeo corriendo con el
     * panel cerrado sería una consulta cada cinco segundos por pestaña para
     * algo que nadie está mirando.
     */
    activo?: boolean;
    /** El canal con el que abrir, si se llega desde un aviso de mención. */
    canalInicial?: string;
}) {
    const [datos, setDatos] = useState<HiloAbierto | null>(null);
    const [fallo, setFallo] = useState<string | null>(null);
    const [canalId, setCanalId] = useState<string>(canalInicial || CANAL_GENERAL);
    const [texto, setTexto] = useState("");
    const [enviando, setEnviando] = useState(false);
    const [listaAbierta, setListaAbierta] = useState(false);

    const abajoDelTodo = useRef<HTMLDivElement | null>(null);
    // El ciclo lee el canal por referencia: si entrara en las dependencias,
    // cambiar de canal remontaría el `setInterval` y perdería su cadencia.
    const canalRef = useRef(canalId);
    canalRef.current = canalId;

    const traer = useCallback(async (cual?: string) => {
        const pedido = cual ?? canalRef.current;
        const res = await hiloDelEquipoAction(pedido);
        if (!res.success) return res.message;
        // Una vuelta del reloj que salió con el canal anterior NO puede pintar
        // encima del que se acaba de abrir: llega tarde, con los mensajes de
        // otra conversación, y desde fuera se ve como un canal que se cambia
        // solo a los pocos segundos.
        if (pedido !== canalRef.current) return null;
        setDatos(res.data);
        // El servidor manda: si el canal pedido no existe para esta persona,
        // devuelve el general y la pantalla se pone donde de verdad está.
        setCanalId(res.data.canalId);
        canalRef.current = res.data.canalId;
        return null;
    }, []);

    // ── La primera carga ────────────────────────────────────────────────────
    useEffect(() => {
        if (!activo || datos) return;
        let vivo = true;
        void (async () => {
            try {
                const malo = await traer(canalInicial || CANAL_GENERAL);
                if (vivo && malo) setFallo(malo);
            } catch (error) {
                // Un panel que se abre vacío y no dice por qué se lee como que
                // el chat no funciona.
                console.warn("[chat-equipo] no se pudo abrir el panel", error);
                if (vivo) setFallo("No se pudo cargar el chat del equipo.");
            }
        })();
        return () => {
            vivo = false;
        };
    }, [activo, datos, traer, canalInicial]);

    // ── El reloj ────────────────────────────────────────────────────────────
    useEffect(() => {
        if (!activo) return;
        let vivo = true;

        const vuelta = async () => {
            if (document.visibilityState === "hidden") return;
            try {
                const malo = await traer();
                if (vivo && malo) {
                    console.warn("[chat-equipo] el refresco no trajo nada", malo);
                }
            } catch (error) {
                console.warn("[chat-equipo] falló una vuelta del refresco", error);
            }
        };

        const id = setInterval(vuelta, CADA_CUANTO_MS);
        const alVolver = () => {
            if (document.visibilityState === "visible") void vuelta();
        };
        document.addEventListener("visibilitychange", alVolver);

        return () => {
            vivo = false;
            clearInterval(id);
            document.removeEventListener("visibilitychange", alVolver);
        };
    }, [activo, traer]);

    // Pegado abajo: un chat se lee por el final.
    useEffect(() => {
        abajoDelTodo.current?.scrollIntoView({ block: "end" });
    }, [datos?.mensajes.length, canalId]);

    const canal = useMemo(
        () => datos?.canales.find((c) => c.id === canalId) ?? datos?.canales[0] ?? null,
        [datos, canalId],
    );

    const cambiarDeCanal = useCallback(
        async (cual: string) => {
            setListaAbierta(false);
            setCanalId(cual);
            // La referencia se mueve YA, no en el render siguiente: es contra
            // ella contra la que el reloj comprueba si su vuelta sigue valiendo.
            canalRef.current = cual;
            setTexto("");
            try {
                const malo = await traer(cual);
                if (malo) toast.error(malo);
            } catch (error) {
                console.warn("[chat-equipo] no se pudo cambiar de canal", error);
                toast.error("No se pudo abrir ese canal.");
            }
        },
        [traer],
    );

    const enviar = useCallback(async () => {
        const limpio = texto.trim();
        if (!limpio || enviando) return;
        setEnviando(true);
        try {
            const res = await enviarAlEquipoAction(limpio, canalId);
            if (!res.success) {
                // Un botón que no dice por qué no hizo nada es un botón que se
                // pulsa cinco veces.
                toast.error(res.message);
                return;
            }
            setTexto("");
            // Se pinta al momento y el reloj lo confirma en su vuelta: el
            // servidor manda, pero escribir no puede sentirse lento.
            setDatos((antes) =>
                !antes || res.data.canalId !== antes.canalId
                    ? antes
                    : antes.mensajes.some((m) => m.id === res.data.mensaje.id)
                      ? antes
                      : { ...antes, mensajes: [...antes.mensajes, res.data.mensaje] },
            );
        } catch (error) {
            console.error("[chat-equipo] el envío reventó", error);
            toast.error("No se pudo enviar. Inténtalo de nuevo.");
        } finally {
            setEnviando(false);
        }
    }, [texto, enviando, canalId]);

    /** Enter envía, Mayús+Enter hace salto de línea. */
    const alTeclear = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            void enviar();
        }
    };

    const nombrePorId = useMemo(() => {
        const m = new Map<string, string>();
        for (const p of datos?.gente ?? []) m.set(p.id, comoSeLlama(p));
        return m;
    }, [datos?.gente]);

    if (fallo) {
        return (
            <div className="flex h-full items-center justify-center p-6 text-center text-sm text-muted-foreground">
                {fallo}
            </div>
        );
    }

    if (!datos || !canal) {
        return (
            <div className="flex h-full items-center justify-center p-6 text-sm text-muted-foreground">
                Cargando…
            </div>
        );
    }

    return (
        <div className="flex h-full min-h-0 w-full flex-col">
            <BarraDeCanales
                abierta={listaAbierta}
                onAlternar={() => setListaAbierta((v) => !v)}
                canal={canal}
                datos={datos}
                onElegir={(id) => void cambiarDeCanal(id)}
                onRefrescar={() => void traer()}
            />

            <div className="flex-1 min-h-0 overflow-y-auto px-3 py-4 sm:px-6">
                {datos.mensajes.length === 0 ? (
                    <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground">
                        <MessagesSquare className="h-8 w-8 opacity-40" />
                        <p>
                            {canal.tipo === "directo"
                                ? "Aquí habláis los dos."
                                : "Aquí habla la gente de este canal."}
                        </p>
                        <p className="text-xs">
                            Escribe <span className="font-medium">@</span> y el nombre de
                            alguien para avisarle.
                        </p>
                    </div>
                ) : (
                    <div className="mx-auto flex max-w-3xl flex-col gap-3">
                        {datos.mensajes.map((m) => (
                            <Burbuja
                                key={m.id}
                                mensaje={m}
                                mio={m.autorId === datos.yo}
                                meMencionan={m.mencionados.includes(datos.yo)}
                                nombrePorId={nombrePorId}
                            />
                        ))}
                        <div ref={abajoDelTodo} />
                    </div>
                )}
            </div>

            <div className="shrink-0 border-t border-border bg-background px-3 py-3 sm:px-6">
                <div className="mx-auto flex max-w-3xl items-end gap-2">
                    <Textarea
                        value={texto}
                        onChange={(e) => setTexto(e.target.value.slice(0, TOPE_DEL_MENSAJE))}
                        onKeyDown={alTeclear}
                        rows={1}
                        placeholder="@ para mencionar"
                        className="max-h-40 min-h-[40px] flex-1 resize-y"
                        disabled={enviando || !canal.puedoEscribir}
                    />
                    <Button
                        onClick={() => void enviar()}
                        disabled={enviando || !texto.trim() || !canal.puedoEscribir}
                        className="shrink-0"
                    >
                        {enviando ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                            <Send className="h-4 w-4" />
                        )}
                        <span className="ml-2 hidden sm:inline">Enviar</span>
                    </Button>
                </div>
            </div>
        </div>
    );
}

/**
 * La barra de canales: el que está abierto, y la lista al desplegarla.
 *
 * Es un desplegable y no una columna al lado: el panel mide lo que mide la
 * lista de Chats —288 px en una pantalla normal— y una columna de canales ahí
 * dentro dejaría la conversación en la mitad.
 */
function BarraDeCanales({
    abierta,
    onAlternar,
    canal,
    datos,
    onElegir,
    onRefrescar,
}: {
    abierta: boolean;
    onAlternar: () => void;
    canal: CanalDeEquipo;
    datos: HiloAbierto;
    onElegir: (id: string) => void;
    onRefrescar: () => void;
}) {
    const [creando, setCreando] = useState(false);

    const areas = datos.canales.filter((c) => c.tipo !== "directo");
    const directos = datos.canales.filter((c) => c.tipo === "directo");
    // Con quién se puede abrir un directo: el equipo menos uno mismo y menos
    // aquellos con los que ya hay uno abierto, que ya salen en la lista.
    const yaHablo = new Set(directos.map((d) => d.conQuienId).filter(Boolean));
    const porAbrir = datos.gente.filter((p) => p.id !== datos.yo && !yaHablo.has(p.id));

    return (
        <div className="shrink-0 border-b border-border bg-background">
            <button
                type="button"
                onClick={onAlternar}
                aria-expanded={abierta}
                className="flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-muted/60 sm:px-6"
            >
                <IconoDeCanal canal={canal} />
                <span className="min-w-0 flex-1 truncate text-sm font-medium">
                    {canal.nombre}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">
                    {abierta ? "Cerrar" : "Cambiar"}
                </span>
            </button>

            {abierta && (
                <div className="max-h-[min(50vh,320px)] overflow-y-auto border-t border-border px-2 py-2">
                    <Grupo titulo="Canales">
                        {areas.map((c) => (
                            <FilaDeCanal
                                key={c.id}
                                canal={c}
                                activo={c.id === canal.id}
                                mando={datos.mando}
                                gente={datos.gente}
                                cuentasDeLaFamilia={datos.cuentasDeLaFamilia}
                                onElegir={onElegir}
                                onRefrescar={onRefrescar}
                            />
                        ))}
                        {datos.mando &&
                            (creando ? (
                                <FormularioDeCanal
                                    cuentasDeLaFamilia={datos.cuentasDeLaFamilia}
                                    onListo={(id) => {
                                        setCreando(false);
                                        onRefrescar();
                                        if (id) onElegir(id);
                                    }}
                                />
                            ) : (
                                <button
                                    type="button"
                                    onClick={() => setCreando(true)}
                                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
                                >
                                    <Plus className="h-3.5 w-3.5 shrink-0" />
                                    <span>Crear canal</span>
                                </button>
                            ))}
                    </Grupo>

                    <Grupo titulo="Directos">
                        {directos.map((c) => (
                            <FilaDeCanal
                                key={c.id}
                                canal={c}
                                activo={c.id === canal.id}
                                mando={datos.mando}
                                gente={datos.gente}
                                cuentasDeLaFamilia={datos.cuentasDeLaFamilia}
                                onElegir={onElegir}
                                onRefrescar={onRefrescar}
                            />
                        ))}
                        {porAbrir.map((p) => (
                            <AbrirDirecto
                                key={p.id}
                                persona={p}
                                onAbierto={(id) => {
                                    onRefrescar();
                                    onElegir(id);
                                }}
                            />
                        ))}
                        {!directos.length && !porAbrir.length && (
                            <p className="px-2 py-1.5 text-xs text-muted-foreground">
                                No hay nadie más en esta cuenta.
                            </p>
                        )}
                    </Grupo>
                </div>
            )}
        </div>
    );
}

function Grupo({ titulo, children }: { titulo: string; children: React.ReactNode }) {
    return (
        <div className="mb-2 last:mb-0">
            <p className="px-2 pb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                {titulo}
            </p>
            <div className="flex flex-col">{children}</div>
        </div>
    );
}

function IconoDeCanal({ canal }: { canal: Pick<CanalDeEquipo, "tipo" | "cuentas"> }) {
    // Un canal que cruza cuentas se ve distinto de uno de la casa: quien
    // escribe ahí está hablándole a gente de otra cuenta, y eso conviene
    // saberlo ANTES de escribir, no después.
    const Icono =
        canal.tipo === "directo" ? Users : canal.cuentas.length ? Building2 : Hash;
    return <Icono className="h-4 w-4 shrink-0 text-muted-foreground" />;
}

function FilaDeCanal({
    canal,
    activo,
    mando,
    gente,
    cuentasDeLaFamilia,
    onElegir,
    onRefrescar,
}: {
    canal: CanalDeEquipo;
    activo: boolean;
    mando: boolean;
    gente: PersonaMencionable[];
    cuentasDeLaFamilia: { id: string; nombre: string }[];
    onElegir: (id: string) => void;
    onRefrescar: () => void;
}) {
    const [editando, setEditando] = useState(false);
    // Solo los canales de área se retocan: el general no es una fila y un
    // directo se llama con la otra persona, no con lo que alguien escriba.
    //
    // Y un canal que CRUZA solo lo retoca su dueña — la lista de cuentas
    // llega vacía para todas las demás, así que el lápiz no se pinta y la
    // acción tampoco lo dejaría pasar.
    const seRetoca =
        mando && canal.tipo === "area" && (!canal.cuentas.length || cuentasDeLaFamilia.length > 0);

    if (editando) {
        return (
            <AjustesDeCanal
                canal={canal}
                gente={gente}
                cuentasDeLaFamilia={cuentasDeLaFamilia}
                onListo={() => {
                    setEditando(false);
                    onRefrescar();
                }}
            />
        );
    }

    return (
        <div className="flex items-center gap-1">
            <button
                type="button"
                onClick={() => onElegir(canal.id)}
                className={[
                    "flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
                    activo ? "bg-primary/10 text-primary" : "hover:bg-muted/60",
                ].join(" ")}
            >
                <IconoDeCanal canal={canal} />
                <span className="min-w-0 flex-1 truncate">{canal.nombre}</span>
                {/* Un canal que se lee sin pertenecer —lo que ve quien
                    administra— se marca: por qué sale ahí no es evidente. */}
                {!canal.pertenezco && (
                    <Lock className="h-3 w-3 shrink-0 text-muted-foreground" />
                )}
            </button>
            {seRetoca && (
                <button
                    type="button"
                    onClick={() => setEditando(true)}
                    aria-label={`Ajustes de ${canal.nombre}`}
                    className="shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                    <Pencil className="h-3.5 w-3.5" />
                </button>
            )}
        </div>
    );
}

function FormularioDeCanal({
    cuentasDeLaFamilia,
    onListo,
}: {
    cuentasDeLaFamilia: { id: string; nombre: string }[];
    onListo: (id: string | null) => void;
}) {
    const [nombre, setNombre] = useState("");
    const [cuentas, setCuentas] = useState<Set<string>>(new Set());
    const [guardando, setGuardando] = useState(false);

    const crear = async () => {
        if (guardando) return;
        setGuardando(true);
        try {
            const res = await crearCanalAction(nombre, [], Array.from(cuentas));
            if (!res.success) {
                toast.error(res.message);
                return;
            }
            onListo(res.data.canalId);
        } catch (error) {
            // Una acción puede REVENTAR, no solo devolver `success: false`, y
            // entonces el «Guardando…» no se apagaría nunca.
            console.warn("[chat-equipo] no se pudo crear el canal", error);
            toast.error("No se pudo crear el canal.");
        } finally {
            setGuardando(false);
        }
    };

    return (
        <div className="my-1 rounded-md border border-border bg-muted/30 p-2">
            <div className="flex items-center gap-1">
                <input
                    autoFocus
                    value={nombre}
                    onChange={(e) => setNombre(e.target.value.slice(0, TOPE_DEL_NOMBRE))}
                    onKeyDown={(e) => {
                        if (e.key === "Enter") void crear();
                        if (e.key === "Escape") onListo(null);
                    }}
                    placeholder="ventas, marketing…"
                    className="min-w-0 flex-1 rounded-md border border-border bg-background px-2 py-1 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary"
                />
                <Button size="sm" disabled={guardando || !nombre.trim()} onClick={() => void crear()}>
                    {guardando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Crear"}
                </Button>
            </div>
            <CuentasDelCanal
                cuentasDeLaFamilia={cuentasDeLaFamilia}
                marcadas={cuentas}
                onCambiar={setCuentas}
            />
        </div>
    );
}

/**
 * Qué cuentas vinculadas entran en el canal.
 *
 * **No se pinta si no hay ninguna que ofrecer**: la lista llega vacía para
 * todas las cuentas que no son la madre, así que quien no reparte canales
 * entre cuentas no ve un bloque que no puede usar.
 *
 * Y lo que dice el pie es lo que hace falta saber antes de marcar una casilla:
 * entra la CUENTA entera, no una persona.
 */
function CuentasDelCanal({
    cuentasDeLaFamilia,
    marcadas,
    onCambiar,
}: {
    cuentasDeLaFamilia: { id: string; nombre: string }[];
    marcadas: Set<string>;
    onCambiar: (v: Set<string>) => void;
}) {
    if (!cuentasDeLaFamilia.length) return null;

    return (
        <div className="mt-2 border-t border-border pt-2">
            <p className="px-1 pb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Cuentas vinculadas
            </p>
            <div className="max-h-32 overflow-y-auto">
                {cuentasDeLaFamilia.map((c) => (
                    <label
                        key={c.id}
                        className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-sm hover:bg-muted/60"
                    >
                        <input
                            type="checkbox"
                            checked={marcadas.has(c.id)}
                            onChange={(e) => {
                                const copia = new Set(marcadas);
                                if (e.target.checked) copia.add(c.id);
                                else copia.delete(c.id);
                                onCambiar(copia);
                            }}
                        />
                        <span className="min-w-0 truncate">{c.nombre}</span>
                    </label>
                ))}
            </div>
            <p className="px-1 pt-1 text-[11px] text-muted-foreground">
                Entra toda la gente de esas cuentas.
            </p>
        </div>
    );
}

/** Renombrar y decidir quién pertenece, en el mismo sitio. */
function AjustesDeCanal({
    canal,
    gente,
    cuentasDeLaFamilia,
    onListo,
}: {
    canal: CanalDeEquipo;
    gente: PersonaMencionable[];
    cuentasDeLaFamilia: { id: string; nombre: string }[];
    onListo: () => void;
}) {
    const [nombre, setNombre] = useState(canal.nombre);
    const [dentro, setDentro] = useState<Set<string>>(new Set());
    // Las cuentas SÍ vienen en la lista de canales, así que se pueden marcar
    // desde el primer pintado — al contrario que la gente, que se pide aparte.
    const [cuentas, setCuentas] = useState<Set<string>>(new Set(canal.cuentas));
    const [cargado, setCargado] = useState(false);
    const [guardando, setGuardando] = useState(false);

    // Quién está dentro no viaja en la lista de canales —serían los miembros de
    // todos los canales en cada vuelta del reloj—, así que se pide al abrir.
    useEffect(() => {
        let vivo = true;
        void (async () => {
            try {
                const res = await hiloDelEquipoAction(canal.id);
                if (!vivo || !res.success) return;
                setDentro(new Set(res.data.equipo.map((p) => p.id)));
            } catch (error) {
                console.warn("[chat-equipo] no se pudo leer quién está en el canal", error);
            } finally {
                if (vivo) setCargado(true);
            }
        })();
        return () => {
            vivo = false;
        };
    }, [canal.id]);

    const guardar = async () => {
        if (guardando) return;
        setGuardando(true);
        try {
            const [r1, r2] = await Promise.all([
                renombrarCanalAction(canal.id, nombre),
                ponerMiembrosAction(
                    canal.id,
                    Array.from(dentro),
                    // Solo se mandan las cuentas si esta pantalla las puede
                    // ofrecer. Mandando un array vacío desde una cuenta que no
                    // las ve, un canal que cruzaba se quedaría sin ninguna al
                    // guardar solo la gente.
                    cuentasDeLaFamilia.length ? Array.from(cuentas) : undefined,
                ),
            ]);
            if (!r1.success) toast.error(r1.message);
            else if (!r2.success) toast.error(r2.message);
            else onListo();
        } catch (error) {
            console.warn("[chat-equipo] no se pudieron guardar los ajustes", error);
            toast.error("No se pudo guardar.");
        } finally {
            setGuardando(false);
        }
    };

    return (
        <div className="my-1 rounded-md border border-border bg-muted/30 p-2">
            <input
                autoFocus
                value={nombre}
                onChange={(e) => setNombre(e.target.value.slice(0, TOPE_DEL_NOMBRE))}
                className="mb-2 w-full rounded-md border border-border bg-background px-2 py-1 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary"
            />
            <div className="max-h-40 overflow-y-auto">
                {!cargado ? (
                    <p className="px-1 py-1 text-xs text-muted-foreground">Cargando…</p>
                ) : (
                    gente.map((p) => (
                        <label
                            key={p.id}
                            className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-sm hover:bg-muted/60"
                        >
                            <input
                                type="checkbox"
                                checked={dentro.has(p.id)}
                                onChange={(e) =>
                                    setDentro((antes) => {
                                        const copia = new Set(antes);
                                        if (e.target.checked) copia.add(p.id);
                                        else copia.delete(p.id);
                                        return copia;
                                    })
                                }
                            />
                            <span className="min-w-0 truncate">{comoSeLlama(p)}</span>
                        </label>
                    ))
                )}
            </div>
            <CuentasDelCanal
                cuentasDeLaFamilia={cuentasDeLaFamilia}
                marcadas={cuentas}
                onCambiar={setCuentas}
            />
            {/* Cancelar a la izquierda y la acción a la derecha, como el resto
                de la App. */}
            <div className="mt-2 flex items-center justify-between gap-2">
                <Button size="sm" variant="ghost" onClick={onListo} disabled={guardando}>
                    Cancelar
                </Button>
                <Button size="sm" onClick={() => void guardar()} disabled={guardando || !nombre.trim()}>
                    {guardando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Guardar"}
                </Button>
            </div>
        </div>
    );
}

function AbrirDirecto({
    persona,
    onAbierto,
}: {
    persona: PersonaMencionable;
    onAbierto: (canalId: string) => void;
}) {
    const [abriendo, setAbriendo] = useState(false);

    const abrir = async () => {
        if (abriendo) return;
        setAbriendo(true);
        try {
            const res = await abrirDirectoAction(persona.id);
            if (!res.success) {
                toast.error(res.message);
                return;
            }
            onAbierto(res.data.canalId);
        } catch (error) {
            console.warn("[chat-equipo] no se pudo abrir el directo", error);
            toast.error("No se pudo abrir la conversación.");
        } finally {
            setAbriendo(false);
        }
    };

    return (
        <button
            type="button"
            onClick={() => void abrir()}
            disabled={abriendo}
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground disabled:opacity-60"
        >
            {abriendo ? (
                <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
            ) : (
                <Plus className="h-3.5 w-3.5 shrink-0" />
            )}
            <span className="min-w-0 truncate">{comoSeLlama(persona)}</span>
        </button>
    );
}

function Burbuja({
    mensaje,
    mio,
    meMencionan,
    nombrePorId,
}: {
    mensaje: MensajeDeEquipo;
    mio: boolean;
    meMencionan: boolean;
    nombrePorId: Map<string, string>;
}) {
    const quien = mensaje.autorNombre?.trim() || nombrePorId.get(mensaje.autorId) || "Alguien";
    const hora = new Date(mensaje.creadoEn).toLocaleString([], {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
    });

    return (
        <div className={`flex flex-col gap-1 ${mio ? "items-end" : "items-start"}`}>
            <div className="flex items-center gap-2 px-1 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{mio ? "Tú" : quien}</span>
                <span>{hora}</span>
            </div>
            <div
                className={[
                    "max-w-[85%] whitespace-pre-wrap break-words rounded-lg border px-3 py-2 text-sm",
                    mio
                        ? "border-primary/30 bg-primary/10"
                        : "border-border bg-muted/40",
                    // Una mención se ve sin leer el texto: es lo que hace que
                    // volver al hilo desde el aviso valga para algo.
                    meMencionan ? "ring-2 ring-amber-400/60" : "",
                ].join(" ")}
            >
                {mensaje.texto}
            </div>
        </div>
    );
}
