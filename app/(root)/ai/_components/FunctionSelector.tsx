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
    CommandEmpty,
    CommandInput,
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
};

export const FunctionSelector = ({
    step,
    setSteps,
    notificationNumber,
    isManagement = false,
    onCreateBlock,
    showRule = true,
    showAction = true,
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
        const st = subtype ?? "Pedidos";
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
        const st = subtype ?? "Pedidos";
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
        const st = subtype ?? "Pedidos";
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
                            className="bg-blue-600 hover:bg-blue-700 text-white"
                            onClick={() => onOpenChange(true)}
                        >
                            <Zap className="mr-2 h-4 w-4" />
                            {isManagement ? "Agregar acción" : "Agregar acción"}
                        </Button>
                    </PopoverTrigger>

                    <PopoverContent className="p-0 w-[320px]" align="end">
                        <Command>
                            <CommandInput placeholder="Buscar opción…" />
                            <CommandList>
                                <CommandEmpty>Sin coincidencias…</CommandEmpty>

                                <CommandGroup heading="Acciones">
                                    {/* Gestión: captura/consulta/actualizar */}
                                    {isManagement && (
                                        <>
                                            <CommandItem onSelect={() => addFunctionCaptura()}>
                                                Captura de datos
                                            </CommandItem>
                                            {/* <CommandItem onSelect={() => addFunctionConsultaDatos()}>
                                                Consulta de datos
                                            </CommandItem>
                                            <CommandItem onSelect={() => addFunctionActualizarDatos()}>
                                                Actualizar datos
                                            </CommandItem> */}
                                        </>
                                    )}

                                    {/* No gestión: ejecutar flujo / notificar */}
                                    {!isManagement && (
                                        <>
                                            <CommandItem onSelect={addFunctionEjecutarFlujo}>
                                                Ejecutar flujo
                                            </CommandItem>
                                            <CommandItem onSelect={addFunctionNotificar}>
                                                Notificar asesor
                                            </CommandItem>
                                        </>
                                    )}

                                    {/* Texto/regla: solo tiene sentido si hay step; en raíz podría crear bloque con texto si lo deseas */}
                                    {step && (
                                        <CommandItem onSelect={addText}>Agregar regla</CommandItem>
                                    )}
                                </CommandGroup>
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
