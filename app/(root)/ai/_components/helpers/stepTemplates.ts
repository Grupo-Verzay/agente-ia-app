import { nanoid } from "nanoid";

import type { ElementItem } from "@/types/agentAi";

export type StepTemplate = {
    id: string;
    name: string;
    description: string;
    content: string;
    /**
     * Lo que la plantilla deja armado además del texto.
     *
     * Cada plantilla nombra su propia acción, así que aplicarla y dejar el
     * bloque vacío obligaba a agregarla a mano, y quien no lo hacía se quedaba
     * con un texto que nombra algo que no existe.
     */
    elementos: (notificationNumber?: string | null) => ElementItem[];
};

const texto = (): ElementItem =>
    ({ id: nanoid(), kind: "text", text: "" }) as ElementItem;

const ejecutarFlujo = (): ElementItem =>
    ({
        id: nanoid(),
        kind: "function",
        fn: "ejecutar_flujo",
        flowId: null,
        flowName: null,
    }) as ElementItem;

const notificarAsesor = (notificationNumber?: string | null): ElementItem =>
    ({
        id: nanoid(),
        kind: "function",
        fn: "notificar_asesor",
        notificationNumber: notificationNumber ?? null,
    }) as ElementItem;

/**
 * Las tres plantillas.
 *
 * Antes había dieciséis, repartidas en siete fases de venta, escritas como
 * consejos: "saluda al cliente por su nombre", "reconoce que llega referido".
 * Nadie las usaba, y con razón: eso el modelo lo lee y lo interpreta, así que
 * cada conversación salía distinta.
 *
 * Estas no se interpretan. Dicen cuándo entra el bloque, qué sale, en qué orden
 * y qué está prohibido. Las tres se disparan igual —por el TÍTULO que el cliente
 * les ponga arriba, ahí van sus palabras: "precio", "garantía", "envío"— y se
 * diferencian solo en qué hace el bloque al activarse: ejecutar un flujo, avisar
 * al asesor, o simplemente responder.
 */
export const EJECUCION_POR_INTENCION = `## 🔒 GATE — EJECUCIÓN POR (INTENCIÓN / PALABRA)

**CONDICIÓN DE ACTIVACIÓN:**
\`gate_evaluado == true\` **AND** el mensaje del usuario coincide con alguno de los términos del **TÍTULO DE ESTE BLOQUE** (campo superior), o con su significado equivalente.

> 🚨 **PRIORIDAD ABSOLUTA.** Este bloque se ejecuta en cualquier momento de la conversación, siempre que se cumpla la condición de activación.

### 📤 SALIDA DEL TURNO — en este orden, siempre

| # | Acción | Condición |
|---|--------|-----------|
| 1º | **FUNCIÓN** (Ejecutar flujo) | Solo si este bloque la tiene. Si no la tiene, se omite sin error. |
| 2º | **PRIMER elemento de TEXTO** de este bloque, palabra por palabra | Siempre sale, haya flujo o no. |
| 3º | **ESPERAR** respuesta del usuario | No emitir nada más. |

### 🚫 PROHIBIDO

- Activar este bloque por coincidencia parcial o ambigua. Si no es clara → no activar, seguir el flujo en curso.
- Reformular, resumir o parafrasear el texto. Sale palabra por palabra.
- Emitir los elementos marcados **NO EMITIR** (transición / notas de control).`;

export const NOTIFICAR_ASESOR_POR_INTENCION = `## 🔒 GATE — NOTIFICAR ASESOR POR (INTENCIÓN / PALABRA)

**CONDICIÓN DE ACTIVACIÓN:**
\`gate_evaluado == true\` **AND** el mensaje del usuario coincide con alguno de los términos del **TÍTULO DE ESTE BLOQUE** (campo superior), o con su significado equivalente.

> 🚨 **PRIORIDAD ABSOLUTA.** Este bloque se ejecuta en cualquier momento de la conversación, siempre que se cumpla la condición de activación.

### 📤 SALIDA DEL TURNO — en este orden, siempre

| # | Acción | Condición |
|---|--------|-----------|
| 1º | **NOTIFICAR ASESOR** | Se ejecuta SIEMPRE que el bloque se active. Es una acción interna: el cliente no la ve. |
| 2º | **PRIMER elemento de TEXTO** de este bloque, palabra por palabra | Siempre sale. Es lo único que el cliente recibe. |
| 3º | **ESPERAR** respuesta del usuario | No emitir nada más. |

### 🚫 PROHIBIDO

- Activar este bloque por coincidencia parcial o ambigua. Si no es clara → no activar, seguir el flujo en curso.
- Anunciar, describir o mencionar la notificación al asesor. El cliente solo recibe el TEXTO del bloque.
- Reformular, resumir o parafrasear el texto. Sale palabra por palabra.
- Emitir los elementos marcados **NO EMITIR** (transición / notas de control).`;

export const RESPUESTA_POR_INTENCION = `## 🔒 GATE — RESPUESTA POR (INTENCIÓN / PALABRA)

**CONDICIÓN DE ACTIVACIÓN:**
\`gate_evaluado == true\` **AND** el mensaje del usuario coincide con alguno de los términos del **TÍTULO DE ESTE BLOQUE** (campo superior), o con su significado equivalente.

> 🚨 **PRIORIDAD ABSOLUTA.** Este bloque se ejecuta en cualquier momento de la conversación, siempre que se cumpla la condición de activación.

### 📤 SALIDA DEL TURNO — en este orden, siempre

| # | Acción | Condición |
|---|--------|-----------|
| 1º | **ACCIÓN** de este bloque | Solo si este bloque la tiene. Si no la tiene, se omite sin error. |
| 2º | **PRIMER elemento de TEXTO** de este bloque, palabra por palabra | Siempre sale, haya acción o no. |
| 3º | **ESPERAR** respuesta del usuario | No emitir nada más. |

### 🚫 PROHIBIDO

- Activar este bloque por coincidencia parcial o ambigua. Si no es clara → no activar, seguir el flujo en curso.
- Reformular, resumir o parafrasear el texto. Sale palabra por palabra.
- Emitir los elementos marcados **NO EMITIR** (transición / notas de control).`;

export const STEP_TEMPLATES: StepTemplate[] = [
    {
        id: "ejecucion_por_intencion",
        name: "Ejecutar flujo",
        description:
            "Al reconocer la palabra, lanza un flujo y responde con el texto del bloque.",
        content: EJECUCION_POR_INTENCION,
        elementos: () => [ejecutarFlujo(), texto()],
    },
    {
        id: "notificar_asesor_por_intencion",
        name: "Notificar al asesor",
        description:
            "Al reconocer la palabra, avisa al asesor por dentro y responde con el texto del bloque. El cliente no se entera del aviso.",
        content: NOTIFICAR_ASESOR_POR_INTENCION,
        elementos: (notificationNumber) => [notificarAsesor(notificationNumber), texto()],
    },
    {
        id: "respuesta_por_intencion",
        name: "Solo responder",
        description:
            "Al reconocer la palabra, responde con el texto del bloque. Sin acción, salvo la que le agregues después.",
        content: RESPUESTA_POR_INTENCION,
        elementos: () => [texto()],
    },
];

/**
 * Los elementos que faltan para dejar el bloque armado.
 *
 * Aplicar una plantilla sobre un bloque que ya tiene su acción no debe dejar dos
 * selectores de flujo ni dos avisos al asesor, así que solo se agrega lo que no
 * esté ya puesto.
 */
export function elementosQueFaltan(
    plantilla: StepTemplate,
    elements?: ElementItem[],
    notificationNumber?: string | null,
): ElementItem[] {
    const existentes = elements ?? [];
    const funcionesPuestas = new Set(
        existentes
            .filter((el) => el.kind === "function")
            .map((el) => (el as { fn?: string }).fn),
    );
    const yaHayTexto = existentes.some((el) => el.kind === "text");

    return plantilla.elementos(notificationNumber).filter((el) => {
        if (el.kind === "function") return !funcionesPuestas.has((el as { fn?: string }).fn);
        return !yaHayTexto;
    });
}
