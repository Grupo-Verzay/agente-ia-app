export const WELCOME_TITLE = "BIENVENIDA";

export const WELCOME_MAIN_MESSAGE = `🔒 CONDICIÓN DE CHAT NUEVO (GATE): collected == {} AND current_step == 1
🚨 PRIORIDAD ABSOLUTA — PRIMER TURNO. Se ejecuta ante cualquier intención del usuario.

🔀 OVERRIDE DE ENRUTAMIENTO (se evalúa ANTES de la lógica de ejecución):
   → SI existe una Regla/parámetro de enrutamiento cuya condición se cumple con el primer mensaje:
      • OMITIR toda la lógica de BIENVENIDA (pasos 1️⃣ y 2️⃣).
      • Ir al PASO indicado por NOMBRE en esa regla (el sistema resuelve su posición).
      • Si el paso nombrado no existe → ejecutar BIENVENIDA como respaldo.
   → SI NINGUNA Regla/parámetro de enrutamiento aplica:
      • Continuar con la LÓGICA DE EJECUCIÓN normal (1️⃣ / 2️⃣).

✅ LÓGICA DE EJECUCIÓN (en orden estricto):
1️⃣ SI el flujo 'BIENVENIDA' está disponible:
   → EJECUTARLO de inmediato, ANTES de responder.
   → Emitir ÚNICAMENTE el texto exacto de Regla/parámetro (2).
   → SIN parafrasear, SIN omitir, SIN modificar.
2️⃣ SI el flujo 'BIENVENIDA' NO está disponible:
   → Emitir ÚNICAMENTE el texto exacto de Regla/parámetro (1).
   → SIN reformular, SIN inventar, SIN agregar texto.

⏸️ DESPUÉS de ejecutar (cualquiera de los dos casos): ESPERAR respuesta del usuario.

➡️ TRANSICIÓN:
   A) Si se activó el OVERRIDE DE ENRUTAMIENTO:
      → Ir al PASO de destino por nombre.
      → El paso de destino gestiona su propio current_step y transición.
   B) Si se ejecutó BIENVENIDA normal (sin override):
      → Guardar saludo_completado = true
      → current_step = 2
      → El siguiente turno evalúa el gate del Paso 2.

⚠️ EXCEPCIONES:
   1. Si el usuario hace una pregunta directa antes del saludo → ejecutar igual el GATE primero, luego responder en el Paso 2.
   2. Si el flujo 'BIENVENIDA' falla a mitad de ejecución → emitir Regla/parámetro (1) como respaldo.
   3. Si el mensaje del usuario llega vacío o es un sticker/audio sin texto → ejecutar GATE normal, no saltar paso.

🚫 PROHIBIDO:
- Responder sin ejecutar primero el GATE.
- Usar el "Comportamiento obligatorio" como sustituto de la ejecución del flujo.
- Reformular, inventar o parafrasear el texto.
- Enviar más de un (1) mensaje en este turno.
- Emitir Regla/parámetro (1) si 'BIENVENIDA' SÍ está disponible.
- Emitir Regla/parámetro (2) si 'BIENVENIDA' NO está disponible.
- Ejecutar BIENVENIDA si una Regla/parámetro de enrutamiento SÍ aplica.`;
