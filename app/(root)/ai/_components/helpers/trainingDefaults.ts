export const WELCOME_TITLE = "INICIO FLUJO";
export const WELCOME_TITLE_LEGACY = "BIENVENIDA";

export type WelcomeType = "obligatoria" | "inteligente";

// Los dos modos hablan de "el PRIMER elemento de TEXTO del paso" y no de un
// número: la lista de elementos se arma como [función?, texto, extras...] y el
// elemento de FUNCIÓN solo entra si el paso tiene flujo. Sin flujo todo se corre
// un puesto y un número fijo apuntaría a la nota de control.
export const WELCOME_MAIN_MESSAGE_OBLIGATORIA = `🔒 CONDICIÓN DE CHAT NUEVO (GATE): collected == {} AND current_step == 1
🚨 PRIORIDAD ABSOLUTA — PRIMER TURNO. Se ejecuta ante cualquier intención del usuario, sea texto, audio, imagen, sticker o mensaje de anuncio.

✅ LÓGICA DE EJECUCIÓN — MODO OBLIGATORIO:
   → Si el paso tiene elemento FUNCIÓN (Ejecutar flujo) → ejecutarlo SIEMPRE, sin importar el mensaje.
   → Emitir a continuación el PRIMER elemento de TEXTO del paso, palabra por palabra.
   → Si el paso NO tiene elemento FUNCIÓN → emitir igual ese mismo texto.
   → Ignorar la intención del mensaje del usuario, sea cual sea su contenido.

⏸️ DESPUÉS de ejecutar: ESPERAR respuesta del usuario.

➡️ TRANSICIÓN:
   → bienvenida_enviada = true
   → current_step permanece en 1 hasta capturar la variable del paso, o si no tiene, hasta que el cliente responda.

🚫 PROHIBIDO:
- Saltar la BIENVENIDA por intención directa del usuario.
- Repetir la bienvenida si bienvenida_enviada == true.
- Formular preguntas propias o de confirmación.
- Reformular, inventar, resumir o parafrasear el texto.
- Emitir cualquier mensaje distinto del flujo + el PRIMER elemento de TEXTO.
- Emitir los elementos marcados NO EMITIR (transición / notas de control).
- Usar el Comportamiento obligatorio como sustituto de la ejecución del flujo.
- Activar Q&A, CATÁLOGO, OBJECIONES o cualquier módulo lateral en este turno.
- Agregar o quitar cualquier texto al emitir. Lo único permitido es la firma declarada en "Firma del agente", al inicio del mensaje.

💬 EMIT SALIDA LITERAL: flujo (si existe) + PRIMER elemento de TEXTO del paso. Ambos cuentan como la salida de este turno. Esperar respuesta.`;

export const WELCOME_MAIN_MESSAGE_INTELIGENTE = `🔒 CONDICIÓN DE CHAT NUEVO (GATE): collected == {} AND current_step == 1
🚨 PRIORIDAD ABSOLUTA — PRIMER TURNO. Se ejecuta ante cualquier primer mensaje del usuario, sea texto, audio, imagen, sticker o mensaje de anuncio.

✅ LÓGICA DE EJECUCIÓN — MODO INTELIGENTE:
   → Analizar el primer mensaje del usuario:
      • Si detecta una INTENCIÓN DIRECTA (ver lista abajo) → ir al paso destino (según el elemento de TRANSICIÓN), sin ejecutar la BIENVENIDA.
      • Si NO detecta intención clara → ejecutar la SECUENCIA de abajo.
   → SECUENCIA: si el paso tiene elemento FUNCIÓN (Ejecutar flujo) → ejecutarlo; luego emitir el PRIMER elemento de TEXTO del paso, palabra por palabra.
   → Si el paso NO tiene elemento FUNCIÓN → emitir igual ese mismo texto.

📋 INTENCIÓN DIRECTA — SOLO estas cuentan:
- Menciona un producto o servicio específico del catálogo.
- Pregunta el precio de un ítem concreto.
- Pide agendar, comprar o cotizar algo puntual.

❌ NO cuenta como intención directa (ejecutar SECUENCIA normal):
- Saludos ("hola", "buenas", "buenos días").
- Peticiones genéricas ("quiero información", "cuéntame más", "me interesa").
- Mensajes precargados provenientes de anuncios de Meta o campañas.
- Emojis, stickers, audios sin petición concreta.

⚠️ VALIDACIÓN DE SALTO: si el paso destino requiere variables que aún no están capturadas → NO saltar. Ejecutar la SECUENCIA normal desde el Paso 1.

⏸️ DESPUÉS de ejecutar: ESPERAR respuesta del usuario.

➡️ TRANSICIÓN:
   → bienvenida_enviada = true
   → Si hubo intención directa válida → current_step = el paso destino.
   → Si no → current_step permanece en 1 hasta capturar la variable del paso, o si no tiene, hasta que el cliente responda.

🚫 PROHIBIDO:
- Repetir la bienvenida si bienvenida_enviada == true.
- Saltar pasos cuyas variables sean requeridas por el paso destino.
- Formular preguntas propias o de confirmación.
- Reformular, inventar, resumir o parafrasear el texto.
- Emitir cualquier mensaje distinto del flujo + el PRIMER elemento de TEXTO.
- Emitir los elementos marcados NO EMITIR (transición / notas de control).
- Usar el Comportamiento obligatorio como sustituto de la ejecución del flujo.
- Activar Q&A, CATÁLOGO, OBJECIONES o cualquier módulo lateral en este turno.
- Agregar o quitar cualquier texto al emitir. Lo único permitido es la firma declarada en "Firma del agente", al inicio del mensaje.

💬 EMIT SALIDA LITERAL: flujo (si existe) + PRIMER elemento de TEXTO del paso. Ambos cuentan como la salida de este turno. Esperar respuesta.`;

export const WELCOME_MESSAGES: Record<WelcomeType, string> = {
    obligatoria: WELCOME_MAIN_MESSAGE_OBLIGATORIA,
    inteligente: WELCOME_MAIN_MESSAGE_INTELIGENTE,
};

export const WELCOME_MAIN_MESSAGE = WELCOME_MAIN_MESSAGE_OBLIGATORIA;
