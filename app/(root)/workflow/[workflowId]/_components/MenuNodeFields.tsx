'use client';

import { ChangeEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronDown, List } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateNodeMenuConfig } from "@/actions/workflow-node-action";
import {
    MAX_OPCIONES_MENU,
    MAX_REINTENTOS_MENU,
    TOPE_BOTON_DE_LISTA,
    TOPE_DE_BOTONES,
    TOPE_TEXTO_DE_BOTON,
    TOPE_TITULO_DE_FILA,
    buildMenuPreview,
    comoEstiloDeMenu,
    comoRendicion,
    comoTextoDelBoton,
    esMenuInteractivo,
    formaDelMenuInteractivo,
    parseMenuOptions,
    reintentosDeIntentos,
    rotulosDeLasOpciones,
    type EstiloDeMenu,
    type RendicionDeMenu,
} from "@/lib/workflow-menu";

/**
 * El editor de los DOS pasos de menú —«Menú de opciones» y «Menú con botones»—.
 *
 * Es un solo bloque a propósito: los dos pasos se configuran igual (pregunta,
 * opciones, reintentos, aviso y qué pasa al agotarlos) y lo único propio del de
 * botones es su forma (lista o botones) y el texto del botón de la lista. Con
 * dos editores, el día que se afine uno el otro se queda atrás.
 */

type NodoDeMenu = {
    id: string;
    tipo: string;
    intentionMaxAttempts?: number | null;
    noMatchMessage?: string | null;
    menuStyle?: string | null;
    menuListButton?: string | null;
    menuFallback?: string | null;
};

type Props = {
    nodo: NodoDeMenu;
    pregunta: string;
    alEscribirPregunta: (e: ChangeEvent<HTMLInputElement>) => void;
    alGuardarPregunta: () => void;
    opcionesMenu: string;
    setOpcionesMenu: (v: string) => void;
    alGuardarOpciones: () => void;
};

export function MenuNodeFields({
    nodo,
    pregunta,
    alEscribirPregunta,
    alGuardarPregunta,
    opcionesMenu,
    setOpcionesMenu,
    alGuardarOpciones,
}: Props) {
    const router = useRouter();
    const interactivo = esMenuInteractivo(nodo.tipo);
    const opciones = parseMenuOptions(opcionesMenu);

    const [reintentos, setReintentos] = useState(reintentosDeIntentos(nodo.intentionMaxAttempts));
    const [aviso, setAviso] = useState(nodo.noMatchMessage ?? "");
    const [rendicion, setRendicion] = useState<RendicionDeMenu>(comoRendicion(nodo.menuFallback));
    const [estilo, setEstilo] = useState<EstiloDeMenu>(comoEstiloDeMenu(nodo.menuStyle));
    const [textoDelBoton, setTextoDelBoton] = useState(nodo.menuListButton ?? "");

    useEffect(() => {
        setReintentos(reintentosDeIntentos(nodo.intentionMaxAttempts));
        setAviso(nodo.noMatchMessage ?? "");
        setRendicion(comoRendicion(nodo.menuFallback));
        setEstilo(comoEstiloDeMenu(nodo.menuStyle));
        setTextoDelBoton(nodo.menuListButton ?? "");
    }, [nodo.intentionMaxAttempts, nodo.noMatchMessage, nodo.menuFallback, nodo.menuStyle, nodo.menuListButton]);

    /** Guarda un ajuste; si el servidor dice que no, se vuelve a lo guardado. */
    const guardar = async (
        cambios: Parameters<typeof updateNodeMenuConfig>[1],
        deshacer: () => void,
    ) => {
        const res = await updateNodeMenuConfig(nodo.id, cambios);
        if (!res.success) {
            toast.error(res.message);
            deshacer();
            return;
        }
        toast.success(res.message);
        // Se refresca desde lo guardado: cambiar la rendición cambia los
        // conectores del nodo, y el resto de ajustes viaja con él.
        router.refresh();
    };

    const guardarReintentos = () => {
        const anterior = reintentosDeIntentos(nodo.intentionMaxAttempts);
        if (reintentos === anterior) return;
        void guardar({ reintentos }, () => setReintentos(anterior));
    };

    const guardarAviso = () => {
        const anterior = nodo.noMatchMessage ?? "";
        if (aviso.trim() === anterior.trim()) return;
        void guardar({ aviso }, () => setAviso(anterior));
    };

    const cambiarRendicion = (nueva: RendicionDeMenu) => {
        const anterior = rendicion;
        if (nueva === anterior) return;
        setRendicion(nueva);
        void guardar({ rendicion: nueva }, () => setRendicion(anterior));
    };

    const cambiarEstilo = (nuevo: EstiloDeMenu) => {
        const anterior = estilo;
        if (nuevo === anterior) return;
        setEstilo(nuevo);
        void guardar({ estilo: nuevo }, () => setEstilo(anterior));
    };

    const guardarTextoDelBoton = () => {
        const anterior = nodo.menuListButton ?? "";
        if (textoDelBoton.trim() === anterior.trim()) return;
        void guardar({ textoDelBoton }, () => setTextoDelBoton(anterior));
    };

    const forma = formaDelMenuInteractivo(estilo, opciones);

    return (
        <div className="nodrag flex flex-col gap-2" data-editor-de-menu={interactivo ? "interactivo" : "texto"}>
            <div className="flex flex-col gap-1.5">
                <Label className="text-xs">Pregunta</Label>
                <Input
                    value={pregunta}
                    onChange={alEscribirPregunta}
                    onBlur={alGuardarPregunta}
                    placeholder="Ej: ¿En qué te podemos ayudar?"
                    className="h-8 text-sm"
                />
            </div>

            <div className="flex flex-col gap-1.5">
                <Label className="text-xs">Opciones — una por línea</Label>
                <textarea
                    value={opcionesMenu}
                    onChange={(e) => setOpcionesMenu(e.target.value)}
                    onBlur={alGuardarOpciones}
                    rows={4}
                    placeholder={"Ventas\nSoporte\nHorarios"}
                    className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm outline-none focus-visible:border-primary"
                />
                <p className="text-[11px] text-muted-foreground">
                    {opciones.length === 0
                        ? "Sin opciones el menú no puede ramificar."
                        : interactivo
                          ? `${opciones.length} de ${MAX_OPCIONES_MENU}. Cada opción es una fila que el cliente toca.`
                          : `${opciones.length} de ${MAX_OPCIONES_MENU}. El número lo pone el sistema.`}
                </p>
            </div>

            {interactivo && (
                <div className="flex flex-col gap-1.5">
                    <Label className="text-xs">Forma</Label>
                    <div className="grid grid-cols-2 gap-1" role="radiogroup" aria-label="Forma del menú">
                        {([
                            ["lista", "Lista desplegable"],
                            ["botones", `Botones (hasta ${TOPE_DE_BOTONES})`],
                        ] as const).map(([valor, rotulo]) => (
                            <button
                                key={valor}
                                type="button"
                                role="radio"
                                aria-checked={estilo === valor}
                                data-forma={valor}
                                onClick={() => cambiarEstilo(valor)}
                                className={`rounded-md border px-2 py-1 text-xs transition ${
                                    estilo === valor
                                        ? "border-orange-500 bg-orange-500/10 font-semibold text-foreground"
                                        : "border-input text-muted-foreground hover:bg-muted"
                                }`}
                            >
                                {rotulo}
                            </button>
                        ))}
                    </div>
                    {estilo === "botones" && opciones.length > TOPE_DE_BOTONES && (
                        <p className="text-[11px] text-amber-600">
                            Con más de {TOPE_DE_BOTONES} opciones sale como lista: WhatsApp no admite más botones.
                        </p>
                    )}
                    {forma === "lista" && (
                        <>
                            <Label className="mt-1 text-xs">Botón que abre la lista</Label>
                            <Input
                                value={textoDelBoton}
                                onChange={(e) => setTextoDelBoton(e.target.value.slice(0, TOPE_BOTON_DE_LISTA))}
                                onBlur={guardarTextoDelBoton}
                                maxLength={TOPE_BOTON_DE_LISTA}
                                placeholder="Ver opciones"
                                className="h-8 text-sm"
                            />
                        </>
                    )}
                </div>
            )}

            <div className="flex flex-col gap-1.5 rounded-md border border-border bg-muted/30 p-2">
                <Label className="text-xs" htmlFor={`reintentos-${nodo.id}`}>
                    Si escribe en vez de elegir
                </Label>
                <div className="flex items-center gap-2">
                    <Input
                        id={`reintentos-${nodo.id}`}
                        type="number"
                        min={0}
                        max={MAX_REINTENTOS_MENU}
                        value={reintentos}
                        onChange={(e) => {
                            const n = Math.floor(Number(e.target.value));
                            setReintentos(Number.isFinite(n) ? Math.min(Math.max(n, 0), MAX_REINTENTOS_MENU) : 0);
                        }}
                        onBlur={guardarReintentos}
                        className="h-8 w-16 text-sm"
                    />
                    <span className="text-xs text-muted-foreground">
                        {reintentos === 1 ? "reintento" : "reintentos"}
                    </span>
                </div>
                <Input
                    value={aviso}
                    onChange={(e) => setAviso(e.target.value)}
                    onBlur={guardarAviso}
                    maxLength={500}
                    placeholder={interactivo ? "Aviso: Toca una de las opciones, por favor." : "Aviso: Responde con el número de una opción."}
                    className="h-8 text-sm"
                />

                <Label className="mt-1 text-xs">Al agotar los reintentos</Label>
                <div className="grid grid-cols-2 gap-1" role="radiogroup" aria-label="Al agotar los reintentos">
                    {([
                        ["rama", "Seguir por una rama"],
                        ["ia", "Pasar a la IA"],
                    ] as const).map(([valor, rotulo]) => (
                        <button
                            key={valor}
                            type="button"
                            role="radio"
                            aria-checked={rendicion === valor}
                            data-rendicion={valor}
                            onClick={() => cambiarRendicion(valor)}
                            className={`rounded-md border px-2 py-1 text-xs transition ${
                                rendicion === valor
                                    ? "border-orange-500 bg-orange-500/10 font-semibold text-foreground"
                                    : "border-input text-muted-foreground hover:bg-muted"
                            }`}
                        >
                            {rotulo}
                        </button>
                    ))}
                </div>
                <p className="text-[11px] text-muted-foreground">
                    {rendicion === "rama"
                        ? "Sigue por el conector «No eligió»."
                        : "La IA responde en lenguaje libre a lo que escribió."}
                </p>
            </div>

            {opciones.length > 0 && (
                <div className="rounded-md border border-dashed border-border bg-muted/40 p-2">
                    <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Así lo recibe el cliente
                    </p>
                    {interactivo ? (
                        <VistaPreviaInteractiva
                            pregunta={pregunta}
                            opciones={opciones}
                            forma={forma}
                            textoDelBoton={comoTextoDelBoton(textoDelBoton)}
                        />
                    ) : (
                        <p className="whitespace-pre-wrap text-xs text-foreground">
                            {buildMenuPreview(pregunta ?? "", opciones)}
                        </p>
                    )}
                </div>
            )}
        </div>
    );
}

/**
 * Cómo se ve en WhatsApp: el mensaje con su botón de lista y, debajo, las filas
 * que se despliegan; o los botones. Los rótulos salen de la MISMA regla que usa
 * el motor (recortados a 24 / 20 y numerados si quedan iguales).
 */
function VistaPreviaInteractiva({
    pregunta,
    opciones,
    forma,
    textoDelBoton,
}: {
    pregunta: string;
    opciones: string[];
    forma: EstiloDeMenu;
    textoDelBoton: string;
}) {
    const cuerpo = (pregunta ?? "").trim() || "Elige una opción";
    if (forma === "botones") {
        const rotulos = rotulosDeLasOpciones(opciones, TOPE_TEXTO_DE_BOTON);
        return (
            <div className="flex flex-col gap-1" data-vista-previa="botones">
                <p className="rounded-md bg-background px-2 py-1.5 text-xs text-foreground shadow-sm">{cuerpo}</p>
                {rotulos.map((r, i) => (
                    <span
                        key={i}
                        className="rounded-md bg-background px-2 py-1 text-center text-xs font-medium text-sky-600 shadow-sm"
                    >
                        {r}
                    </span>
                ))}
            </div>
        );
    }
    const rotulos = rotulosDeLasOpciones(opciones, TOPE_TITULO_DE_FILA);
    return (
        <div className="flex flex-col gap-1" data-vista-previa="lista">
            <div className="rounded-md bg-background shadow-sm">
                <p className="px-2 py-1.5 text-xs text-foreground">{cuerpo}</p>
                <p className="flex items-center justify-center gap-1 border-t border-border px-2 py-1 text-xs font-medium text-sky-600">
                    <List className="h-3 w-3" />
                    {textoDelBoton}
                </p>
            </div>
            <div className="rounded-md bg-background px-2 py-1 shadow-sm">
                <p className="mb-0.5 flex items-center gap-1 text-[10px] uppercase text-muted-foreground">
                    <ChevronDown className="h-3 w-3" /> Al tocar se despliega
                </p>
                {rotulos.map((r, i) => (
                    <div key={i} className="flex items-center justify-between py-0.5 text-xs">
                        <span className="truncate" title={opciones[i]}>{r}</span>
                        <span className="ml-2 h-3 w-3 shrink-0 rounded-full border border-muted-foreground/60" />
                    </div>
                ))}
            </div>
        </div>
    );
}
