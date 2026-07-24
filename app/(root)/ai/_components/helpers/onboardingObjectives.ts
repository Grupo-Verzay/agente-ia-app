// Objetivos (embudos) del asistente de alta "Da de alta tu Agente IA".
//
// Fuente ÚNICA compartida entre:
//  - AgentOnboardingWizard (muestra los pasos y el ejemplo editable), y
//  - completeAgentOnboarding (inyecta `main` como "instrucciones del sistema"
//    / Objetivo–respuesta principal de cada paso, igual que una plantilla; y
//    los campos del Motor de Flujo: variable que recoge + condición para avanzar).
//
// Cada paso:
//  - t:         título del paso (MAYÚSCULA; el último lleva " (paso final)").
//  - ex:        mensaje que dice el agente (se pre-llena y el dueño edita).
//  - main:      instrucciones del sistema (GATE + secuencia + prohibido +
//               función + transición).
//  - variable:  Motor de Flujo — variable que recoge el paso.
//  - condicion: Motor de Flujo — condición para avanzar.
//
// Todos los objetivos tienen 5 pasos.

export type ObjectiveStep = {
  t: string;
  ex: string;
  main: string;
  variable?: string;
  condicion?: string;
};

/**
 * Reemplaza las variables entre [corchetes] por los datos reales del negocio.
 * Solo sustituye la variable si el dato existe; si no, deja el [placeholder]
 * para que quede claro qué falta. Nunca toca texto personalizado por el dueño
 * (solo reemplaza el token exacto). Las variables de tiempo de conversación
 * ([PRODUCTO], [PRECIO], [FECHA_HORA], [TOTAL]…) se dejan intactas: las llena el
 * agente al hablar con el cliente.
 */
export function fillBusinessVars(
  text: string,
  biz: { nombre?: string; ubicacion?: string; horario?: string } | null | undefined,
): string {
  if (!text || !biz) return text;
  const map: Record<string, string | undefined> = {
    "[tu negocio]": biz.nombre,
    "[el negocio]": biz.nombre,
    "[nombre del negocio]": biz.nombre,
    "[NOMBRE_NEGOCIO]": biz.nombre,
    "[dirección]": biz.ubicacion,
    "[direccion]": biz.ubicacion,
    "[DIRECCION]": biz.ubicacion,
    "[días/horas]": biz.horario,
    "[dias/horas]": biz.horario,
    "[horarios]": biz.horario,
  };
  let out = text;
  for (const [token, value] of Object.entries(map)) {
    const v = (value ?? "").trim();
    if (v) out = out.split(token).join(v);
  }
  return out;
}

export type OnboardingObjective = {
  id: string;
  em: string;
  title: string;
  desc: string;
  steps: ObjectiveStep[];
};

export const ONBOARDING_OBJECTIVES: OnboardingObjective[] = [
  {
    id: "venta-directa", em: "⚡", title: "Venta Directa",
    desc: "5 fases: ventas rápidas con foco en cerrar.",
    steps: [
      { t: "BIENVENIDA",
        variable: "producto_interes (opcional en este paso)",
        condicion: "Si nombra un producto del catálogo, va directo al paso 3. Si no, va al paso 2 para mostrarle las opciones — NO bloquear.",
        ex: `¡Hola! 👋 Bienvenido a *[NOMBRE_NEGOCIO]*.
¿Qué producto te interesa?`,
        main: `🔒 CONDICIÓN GATE: current_step == 1 AND bienvenida_enviada == false
🚨 PRIORIDAD ABSOLUTA — PRIMER TURNO.

✅ SECUENCIA OBLIGATORIA (orden estricto):
1º Emitir ÚNICAMENTE el texto exacto de Regla/parámetro (2).
2º Si existe el flujo 'BIENVENIDA', ejecutarlo; si NO existe, continuar igual.
3º Guardar bienvenida_enviada = true.

⏸️ DESPUÉS de ejecutar: ESPERAR respuesta del usuario.

🚫 PROHIBIDO EN ESTE PASO:
- Formular preguntas propias o de confirmación.
- Dar precios en este turno.
- Ejecutar cualquier tool.
- Repetir la bienvenida si bienvenida_enviada == true.

ELEMENTOS DEL PASO 1:

(1) FUNCIÓN (opcional): Ejecuta el flujo 'BIENVENIDA' si existe; si no, continúa igual

(2) REGLA/PARÁMETRO — TEXTO ÚNICO (un solo mensaje):
¡Hola! 👋 Bienvenido a *[NOMBRE_NEGOCIO]*.
¿Qué producto te interesa?

(3) REGLA/PARÁMETRO — TRANSICIÓN (NO EMITIR):
- Menciona un producto del catálogo → guardar en silencio producto_interes → current_step = 3
- Escribe sin intención clara o pide ver opciones → current_step = 2` },
      { t: "CATALOGO",
        variable: "producto_interes",
        condicion: "Captura el producto. Si no elige, repregunta MÁX. 1 vez; luego guarda producto_interes = \"no definido\" y avanza presentando el más vendido — no ciclar.",
        ex: `Tenemos:
1️⃣ *[CATEGORIA_1]*
2️⃣ *[CATEGORIA_2]*
3️⃣ *[CATEGORIA_3]*
¿Cuál te interesa?`,
        main: `🔒 CONDICIÓN GATE: bienvenida_enviada == true AND producto_interes == null

✅ SECUENCIA OBLIGATORIA (orden estricto):
1º Emitir ÚNICAMENTE el texto exacto de Regla/parámetro (2).
2º Si existe el flujo 'CATALOGO', ejecutarlo; si NO existe, continuar igual.

⏸️ DESPUÉS de ejecutar: ESPERAR respuesta del usuario.

🚫 PROHIBIDO EN ESTE PASO:
- Dar precios antes de identificar el producto.
- Inventar productos o categorías fuera del catálogo o las tools.
- Hacer dos preguntas en el mismo mensaje.
- Ejecutar tools de registro.

ELEMENTOS DEL PASO 2:

(1) FUNCIÓN (opcional): Ejecuta el flujo 'CATALOGO' si existe; si no, continúa igual

(2) REGLA/PARÁMETRO — TEXTO ÚNICO (un solo mensaje):
Tenemos:
1️⃣ *[CATEGORIA_1]*
2️⃣ *[CATEGORIA_2]*
3️⃣ *[CATEGORIA_3]*
¿Cuál te interesa?

(3) REGLA/PARÁMETRO — TRANSICIÓN (NO EMITIR):
- Elige una opción o nombra un producto del catálogo → guardar en silencio producto_interes → current_step = 3
- Nombra algo fuera del catálogo → emitir: "Ese no lo manejamos 😕 ¿Te interesa alguno de la lista?" → repreguntar una vez.
- Tras repreguntar 1 vez sin elegir → guardar producto_interes = "no definido" → current_step = 3 (se le presenta el más vendido)` },
      { t: "PRESENTACIÓN",
        variable: "—",
        condicion: "Avanza al cierre ante cualquier señal de compra (sí / dale / lo quiero). Ante una objeción, responde y permanece. Si pide otra opción, vuelve al catálogo. No bloquear.",
        ex: `Te recomiendo *[PRODUCTO]*.
✅ *[BENEFICIO_1]*
✅ *[BENEFICIO_2]*
✅ *[BENEFICIO_3]*
💰 *[PRECIO]*
¿Te lo llevas?`,
        main: `🔒 CONDICIÓN GATE: producto_interes != null AND compra_confirmada == false

✅ SECUENCIA OBLIGATORIA (orden estricto):
1º Si existe el flujo 'PRESENTACION', ejecutarlo; si NO existe, continuar igual (la instrucción va primero).
2º Si oferta_presentada == false → emitir Regla/parámetro (2) → guardar oferta_presentada = true.
3º Si oferta_presentada == true y el cliente objeta → emitir Regla/parámetro (3), sin reejecutar el flujo.

⏸️ DESPUÉS de ejecutar: ESPERAR respuesta del usuario.

🚫 PROHIBIDO EN ESTE PASO:
- Inventar precios, stock o características.
- Presentar más de una opción a la vez si abruma.
- Fragmentar la presentación en varios mensajes.
- Repetir la presentación completa al responder una objeción.
- Ofrecer descuentos no autorizados.
- Reejecutar el flujo si oferta_presentada == true.

ELEMENTOS DEL PASO 3:

(1) FUNCIÓN (opcional): Ejecuta el flujo 'PRESENTACION' si existe; si no, continúa igual

(2) REGLA/PARÁMETRO — PRESENTACIÓN — TEXTO ÚNICO (un solo mensaje):
Te recomiendo *[PRODUCTO]*.
✅ *[BENEFICIO_1]*
✅ *[BENEFICIO_2]*
✅ *[BENEFICIO_3]*
💰 *[PRECIO]*
¿Te lo llevas?

(3) REGLA/PARÁMETRO — OBJECIÓN — TEXTO ÚNICO (un solo mensaje):
Entiendo tu punto.
*[RESPUESTA_A_LA_OBJECION]*
¿Te gustaría que avancemos con *[ALTERNATIVA]*?

(4) REGLA/PARÁMETRO — TRANSICIÓN (NO EMITIR):
- Confirma (sí / lo quiero / dale / me lo llevo) → compra_confirmada = true → current_step = 4
- Pide otra opción → producto_interes = null → oferta_presentada = false → current_step = 2
- Objeta el precio o pide detalles → emitir Regla/parámetro (3) → permanecer en current_step = 3` },
      { t: "CIERRE",
        variable: "nombre (opcional), metodo_pago",
        condicion: "Pide un dato a la vez. El nombre es opcional. Si no elige método de pago, repregunta MÁX. 1 vez, guarda \"por definir\" y avanza — no bloquear.",
        ex: `¡Perfecto! ¿A nombre de quién registro el pedido? 📝`,
        main: `🔒 CONDICIÓN GATE: compra_confirmada == true AND datos_completos == false
📝 PLACEHOLDER: si nombre == null → omite el placeholder [NOMBRE] del mensaje, sin dejar espacios ni comas sueltas.

✅ SECUENCIA OBLIGATORIA (orden estricto):
1º Emitir ÚNICAMENTE el texto exacto de Regla/parámetro (2).
2º Si existe el flujo 'CIERRE', ejecutarlo; si NO existe, continuar igual.
3º Tras recibir el nombre, emitir Regla/parámetro (3).

⏸️ DESPUÉS de ejecutar: ESPERAR respuesta del usuario.

🚫 PROHIBIDO EN ESTE PASO:
- Pedir todos los datos en un solo mensaje.
- Solicitar datos que el cliente ya entregó.
- Ofrecer métodos de pago o envío no habilitados por el negocio.
- Ejecutar tools de registro.

ELEMENTOS DEL PASO 4:

(1) FUNCIÓN (opcional): Ejecuta el flujo 'CIERRE' si existe; si no, continúa igual

(2) REGLA/PARÁMETRO — TEXTO ÚNICO (un solo mensaje):
¡Perfecto! ¿A nombre de quién registro el pedido? 📝

(3) REGLA/PARÁMETRO — SEGUNDA PREGUNTA (tras el nombre) — TEXTO ÚNICO:
Gracias. ¿Cómo prefieres pagar y recibirlo?
1️⃣ *[METODO_1]*
2️⃣ *[METODO_2]*
3️⃣ *[METODO_3]*

(4) REGLA/PARÁMETRO — TRANSICIÓN (NO EMITIR):
- Entrega el nombre → guardar en silencio nombre → emitir Regla/parámetro (3) → permanecer en current_step = 4
- No entrega el nombre tras pedirlo 1 vez → emitir igual Regla/parámetro (3) → permanecer en current_step = 4 (el nombre es opcional)
- Elige método de pago/envío → guardar metodo_pago → datos_completos = true → current_step = 5
- No elige método tras repreguntar 1 vez → guardar metodo_pago = "por definir" → datos_completos = true → current_step = 5` },
      { t: "CONFIRMACIÓN (paso final)",
        variable: "—",
        condicion: "Ejecuta la tool de registro/notificación y CIERRA SIEMPRE. Fin del flujo.",
        ex: `¡Listo, *[NOMBRE]*! Tu pedido quedó confirmado ✅
🛍️ *[PRODUCTO]*
💰 Total: *[TOTAL]*
🚚 Entrega: *[TIEMPO_ENTREGA]*
Te avisamos cuando salga. ¡Gracias por tu compra! 🎉`,
        main: `🔒 CONDICIÓN GATE: datos_completos == true AND pedido_confirmado == false
📝 PLACEHOLDER: si nombre == null → omite el placeholder [NOMBRE] del mensaje, sin dejar espacios ni comas sueltas.

✅ SECUENCIA OBLIGATORIA (orden estricto):
1º Emitir ÚNICAMENTE el texto exacto de Regla/parámetro (2), como UN SOLO MENSAJE.
2º Si existe el flujo 'CONFIRMACION', ejecutarlo; si NO existe, continuar igual.
3º Ejecutar la tool de registro/notificación del pedido.
4º Guardar pedido_confirmado = true → halt.

🚫 PROHIBIDO EN ESTE PASO:
- Bloquear el cierre si falta el nombre o el método de pago — el flujo debe CERRAR igual.
- Inventar tiempos de entrega no definidos en el catálogo o las tools.
- Fragmentar la confirmación en varios mensajes.
- Emitir cualquier mensaje después del cierre.

ELEMENTOS DEL PASO 5:

(1) FUNCIÓN (opcional): Ejecuta el flujo 'CONFIRMACION' si existe; si no, continúa igual

(2) REGLA/PARÁMETRO — TEXTO ÚNICO (un solo mensaje):
¡Listo, *[NOMBRE]*! Tu pedido quedó confirmado ✅
🛍️ *[PRODUCTO]*
💰 Total: *[TOTAL]*
🚚 Entrega: *[TIEMPO_ENTREGA]*
Te avisamos cuando salga. ¡Gracias por tu compra! 🎉

(3) FUNCIÓN: Ejecuta la tool de registro/notificación del pedido

(4) REGLA/PARÁMETRO — TRANSICIÓN (NO EMITIR):
- Emitir la confirmación → ejecutar tool → pedido_confirmado = true → halt
- Si metodo_pago == "por definir" → notificar al asesor para que coordine el pago.

(5) NOTA DE CONTROL (NO EMITIR):
⛔ FIN DEL FLUJO. PROHIBIDO emitir contenido adicional tras el cierre.` },
    ],
  },
  {
    id: "venta-consultiva", em: "🎯", title: "Venta Consultiva",
    desc: "5 fases: conexión, preguntas, propuesta y cierre.",
    steps: [
      { t: "BIENVENIDA",
        variable: "nombre (opcional)",
        condicion: "Captura el nombre si lo da. Si no lo da, se pregunta 1 vez más y luego se continúa igual — NO bloquear por el nombre.",
        ex: `¡Hola! 👋 Soy el asistente de *[NOMBRE_NEGOCIO]*.
Para ayudarte mejor, ¿me compartes tu nombre?`,
        main: `🔒 CONDICIÓN GATE: current_step == 1 AND bienvenida_enviada == false
🚨 PRIORIDAD ABSOLUTA — PRIMER TURNO.

✅ SECUENCIA OBLIGATORIA (orden estricto):
1º Emitir ÚNICAMENTE el texto exacto de Regla/parámetro (2).
2º Si existe el flujo 'BIENVENIDA', ejecutarlo; si NO existe, continuar igual.
3º Guardar bienvenida_enviada = true.

⏸️ DESPUÉS de ejecutar: ESPERAR respuesta del usuario.

🚫 PROHIBIDO EN ESTE PASO:
- Formular preguntas propias o de confirmación.
- Dar precios, planes o propuestas en este turno.
- Ejecutar cualquier tool.
- Repetir la bienvenida si bienvenida_enviada == true.

ELEMENTOS DEL PASO 1:

(1) FUNCIÓN (opcional): Ejecuta el flujo 'BIENVENIDA' si existe; si no, continúa igual

(2) REGLA/PARÁMETRO — TEXTO ÚNICO (un solo mensaje):
¡Hola! 👋 Soy el asistente de *[NOMBRE_NEGOCIO]*.
Para ayudarte mejor, ¿me compartes tu nombre?

(3) REGLA/PARÁMETRO — TRANSICIÓN (NO EMITIR):
- Responde con un nombre → guardar en silencio nombre → current_step = 2
- No entrega nombre → pedirlo una vez más, sin repetir la bienvenida.` },
      { t: "PREGUNTA 1",
        variable: "necesidad",
        condicion: "Captura la necesidad. Si responde vago, repregunta MÁX. 1 vez; luego guarda necesidad = \"no definida\" y avanza — no ciclar.",
        ex: `Cuéntame, *[NOMBRE]*, ¿qué es lo que necesitas resolver?`,
        main: `🔒 CONDICIÓN GATE: bienvenida_enviada == true AND necesidad == null
📝 PLACEHOLDER: si nombre == null → omite el placeholder [NOMBRE] del mensaje, sin dejar espacios ni comas sueltas.

✅ SECUENCIA OBLIGATORIA (orden estricto):
1º Emitir ÚNICAMENTE el texto exacto de Regla/parámetro (2).
2º Si existe el flujo 'PREGUNTA 1', ejecutarlo; si NO existe, continuar igual.

⏸️ DESPUÉS de ejecutar: ESPERAR respuesta del usuario.

🚫 PROHIBIDO EN ESTE PASO:
- Presentar soluciones o precios antes de conocer la necesidad.
- Hacer dos preguntas en el mismo mensaje.
- Ejecutar tools de registro.

ELEMENTOS DEL PASO 2:

(1) FUNCIÓN (opcional): Ejecuta el flujo 'PREGUNTA 1' si existe; si no, continúa igual

(2) REGLA/PARÁMETRO — TEXTO ÚNICO (un solo mensaje):
Cuéntame, *[NOMBRE]*, ¿qué es lo que necesitas resolver?

(3) REGLA/PARÁMETRO — TRANSICIÓN (NO EMITIR):
- Describe su necesidad → guardar en silencio necesidad → current_step = 3
- Responde vago ("info", "precios") → repreguntar una vez pidiendo más detalle.
- Tras repreguntar 1 vez sin respuesta clara → guardar necesidad = "no definida" → current_step = 3` },
      { t: "PREGUNTA 2",
        variable: "contexto (opcional)",
        condicion: "Captura plazo/presupuesto si lo da. Si lo evade, guarda contexto = 'no definido' y avanza igual — no bloquear.",
        ex: `Entiendo. ¿Para cuándo lo necesitas y manejas un presupuesto estimado?`,
        main: `🔒 CONDICIÓN GATE: necesidad != null AND contexto == null

✅ SECUENCIA OBLIGATORIA (orden estricto):
1º Emitir ÚNICAMENTE el texto exacto de Regla/parámetro (2).
2º Si existe el flujo 'PREGUNTA 2', ejecutarlo; si NO existe, continuar igual.

⏸️ DESPUÉS de ejecutar: ESPERAR respuesta del usuario.

🚫 PROHIBIDO EN ESTE PASO:
- Presentar la solución antes de capturar el contexto.
- Hacer dos preguntas en el mismo mensaje.
- Insistir en el presupuesto si el cliente lo evade.
- Ejecutar tools de registro.

ELEMENTOS DEL PASO 3:

(1) FUNCIÓN (opcional): Ejecuta el flujo 'PREGUNTA 2' si existe; si no, continúa igual

(2) REGLA/PARÁMETRO — TEXTO ÚNICO (un solo mensaje):
Entiendo. ¿Para cuándo lo necesitas y manejas un presupuesto estimado?

(3) REGLA/PARÁMETRO — TRANSICIÓN (NO EMITIR):
- Responde plazo y/o presupuesto → guardar en silencio contexto → current_step = 4
- Evade el presupuesto → guardar contexto = "no definido" → current_step = 4` },
      { t: "PRESENTACIÓN",
        variable: "—",
        condicion: "No captura datos del cliente. Avanza al cierre ante cualquier señal de interés (sí / dale / me interesa) o si pide tiempo. Ante una objeción, responde y permanece. No bloquear.",
        ex: `Por lo que me cuentas, lo ideal para ti es *[SOLUCION]*.
Encaja con tu caso porque *[JUSTIFICACION]*.
💰 Inversión: *[PRECIO]*
¿Qué te parece?`,
        main: `🔒 CONDICIÓN GATE: contexto != null AND interes_confirmado == false

✅ SECUENCIA OBLIGATORIA (orden estricto):
1º Si existe el flujo 'PRESENTACION', ejecutarlo; si NO existe, continuar igual (la instrucción va primero).
2º Si presentacion_emitida == false → emitir Regla/parámetro (2) → guardar presentacion_emitida = true.
3º Si presentacion_emitida == true y el cliente objeta → emitir Regla/parámetro (3), sin reejecutar el flujo.

⏸️ DESPUÉS de ejecutar: ESPERAR respuesta del usuario.

🚫 PROHIBIDO EN ESTE PASO:
- Recomendar servicios fuera del catálogo o las tools.
- Inventar precios, resultados o casos de éxito.
- Fragmentar la propuesta en varios mensajes.
- Repetir la presentación completa al responder una objeción.
- Presionar si el cliente pide tiempo. Ofrecer descuentos no autorizados.
- Reejecutar el flujo si presentacion_emitida == true.

ELEMENTOS DEL PASO 4:

(1) FUNCIÓN (opcional): Ejecuta el flujo 'PRESENTACION' si existe; si no, continúa igual

(2) REGLA/PARÁMETRO — PRESENTACIÓN — TEXTO ÚNICO (un solo mensaje):
Por lo que me cuentas, lo ideal para ti es *[SOLUCION]*.
Encaja con tu caso porque *[JUSTIFICACION]*.
💰 Inversión: *[PRECIO]*
¿Qué te parece?

(3) REGLA/PARÁMETRO — NEGOCIACIÓN — TEXTO ÚNICO (un solo mensaje):
Entiendo perfectamente tu punto.
*[RESPUESTA_A_LA_OBJECION]*
¿Te gustaría que avancemos con *[ALTERNATIVA]*?

(4) REGLA/PARÁMETRO — TRANSICIÓN (NO EMITIR):
- Confirma interés (sí / me interesa / dale) → interes_confirmado = true → current_step = 5
- Plantea una objeción → emitir Regla/parámetro (3) → permanecer en current_step = 4
- Pide más detalle → responder sin reejecutar el flujo → permanecer en current_step = 4
- Pide tiempo para pensarlo → interes_confirmado = true → current_step = 5` },
      { t: "CIERRE (paso final)",
        variable: "nombre (opcional)",
        condicion: "Captura el nombre si lo da (opcional). Ejecuta la tool de registro/notificación y CIERRA SIEMPRE, con o sin nombre. Sin correo obligatorio.",
        ex: `¡Excelente decisión, *[NOMBRE]*!
Un asesor te contacta en breve. 📩`,
        main: `🔒 CONDICIÓN GATE: interes_confirmado == true AND cierre_completado == false
📝 PLACEHOLDER: si nombre == null → omite el placeholder [NOMBRE] del mensaje, sin dejar espacios ni comas sueltas.

✅ SECUENCIA OBLIGATORIA (orden estricto):
1º Emitir ÚNICAMENTE el texto exacto de Regla/parámetro (2).
2º Si existe el flujo 'CIERRE', ejecutarlo; si NO existe, continuar igual.
3º Ejecutar la tool de registro/notificación al asesor (con el nombre, si el cliente lo dio).
4º Guardar cierre_completado = true → halt.

🚫 PROHIBIDO EN ESTE PASO:
- Bloquear el cierre si el cliente no da el nombre — el flujo debe CERRAR igual.
- Solicitar datos que el cliente ya entregó.
- Emitir cualquier mensaje después del cierre.

ELEMENTOS DEL PASO 5:

(1) FUNCIÓN (opcional): Ejecuta el flujo 'CIERRE' si existe; si no, continúa igual

(2) REGLA/PARÁMETRO — MENSAJE CONDICIONAL (según si ya se tiene el nombre):
- Si nombre != null → ¡Excelente decisión, *[NOMBRE]*! Un asesor te contacta en breve. 📩
- Si nombre == null → ¡Excelente decisión! Para coordinar, ¿me confirmas tu *nombre*? 📩

(3) FUNCIÓN: Ejecuta la tool de registro/notificación al asesor

(4) REGLA/PARÁMETRO — TRANSICIÓN (NO EMITIR):
- Si ya se tiene el nombre (nombre != null) → emitir el mensaje "nombre != null" → ejecutar tool → cierre_completado = true → halt
- Si nombre == null → emitir el mensaje "nombre == null" (pide el nombre) → capturarlo si lo da → ejecutar tool igual → cierre_completado = true → halt (el flujo continúa; el nombre es opcional)
- El correo NO es obligatorio: solo se guarda si el cliente lo ofrece.

(5) NOTA DE CONTROL (NO EMITIR):
⛔ FIN DEL FLUJO. PROHIBIDO emitir contenido adicional tras el cierre.` },
    ],
  },
  {
    id: "agendamiento-citas", em: "📅", title: "Agendar citas",
    desc: "5 fases: ofrece horarios y reserva la cita.",
    steps: [
      { t: "BIENVENIDA",
        variable: "servicio (opcional en este paso)",
        condicion: "Si nombra un servicio del catálogo, va directo al paso 3. Si no, va al paso 2 para mostrarle las opciones — NO bloquear.",
        ex: `¡Hola! 👋 Bienvenido a *[NOMBRE_NEGOCIO]*.
¿Qué servicio te gustaría agendar?`,
        main: `🔒 CONDICIÓN GATE: current_step == 1 AND bienvenida_enviada == false
🚨 PRIORIDAD ABSOLUTA — PRIMER TURNO.

✅ SECUENCIA OBLIGATORIA (orden estricto):
1º Emitir ÚNICAMENTE el texto exacto de Regla/parámetro (2).
2º Si existe el flujo 'BIENVENIDA', ejecutarlo; si NO existe, continuar igual.
3º Guardar bienvenida_enviada = true.

⏸️ DESPUÉS de ejecutar: ESPERAR respuesta del usuario.

🚫 PROHIBIDO EN ESTE PASO:
- Formular preguntas propias o de confirmación.
- Ofrecer horarios en este turno.
- Ejecutar cualquier tool.
- Repetir la bienvenida si bienvenida_enviada == true.

ELEMENTOS DEL PASO 1:

(1) FUNCIÓN (opcional): Ejecuta el flujo 'BIENVENIDA' si existe; si no, continúa igual

(2) REGLA/PARÁMETRO — TEXTO ÚNICO (un solo mensaje):
¡Hola! 👋 Bienvenido a *[NOMBRE_NEGOCIO]*.
¿Qué servicio te gustaría agendar?

(3) REGLA/PARÁMETRO — TRANSICIÓN (NO EMITIR):
- Menciona un servicio del catálogo → guardar en silencio servicio → current_step = 3
- Pide agendar sin decir el servicio → current_step = 2` },
      { t: "SERVICIO",
        variable: "servicio",
        condicion: "Captura el servicio. Si no elige, repregunta MÁX. 1 vez; luego guarda servicio = \"no definido\" y avanza — no ciclar.",
        ex: `Estos son nuestros servicios:
1️⃣ *[SERVICIO_1]*
2️⃣ *[SERVICIO_2]*
3️⃣ *[SERVICIO_3]*
¿Cuál te interesa?`,
        main: `🔒 CONDICIÓN GATE: bienvenida_enviada == true AND servicio == null

✅ SECUENCIA OBLIGATORIA (orden estricto):
1º Emitir ÚNICAMENTE el texto exacto de Regla/parámetro (2).
2º Si existe el flujo 'SERVICIO', ejecutarlo; si NO existe, continuar igual.

⏸️ DESPUÉS de ejecutar: ESPERAR respuesta del usuario.

🚫 PROHIBIDO EN ESTE PASO:
- Inventar servicios fuera del catálogo o las tools.
- Ofrecer horarios antes de definir el servicio.
- Hacer dos preguntas en el mismo mensaje.
- Ejecutar tools de registro.

ELEMENTOS DEL PASO 2:

(1) FUNCIÓN (opcional): Ejecuta el flujo 'SERVICIO' si existe; si no, continúa igual

(2) REGLA/PARÁMETRO — TEXTO ÚNICO (un solo mensaje):
Estos son nuestros servicios:
1️⃣ *[SERVICIO_1]*
2️⃣ *[SERVICIO_2]*
3️⃣ *[SERVICIO_3]*
¿Cuál te interesa?

(3) REGLA/PARÁMETRO — TRANSICIÓN (NO EMITIR):
- Elige una opción o nombra un servicio del catálogo → guardar en silencio servicio → current_step = 3
- Nombra algo fuera del catálogo → emitir: "Ese servicio no lo manejamos 😕 ¿Te interesa alguno de la lista?" → repreguntar una vez.
- Tras repreguntar 1 vez sin elegir → guardar servicio = "no definido" → current_step = 3 (un asesor confirmará el servicio)` },
      { t: "DISPONIBILIDAD",
        variable: "fecha_hora",
        condicion: "Ofrece solo horarios reales de la agenda. Captura el elegido. Si ninguno le sirve, un asesor coordina (fecha_hora = \"por coordinar\") y avanza — no bloquear.",
        ex: `Para *[SERVICIO]* tengo estos horarios disponibles:
1️⃣ *[HORARIO_1]*
2️⃣ *[HORARIO_2]*
3️⃣ *[HORARIO_3]*
¿Cuál te queda mejor?`,
        main: `🔒 CONDICIÓN GATE: servicio != null AND fecha_hora == null

✅ SECUENCIA OBLIGATORIA (orden estricto):
1º Si existe el flujo 'DISPONIBILIDAD', ejecutarlo; si NO existe, continuar igual (la instrucción va primero).
2º Consultar la disponibilidad real en la tool de agenda (Calendar/Calendly/Sheet), si está conectada.
3º Emitir ÚNICAMENTE el texto exacto de Regla/parámetro (2) con los horarios obtenidos.

⏸️ DESPUÉS de ejecutar: ESPERAR respuesta del usuario.

🚫 PROHIBIDO EN ESTE PASO:
- Ofrecer horarios sin haberlos validado contra la fuente real (si hay tool conectada).
- Inventar disponibilidad, días u horarios.
- Ofrecer fechas fuera del horario de atención definido.
- Ejecutar tools de registro.

ELEMENTOS DEL PASO 3:

(1) FUNCIÓN (opcional): Ejecuta el flujo 'DISPONIBILIDAD' si existe; si no, continúa igual

(2) REGLA/PARÁMETRO — TEXTO ÚNICO (un solo mensaje):
Para *[SERVICIO]* tengo estos horarios disponibles:
1️⃣ *[HORARIO_1]*
2️⃣ *[HORARIO_2]*
3️⃣ *[HORARIO_3]*
¿Cuál te queda mejor?

(3) REGLA/PARÁMETRO — TRANSICIÓN (NO EMITIR):
- Elige un horario ofrecido → guardar en silencio fecha_hora → current_step = 4
- Pide otro día u horario → volver a consultar la agenda y ofrecer nuevas opciones → permanecer en current_step = 3
- Tras repreguntar 1 vez sin elegir → emitir: "Déjame que un asesor coordine el horario contigo 🙏" → guardar fecha_hora = "por coordinar" → current_step = 4` },
      { t: "CONFIRMACIÓN",
        variable: "nombre (opcional)",
        condicion: "Confirma el horario y crea la cita. El nombre es opcional: si no lo da, crea la cita igual y avanza — no bloquear.",
        ex: `Perfecto, reservo *[SERVICIO]* para el *[FECHA_HORA]*.
¿A nombre de quién la registro? 📝`,
        main: `🔒 CONDICIÓN GATE: fecha_hora != null AND cita_confirmada == false
📝 PLACEHOLDER: si nombre == null → omite el placeholder [NOMBRE] del mensaje, sin dejar espacios ni comas sueltas.

✅ SECUENCIA OBLIGATORIA (orden estricto):
1º Emitir ÚNICAMENTE el texto exacto de Regla/parámetro (2).
2º Si existe el flujo 'CONFIRMACION', ejecutarlo; si NO existe, continuar igual.
3º Al recibir el nombre, crear la cita en la tool de agenda (si está conectada).
4º Guardar cita_confirmada = true.

⏸️ DESPUÉS de ejecutar: ESPERAR respuesta del usuario.

🚫 PROHIBIDO EN ESTE PASO:
- Bloquear la confirmación si el cliente no da el nombre — el flujo debe continuar.
- Solicitar datos que el cliente ya entregó.
- Fragmentar la respuesta en varios mensajes.

ELEMENTOS DEL PASO 4:

(1) FUNCIÓN (opcional): Ejecuta el flujo 'CONFIRMACION' si existe; si no, continúa igual

(2) REGLA/PARÁMETRO — TEXTO ÚNICO (un solo mensaje):
Perfecto, reservo *[SERVICIO]* para el *[FECHA_HORA]*.
¿A nombre de quién la registro? 📝

(3) REGLA/PARÁMETRO — TRANSICIÓN (NO EMITIR):
- Entrega el nombre → guardar en silencio nombre → crear la cita en la agenda → cita_confirmada = true → current_step = 5
- No entrega el nombre tras pedirlo 1 vez → crear la cita igual → cita_confirmada = true → current_step = 5 (el nombre es opcional)
- Cambia de horario → fecha_hora = null → current_step = 3` },
      { t: "FINALIZACIÓN (paso final)",
        variable: "—",
        condicion: "Ejecuta la tool de registro/notificación, activa el recordatorio (24 h y 1 h antes) y CIERRA SIEMPRE. Fin del flujo.",
        ex: `¡Listo, *[NOMBRE]*! Tu cita quedó confirmada ✅
🗓️ *[SERVICIO]* — *[FECHA_HORA]*
📍 *[DIRECCION]*
Te enviaré un recordatorio antes de tu cita. ¡Te esperamos! 😊`,
        main: `🔒 CONDICIÓN GATE: cita_confirmada == true AND recordatorio_activado == false
📝 PLACEHOLDER: si nombre == null → omite el placeholder [NOMBRE] del mensaje, sin dejar espacios ni comas sueltas.

✅ SECUENCIA OBLIGATORIA (orden estricto):
1º Emitir ÚNICAMENTE el texto exacto de Regla/parámetro (2), como UN SOLO MENSAJE.
2º Si existe el flujo 'FINALIZACION', ejecutarlo; si NO existe, continuar igual.
3º Ejecutar la tool de registro/notificación de la cita.
4º Activar el recordatorio automático (24 h antes y 1 h antes).
5º Guardar recordatorio_activado = true → halt.

🚫 PROHIBIDO EN ESTE PASO:
- Bloquear el cierre si falta el nombre — el flujo debe CERRAR igual.
- Inventar dirección, sede o datos no definidos en el catálogo o las tools.
- Fragmentar la confirmación en varios mensajes.
- Emitir cualquier mensaje después del cierre.

ELEMENTOS DEL PASO 5:

(1) FUNCIÓN (opcional): Ejecuta el flujo 'FINALIZACION' si existe; si no, continúa igual

(2) REGLA/PARÁMETRO — TEXTO ÚNICO (un solo mensaje):
¡Listo, *[NOMBRE]*! Tu cita quedó confirmada ✅
🗓️ *[SERVICIO]* — *[FECHA_HORA]*
📍 *[DIRECCION]*
Te enviaré un recordatorio antes de tu cita. ¡Te esperamos! 😊

(3) FUNCIÓN: Ejecuta la tool de registro/notificación de la cita

(4) REGLA/PARÁMETRO — TRANSICIÓN (NO EMITIR):
- Emitir la confirmación → ejecutar tool → activar recordatorio → recordatorio_activado = true → halt
- Si fecha_hora == "por coordinar" → notificar al asesor para que agende el horario con el cliente.

(5) NOTA DE CONTROL (NO EMITIR):
⛔ FIN DEL FLUJO. PROHIBIDO emitir contenido adicional tras el cierre.` },
    ],
  },
  {
    id: "calificacion-leads", em: "🧲", title: "Calificar leads",
    desc: "5 fases: detecta quién está listo para comprar.",
    steps: [
      { t: "BIENVENIDA",
        variable: "interes_declarado",
        condicion: "Captura lo que busca. Si solo saluda, repregunta 1 vez; luego guarda interes_declarado = \"no definido\" y avanza — no bloquear.",
        ex: `¡Hola! 👋 Gracias por tu interés en *[NOMBRE_NEGOCIO]*.
Para orientarte mejor, ¿qué estás buscando?`,
        main: `🔒 CONDICIÓN GATE: current_step == 1 AND bienvenida_enviada == false
🚨 PRIORIDAD ABSOLUTA — PRIMER TURNO.

✅ SECUENCIA OBLIGATORIA (orden estricto):
1º Emitir ÚNICAMENTE el texto exacto de Regla/parámetro (2).
2º Si existe el flujo 'BIENVENIDA', ejecutarlo; si NO existe, continuar igual.
3º Guardar bienvenida_enviada = true.

⏸️ DESPUÉS de ejecutar: ESPERAR respuesta del usuario.

🚫 PROHIBIDO EN ESTE PASO:
- Formular preguntas propias o de confirmación.
- Dar precios, planes o propuestas en este turno.
- Ejecutar cualquier tool.
- Repetir la bienvenida si bienvenida_enviada == true.

ELEMENTOS DEL PASO 1:

(1) FUNCIÓN (opcional): Ejecuta el flujo 'BIENVENIDA' si existe; si no, continúa igual

(2) REGLA/PARÁMETRO — TEXTO ÚNICO (un solo mensaje):
¡Hola! 👋 Gracias por tu interés en *[NOMBRE_NEGOCIO]*.
Para orientarte mejor, ¿qué estás buscando?

(3) REGLA/PARÁMETRO — TRANSICIÓN (NO EMITIR):
- Describe lo que busca → guardar en silencio interes_declarado → current_step = 2
- Saluda sin explicar nada → pedirlo una vez más, sin repetir la bienvenida.
- Tras repreguntar 1 vez sin describir → guardar interes_declarado = "no definido" → current_step = 2` },
      { t: "CALIFICACIÓN",
        variable: "perfil",
        condicion: "Captura si es personal o empresa (suma al score). Si no responde claro, repregunta 1 vez y avanza — no ciclar.",
        ex: `¿Es para uso *personal* o para tu *empresa*?`,
        main: `🔒 CONDICIÓN GATE: interes_declarado != null AND perfil == null

✅ SECUENCIA OBLIGATORIA (orden estricto):
1º Emitir ÚNICAMENTE el texto exacto de Regla/parámetro (2).
2º Si existe el flujo 'CALIFICACION', ejecutarlo; si NO existe, continuar igual.

⏸️ DESPUÉS de ejecutar: ESPERAR respuesta del usuario.

🚫 PROHIBIDO EN ESTE PASO:
- Dar precios o hacer venta dura antes de completar la calificación.
- Hacer dos preguntas en el mismo mensaje.
- Descartar al lead por su respuesta.
- Ejecutar tools de registro.

ELEMENTOS DEL PASO 2:

(1) FUNCIÓN (opcional): Ejecuta el flujo 'CALIFICACION' si existe; si no, continúa igual

(2) REGLA/PARÁMETRO — TEXTO ÚNICO (un solo mensaje):
¿Es para uso *personal* o para tu *empresa*?

(3) REGLA/PARÁMETRO — TRANSICIÓN (NO EMITIR):
- Personal → guardar perfil = "personal" → score = score + 0 → current_step = 3
- Empresa / negocio / equipo → guardar perfil = "empresa" → score = score + 1 → current_step = 3
- Tras repreguntar 1 vez sin definir → guardar perfil = "no definido" → current_step = 3` },
      { t: "URGENCIA",
        variable: "urgencia",
        condicion: "Captura la urgencia (ajusta el score). Si no responde claro, repregunta 1 vez y avanza — no ciclar.",
        ex: `¿Para cuándo lo necesitas?
1️⃣ *Lo antes posible*
2️⃣ *En 1 a 3 meses*
3️⃣ *Solo estoy explorando*`,
        main: `🔒 CONDICIÓN GATE: perfil != null AND urgencia == null

✅ SECUENCIA OBLIGATORIA (orden estricto):
1º Emitir ÚNICAMENTE el texto exacto de Regla/parámetro (2).
2º Si existe el flujo 'URGENCIA', ejecutarlo; si NO existe, continuar igual.

⏸️ DESPUÉS de ejecutar: ESPERAR respuesta del usuario.

🚫 PROHIBIDO EN ESTE PASO:
- Presionar si el lead indica que solo está explorando.
- Hacer dos preguntas en el mismo mensaje.
- Ejecutar tools de registro.

ELEMENTOS DEL PASO 3:

(1) FUNCIÓN (opcional): Ejecuta el flujo 'URGENCIA' si existe; si no, continúa igual

(2) REGLA/PARÁMETRO — TEXTO ÚNICO (un solo mensaje):
¿Para cuándo lo necesitas?
1️⃣ *Lo antes posible*
2️⃣ *En 1 a 3 meses*
3️⃣ *Solo estoy explorando*

(3) REGLA/PARÁMETRO — TRANSICIÓN (NO EMITIR):
- Opción 1 o "urgente" / "ya" / "esta semana" → guardar urgencia = "alta" → score = score + 1 → current_step = 4
- Opción 2 o plazo de meses → guardar urgencia = "media" → score = score + 0 → current_step = 4
- Opción 3 o "explorando" → guardar urgencia = "baja" → score = score - 1 → current_step = 4
- Tras repreguntar 1 vez sin definir → guardar urgencia = "no definida" → current_step = 4` },
      { t: "PRESUPUESTO",
        variable: "—",
        condicion: "Ajusta el score según presupuesto y autoridad. Si lo evade, registra \"no definido\" y avanza igual — no bloquear.",
        ex: `Para recomendarte la mejor opción, ¿manejas un presupuesto estimado? ¿Y la decisión la tomas tú o alguien más?`,
        main: `🔒 CONDICIÓN GATE: urgencia != null AND calificacion_completa == false

✅ SECUENCIA OBLIGATORIA (orden estricto):
1º Emitir ÚNICAMENTE el texto exacto de Regla/parámetro (2).
2º Si existe el flujo 'PRESUPUESTO', ejecutarlo; si NO existe, continuar igual.

⏸️ DESPUÉS de ejecutar: ESPERAR respuesta del usuario.

🚫 PROHIBIDO EN ESTE PASO:
- Insistir en el presupuesto si el lead lo evade dos veces.
- Descartar al lead por no tener presupuesto definido.
- Hacer dos preguntas en el mismo mensaje.
- Ejecutar tools de registro.

ELEMENTOS DEL PASO 4:

(1) FUNCIÓN (opcional): Ejecuta el flujo 'PRESUPUESTO' si existe; si no, continúa igual

(2) REGLA/PARÁMETRO — TEXTO ÚNICO (un solo mensaje):
Para recomendarte la mejor opción, ¿manejas un presupuesto estimado? ¿Y la decisión la tomas tú o alguien más?

(3) REGLA/PARÁMETRO — TRANSICIÓN (NO EMITIR):
- Da un rango + es quien decide → score = score + 2 → guardar calificacion_completa = true → current_step = 5
- Da un rango pero decide otro → score = score + 1 → guardar calificacion_completa = true → current_step = 5
- No tiene presupuesto definido → score = score - 1 → guardar calificacion_completa = true → current_step = 5
- Evade dos veces → registrar "no definido" → guardar calificacion_completa = true → current_step = 5` },
      { t: "DERIVAR (paso final)",
        variable: "nombre (opcional), correo (opcional)",
        condicion: "Clasifica por score (caliente/tibio/frío), emite el mensaje del segmento, ejecuta la tool y CIERRA SIEMPRE, con o sin datos. Fin del flujo.",
        ex: `Por lo que me cuentas, lo mejor es que hables directo con un asesor.
¿Me confirmas tu *nombre* y tu *correo* para coordinarlo hoy mismo? 📩`,
        main: `🔒 CONDICIÓN GATE: calificacion_completa == true AND lead_derivado == false
📝 PLACEHOLDER: si nombre == null → omite el placeholder [NOMBRE] del mensaje, sin dejar espacios ni comas sueltas.

✅ SECUENCIA OBLIGATORIA (orden estricto):
1º Clasificar el lead según el score acumulado.
2º Emitir ÚNICAMENTE el texto de la Regla/parámetro correspondiente al segmento (2), (3) o (4).
3º Si existe el flujo 'DERIVAR', ejecutarlo; si NO existe, continuar igual.
4º Ejecutar la tool de registro/notificación al asesor.
5º Guardar lead_derivado = true → halt.

🗂️ CLASIFICACIÓN POR SCORE:
- CALIENTE → score >= 3 → Regla/parámetro (2)
- TIBIO → score entre 0 y 2 → Regla/parámetro (3)
- FRÍO → score < 0 → Regla/parámetro (4)

🚫 PROHIBIDO EN ESTE PASO:
- Derivar sin haber calculado el score.
- Tratar a un lead frío con presión de venta.
- Descartar un lead frío sin ofrecerle material.
- Bloquear el cierre si el cliente no da nombre/correo — el flujo debe CERRAR igual.

ELEMENTOS DEL PASO 5:

(1) FUNCIÓN (opcional): Ejecuta el flujo 'DERIVAR' si existe; si no, continúa igual

(2) REGLA/PARÁMETRO — LEAD CALIENTE — TEXTO ÚNICO (un solo mensaje):
Por lo que me cuentas, lo mejor es que hables directo con un asesor.
¿Me confirmas tu *nombre* y tu *correo* para coordinarlo hoy mismo? 📩

(3) REGLA/PARÁMETRO — LEAD TIBIO — TEXTO ÚNICO (un solo mensaje):
Te propongo una demo corta para que veas cómo funciona.
¿Me compartes tu *nombre* y *correo* para enviarte la información? 📩

(4) REGLA/PARÁMETRO — LEAD FRÍO — TEXTO ÚNICO (un solo mensaje):
Perfecto, sin compromiso.
Déjame tu *nombre* y *correo* y te envío material útil para cuando estés listo. 📩

(5) FUNCIÓN: Ejecuta la tool de registro/notificación al asesor

(6) REGLA/PARÁMETRO — TRANSICIÓN (NO EMITIR):
- Entrega nombre y correo → guardar → ejecutar tool → emitir confirmación breve → lead_derivado = true → halt
- Entrega solo parte o nada → ejecutar tool igual con lo que haya → lead_derivado = true → halt (nombre y correo son opcionales)

(7) NOTA DE CONTROL (NO EMITIR):
⛔ FIN DEL FLUJO. PROHIBIDO emitir contenido adicional tras la derivación.` },
    ],
  },
  {
    id: "atencion-cliente", em: "🎧", title: "Atención / soporte",
    desc: "5 fases: resuelve dudas, solicitudes y reclamos.",
    steps: [
      { t: "BIENVENIDA",
        variable: "motivo_consulta",
        condicion: "Captura el motivo. Si el tono es molesto, marca caso_sensible. Si solo saluda, repregunta 1 vez y avanza — no bloquear.",
        ex: `¡Hola! 👋 Soporte de *[NOMBRE_NEGOCIO]*.
¿En qué puedo ayudarte hoy?`,
        main: `🔒 CONDICIÓN GATE: current_step == 1 AND bienvenida_enviada == false
🚨 PRIORIDAD ABSOLUTA — PRIMER TURNO.

✅ SECUENCIA OBLIGATORIA (orden estricto):
1º Emitir ÚNICAMENTE el texto exacto de Regla/parámetro (2).
2º Si existe el flujo 'BIENVENIDA', ejecutarlo; si NO existe, continuar igual.
3º Guardar bienvenida_enviada = true.

⏸️ DESPUÉS de ejecutar: ESPERAR respuesta del usuario.

🚫 PROHIBIDO EN ESTE PASO:
- Formular preguntas propias o de confirmación.
- Dar soluciones o diagnósticos en este turno.
- Ejecutar cualquier tool.
- Repetir la bienvenida si bienvenida_enviada == true.

ELEMENTOS DEL PASO 1:

(1) FUNCIÓN (opcional): Ejecuta el flujo 'BIENVENIDA' si existe; si no, continúa igual

(2) REGLA/PARÁMETRO — TEXTO ÚNICO (un solo mensaje):
¡Hola! 👋 Soporte de *[NOMBRE_NEGOCIO]*.
¿En qué puedo ayudarte hoy?

(3) REGLA/PARÁMETRO — TRANSICIÓN (NO EMITIR):
- Describe una duda, solicitud o reclamo → guardar en silencio motivo_consulta → current_step = 2
- Si el tono es molesto o de reclamo → guardar caso_sensible = true → current_step = 2
- Saluda sin explicar nada → pedirlo una vez más, sin repetir la bienvenida.
- Tras repreguntar 1 vez sin describir → guardar motivo_consulta = "no definido" → current_step = 2` },
      { t: "IDENTIFICACIÓN",
        variable: "datos_caso",
        condicion: "Captura nombre + número de pedido/servicio. Si no lo tiene, acepta nombre + fecha o marca \"sin identificar\" y avanza — no bloquear.",
        ex: `Para ubicar tu caso, ¿me compartes tu *nombre* y tu *número de pedido o servicio*? 📋`,
        main: `🔒 CONDICIÓN GATE: motivo_consulta != null AND datos_caso == null
📝 PLACEHOLDER: si caso_sensible == true → anteponer UNA sola frase de empatía antes del texto (ej: "Lamento el inconveniente.").

✅ SECUENCIA OBLIGATORIA (orden estricto):
1º Emitir ÚNICAMENTE el texto exacto de Regla/parámetro (2).
2º Si existe el flujo 'IDENTIFICACION', ejecutarlo; si NO existe, continuar igual.

⏸️ DESPUÉS de ejecutar: ESPERAR respuesta del usuario.

🚫 PROHIBIDO EN ESTE PASO:
- Dar información sensible antes de identificar el caso.
- Pedir más datos de los necesarios para ubicar el caso.
- Adelantar la solución sin haber identificado el caso.
- Ejecutar tools de registro.

ELEMENTOS DEL PASO 2:

(1) FUNCIÓN (opcional): Ejecuta el flujo 'IDENTIFICACION' si existe; si no, continúa igual

(2) REGLA/PARÁMETRO — TEXTO ÚNICO (un solo mensaje):
Para ubicar tu caso, ¿me compartes tu *nombre* y tu *número de pedido o servicio*? 📋

(3) REGLA/PARÁMETRO — TRANSICIÓN (NO EMITIR):
- Entrega los datos → guardar en silencio datos_caso → current_step = 3
- Entrega solo parte → pedir únicamente lo faltante, sin repetir la pregunta completa.
- No tiene número de pedido → aceptar nombre + fecha aproximada → guardar datos_caso → current_step = 3
- Tras pedir 1 vez sin dar datos → guardar datos_caso = "sin identificar" → current_step = 3` },
      { t: "VALIDACIÓN",
        variable: "—",
        condicion: "Consulta el caso en la fuente. Si lo encuentra, guarda su estado. Si no, tras 2 intentos lo marca \"requiere_humano\" y avanza — no bloquear.",
        ex: `Gracias, ya tengo tu caso. Estoy revisando la información, dame un momento. 🔎`,
        main: `🔒 CONDICIÓN GATE: datos_caso != null AND caso_validado == false

✅ SECUENCIA OBLIGATORIA (orden estricto):
1º Si existe el flujo 'VALIDACION', ejecutarlo; si NO existe, continuar igual (la instrucción va primero).
2º Consultar el caso en la fuente disponible (base de conocimiento, Sheet, CRM o tool de consulta).
3º Emitir ÚNICAMENTE el texto exacto de Regla/parámetro (2).
4º Guardar caso_validado = true.

⏸️ DESPUÉS de ejecutar: ESPERAR respuesta del usuario.

🚫 PROHIBIDO EN ESTE PASO:
- Inventar el estado del caso, plazos o historial.
- Prometer soluciones antes de confirmar la información.
- Ejecutar tools de registro o notificación.

ELEMENTOS DEL PASO 3:

(1) FUNCIÓN (opcional): Ejecuta el flujo 'VALIDACION' si existe; si no, continúa igual

(2) REGLA/PARÁMETRO — TEXTO ÚNICO (un solo mensaje):
Gracias, ya tengo tu caso. Estoy revisando la información, dame un momento. 🔎

(3) REGLA/PARÁMETRO — TRANSICIÓN (NO EMITIR):
- Caso encontrado → guardar estado_caso → current_step = 4
- Caso NO encontrado → emitir: "No encuentro ese registro 😕 ¿Me confirmas el dato?" → repreguntar una vez.
- Tras 2 intentos sin encontrarlo → guardar estado_caso = "requiere_humano" → current_step = 4` },
      { t: "RESOLUCIÓN",
        variable: "—",
        condicion: "Entrega la solución o escala al humano. Si pide más detalle, responde sin reejecutar y avanza al cierre — no bloquear.",
        ex: `Esto es lo que encontré: *[ESTADO_O_SOLUCIÓN]*
Pasos a seguir: *[PASOS]*`,
        main: `🔒 CONDICIÓN GATE: caso_validado == true AND solucion_entregada == false

✅ SECUENCIA OBLIGATORIA (orden estricto):
1º Si existe el flujo 'RESOLUCION', ejecutarlo; si NO existe, continuar igual (la instrucción va primero).
2º Emitir Regla/parámetro (2) si hay solución, o Regla/parámetro (3) si el caso requiere humano.
3º Guardar solucion_entregada = true.

⏸️ DESPUÉS de ejecutar: ESPERAR respuesta del usuario.

🚫 PROHIBIDO EN ESTE PASO:
- Inventar soluciones, plazos o compromisos no definidos.
- Repetir una solución que el usuario ya dijo haber intentado.
- Fragmentar la respuesta en varios mensajes.
- Ejecutar tools de registro.

ELEMENTOS DEL PASO 4:

(1) FUNCIÓN (opcional): Ejecuta el flujo 'RESOLUCION' si existe; si no, continúa igual

(2) REGLA/PARÁMETRO — CASO CON SOLUCIÓN — TEXTO ÚNICO (un solo mensaje):
Esto es lo que encontré: *[ESTADO_O_SOLUCIÓN]*
Pasos a seguir: *[PASOS]*

(3) REGLA/PARÁMETRO — CASO SIN SOLUCIÓN — TEXTO ÚNICO (un solo mensaje):
Tu caso necesita revisión de un especialista. Ya lo escalé al área encargada y te contactarán en *[PLAZO]*. 🙏

(4) REGLA/PARÁMETRO — TRANSICIÓN (NO EMITIR):
- Solución entregada → current_step = 5
- Caso escalado (estado_caso == "requiere_humano") → current_step = 5
- Usuario pide más detalle → responder sin reejecutar el flujo → permanecer en current_step = 4` },
      { t: "CIERRE (paso final)",
        variable: "—",
        condicion: "Confirma si quedó resuelto. Si no, vuelve a Resolución. Si plantea otro caso, reinicia en Identificación. Cierra siempre. Fin del flujo.",
        ex: `¿Esto resuelve tu solicitud? ¿Puedo ayudarte con algo más? 😊`,
        main: `🔒 CONDICIÓN GATE: solucion_entregada == true AND caso_cerrado == false

✅ SECUENCIA OBLIGATORIA (orden estricto):
1º Emitir ÚNICAMENTE el texto exacto de Regla/parámetro (2).
2º Si existe el flujo 'CIERRE', ejecutarlo; si NO existe, continuar igual.
3º Guardar caso_cerrado = true → halt.

🚫 PROHIBIDO EN ESTE PASO:
- Cerrar el caso sin confirmar si el usuario quedó conforme.
- Insistir con la encuesta si el usuario no responde.
- Emitir cualquier mensaje después del cierre.

ELEMENTOS DEL PASO 5:

(1) FUNCIÓN (opcional): Ejecuta el flujo 'CIERRE' si existe; si no, continúa igual

(2) REGLA/PARÁMETRO — TEXTO ÚNICO (un solo mensaje):
¿Esto resuelve tu solicitud? ¿Puedo ayudarte con algo más? 😊

(3) REGLA/PARÁMETRO — TRANSICIÓN (NO EMITIR):
- Confirma que quedó resuelto → guardar caso_cerrado = true → emitir despedida breve → halt
- Dice que NO quedó resuelto → solucion_entregada = false → current_step = 4
- Plantea un caso nuevo → reiniciar desde current_step = 2 con nuevo motivo_consulta
- No responde tras la pregunta → guardar caso_cerrado = true → halt (no insistir)

(4) NOTA DE CONTROL (NO EMITIR):
⛔ FIN DEL FLUJO al confirmarse el cierre. PROHIBIDO emitir contenido adicional.` },
    ],
  },
  {
    id: "pedidos-delivery", em: "🛵", title: "Pedidos / Delivery",
    desc: "5 fases: arma el pedido, entrega y cobra.",
    steps: [
      { t: "BIENVENIDA",
        variable: "carrito",
        condicion: "Menciona productos o pide el menú → paso 2. Saluda sin pedir → permanecer sin repetir la bienvenida.",
        ex: `¡Hola! 👋 Bienvenido a *[NOMBRE_NEGOCIO]*.
¿Qué te gustaría pedir hoy?`,
        main: `🔒 CONDICIÓN GATE: current_step == 1 AND bienvenida_enviada == false
🚨 PRIORIDAD ABSOLUTA — PRIMER TURNO.

✅ SECUENCIA OBLIGATORIA (orden estricto):
1º Emitir ÚNICAMENTE el texto de "lo que dice el agente".
2º Si existe el flujo 'BIENVENIDA', ejecutarlo; si NO existe, continuar igual.
3º Guardar bienvenida_enviada = true.

⏸️ DESPUÉS de ejecutar: ESPERAR respuesta del usuario.

🚫 PROHIBIDO EN ESTE PASO:
- Formular preguntas propias o de confirmación.
- Emitir precios o tomar el pedido en este turno.
- Ejecutar cualquier tool.
- Repetir la bienvenida si bienvenida_enviada == true.

🔄 FUNCIÓN (opcional): Ejecuta el flujo 'BIENVENIDA' si existe; si no, continúa igual.

➡️ TRANSICIÓN (NO EMITIR):
- Menciona uno o más productos, o pide ver el menú → current_step = 2
- Saluda sin pedir nada → permanecer en current_step = 1, sin repetir la bienvenida.` },
      { t: "PEDIDO",
        variable: "carrito, carrito_cerrado",
        condicion: "Agrega productos al carrito (validando disponibilidad). 'Es todo' → carrito_cerrado → paso 3.",
        ex: `Listo, agregué *[PRODUCTO]* a tu pedido.
¿Deseas agregar algo más o cerramos el pedido?`,
        main: `🔒 CONDICIÓN GATE: current_step == 2 AND carrito_cerrado == false

✅ SECUENCIA OBLIGATORIA (orden estricto):
1º Ejecutar el flujo del producto/categoría mencionado, si existe.
2º Validar disponibilidad ANTES de agregar al carrito.
3º Agregar el ítem a carrito[] (producto + cantidad + precio).
4º Emitir ÚNICAMENTE el texto de "lo que dice el agente".

⏸️ DESPUÉS de ejecutar: ESPERAR respuesta del usuario.

🚫 PROHIBIDO EN ESTE PASO:
- Agregar productos sin validar disponibilidad.
- Inventar productos, precios o extras fuera del catálogo/tool.
- Cerrar el carrito sin que el usuario lo confirme.
- Ejecutar tools de registro.

🔄 FUNCIÓN (opcional): Ejecuta el flujo del producto correspondiente si existe; si no, continúa igual.

➡️ TRANSICIÓN (NO EMITIR):
- Menciona otro producto → agregar a carrito[] → permanecer en current_step = 2
- Dice "es todo" / "cerrar" / "nada más" / "ya" → carrito_cerrado = true → current_step = 3
- Pide ver el menú → emitir catálogo → permanecer en current_step = 2
- Otra cosa → repreguntar: "¿Agregas algo más o cerramos el pedido? 🙏" (sin avanzar)` },
      { t: "DATOS ENTREGA",
        variable: "datos_entrega, costo_envio",
        condicion: "Recoge → datos_entrega='local'. Delivery + dirección → validar zona → costo_envio → paso 4.",
        ex: `¿Es para *delivery* o lo *recoges en el local*?
Si es delivery, indícame tu dirección con un punto de referencia. 📍`,
        main: `🔒 CONDICIÓN GATE: carrito_cerrado == true AND datos_entrega == null
💬 EMIT SALIDA LITERAL: Emitir ÚNICAMENTE el texto de "lo que dice el agente". Esperar respuesta.

🚫 PROHIBIDO EN ESTE PASO:
- Confirmar entrega a una zona sin validar cobertura real.
- Inventar costos de envío fuera del catálogo/tool.
- Pedir dirección si el usuario eligió recoger en el local.
- Ejecutar tools de registro.

➡️ TRANSICIÓN (NO EMITIR):
- Elige recoger → datos_entrega = "local" → costo_envio = 0 → current_step = 4
- Elige delivery + entrega dirección → validar zona:
   • Zona cubierta → datos_entrega = <dirección> + costo_envio = <valor> → current_step = 4
   • Zona NO cubierta → emitir: "Por ahora no llegamos a esa zona 😔 ¿Prefieres recogerlo en el local?" → permanecer en current_step = 3
- Elige delivery sin dirección → pedir solo la dirección, sin repetir la pregunta completa.` },
      { t: "RESUMEN",
        variable: "resumen_confirmado",
        condicion: "Confirma → resumen_confirmado → paso 5. Agrega producto → volver a paso 2. Cambia algo → actualizar y reemitir.",
        ex: `Este es tu pedido:
🛒 *[LISTA_PRODUCTOS_CON_PRECIO]*
🚚 Envío: *[COSTO_ENVIO]*
💰 *Total: [TOTAL]*
¿Confirmamos tu pedido?`,
        main: `🔒 CONDICIÓN GATE: datos_entrega != null AND resumen_confirmado == false
💬 EMIT SALIDA LITERAL: Emitir ÚNICAMENTE el texto de "lo que dice el agente", como UN SOLO MENSAJE. Esperar respuesta.

🚫 PROHIBIDO EN ESTE PASO:
- Fragmentar el resumen en varios mensajes.
- Modificar el carrito sin que el usuario lo pida.
- Insistir con el complemento más de una vez.
- Inventar promociones o combos fuera del catálogo/tool.
- Ejecutar tools de registro.

➡️ TRANSICIÓN (NO EMITIR):
- Confirma (sí / dale / correcto / listo / ok) → resumen_confirmado = true → current_step = 5
- Agrega un producto → carrito_cerrado = false → current_step = 2
- Quita o cambia un producto → actualizar carrito[] → reemitir el resumen actualizado → permanecer en current_step = 4
- Otra cosa → repreguntar: "¿Confirmamos tu pedido? 🙏" (sin avanzar)` },
      { t: "PAGO (paso final)",
        variable: "metodo_pago, seguimiento_activado",
        condicion: "Elige método → emitir sus datos → ejecutar tool de registro → confirmar pedido → activar seguimiento → fin (halt).",
        ex: `¿Cómo prefieres pagar?
1️⃣ *[METODO_1]*
2️⃣ *[METODO_2]*
3️⃣ *[METODO_3]*`,
        main: `🔒 CONDICIÓN GATE: resumen_confirmado == true AND seguimiento_activado == false

✅ SECUENCIA OBLIGATORIA (orden estricto):
1º Preguntar el método de pago (texto de "lo que dice el agente"). Esperar la elección.
2º Al elegir, emitir los datos del método elegido ([DATOS_METODO_1/2/3]) y guardar metodo_pago.
3º Ejecutar la tool de registro/notificación del pedido.
4º Emitir la confirmación final (un solo mensaje), reemplazando las variables por sus valores capturados:
   "¡Pedido confirmado, [NOMBRE]! 🎉 🛒 [LISTA_PRODUCTOS] 💰 Total: [TOTAL] ⏱️ Tiempo estimado: [TIEMPO_ENTREGA] 📍 Entrega en: [DATOS_ENTREGA]. Te avisamos cuando salga tu pedido. ¡Gracias por tu compra! 🛵"
5º Activar triggers: "en preparación" → "en camino" → "entregado" → encuesta.
6º Guardar seguimiento_activado = true → halt.

🚫 PROHIBIDO EN ESTE PASO:
- Ofrecer métodos de pago no habilitados por el negocio.
- Emitir datos bancarios antes de que el usuario elija su opción.
- Emitir cualquier mensaje después de la confirmación.
- Emitir nombres de variables como texto literal — usar SIEMPRE el valor capturado.
- Inventar tiempos de entrega no definidos en el catálogo/tool.

🔄 FUNCIÓN: Ejecuta la tool de registro/notificación del pedido.

➡️ TRANSICIÓN (NO EMITIR):
- Elige una opción (1-3) → guardar metodo_pago → emitir sus datos → ejecutar tool → emitir confirmación final → activar seguimiento → seguimiento_activado = true → halt
- No elige → repreguntar una vez, sin avanzar.

⛔ FIN DEL FLUJO. Este es el último paso. PROHIBIDO avanzar a pasos posteriores o emitir contenido adicional.` },
    ],
  },
];
