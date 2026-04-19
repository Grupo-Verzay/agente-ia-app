// components/training/ElementRenderer.tsx
"use client";

import { FC } from "react";
import { DataSubtype, PropsActionSteeps } from "@/types/agentAi";
import {
    TextRuleCard,
    CapturaDatosCard,
    ActualizarDatosCard,
    EjecutarFlujoCard,
    NotificarAsesorCard,
    ConsultaDatosCard,
} from "./";

const ElementRenderer: FC<PropsActionSteeps> = ({
    stepId,
    el,
    flows,
    removeElement,
    updateText,
    setFlowOnElement,
    addPedidoField,
    removePedidoField,
    onSubtypeChange,
    isManagement
}) => {
    if (el.kind === "text") {
        return (
            <TextRuleCard
                el={el}
                onRemove={() => removeElement(stepId, el.id)}
                onChange={(v) => updateText(stepId, el.id, v)}
                isManagement={isManagement}
            />
        );
    }

    if (el.kind === "function" && el.fn === "captura_datos") {
        return (
            <CapturaDatosCard
                el={el as any}
                onRemove={() => removeElement(stepId, el.id)}
                onAddField={(f) => addPedidoField(stepId, el.id, f)}
                onRemoveField={(f) => removePedidoField(stepId, el.id, f)}
                onSubtypeChange={(subtype: DataSubtype) => onSubtypeChange(stepId, el.id, subtype)} // Pasando stepId
                isManagement={isManagement}
            />
        );
    }

    if (el.kind === "function" && el.fn === "actualizar_datos") {
        return (
            <ActualizarDatosCard
                el={el as any}
                onRemove={() => removeElement(stepId, el.id)}
                onAddField={(f) => addPedidoField(stepId, el.id, f)}
                onRemoveField={(f) => removePedidoField(stepId, el.id, f)}
                onSubtypeChange={(subtype: DataSubtype) => onSubtypeChange(stepId, el.id, subtype)} // Pasando stepId
                isManagement={isManagement}
            />
        );
    }

    if (el.kind === "function" && el.fn === "ejecutar_flujo") {
        return (
            <EjecutarFlujoCard
                el={el as any}
                flows={flows}
                onRemove={() => removeElement(stepId, el.id)}
                onSelectFlow={(flow) => setFlowOnElement(stepId, el.id, flow)}
                isManagement={isManagement}
            />
        );
    }

    if (el.kind === "function" && el.fn === "notificar_asesor") {
        return (
            <NotificarAsesorCard
                el={el as any}
                onRemove={() => removeElement(stepId, el.id)}
                isManagement={isManagement}
            />
        );
    }

    // consulta_datos (fallback)
    return (
        <ConsultaDatosCard
            isManagement={isManagement}
            el={el as any}
            onRemove={() => removeElement(stepId, el.id)}
            onAddField={(f) => addPedidoField(stepId, el.id, f)}
            onRemoveField={(f) => removePedidoField(stepId, el.id, f)}
            onSubtypeChange={(subtype: DataSubtype) => onSubtypeChange(stepId, el.id, subtype)} // Pasando stepId
        />
    );
};

export default ElementRenderer;
