// components/training/ElementRenderer.tsx
"use client";

import { FC } from "react";
import {
    DataSubtype,
    ElementoLeerGoogleSheets,
    ElementoNotaInterna,
    ElementRouting,
    PedidoFunctionEl,
    PropsActionSteeps,
    PropsConsultaDatos,
    PropsExecuteFlow,
    PropsNotifyAsesor,
} from "@/types/agentAi";
import {
    TextRuleCard,
    CapturaDatosCard,
    ActualizarDatosCard,
    EjecutarFlujoCard,
    NotificarAsesorCard,
    ConsultaDatosCard,
    RoutingCard,
    LeerGoogleSheetsCard,
    NotaInternaCard,
    CasoCard,
    TransicionCard,
} from "./";
import { pasosParaLaTransicion } from "@/lib/maqueta-del-paso";

const ElementRenderer: FC<PropsActionSteeps & { onAddRule?: () => void }> = ({
    stepId,
    el,
    flows,
    removeElement,
    updateText,
    setFlowOnElement,
    addPedidoField,
    removePedidoField,
    onSubtypeChange,
    isManagement,
    onAddRule,
    steps,
    updateRoutingRules,
    updateSheetUrl,
    updateNotaInterna,
    updateCaso,
    updateTransicion,
    numeroDeCaso,
    pasosDelInicio,
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
                el={el}
                onRemove={() => removeElement(stepId, el.id)}
                onAddField={(f) => addPedidoField(stepId, el.id, f)}
                onRemoveField={(f) => removePedidoField(stepId, el.id, f)}
                onSubtypeChange={(subtype: DataSubtype) => onSubtypeChange(stepId, el.id, subtype)}
                isManagement={isManagement}
                onAddRule={onAddRule}
            />
        );
    }

    if (el.kind === "function" && el.fn === "actualizar_datos") {
        return (
            <ActualizarDatosCard
                el={el}
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
                el={el as PropsExecuteFlow['el']}
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
                el={el as PropsNotifyAsesor['el']}
                onRemove={() => removeElement(stepId, el.id)}
                isManagement={isManagement}
            />
        );
    }

    if (el.kind === "function" && el.fn === "leer_google_sheets") {
        return (
            <LeerGoogleSheetsCard
                el={el as ElementoLeerGoogleSheets}
                onRemove={() => removeElement(stepId, el.id)}
                onChangeUrl={(url) => updateSheetUrl?.(stepId, el.id, url)}
                isManagement={isManagement}
            />
        );
    }

    if (el.kind === "function" && el.fn === "nota_interna") {
        return (
            <NotaInternaCard
                el={el as ElementoNotaInterna}
                onRemove={() => removeElement(stepId, el.id)}
                onChangeNota={(nota) => updateNotaInterna?.(stepId, el.id, nota)}
                isManagement={isManagement}
            />
        );
    }

    if (el.kind === "function" && el.fn === "caso") {
        const caso = el as { escenario?: string | null; respuesta?: string | null };
        return (
            <CasoCard
                numero={numeroDeCaso && numeroDeCaso > 0 ? numeroDeCaso : 1}
                escenario={caso.escenario ?? ""}
                respuesta={caso.respuesta ?? ""}
                onChange={(cambio) => updateCaso?.(stepId, el.id, cambio)}
                onRemove={() => removeElement(stepId, el.id)}
            />
        );
    }

    if (el.kind === "function" && el.fn === "transicion") {
        return (
            <TransicionCard
                pasos={pasosParaLaTransicion(
                    (pasosDelInicio ?? steps ?? []).map((s) => ({ id: s.id, titulo: s.title })),
                    stepId,
                )}
                fueraDeInicio={!!pasosDelInicio}
                destino={(el as { destino?: string | null }).destino ?? null}
                onChange={(id) => updateTransicion?.(stepId, el.id, id)}
                onRemove={() => removeElement(stepId, el.id)}
            />
        );
    }

    if (el.kind === "function" && el.fn === "enrutamiento") {
        return (
            <RoutingCard
                el={el as ElementRouting}
                onRemove={() => removeElement(stepId, el.id)}
                steps={steps ?? []}
                onUpdateRules={(rules) => updateRoutingRules?.(stepId, el.id, rules)}
                isManagement={isManagement}
            />
        );
    }

    // consulta_datos (fallback)
    return (
        <ConsultaDatosCard
            isManagement={isManagement}
            el={el}
            onRemove={() => removeElement(stepId, el.id)}
            onAddField={(f) => addPedidoField(stepId, el.id, f)}
            onRemoveField={(f) => removePedidoField(stepId, el.id, f)}
            onSubtypeChange={(subtype: DataSubtype) => onSubtypeChange(stepId, el.id, subtype)}
        />
    );
};

export default ElementRenderer;
