export const WELCOME_TITLE = "INICIO FLUJO";
export const WELCOME_TITLE_LEGACY = "BIENVENIDA";

export type WelcomeType = "obligatoria" | "inteligente";

export const WELCOME_MAIN_MESSAGE_OBLIGATORIA = `🔒 GATE: collected == {} AND current_step == 1
🚨 PRIORIDAD ABSOLUTA — PRIMER TURNO.

modo_bienvenida = obligatoria
   → Siempre ejecuta BIENVENIDA, sin importar el mensaje.

✅ LÓGICA DE EJECUCIÓN:

▶ MODO "obligatorio":
   → Ejecutar siempre el flujo BIENVENIDA.
   → Si no está disponible → emitir texto por defecto (Regla/parámetro 1).
   → Ignorar intención del mensaje del usuario.

⏸️ DESPUÉS de ejecutar: ESPERAR respuesta del usuario.

➡️ TRANSICIÓN:
   → saludo_completado = true
   → current_step = 2
   → El siguiente turno evalúa el gate del Paso 2.

🚫 PROHIBIDO:
- Saltar BIENVENIDA por intención directa del usuario.
- Reformular, inventar o parafrasear el texto.
- Enviar más de un (1) mensaje en este turno.
- Pedir datos que el cliente ya entregó en su primer mensaje.`;

export const WELCOME_MAIN_MESSAGE_INTELIGENTE = `🔒 GATE: collected == {} AND current_step == 1
🚨 PRIORIDAD ABSOLUTA — PRIMER TURNO.

modo_bienvenida = inteligente
   → Solo ejecuta BIENVENIDA si el mensaje NO tiene intención clara.
   → Si tiene intención directa (producto, agenda, precio, humano, frase clave):
      → Omite BIENVENIDA y va al PASO correspondiente.

✅ LÓGICA DE EJECUCIÓN:

▶ MODO "inteligente":
   → Analizar el primer mensaje del usuario:
      • Si detecta una INTENCIÓN DIRECTA → ir al PASO de destino, sin BIENVENIDA.
      • Si NO detecta intención clara → ejecutar BIENVENIDA como respaldo.
   → Si el flujo BIENVENIDA no está disponible → emitir texto por defecto (Regla/parámetro 1).

🎯 INTENCIONES DIRECTAS (omiten BIENVENIDA):
   • Pedir información de producto/servicio → PASO_PRODUCTOS
   • Agendar / reservar cita → PASO_AGENDA
   • Preguntar precio específico → PASO_PRODUCTOS
   • Hablar con un humano / asesor → PASO_HANDOFF
   • Postventa / reclamo / soporte → PASO_POSTVENTA
   • Frase clave de campaña (vz-basico, vz-avanzado, etc.) → PASO según regla de enrutamiento

⏸️ DESPUÉS de ejecutar: ESPERAR respuesta del usuario.

➡️ TRANSICIÓN:
   A) Si se saltó BIENVENIDA por intención directa:
      → Ir al PASO de destino.
      → Ese paso gestiona su propio current_step y transición.
   B) Si se ejecutó BIENVENIDA como respaldo:
      → saludo_completado = true
      → current_step = 2
      → El siguiente turno evalúa el gate del Paso 2.

🚫 PROHIBIDO:
- Ejecutar BIENVENIDA si hay una intención directa detectada.
- Reformular, inventar o parafrasear el texto.
- Enviar más de un (1) mensaje en este turno.
- Pedir datos que el cliente ya entregó en su primer mensaje.
- Inventar intenciones que no estén en la lista de INTENCIONES DIRECTAS.`;

export const WELCOME_MESSAGES: Record<WelcomeType, string> = {
    obligatoria: WELCOME_MAIN_MESSAGE_OBLIGATORIA,
    inteligente: WELCOME_MAIN_MESSAGE_INTELIGENTE,
};

export const WELCOME_MAIN_MESSAGE = WELCOME_MAIN_MESSAGE_OBLIGATORIA;
