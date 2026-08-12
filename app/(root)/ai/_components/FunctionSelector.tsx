import { useCallback, useEffect, useState } from "react";
import {
    Popover,
    PopoverTrigger,
    PopoverContent,
} from "@/components/ui/popover";
import {
    Command,
    CommandGroup,
    CommandItem,
    CommandList,
} from "@/components/ui/command";

import {
    CAPTURE_SNIPPETS,
    CapturePedidoFunctionEl,
    CONSULTA_DATOS_SNIPPET,
    ElementFunction,
    ElementItem,
    ElementText,
    FunctionSelectorInterface,
    PedidoFunctionEl,
    UpdatePedidoFunctionEl,
} from "@/types/agentAi";

import { Button } from "@/components/ui/button";
import { Plus, Zap } from "lucide-react";
import { nanoid } from "nanoid";

export interface CaptureFunctionIF {
    stepId: string;
    subtype?: "Solicitudes" | "Reclamos" | "Pedidos" | "Reservas" | "Citas" | null;
}

/** NUEVO: extendemos las props para admitir onCreateBlock en modo raíz */
type Props = FunctionSelectorInterface & {
    onCreateBlock?: (el: ElementItem) => void;
    showRule?: boolean;
    showAction?: boolean;
    steps?: Array<{ id: string; title?: string }>;
};

export const FunctionSelector = ({
    step,
    setSteps,
    notificationNumber,
    isManagement = false,
    onCreateBlock,
    showRule = true,
    showAction = true,
    steps = [],
}: Props) => {
    const isRoot = !step; // sin step => modo raíz
    const [openRoot, setOpenRoot] = useState(false);

    const toggleStepPicker = (stepId: string, open: boolean) => {
        if (!setSteps) return;
        setSteps((prev) =>
            prev.map((s) => (s.id === stepId ? { ...s, openPicker: open } : s))
        );
    };

    /** Helpers: crear elementos sin insertarlos aún */
    const makeText = (): ElementText => ({
        id: nanoid(),
        kind: "text",
        text: "",
    });

    const makeCaptura = (subtype?: CaptureFunctionIF["subtype"]): ElementItem => {
        const st = subtype ?? "Solicitudes";
        const base: ElementFunction = {
            id: nanoid(),
            kind: "function",
            fn: "captura_datos",
            subtype: st,
            prompt: CAPTURE_SNIPPETS[st],
        };
        return st === "Pedidos"
            ? ({ ...base, fields: [] } as PedidoFunctionEl)
            : base;
    };

    const makeConsulta = (
        subtype?: CaptureFunctionIF["subtype"]
    ): ElementItem => {
        const st = subtype ?? "Solicitudes";
        const base: ElementFunction = {
            id: nanoid(),
            kind: "function",
            fn: "consulta_datos",
            subtype: st,
            prompt: CAPTURE_SNIPPETS[st],
        };
        return st === "Pedidos"
            ? ({ ...base, fields: [] } as CapturePedidoFunctionEl)
            : base;
    };

    const makeActualizar = (
        subtype?: CaptureFunctionIF["subtype"]
    ): ElementItem => {
        const st = subtype ?? "Solicitudes";
        const base: ElementFunction = {
            id: nanoid(),
            kind: "function",
            fn: "actualizar_datos",
            subtype: st,
            prompt: CAPTURE_SNIPPETS[st],
        };
        return st === "Pedidos"
            ? ({ ...base, fields: [] } as UpdatePedidoFunctionEl)
            : base;
    };

    const makeEjecutarFlujo = (): ElementFunction => ({
        id: nanoid(),
        kind: "function",
        fn: "ejecutar_flujo",
        flowId: null,
        flowName: null,
    });

    const makeNotificar = (): ElementFunction => ({
        id: nanoid(),
        kind: "function",
        fn: "notificar_asesor",
        notificationNumber: notificationNumber ?? null,
    });

    const makeRouting = () => ({
        id: nanoid(),
        kind: "function" as const,
        fn: "enrutamiento" as const,
        rules: [],
    });

    /** Inserta en step o crea bloque (raíz) */
    const insertOrCreate = useCallback((el: ElementItem) => {
        if (step && setSteps) {
            setSteps((prev) =>
                prev.map((s) =>
                    s.id === step.id
                        ? { ...s, elements: [...s.elements, el], openPicker: false }
                        : s
                )
            );
        } else if (onCreateBlock) {
            onCreateBlock(el);
            setOpenRoot(false);
        }
    }, [onCreateBlock, setSteps, step]);

    /** Actions (compatibles con ambos modos) */
    const addText = () => insertOrCreate(makeText());
    const addFunctionCaptura = (subtype?: CaptureFunctionIF["subtype"]) =>
        insertOrCreate(makeCaptura(subtype));
    const addFunctionConsultaDatos = (subtype?: CaptureFunctionIF["subtype"]) =>
        insertOrCreate(makeConsulta(subtype));
    const addFunctionActualizarDatos = (subtype?: CaptureFunctionIF["subtype"]) =>
        insertOrCreate(makeActualizar(subtype));
    const addFunctionEjecutarFlujo = () =>
        insertOrCreate(makeEjecutarFlujo() as ElementItem);
    const addFunctionNotificar = () =>
        insertOrCreate(makeNotificar() as ElementItem);

    const addRouting = () =>
        insertOrCreate(makeRouting() as ElementItem);

    /* Open/close control para ambos modos */
    const open = isRoot ? openRoot : !!step?.openPicker;
    const onOpenChange = (o: boolean) => {
        if (isRoot) setOpenRoot(o);
        else if (step) toggleStepPicker(step.id, o);
    };

    /** 👇 NUEVO: si es Gestión, al abrir el popover emulamos click en "Captura de datos" */
    useEffect(() => {
        if (isManagement && open) {
            insertOrCreate(makeCaptura());
        }
    }, [insertOrCreate, isManagement, open]);

    return (
        <>
            {showAction && (
                <Popover open={open} onOpenChange={onOpenChange}>
                    <PopoverTrigger asChild>
                        {/* Botón visible en ambos modos */}
                        <Button
                            type="button"
                            size="sm"
                            className="gap-2"
                            onClick={() => onOpenChange(true)}
                        >
                            <Zap className="h-4 w-4" />
                            Agregar acción
                        </Button>
                    </PopoverTrigger>

                    <PopoverContent className="p-0 w-[220px]" align="end" side="bottom">
                        <Command>
                            <CommandList>
                                <CommandGroup heading="ACCIONES">
                                    {/* Captura de datos vive solo en Gestión. Se probó ofrecerla en
                                        embudo, FAQ, productos y extras, y lo que hace es estorbar:
                                        obliga a declarar campos producto por producto para algo que
                                        el modelo ya resuelve solo —reconoce cuándo alguien quiere
                                        avanzar con la compra y pide lo que falta—, y Gestión ya
                                        recoge esos datos.

                                        Consulta y Actualizar datos siguen fuera por lo mismo: están
                                        escritas pero nadie las pidió, y cada opción de más en este
                                        menú es una decisión de más para quien arma el embudo. */}
                                    {isManagement && (
                                        <CommandItem onSelect={() => addFunctionCaptura()}>
                                            <span className="flex items-center gap-2">📋 Captura de datos</span>
                                        </CommandItem>
                                    )}

                                    {!isManagement && (
                                        <>
                                            {/* Enrutamiento se retiró del menú. Escribía en el prompt
                                                "PRIORIDAD: se evalúa ANTES de la BIENVENIDA → OMITIR
                                                BIENVENIDA", justo lo que la bienvenida obligatoria
                                                prohíbe. Con las dos puestas el modelo recibía dos
                                                órdenes opuestas y obedecía una al azar. Lo que hacía
                                                ya está cubierto: el modo inteligente enruta en el
                                                primer mensaje, y las plantillas por palabra en
                                                cualquier otro momento.

                                                La tarjeta se conserva: los bloques que ya lo tengan
                                                guardado se siguen viendo y editando. */}
                                            <CommandItem onSelect={addFunctionEjecutarFlujo}>
                                                <span className="flex items-center gap-2">⚡ Ejecutar flujo</span>
                                            </CommandItem>
                                            <CommandItem onSelect={addFunctionNotificar}>
                                                <span className="flex items-center gap-2">🔔 Notificar asesor</span>
                                            </CommandItem>
                                        </>
                                    )}
                                </CommandGroup>

                                {step && (
                                    <CommandGroup heading="TEXTO">
                                        <CommandItem onSelect={addText}>
                                            <span className="flex items-center gap-2">📝 Agregar regla</span>
                                        </CommandItem>
                                    </CommandGroup>
                                )}
                            </CommandList>
                        </Command>
                    </PopoverContent>
                </Popover>
            )}

            {/* Botón extra para “regla” solo cuando hay step */}
            {showRule && isManagement && (
                <Button onClick={addText} variant={"outline"} className="ml-2">
                    Agregar regla
                </Button>
            )}
        </>
    );
};
