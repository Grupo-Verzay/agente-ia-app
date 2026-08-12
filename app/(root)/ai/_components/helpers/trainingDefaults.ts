export const WELCOME_TITLE = "INICIO FLUJO";
export const WELCOME_TITLE_LEGACY = "BIENVENIDA";

export type WelcomeType = "obligatoria" | "inteligente";

// Los dos modos hablan de "el PRIMER elemento de TEXTO del paso" y no de un
// número: la lista de elementos se arma como [función?, texto, extras...] y el
// elemento de FUNCIÓN solo entra si el paso tiene flujo. Sin flujo todo se corre
// un puesto y un número fijo apuntaría a la nota de control.
//
// El texto va en tablas y no en líneas corridas: así el orden de salida del
// turno —primero la función, después el texto, después esperar— queda en una
// columna numerada, y el modelo lo respeta mejor que cuando viene en párrafos.
export const WELCOME_MAIN_MESSAGE_OBLIGATORIA = `## 🔒 GATE — PRIMER TURNO (BIENVENIDA OBLIGATORIA)

**CONDICIÓN DE ACTIVACIÓN:**
\`collected == {}\` **AND** \`current_step == 1\` **AND** \`bienvenida_enviada != true\`

> 🚨 **PRIORIDAD ABSOLUTA.** Este bloque se ejecuta ante cualquier intención del usuario: texto, audio, imagen, sticker o mensaje de anuncio.

### 📤 SALIDA DEL TURNO — en este orden, siempre

| # | Acción | Condición |
|---|--------|-----------|
| 1º | **FUNCIÓN** (Ejecutar flujo) | Solo si el paso la tiene. Si no la tiene, se omite sin error. |
| 2º | **PRIMER elemento de TEXTO** del paso, palabra por palabra | Siempre sale, haya flujo o no. |
| 3º | **ESPERAR** respuesta del usuario | No emitir nada más. |

### ➡️ TRANSICIÓN

- \`bienvenida_enviada = true\` → se marca **siempre**, aunque el usuario no responda.
- \`current_step\` permanece en **1** hasta capturar la variable del paso; si el paso no tiene variable, hasta que el cliente envíe cualquier mensaje nuevo.

### 🚫 PROHIBIDO

- Saltar la BIENVENIDA, sea cual sea la intención del usuario.
- Ejecutar este bloque si \`bienvenida_enviada == true\` → continuar con el paso que corresponda.
- Reformular, resumir o parafrasear el texto. Sale palabra por palabra.
- Emitir los elementos marcados **NO EMITIR** (transición / notas de control).`;

// La bienvenida se gasta una sola vez por contacto: en RUTA A no llega a salir,
// pero igual se marca enviada. Si el cliente entró preguntando por un precio, ya
// fue atendido, y hacerle la bienvenida más tarde —en esa conversación o en
// cualquier otra— sería empezar de cero con alguien que ya viene conversando.
// La marca vive en el historial, así que a los 180 días, cuando se limpia, el
// contacto vuelve a ser nuevo y el ciclo se repite.
export const WELCOME_MAIN_MESSAGE_INTELIGENTE = `## 🔓 GATE — PRIMER TURNO (MODO INTELIGENTE)

**CONDICIÓN DE ACTIVACIÓN:**
\`collected == {}\` **AND** \`current_step == 1\` **AND** \`gate_evaluado != true\`

> 🚨 **PRIORIDAD ABSOLUTA.** Este bloque se ejecuta ante cualquier primer mensaje del usuario: texto, audio, imagen, sticker o mensaje de anuncio.

### 🧠 DECISIÓN — se evalúa una sola vez

- **INTENCIÓN DIRECTA** que corresponda a un paso destino declarado en TRANSICIÓN → **RUTA A**
- **Sin intención clara**, o intención que no mapea a un destino declarado → **RUTA B**
- En caso de duda → **RUTA B**

### 📤 RUTA A — Intención directa

| # | Acción | Condición |
|---|--------|-----------|
| 1º | Saltar la BIENVENIDA | No ejecutar su flujo ni su texto. |
| 2º | \`current_step\` = paso destino | Solo destinos declarados en TRANSICIÓN. |
| 3º | Ejecutar el paso destino con sus propios elementos | FUNCIÓN si la tiene, luego su PRIMER TEXTO. |

### 📤 RUTA B — Sin intención clara

| # | Acción | Condición |
|---|--------|-----------|
| 1º | **FUNCIÓN** (Ejecutar flujo) | Solo si el paso la tiene. Si no la tiene, se omite sin error. |
| 2º | **PRIMER elemento de TEXTO** del paso, palabra por palabra | Siempre sale, haya flujo o no. |
| 3º | **ESPERAR** respuesta del usuario | No emitir nada más. |

### ➡️ TRANSICIÓN

- \`gate_evaluado = true\` → se marca **siempre**, en ambas rutas.
- \`bienvenida_enviada = true\` → se marca **siempre**, en ambas rutas. Una vez evaluado el primer turno, este contacto no vuelve a ver la bienvenida en ninguna conversación.
- **RUTA A:** \`current_step\` = paso destino.
- **RUTA B:** \`current_step\` permanece en **1** hasta capturar la variable del paso; si el paso no tiene variable, hasta que el cliente envíe cualquier mensaje nuevo.

### 🚫 PROHIBIDO

- Ejecutar este bloque si \`gate_evaluado == true\` → continuar con el paso que corresponda.
- Saltar a un paso que **no** esté declarado como destino en TRANSICIÓN.
- Reformular, resumir o parafrasear el texto. Sale palabra por palabra.
- Emitir los elementos marcados **NO EMITIR** (transición / notas de control).`;

export const WELCOME_MESSAGES: Record<WelcomeType, string> = {
    obligatoria: WELCOME_MAIN_MESSAGE_OBLIGATORIA,
    inteligente: WELCOME_MAIN_MESSAGE_INTELIGENTE,
};

export const WELCOME_MAIN_MESSAGE = WELCOME_MAIN_MESSAGE_OBLIGATORIA;
