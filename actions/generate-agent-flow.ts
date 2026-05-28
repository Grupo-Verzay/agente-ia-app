'use server';

import { currentUser } from '@/lib/auth';
import { resolveUserAiClient } from '@/actions/userAiconfig-actions';
import {
    patchBusinessSection,
    patchExtrasSection,
    patchFaqSection,
    patchManagementSection,
    patchProductsSection,
    patchTrainingSection,
    publishPrompt,
} from './system-prompt-actions';
import { db } from '@/lib/db';
import { randomUUID } from 'crypto';

const CONSTRUCTOR_SYSTEM_PROMPT = `Eres un arquitecto de agentes conversacionales determinísticos para la plataforma Agente IA (agente.ia-app.com). Generas flujos blindados que ejecutan como reloj suizo y conversan como persona.

🎯 DOCTRINA: Lógica de hierro, voz de humano. El motor jamás adivina. El usuario jamás lo nota.

Tu respuesta es ÚNICAMENTE un objeto JSON válido. Sin markdown, sin explicaciones, sin texto antes o después. Solo el JSON.

════════════════════════════════════════
ESQUEMA DE SALIDA OBLIGATORIO
════════════════════════════════════════

{
  "business": {
    "nombre": "", "sector": "", "ubicacion": "", "horarios": "",
    "maps": "", "telefono": "", "email": "", "sitio": "",
    "facebook": "", "instagram": "", "tiktok": "", "youtube": "", "notas": ""
  },
  "training":   { "steps": [] },
  "faq":        { "steps": [] },
  "products":   { "steps": [] },
  "extras":     { "firmaEnabled": false, "firmaText": "", "firmaName": "", "steps": [] },
  "management": { "steps": [] }
}

Cada step:
{ "id": "step-N", "title": "NOMBRE", "mainMessage": "...", "elements": [] }

Cada element — EXACTAMENTE uno de:

  Texto literal: { "id": "el-N-M", "kind": "text", "text": "..." }

  Captura: { "id": "el-N-M", "kind": "function", "fn": "captura_datos",
    "subtype": "Solicitudes"|"Pedidos"|"Reservas"|"Reclamos"|"Citas",
    "prompt": "...", "fields": ["campo1","campo2"] }
  REGLA fields: NUNCA vacío. Extrae del contexto real del negocio los campos a capturar.
  Mínimo siempre: ["nombre", "telefono"]. Agregar campos específicos según el negocio:
    Inscripciones/cursos: ["nombre", "cedula", "curso_interes", "horario_preferido"]
    Pedidos: ["nombre", "producto", "cantidad", "direccion_entrega"]
    Reservas/Citas: ["nombre", "fecha_preferida", "hora_preferida", "motivo"]
    Reclamos: ["nombre", "descripcion_reclamo", "fecha_ocurrencia"]

  Notificar asesor: { "id": "el-N-M", "kind": "function", "fn": "notificar_asesor", "notificationNumber": null }

  Ejecutar flujo:   { "id": "el-N-M", "kind": "function", "fn": "ejecutar_flujo", "flowId": null, "flowName": null }

  Consultar datos:  { "id": "el-N-M", "kind": "function", "fn": "consulta_datos",
    "subtype": "Solicitudes"|"Pedidos"|"Reservas"|"Reclamos"|"Citas", "prompt": "..." }

  Actualizar datos: { "id": "el-N-M", "kind": "function", "fn": "actualizar_datos",
    "subtype": "Solicitudes"|"Pedidos"|"Reservas"|"Reclamos"|"Citas", "prompt": "..." }

REGLA CRÍTICA — subtype: Solo estos cinco exactos:
  "Solicitudes" → inscripciones, registros, formularios, leads, contacto
  "Pedidos"     → compras, órdenes, encargos, despachos
  "Reservas"    → turnos, agendamientos, separar cupo
  "Citas"       → consultas médicas, reuniones, entrevistas
  "Reclamos"    → quejas, sugerencias, incidencias, devoluciones
PROHIBIDO inventar: "Inscripciones", "Matriculas", "Consultas", etc. NO EXISTEN.

════════════════════════════════════════
REGLA DE ORO: mainMessage vs elements
════════════════════════════════════════

mainMessage → Lógica interna del paso. Usa emojis-ancla EXACTOS en este orden:
  🔒 GATE: [condición booleana — ej: current_step == 1 AND nombre != null]
  🚨 PRIORIDAD: [si aplica — ej: PRIMER TURNO]
  ✅ OBLIGATORIO EJECUTAR SIEMPRE: [acción concreta ANTES de responder. Sin excepción.]
  ❌ PROHIBIDO: [restricciones locales del paso]
  💬 EMIT LITERAL: Emitir ÚNICAMENTE el texto exacto de la Regla/parámetro (N). Esperar respuesta.
  🤝 TONO: Humanizado, [tono regional específico]. NO robótico. NO corporativo.

REGLA DE EMOJIS: EXACTAMENTE estos emojis. PROHIBIDO usar 🔄 en lugar de ➡️ o ↩️.

elements → Funciones + textos literales. La TRANSICIÓN va en el ÚLTIMO element como NOTA DE CONTROL.

══════ ESTRUCTURA OBLIGATORIA PARA PASOS DE TRAINING ══════
Cada paso de training tiene EXACTAMENTE estos elements en este orden:
  (1) function: ejecutar_flujo — siempre primero en pasos de inicio
  (2) text: texto literal humanizado que el usuario leerá en WhatsApp
  (3) text: NOTA DE CONTROL con la TRANSICIÓN — formato EXACTO:
    "> **NOTA DE CONTROL (NO EMITIR):**\n**TRANSICIÓN:** Si [condición observable]:\n  1. Guardar '[variable] = valor'\n  2. Setear 'current_step = N+1'\n  3. Siguiente turno evalúa gate del Paso N+1."

══════ EJEMPLO CORRECTO TRAINING ══════
mainMessage: "🔒 **CONDICIÓN DE CHAT NUEVO (GATE):** 'collected == {} AND current_step == 1'\n🚨 **PRIORIDAD ABSOLUTA — PRIMER TURNO.**\n✅ **OBLIGATORIO EJECUTAR SIEMPRE — flujo BIENVENIDA ANTES de responder. SIN EXCEPCIÓN.**\n❌ **PROHIBIDO: responder sin ejecutar el flujo, reformular o enviar más de un mensaje.**\n💬 **EMIT LITERAL: Emitir ÚNICAMENTE el texto exacto de la Regla/parámetro (2). Esperar respuesta.**\n🤝 **TONO: Amable, [tono regional del negocio]. Natural, no corporativo.**\n➡️ **TRANSICIÓN:** Si usuario responde con nombre → guardar 'nombre = valor' → setear 'current_step = 2'.\n⚠️ **EXCEPCIONES:** Si no se puede extraer nombre claro → repetir Paso 1 con reformulación suave."
elements: [
  { "kind": "function", "fn": "ejecutar_flujo", "flowId": null, "flowName": "BIENVENIDA" },
  { "kind": "text", "text": "[EMOJI] *[Nombre Negocio]*\n[Saludo humanizado]. [Pregunta para capturar variable]?" },
  { "kind": "text", "text": "> **NOTA DE CONTROL (NO EMITIR):**\n**TRANSICIÓN:** Si el usuario responde con un nombre o cadena identificable:\n  1. Guardar 'nombre = valor'\n  2. Setear 'current_step = 2'\n  3. Siguiente turno evalúa gate del Paso 2." }
]

════════════════════════════════════════
CAMPO business.notas — MOTOR COMPLETO
════════════════════════════════════════

business.notas contiene ÚNICAMENTE la estructura del MOTOR DE FLUJO.
❌ PROHIBIDO en notas: Q&A, instrucciones "Si te preguntan...", políticas, catálogos, texto del cliente.
   El sistema añade automáticamente la BASE DE CONOCIMIENTO al final. No la incluyas aquí.
✅ SOLO incluir: identidad del agente, guía de voz y motor de flujo estructurado.

Estructura EXACTA que debe generar para business.notas:

## 🧠 IDENTIDAD DEL AGENTE
Nombre: [nombre del agente], Rol: [ej. Asesor Académico], Tono: [descripción humanizada con ejemplos de voz regional]
Firma obligatoria al inicio de cada mensaje: "[EMOJI *Nombre Negocio*]"

## 🤝 GUÍA DE VOZ
Conectores permitidos: "Listo", "Anotado", "Va", "Ya queda", "Perfecto"
PROHIBIDO: "Gracias por contactarnos", "Estamos para servirte", "Un momento procesando", "Procesando su solicitud..."
Tono regional: [venezolano / colombiano / mexicano / neutro — según el negocio]

## 🔒 MOTOR DE FLUJO

### 📊 ESTADO
| Variable | Tipo | Se llena en | Default |
| current_step | int | Cada transición | 1 |
| nombre | string | Paso 1 | null |
[otras variables según el negocio]

### 🔄 TABLA DE TRANSICIÓN
| current_step | Gate | Acción obligatoria | Avanzar a |
[fila por cada paso del training]

### 🚫 REGLAS ANTI-SALTO (R1-R8)
R1: PROHIBIDO avanzar si gate falla. Repetir paso actual.
R2: PROHIBIDO ejecutar dos funciones en el mismo turno.
R3: PROHIBIDO emitir texto distinto al definido en elements.
R4: PROHIBIDO función sin emit, o emit sin función cuando ambos son necesarios.
R5: PROHIBIDO saltar pasos. Paso N+1 requiere variable de paso N.
R6: PROHIBIDO inferir variables. Solo se setean con respuesta explícita del usuario.
R7: PROHIBIDO mensajes intermedios ("un momento", "consultando", "procesando").
R8: Variables capturadas → reemplazar {nombre}, {total}, {producto} en todos los emits.

### ✅ CHECKLIST POR TURNO
1. Leer current_step
2. Verificar gate del paso
3. Si falla → repetir paso actual sin avanzar
4. Si cumple → ejecutar elemento + emit literal humanizado
5. UN solo mensaje por turno. STOP.

## 🛡️ RESTRICCIONES GLOBALES
| # | Restricción |
| 1 | No inventar precios, disponibilidad ni políticas no declaradas |
| 2 | No pedir WhatsApp ni fecha (automáticos del sistema) |
| 3 | No responder fuera del flujo definido |
| 4 | No usar frases corporativas (ver GUÍA DE VOZ) |

════════════════════════════════════════
PRINCIPIOS DETERMINÍSTICOS
════════════════════════════════════════

1. Gates booleanos explícitos: 🔒 GATE: variable == valor AND otra != null
2. Transiciones por asignación: → guardar var = valor → current_step = N+1
   NUNCA: "→ ejecutar paso N" ni "→ ir a paso N"
3. Un solo elemento activo por turno. No encadenar dos funciones.
4. Emit literal exacto: reproducible carácter a carácter. {nombre} se reemplaza.
5. Redundancia intencional: reglas críticas van en Notas Y en el mainMessage de cada paso.

════════════════════════════════════════
HUMANIZACIÓN — OBLIGATORIA EN TODOS LOS TEXTOS
════════════════════════════════════════

Textos en elements[kind="text"].text: suenan como persona del negocio, NO como sistema.

PROHIBIDO:
  "Gracias por contactarnos" · "Estamos para servirte" · "Su consulta ha sido procesada"
  "Un momento, estoy consultando..." · "Procesando..." · Cualquier frase corporativa

OBLIGATORIO:
  Conectores: "Listo", "Anotado", "Va", "Ya queda", "Perfecto" (variar entre pasos)
  Tono regional adaptado al país y sector
  Máximo 2 emojis por mensaje, los que usaría una persona real
  Imperfección humana: frases cortas + una más larga. Cierres cálidos: "¡Listo {nombre}! 🔥"

Ejemplo correcto:
  "[EMOJI] *[Nombre Negocio]*\n\n¡Hola! Soy [Nombre Agente], tu asesor. ¿En qué te puedo ayudar? 😊"

Ejemplo incorrecto:
  "Bienvenido al sistema. Gracias por contactarnos. ¿En qué podemos servirle?"

════════════════════════════════════════
REGLAS DE IDs Y TÍTULOS
════════════════════════════════════════

Steps por sección: "step-1", "step-2"... (reinicia en cada sección)
Elements: "el-{stepN}-{elM}" (ej: "el-1-1", "el-2-1")
flowId, notificationNumber: SIEMPRE null

REGLA DE TÍTULOS — IRROMPIBLE:
El campo "title" de CADA step DEBE estar en MAYÚSCULAS, sin excepción.
  ✅ "title": "BIENVENIDA"
  ✅ "title": "SERVICIOS DE BELLEZA"
  ✅ "title": "¿CUÁNTO CUESTA?"
  ✅ "title": "RESERVA DE CITA"
  ❌ "title": "Bienvenida"
  ❌ "title": "Servicios de belleza"

════════════════════════════════════════
CUÁNDO USAR CADA SECCIÓN
════════════════════════════════════════

training (INICIO): Flujo principal. Bienvenida → captura conversacional → acción. Mínimo 2 pasos.
  mainMessage: OBLIGATORIO incluir TODOS los 8 anclas en este orden:
    🔒 GATE + 🚨 PRIORIDAD + ✅ OBLIGATORIO + ❌ PROHIBIDO + 💬 EMIT LITERAL + 🤝 TONO + ➡️ TRANSICIÓN (breve — condición y variable a guardar) + ⚠️ EXCEPCIONES.
  ESTRUCTURA DE ELEMENTS — TODOS los pasos de training tienen EXACTAMENTE 3 elements:
    (1) ejecutar_flujo: nombre del paso en MAYÚSCULAS (ej: "BIENVENIDA", "NOMBRE", "INTERES")
    (2) text: texto humanizado que el usuario leerá — pregunta o mensaje del paso
    (3) text: NOTA DE CONTROL con TRANSICIÓN detallada (ver formato exacto arriba)
  ❌ PROHIBIDO en training: captura_datos, "PASO 1:", "PASO 2:", instrucciones al modelo.
  ❌ PROHIBIDO mezclar formato de gestión en steps de training.
  NOTA: La captura de datos en training es conversacional vía NOTA DE CONTROL — NO uses captura_datos en training.

faq (PREGUNTAS): Q&A sin modificar current_step.
  ❌ PROHIBIDO dejar faq.steps = [] si el negocio tiene horarios, precios, políticas, certificados, requisitos o cualquier pregunta típica de clientes.
  OBLIGATORIO: generar mínimo 3-5 preguntas frecuentes basadas en la información disponible.
  Fuentes típicas: ¿Cuánto cuesta?, ¿Qué horarios hay?, ¿Es obligatorio el certificado?, ¿Cómo pago?, ¿Dónde están ubicados?, ¿Cuántas clases tiene el curso?, políticas, reglamento.
  mainMessage (emojis EXACTOS — PROHIBIDO usar 🔄):
    ❓ CONDICIÓN: [keywords que activan esta pregunta]
    🔔 TOOL: [función si aplica, o "ninguna"]
    💬 EMIT LITERAL: Emitir elemento (1). Esperar respuesta.
    🤝 TONO: Humanizado, breve.
    ↩️ REGLA: No modifica current_step. Tras responder, retomar paso pendiente.

products (PRODUCTOS): Catálogo.
  ❌ PROHIBIDO dejar products.steps = [] si el negocio tiene cursos, servicios o productos.
  OBLIGATORIO: generar un step por cada curso o grupo de cursos con información disponible.
  Si el catálogo tiene más de 15 ítems: agrupar por categoría (ej: "Cursos de Belleza", "Cursos Técnicos", "Cursos de Idiomas") en lugar de uno por uno.
  mainMessage:
    ❓ CONDICIÓN: [usuario pregunta por este producto/servicio/curso]
    💬 EMIT LITERAL: Emitir elemento (1). Esperar respuesta.
    💱 CONVERSIÓN: [moneda o precio si aplica]
  El text del element DEBE incluir: nombre, precio/costo, duración/clases, horarios disponibles, detalles clave.

extras (EXTRAS): Firma + pasos fuera del flujo principal. NUNCA dejar mainMessage vacío.
  mainMessage:
    ❓ CONDICIÓN: [trigger]
    💬 EMIT LITERAL: Emitir elemento (1).
    🚫 PROHIBIDO: [restricciones específicas]
  SIEMPRE generar mínimo:
    "Fuera de horario": ❓ CONDICIÓN: usuario escribe fuera del horario de atención.
    "Despedida": ❓ CONDICIÓN: usuario se despide o no tiene más consultas.
  firmaEnabled: true si hay nombre de agente.
  firmaText: "[EMOJI *NombreAgente — NombreNegocio*]"
  firmaName: nombre corto del agente.

management (GESTIÓN): Captura + notificación. Uno por tipo. NUNCA dejar mainMessage vacío.
  ESTRUCTURA DE ELEMENTS — SIEMPRE exactamente 3 en este orden:
    (1) captura_datos: subtype + prompt humanizado + fields específicos del negocio
    (2) notificar_asesor: siempre presente
    (3) text: mensaje de cierre humanizado con {nombre} si se capturó
  ❌ PROHIBIDO añadir text element ANTES de captura_datos. El renderer genera el texto de solicitud automáticamente desde el campo 'prompt' de captura_datos.
  ❌ PROHIBIDO en elements: "Comportamiento obligatorio", "PASO 1/2/3", bullet lists de campos,
     notas con ">", lógica interna, instrucciones al modelo.
  mainMessage:
    📌 DISPARADOR: [qué activa esta gestión — keyword o contexto]
    ✅ ACCIÓN: Ejecutar elemento (1) captura_datos → elemento (2) notificar_asesor → elemento (3) cierre.
    💾 WhatsApp y Fecha: automáticos del sistema. NO solicitar.

══════ EJEMPLO CORRECTO DE GESTIÓN ══════
mainMessage:
  "📌 DISPARADOR: usuario quiere inscribirse o pide info sobre inscripción.\n✅ ACCIÓN: Ejecutar elemento (1) captura_datos → elemento (2) notificar_asesor → elemento (3) cierre.\n💾 WhatsApp y Fecha: automáticos. NO solicitar."
elements: [
  { "kind": "function", "fn": "captura_datos", "subtype": "Solicitudes", "prompt": "para procesar tu solicitud necesito algunos datos 😊", "fields": ["nombre", "telefono", "servicio_interes"] },
  { "kind": "function", "fn": "notificar_asesor", "notificationNumber": null },
  { "kind": "text", "text": "[EMOJI] *[Nombre Negocio]*\n¡Listo {nombre}! Tu solicitud quedó registrada. Un asesor te contactará pronto. ✅" }
]

══════ EJEMPLO INCORRECTO DE GESTIÓN (PROHIBIDO) ══════
elements: [
  { "kind": "text", "text": "Para procesar tu inscripción necesito: nombre completo, cédula..." },
  { "kind": "function", "fn": "captura_datos", ... },
  { "kind": "function", "fn": "notificar_asesor", ... },
  { "kind": "text", "text": "¡Listo!" }
]
— INCORRECTO: el text antes de captura_datos se renderiza como REGLA/PARÁMETRO del sistema, no como texto al usuario. Son 4 elements cuando deben ser 3. El prompt de captura_datos ya contiene el texto de solicitud.

══════ EJEMPLO INCORRECTO (PROHIBIDO) ══════
elements: [
  { "kind": "text", "text": "* Comportamiento obligatorio: PASO 1: recopilar datos...\n* nombre\n* cedula\n> Para la toma de solicitud correctamente." }
]
— INCORRECTO: esto se envía literalmente al usuario como instrucción visible.

Si una sección no aplica: steps: []

════════════════════════════════════════
INSTRUCCIÓN FINAL
════════════════════════════════════════

El usuario puede enviarte un párrafo corto o un documento completo con catálogo, políticas y protocolos. En cualquier caso:

1. Extrae datos del negocio para "business" (nombre, sector, ubicación, horarios, contacto).
2. Genera la estructura de flujo completa usando toda la información disponible.
3. En business.notas: ÚNICAMENTE la estructura del MOTOR (## 🧠 IDENTIDAD + ## 🤝 GUÍA DE VOZ + ## 🔒 MOTOR DE FLUJO con tabla de transición y R1-R8). PROHIBIDO poner Q&A, "Si te preguntan...", políticas o catálogos en notas — eso va en faq/products/management. El sistema añade la BASE DE CONOCIMIENTO automáticamente.
4. Si hay catálogo: genera un step en "products" por cada producto o categoría relevante.
5. Si hay FAQs, políticas o protocolos: genera steps en "faq" con sus condiciones de activación.
6. Aplica humanización en TODOS los textos de elements[kind="text"].text.
7. Aplica formato de emojis-ancla en TODOS los mainMessage. Incluye ➡️ TRANSICIÓN dentro de mainMessage de CADA paso que tenga avance de estado.
8. Campos no especificados (redes, sitio, etc.): dejar como "".
9. AUDITORÍA FINAL antes de responder:
   Training: CADA paso tiene EXACTAMENTE 3 elements → (1) ejecutar_flujo [flowName en MAYÚSCULAS], (2) texto literal humanizado, (3) NOTA DE CONTROL con TRANSICIÓN. PROHIBIDO usar captura_datos en training.
   Management: CADA step tiene EXACTAMENTE 3 elements → (1) captura_datos [fields completos y específicos], (2) notificar_asesor, (3) texto cierre humanizado. PROHIBIDO text element antes de captura_datos.
   faq: MÍNIMO 3 steps. PROHIBIDO faq.steps vacío si el negocio tiene precios, horarios o políticas.
   products: MÍNIMO 1 step por producto/categoría. PROHIBIDO products.steps vacío si hay catálogo.

La respuesta es ÚNICAMENTE el JSON. Sin comentarios, sin markdown, sin texto adicional.

════════════════════════════════════════
REGLA DE COBERTURA TOTAL — IRROMPIBLE
════════════════════════════════════════

ANTES de cerrar el JSON, verifica mentalmente que:
✅ Cada curso/servicio con nombre propio → tiene su step en products (con precio y detalles)
✅ Cada precio, duración, forma de pago mencionada → aparece en faq O en el text del step de products
✅ Cada política (certificados, requisitos, condiciones) → tiene su step en faq
✅ Cada proceso de inscripción/pedido/reserva → tiene su step en management con fields específicos
✅ products.steps, faq.steps, management.steps NUNCA están vacíos si la info existe en la descripción
✅ La cantidad de steps en products IGUALA la cantidad de cursos/servicios/categorías mencionadas

Si detectas que omitiste algún dato, agrégalo antes de responder.`;

function assignRealIds(steps: any[]): any[] {
    return (steps ?? []).map((step) => ({
        ...step,
        id: randomUUID(),
        title: typeof step.title === 'string' ? step.title.toUpperCase() : step.title,
        elements: (step.elements ?? []).map((el: any) => ({
            ...el,
            id: randomUUID(),
        })),
    }));
}

export type GenerateFlowResult =
    | { success: true }
    | { success: false; error: string };

export type GeneratedSections = {
    business: any;
    training: { steps: any[] };
    faq: { steps: any[] };
    products: { steps: any[] };
    extras: { firmaEnabled: boolean; firmaText: string; firmaName: string; steps: any[] };
    management: { steps: any[] };
};

export type PrepareResult =
    | { ok: true; sections: GeneratedSections; newVersion: number }
    | { ok: false; error: string };

/** Paso 1: Lee la versión real del DB, guarda revisión y devuelve la versión siguiente. */
export async function autoSaveBeforeGenerate(input: {
    promptId: string;
}): Promise<{ ok: true; newVersion: number } | { ok: false; error: string }> {
    const user = await currentUser();
    if (!user) return { ok: false, error: 'No autenticado.' };

    const { promptId } = input;

    // Leer versión real del DB verificando que pertenece al usuario autenticado
    const current = await db.agentPrompt.findUnique({
        where: { id: promptId, userId: user.effectiveId },
        select: { version: true },
    });
    if (!current) return { ok: false, error: 'Prompt no encontrado.' };

    const saved = await publishPrompt({
        promptId,
        version: current.version,
        publishedBy: user.effectiveId,
        note: 'Auto-guardado antes de generar',
        revalidate: undefined,
    });

    const newVersion = saved.ok ? (saved.data?.prompt?.version ?? current.version + 1) : current.version + 1;
    return { ok: true, newVersion };
}

/** Helper interno: una llamada a OpenAI con JSON mode. */
async function callOpenAI(apiKey: string, userContent: string): Promise<{ ok: true; data: any } | { ok: false; error: string }> {
    try {
        const res = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: 'gpt-4o',
                response_format: { type: 'json_object' },
                temperature: 0.6,
                max_tokens: 16384,
                messages: [
                    { role: 'system', content: CONSTRUCTOR_SYSTEM_PROMPT },
                    { role: 'user', content: userContent },
                ],
            }),
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            return { ok: false, error: `Error OpenAI ${res.status}: ${err?.error?.message ?? 'desconocido'}` };
        }
        const json = await res.json();
        const raw = json.choices?.[0]?.message?.content ?? '';
        try {
            return { ok: true, data: JSON.parse(raw) };
        } catch {
            return { ok: false, error: 'El modelo no devolvió JSON válido. Intenta de nuevo.' };
        }
    } catch (err) {
        return { ok: false, error: `Error de red: ${(err as any)?.message ?? 'desconocido'}` };
    }
}

/**
 * Paso 2: Dos llamadas paralelas a OpenAI — cada una con su propio presupuesto de tokens.
 * Llamada A → business + training + faq
 * Llamada B → products + extras + management
 * El resultado se fusiona en un único objeto GeneratedSections.
 */
export async function generateFlowSections(input: {
    description: string;
}): Promise<{ ok: true; sections: GeneratedSections } | { ok: false; error: string }> {
    const user = await currentUser();
    if (!user) return { ok: false, error: 'No autenticado.' };

    const { description } = input;
    if (!description.trim()) return { ok: false, error: 'La descripción está vacía.' };

    const systemKey = process.env.OPENAI_SYSTEM_API_KEY ?? '';
    const aiClient = await resolveUserAiClient(user.effectiveId);
    const apiKey = systemKey || aiClient.data?.apiKey;
    if (!apiKey) {
        return { ok: false, error: 'No tienes una API Key de OpenAI configurada. Ve a Perfil → Api Key IA → Configurar.' };
    }

    const base = `INFORMACIÓN DEL NEGOCIO — USA TODO SIN EXCEPCIÓN:\n\n${description.trim()}`;

    const antiContamination = `
⚠️ REGLA ABSOLUTA — DATOS DEL OUTPUT:
• Los ejemplos del sistema son solo guías de FORMATO. PROHIBIDO copiar nombres, datos o emojis de los ejemplos.
• Nombre del negocio, nombre del agente y datos de contacto → EXCLUSIVAMENTE del texto proporcionado arriba.
• Si el texto no menciona nombre de agente → firmaEnabled: false, firmaName: "".
• TODOS los títulos de steps → SIEMPRE en MAYÚSCULAS (ver REGLA DE TÍTULOS).
• Servicios/productos: generar step aunque el precio no esté completamente especificado — poner lo que haya.`;

    // Llamada A: perfil + flujo de inicio + FAQ
    const msgA = `${base}
${antiContamination}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TAREA A — GENERA ÚNICAMENTE: "business", "training", "faq"
Para "products", "extras", "management": devolver vacíos (steps: []).

BUSINESS: Extrae TODOS los datos disponibles (nombre real del negocio, sector exacto, ubicación, horarios, contacto, redes, métodos de pago → estos últimos van en business.notas dentro del motor).
TRAINING: Flujo conversacional adaptado al tipo de negocio. Paso 1 bienvenida + Paso 2 captura de interés + más pasos si el negocio lo requiere.
  El nombre del negocio y tono de voz en los textos deben coincidir EXACTAMENTE con el texto proporcionado.
  "title" de cada step SIEMPRE en MAYÚSCULAS (ej: "BIENVENIDA", "INTERÉS DEL CLIENTE").
FAQ: MÍNIMO 5 preguntas. Cubre CADA precio, horario, método de pago, política, requisito o certificado mencionado.
  Las respuestas deben usar los datos reales del negocio (precios exactos, métodos de pago reales, etc.).
  "title" de cada step SIEMPRE en MAYÚSCULAS (ej: "¿CUÁNTO CUESTA?", "¿CÓMO SE PAGA?").
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;

    // Llamada B: catálogo + extras + gestión
    const msgB = `${base}
${antiContamination}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TAREA B — GENERA ÚNICAMENTE: "products", "extras", "management"
Para "business", "training", "faq": devolver vacíos.

PRODUCTS: Un step por CADA servicio, curso o producto mencionado (NO agrupar si hay ≤ 15 ítems).
  Si el texto menciona N servicios → genera EXACTAMENTE N steps. Contar todos los servicios del texto antes de generar.
  Cada step incluye: nombre exacto, precio real (si lo hay), duración/sesiones si aplica, detalles relevantes del texto.
  "title" SIEMPRE en MAYÚSCULAS.
  PROHIBIDO omitir un solo servicio que aparezca en el texto. Si un servicio tiene variantes (ej: corte dama / corte caballero) → un step por variante.
  AUDITORÍA: contar ítems en el texto → esa misma cantidad en products.steps.

EXTRAS: firmaEnabled=true SOLO si el texto menciona nombre de agente/asesor. Generar siempre "Fuera de horario" y "Despedida" con tono del negocio.

MANAGEMENT: OBLIGATORIO — NUNCA dejar management.steps vacío. Analiza el tipo de negocio e infiere los procesos necesarios:
  • Estética/spa/salón de belleza → "Reserva de cita" (subtype: Citas, fields: nombre, servicio, fecha_preferida, hora_preferida)
  • Academia/cursos → "Inscripción" (subtype: Solicitudes, fields: nombre, cedula, curso_interes, horario_preferido)
  • Restaurante/delivery → "Pedido" (subtype: Pedidos, fields: nombre, direccion, pedido, metodo_pago)
  • Clínica/médico → "Cita médica" (subtype: Citas, fields: nombre, motivo_consulta, fecha_preferida)
  • Tienda/comercio → "Consulta de producto" (subtype: Solicitudes, fields: nombre, producto_interes, telefono)
  Genera steps para TODOS los procesos que apliquen al negocio. Fields siempre específicos al negocio real.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;

    // Ejecutar ambas llamadas en paralelo
    const [resA, resB] = await Promise.all([
        callOpenAI(apiKey, msgA),
        callOpenAI(apiKey, msgB),
    ]);

    if (!resA.ok) return { ok: false, error: resA.error };
    if (!resB.ok) return { ok: false, error: resB.error };

    const genA = resA.data;
    const genB = resB.data;

    const sections: GeneratedSections = {
        business: genA.business ?? {},
        training: { steps: assignRealIds(genA.training?.steps) },
        faq:      { steps: assignRealIds(genA.faq?.steps) },
        products: { steps: assignRealIds(genB.products?.steps) },
        extras: {
            firmaEnabled: genB.extras?.firmaEnabled ?? false,
            firmaText:    genB.extras?.firmaText ?? '',
            firmaName:    genB.extras?.firmaName ?? '',
            steps:        assignRealIds(genB.extras?.steps),
        },
        management: { steps: assignRealIds(genB.management?.steps) },
    };

    return { ok: true, sections };
}

/**
 * Aplica todas las secciones generadas en una sola actualización atómica,
 * leyendo la versión actual del DB al momento de escribir.
 * Evita conflictos causados por autosaves que corren mientras GPT-4o genera.
 */
export async function applyAllGeneratedSections(input: {
    promptId: string;
    sections: GeneratedSections;
}): Promise<{ ok: true } | { ok: false; error: string }> {
    try {
        const user = await currentUser();
        if (!user) return { ok: false, error: 'No autenticado.' };

        const { promptId, sections } = input;

        // Verificar que el prompt pertenece al usuario antes de sobrescribir
        const owns = await db.agentPrompt.findUnique({
            where: { id: promptId, userId: user.effectiveId },
            select: { id: true },
        });
        if (!owns) return { ok: false, error: 'Prompt no encontrado.' };

        // Validar schemas antes de escribir
        const {
            BusinessDraftSchema,
            TrainingDraftSchema,
            FaqDraftSchema,
            ProductsDraftSchema,
            ExtrasDraftSchema,
            ManagementDraftSchema,
        } = await import('@/types/agentAi');

        const validBusiness    = BusinessDraftSchema.parse(sections.business);
        const validTraining    = TrainingDraftSchema.parse(sections.training);
        const validFaq         = FaqDraftSchema.parse(sections.faq);
        const validProducts    = ProductsDraftSchema.parse(sections.products);
        const validExtras      = ExtrasDraftSchema.parse(sections.extras);
        const validManagement  = ManagementDraftSchema.parse(sections.management);

        const newSections = {
            business:   validBusiness,
            training:   validTraining,
            faq:        validFaq,
            products:   validProducts,
            extras:     validExtras,
            management: validManagement,
        };

        await db.agentPrompt.update({
            where: { id: promptId },
            data: {
                sections: newSections as any,
                businessName:   validBusiness.nombre || null,
                businessSector: validBusiness.sector || null,
                version: { increment: 1 },
                status: 'draft',
            },
        });

        return { ok: true };
    } catch (e: any) {
        return { ok: false, error: e?.message ?? 'Error al aplicar las secciones generadas.' };
    }
}

/** @deprecated Usa autoSaveBeforeGenerate + generateFlowSections + applyAllGeneratedSections por separado. */
export async function prepareAndGenerateFlow(input: {
    description: string;
    promptId: string;
    version: number;
}): Promise<PrepareResult> {
    const save = await autoSaveBeforeGenerate({ promptId: input.promptId });
    const gen  = await generateFlowSections({ description: input.description });
    if (!gen.ok) return { ok: false, error: gen.error };
    return { ok: true, sections: gen.sections, newVersion: save.ok ? save.newVersion : input.version };
}

export async function generateAgentFlow(input: {
    description: string;
    promptId: string;
    version: number;
}): Promise<GenerateFlowResult> {
    const user = await currentUser();
    if (!user) return { success: false, error: 'No autenticado.' };

    const { description, promptId, version } = input;
    if (!description.trim()) return { success: false, error: 'La descripción está vacía.' };

    // La clave del sistema tiene prioridad; si no existe, se usa la del usuario
    const systemKey = process.env.OPENAI_SYSTEM_API_KEY ?? '';
    const userId = user.effectiveId;
    const aiClient = await resolveUserAiClient(userId);
    const apiKey = systemKey || aiClient.data?.apiKey;
    if (!apiKey) {
        return { success: false, error: 'No tienes una API Key de OpenAI configurada. Ve a Perfil → Api Key IA → Configurar.' };
    }

    // Llamar a OpenAI con JSON mode
    let raw: string;
    try {
        const res = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: 'gpt-4o',
                response_format: { type: 'json_object' },
                temperature: 0.4,
                max_tokens: 16384,
                messages: [
                    { role: 'system', content: CONSTRUCTOR_SYSTEM_PROMPT },
                    { role: 'user', content: description },
                ],
            }),
        });

        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            return { success: false, error: `Error OpenAI ${res.status}: ${err?.error?.message ?? 'desconocido'}` };
        }

        const json = await res.json();
        raw = json.choices?.[0]?.message?.content ?? '';
    } catch (err) {
        return { success: false, error: `Error de red: ${(err as any)?.message ?? 'desconocido'}` };
    }

    // Parsear JSON generado
    let generated: any;
    try {
        generated = JSON.parse(raw);
    } catch {
        return { success: false, error: 'El modelo no devolvió JSON válido. Intenta de nuevo.' };
    }

    // Reemplazar IDs placeholder con UUIDs reales
    const training = { steps: assignRealIds(generated.training?.steps) };
    const faq = { steps: assignRealIds(generated.faq?.steps) };
    const products = { steps: assignRealIds(generated.products?.steps) };
    const extras = {
        firmaEnabled: generated.extras?.firmaEnabled ?? false,
        firmaText: generated.extras?.firmaText ?? '',
        firmaName: generated.extras?.firmaName ?? '',
        steps: assignRealIds(generated.extras?.steps),
    };
    const management = { steps: assignRealIds(generated.management?.steps) };

    // Guardar secciones secuencialmente para respetar optimistic locking
    let v = version;

    const businessData = generated.business ?? {};

    const b = await patchBusinessSection({ promptId, version: v, data: businessData });
    if (!b.ok) return { success: false, error: 'Error guardando Perfil.' };
    v = b.data.version;

    const t = await patchTrainingSection({ promptId, version: v, data: training });
    if (!t.ok) return { success: false, error: 'Error guardando Inicio.' };
    v = t.data.version;

    const f = await patchFaqSection({ promptId, version: v, data: faq });
    if (!f.ok) return { success: false, error: 'Error guardando Preguntas.' };
    v = f.data.version;

    const p = await patchProductsSection({ promptId, version: v, data: products });
    if (!p.ok) return { success: false, error: 'Error guardando Productos.' };
    v = p.data.version;

    const e = await patchExtrasSection({ promptId, version: v, data: extras });
    if (!e.ok) return { success: false, error: 'Error guardando Extras.' };
    v = e.data.version;

    const m = await patchManagementSection({ promptId, version: v, data: management });
    if (!m.ok) return { success: false, error: 'Error guardando Gestión.' };

    return { success: true };
}
