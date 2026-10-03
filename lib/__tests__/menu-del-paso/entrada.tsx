import React from "react";
import { createRoot } from "react-dom/client";
import { TrainingBuilder } from "@/app/(root)/ai/_components/TrainingBuilder";
import { FqaBuilder } from "@/app/(root)/ai/_components/FqaBuilder";
import { ProductBuilder } from "@/app/(root)/ai/_components/ProductBuilder";
import { ExtraInfoBuilder } from "@/app/(root)/ai/_components/ExtraInfoBuilder";

/**
 * La maqueta del banco del MENÚ DEL PASO: las cuatro pestañas REALES del
 * entrenamiento (Inicio, Preguntas, Productos y Extras), cada una con un solo
 * elemento abierto. Lo único fingido son las acciones de servidor (las
 * empaqueta mudas `empaquetar-con-acciones-mudas`).
 *
 * `window.pintar(pestana)` monta una; el banco abre «Agregar acción», lee el
 * menú que pinta Radix, agrega un caso y una transición, y mide las tarjetas.
 */
const nada = () => {};
const PASOS_DEL_INICIO = [
    { id: "p1", title: "BIENVENIDA" },
    { id: "p2", title: "CALIFICAR" },
    { id: "p3", title: "CERRAR VENTA" },
];
const paso = (id: string, title: string) => ({ id, title, mainMessage: "", elements: [], openPicker: false });

const comun = {
    flows: [],
    notificationNumber: "573000000000",
    promptId: "prompt-banco",
    version: 1,
    onVersionChange: nada,
    onChange: nada,
    registerSaveHandler: nada,
};

const PESTANAS: Record<string, () => React.ReactElement> = {
    inicio: () => (
        <TrainingBuilder
            {...(comun as any)}
            values={{ training: "" }}
            handleChange={() => nada}
            initialSteps={[paso("p2", "CALIFICAR")]}
        />
    ),
    preguntas: () => (
        <FqaBuilder
            {...(comun as any)}
            values={{ faq: "" }}
            handleChange={() => nada}
            initialItems={[paso("q1", "HORARIOS")]}
            pasosDelInicio={PASOS_DEL_INICIO}
        />
    ),
    productos: () => (
        <ProductBuilder
            {...(comun as any)}
            values={{ products: "" }}
            handleChange={() => nada}
            initialItems={[paso("r1", "CAFÉ MOLIDO")]}
            pasosDelInicio={PASOS_DEL_INICIO}
        />
    ),
    extras: () => (
        <ExtraInfoBuilder
            {...(comun as any)}
            values={{ more: "" }}
            handleChange={() => nada}
            initialExtras={{ items: [paso("e1", "ENVÍOS")] } as any}
            pasosDelInicio={PASOS_DEL_INICIO}
        />
    ),
};

(window as any).pintar = (pestana: string) => {
    const nodo = document.getElementById("app")!;
    (window as any).__raiz?.unmount();
    (window as any).__raiz = createRoot(nodo);
    const Pestana = PESTANAS[pestana];
    (window as any).__raiz.render(<div key={pestana}>{Pestana()}</div>);
};
(window as any).listo = true;
