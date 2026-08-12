export type StepTemplate = {
    id: string;
    name: string;
    description: string;
    content: string;
};

/**
 * La única plantilla.
 *
 * Antes había dieciséis, repartidas en siete fases de venta, escritas como
 * consejos: "saluda al cliente por su nombre", "reconoce que llega referido".
 * Nadie las usaba, y con razón: eso el modelo lo lee y lo interpreta, así que
 * cada conversación salía distinta. No se borraron por hacer sitio, sino porque
 * no servían para lo que una plantilla tiene que servir.
 *
 * Esta no se interpreta. Dice cuándo entra el bloque, qué sale, en qué orden y
 * qué está prohibido. Lo que la dispara es el TÍTULO que el cliente le ponga
 * arriba —ahí van sus palabras, "precio", "garantía", "envío"—, así que la misma
 * plantilla sirve para cualquier tema sin cambiarle una línea.
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

export const STEP_TEMPLATES: StepTemplate[] = [
    {
        id: "ejecucion_por_intencion",
        name: "Ejecución por intención / palabra",
        description:
            "El bloque se dispara cuando el cliente dice algo que coincide con el título que le pongas arriba, en cualquier momento de la conversación.",
        content: EJECUCION_POR_INTENCION,
    },
];
