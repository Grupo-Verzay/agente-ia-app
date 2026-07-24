// Objetivos (embudos) del asistente de alta "Da de alta tu Agente IA".
//
// Fuente ÚNICA compartida entre:
//  - AgentOnboardingWizard (muestra los pasos y el ejemplo editable), y
//  - completeAgentOnboarding (inyecta `main` como "instrucciones del sistema"
//    / Objetivo–respuesta principal de cada paso, igual que una plantilla).
//
// Cada paso:
//  - t:    título del paso (SIEMPRE en MAYÚSCULA).
//  - ex:   ejemplo de lo que dice el agente (se pre-llena y el dueño edita).
//  - main: instrucciones del sistema — equilibrado: objetivo + qué hace +
//          cuándo aplica + cuándo avanza + una regla mínima. Corto pero sólido.

export type ObjectiveStep = {
  t: string;      // título del paso (MAYÚSCULA)
  ex: string;     // mensaje que dice el agente (editable)
  main: string;   // instrucción principal (GATE + secuencia + prohibido + transición)
  variable?: string;  // Motor de Flujo: variable que recoge el paso
  condicion?: string; // Motor de Flujo: condición para avanzar
};

/**
 * Reemplaza las variables entre [corchetes] por los datos reales del negocio.
 * Solo sustituye la variable si el dato existe; si no, deja el [placeholder]
 * para que quede claro qué falta. Nunca toca texto personalizado por el dueño
 * (solo reemplaza el token exacto). Las variables de tiempo de conversación
 * ([fecha/hora], [monto], [tiempo estimado]…) se dejan intactas: las llena el
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
        variable: "producto_interes",
        condicion: "Menciona/pregunta un producto → guardar producto_interes → paso 3. Sin intención clara → paso 2.",
        ex: `🤖 *[NOMBRE_AGENTE]*
¡Hola! 👋 Bienvenido a *[NOMBRE_NEGOCIO]*.
¿Qué producto te interesa?`,
        main: `🔒 CONDICIÓN GATE: current_step == 1 AND bienvenida_enviada == false
🚨 PRIORIDAD ABSOLUTA — PRIMER TURNO.

✅ SECUENCIA OBLIGATORIA (orden estricto):
1º Ejecutar el flujo 'BIENVENIDA' ANTES de responder.
2º Emitir ÚNICAMENTE el texto de "lo que dice el agente".
3º Guardar bienvenida_enviada = true.

⏸️ DESPUÉS de ejecutar: ESPERAR respuesta del usuario.

🚫 PROHIBIDO EN ESTE PASO:
- Formular preguntas propias o de confirmación.
- Dar precios en este turno.
- Ejecutar cualquier tool.
- Repetir la bienvenida si bienvenida_enviada == true.

🔄 FUNCIÓN: Ejecuta el flujo 'BIENVENIDA'.

➡️ TRANSICIÓN (NO EMITIR):
- Menciona un producto del catálogo → guardar producto_interes → current_step = 3
- Pregunta por precio de un producto concreto → guardar producto_interes → current_step = 3
- Escribe sin intención clara → current_step = 2
- Saluda sin pedir nada → permanecer en current_step = 1, sin repetir la bienvenida.` },
      { t: "PRODUCTO DE INTERÉS",
        variable: "producto_interes",
        condicion: "Elige del catálogo → guardar producto_interes → paso 3. Fuera del catálogo → avisar y ofrecer la lista.",
        ex: `🤖 *[NOMBRE_AGENTE]*
Tenemos:
1️⃣ *[CATEGORIA_1]*
2️⃣ *[CATEGORIA_2]*
3️⃣ *[CATEGORIA_3]*
¿Cuál te interesa?`,
        main: `🔒 CONDICIÓN GATE: bienvenida_enviada == true AND producto_interes == null
💬 EMIT SALIDA LITERAL: Emitir ÚNICAMENTE el texto de "lo que dice el agente". Esperar respuesta.

🚫 PROHIBIDO EN ESTE PASO:
- Dar precios antes de identificar el producto.
- Inventar productos o categorías fuera del catálogo o las tools.
- Hacer dos preguntas en el mismo mensaje.
- Ejecutar tools de registro.

➡️ TRANSICIÓN (NO EMITIR):
- Elige una opción o nombra un producto del catálogo → guardar producto_interes → current_step = 3
- Nombra algo fuera del catálogo → emitir: "Ese no lo manejamos 😕 ¿Te interesa alguno de la lista?" → permanecer en current_step = 2
- Otra cosa → repreguntar la lista una vez, sin avanzar.` },
      { t: "PRESENTACIÓN",
        variable: "oferta_presentada",
        condicion: "Confirma (sí / lo quiero) → paso 4. Pide otra opción → reiniciar producto → paso 2. Objeta precio → responder sin reejecutar.",
        ex: `🤖 *[NOMBRE_AGENTE]*
Te recomiendo *[PRODUCTO]*.
✅ *[BENEFICIO_1]*
✅ *[BENEFICIO_2]*
✅ *[BENEFICIO_3]*
💰 *[PRECIO]*
¿Te lo llevas?`,
        main: `🔒 CONDICIÓN GATE: producto_interes != null AND oferta_presentada == false

✅ SECUENCIA OBLIGATORIA (orden estricto):
1º Ejecutar el flujo del producto correspondiente, si existe.
2º Validar disponibilidad y precio en el catálogo o las tools.
3º Emitir ÚNICAMENTE el texto de "lo que dice el agente", como UN SOLO MENSAJE.
4º Guardar oferta_presentada = true.

⏸️ DESPUÉS de ejecutar: ESPERAR respuesta del usuario.

🚫 PROHIBIDO EN ESTE PASO:
- Inventar precios, stock o características.
- Presentar más de una opción a la vez si abruma.
- Fragmentar la presentación en varios mensajes.
- Reejecutar el flujo si oferta_presentada == true.

🔄 FUNCIÓN: Ejecuta el flujo del producto correspondiente (si existe).

➡️ TRANSICIÓN (NO EMITIR):
- Confirma (sí / lo quiero / dale / me lo llevo) → current_step = 4
- Pide otra opción → producto_interes = null → oferta_presentada = false → current_step = 2
- Objeta el precio o pregunta detalles → responder sin reejecutar el flujo → permanecer en current_step = 3` },
      { t: "CIERRE",
        variable: "nombre, metodo_pago, datos_envio",
        condicion: "Da el nombre → emitir 2ª pregunta (pago/envío). Elige pago/envío → datos_completos → paso 5. Falta algo → pedir solo lo faltante.",
        ex: `🤖 *[NOMBRE_AGENTE]*
¡Perfecto! ¿A nombre de quién registro el pedido? 📝`,
        main: `🔒 CONDICIÓN GATE: oferta_presentada == true AND datos_completos == false
💬 EMIT SALIDA LITERAL: Emitir ÚNICAMENTE el texto de "lo que dice el agente". Esperar respuesta.

🚫 PROHIBIDO EN ESTE PASO:
- Pedir todos los datos en un solo mensaje.
- Solicitar datos que el cliente ya entregó.
- Ofrecer métodos de pago o envío no habilitados por el negocio.
- Ejecutar tools de registro.

💬 SEGUNDA PREGUNTA (tras recibir el nombre):
🤖 *[NOMBRE_AGENTE]*
Gracias. ¿Cómo prefieres pagar y recibirlo?
1️⃣ *[METODO_1]*
2️⃣ *[METODO_2]*
3️⃣ *[METODO_3]*

➡️ TRANSICIÓN (NO EMITIR):
- Entrega el nombre → guardar nombre → emitir la SEGUNDA PREGUNTA → permanecer en current_step = 4
- Elige método de pago/envío → guardar metodo_pago y datos_envio → datos_completos = true → current_step = 5
- Falta un dato → pedir únicamente lo faltante, sin repetir el mensaje completo.` },
      { t: "FINALIZACIÓN",
        variable: "seguimiento_activado",
        condicion: "Datos completos → ejecutar tool de registro/notificación → confirmar pedido → activar seguimiento → fin (halt).",
        ex: `🤖 *[NOMBRE_AGENTE]*
¡Listo, *[NOMBRE]*! Tu pedido quedó confirmado ✅
🛍️ *[PRODUCTO]*
💰 Total: *[TOTAL]*
🚚 Entrega: *[TIEMPO_ENTREGA]*
Te avisamos cuando salga. ¡Gracias por tu compra! 🎉`,
        main: `🔒 CONDICIÓN GATE: datos_completos == true AND seguimiento_activado == false

✅ SECUENCIA OBLIGATORIA (orden estricto):
1º Ejecutar la tool de registro/notificación del pedido.
2º Emitir ÚNICAMENTE el texto de "lo que dice el agente", como UN SOLO MENSAJE.
3º Activar el seguimiento postventa programado.
4º Guardar seguimiento_activado = true → halt.

🚫 PROHIBIDO EN ESTE PASO:
- Emitir cualquier mensaje después de este.
- Inventar tiempos de entrega no definidos en el catálogo o las tools.
- Fragmentar la confirmación en varios mensajes.

⛔ FIN DEL FLUJO. Este es el último paso. PROHIBIDO avanzar a pasos posteriores o emitir contenido adicional.` },
    ],
  },
  {
    id: "venta-consultiva", em: "🎯", title: "Venta Consultiva",
    desc: "6 fases: conexión, diagnóstico, propuesta, negociación y cierre.",
    steps: [
      { t: "BIENVENIDA",
        variable: "nombre",
        condicion: "Da su nombre (o llega con intención clara) → guardar nombre → paso 2. Si no da nombre → pedirlo una vez más.",
        ex: `🤖 *[NOMBRE_AGENTE]*
¡Hola! 👋 Soy el asistente de *[NOMBRE_NEGOCIO]*.
Para ayudarte mejor, ¿me compartes tu nombre?`,
        main: `🔒 CONDICIÓN GATE: current_step == 1 AND bienvenida_enviada == false
🚨 PRIORIDAD ABSOLUTA — PRIMER TURNO.

✅ SECUENCIA OBLIGATORIA (orden estricto):
1º Ejecutar el flujo 'BIENVENIDA' ANTES de responder.
2º Emitir ÚNICAMENTE el texto de "lo que dice el agente".
3º Guardar bienvenida_enviada = true.

⏸️ DESPUÉS de ejecutar: ESPERAR respuesta del usuario.

🚫 PROHIBIDO EN ESTE PASO:
- Formular preguntas propias o de confirmación.
- Dar precios, planes o propuestas en este turno.
- Ejecutar cualquier tool.
- Repetir la bienvenida si bienvenida_enviada == true.

🔄 FUNCIÓN: Ejecuta el flujo 'BIENVENIDA'.

➡️ TRANSICIÓN (NO EMITIR):
- Responde con un nombre → guardar nombre → current_step = 2
- Llega con intención clara (pide info de un servicio concreto) → guardar nombre si lo da → current_step = 2
- No entrega nombre → pedirlo una vez más, sin repetir la bienvenida.` },
      { t: "PREGUNTA 1",
        variable: "necesidad",
        condicion: "Describe su necesidad → guardar necesidad → paso 3. Si responde vago → repreguntar una vez.",
        ex: `🤖 *[NOMBRE_AGENTE]*
Cuéntame, *[NOMBRE]*, ¿qué es lo que necesitas resolver?`,
        main: `🔒 CONDICIÓN GATE: nombre != null AND necesidad == null

✅ SECUENCIA OBLIGATORIA (orden estricto):
1º Ejecutar el flujo 'PREGUNTA_1', si existe.
2º Emitir ÚNICAMENTE el texto de "lo que dice el agente".

⏸️ DESPUÉS de ejecutar: ESPERAR respuesta del usuario.

🚫 PROHIBIDO EN ESTE PASO:
- Presentar soluciones o precios antes de conocer la necesidad.
- Hacer dos preguntas en el mismo mensaje.
- Ejecutar tools de registro.

🔄 FUNCIÓN: Ejecuta el flujo 'PREGUNTA_1' (si existe).

➡️ TRANSICIÓN (NO EMITIR):
- Describe su necesidad → guardar necesidad → current_step = 3
- Responde vago ("info", "precios") → repreguntar una vez pidiendo más detalle, sin avanzar.` },
      { t: "PREGUNTA 2",
        variable: "contexto",
        condicion: "Da plazo y/o presupuesto (o lo evade = 'no definido') → guardar contexto → paso 4.",
        ex: `🤖 *[NOMBRE_AGENTE]*
Entiendo. ¿Para cuándo lo necesitas y manejas un presupuesto estimado?`,
        main: `🔒 CONDICIÓN GATE: necesidad != null AND contexto == null

✅ SECUENCIA OBLIGATORIA (orden estricto):
1º Ejecutar el flujo 'PREGUNTA_2', si existe.
2º Emitir ÚNICAMENTE el texto de "lo que dice el agente".

⏸️ DESPUÉS de ejecutar: ESPERAR respuesta del usuario.

🚫 PROHIBIDO EN ESTE PASO:
- Presentar la solución antes de capturar el contexto.
- Hacer dos preguntas en el mismo mensaje.
- Insistir en el presupuesto si el cliente lo evade.
- Ejecutar tools de registro.

🔄 FUNCIÓN: Ejecuta el flujo 'PREGUNTA_2' (si existe).

➡️ TRANSICIÓN (NO EMITIR):
- Responde plazo y/o presupuesto → guardar contexto → current_step = 4
- Evade el presupuesto → registrar "no definido" → current_step = 4` },
      { t: "PRESENTACIÓN",
        variable: "presentacion_emitida, interes_confirmado",
        condicion: "Confirma interés → interes_confirmado → paso 6. Objeción/duda → paso 5. Pide detalle → responder sin reejecutar.",
        ex: `🤖 *[NOMBRE_AGENTE]*
Por lo que me cuentas, lo ideal para ti es *[SOLUCION]*.
Encaja con tu caso porque *[JUSTIFICACION]*.
💰 Inversión: *[PRECIO]*
¿Qué te parece?`,
        main: `🔒 CONDICIÓN GATE: contexto != null AND presentacion_emitida == false

✅ SECUENCIA OBLIGATORIA (orden estricto):
1º Ejecutar el flujo de solución correspondiente a la necesidad, si existe.
2º Emitir ÚNICAMENTE el texto de "lo que dice el agente", como UN SOLO MENSAJE.
3º Guardar presentacion_emitida = true.

⏸️ DESPUÉS de ejecutar: ESPERAR respuesta del usuario.

🚫 PROHIBIDO EN ESTE PASO:
- Recomendar servicios fuera del catálogo o las tools.
- Inventar precios, resultados o casos de éxito.
- Fragmentar la propuesta en varios mensajes.
- Reejecutar el flujo si presentacion_emitida == true.

🔄 FUNCIÓN: Ejecuta el flujo de solución correspondiente (si existe).

➡️ TRANSICIÓN (NO EMITIR):
- Confirma interés (sí / me interesa / dale) → interes_confirmado = true → current_step = 6
- Plantea una objeción o duda → current_step = 5
- Pide más detalle → responder sin reejecutar el flujo → permanecer en current_step = 4` },
      { t: "NEGOCIACIÓN",
        variable: "interes_confirmado",
        condicion: "Resuelve la objeción y acepta → interes_confirmado → paso 6. Otra objeción → responder de nuevo. Pide tiempo → dejar puerta abierta → paso 6.",
        ex: `🤖 *[NOMBRE_AGENTE]*
Entiendo perfectamente tu punto.
*[RESPUESTA_A_LA_OBJECION]*
¿Te gustaría que avancemos con *[ALTERNATIVA]*?`,
        main: `🔒 CONDICIÓN GATE: presentacion_emitida == true AND interes_confirmado == false
💬 EMIT SALIDA LITERAL: Emitir ÚNICAMENTE el texto de "lo que dice el agente". Esperar respuesta.

🚫 PROHIBIDO EN ESTE PASO:
- Presionar o insistir si el cliente pide tiempo.
- Ofrecer descuentos no autorizados.
- Repetir la presentación completa.
- Ejecutar tools de registro.

➡️ TRANSICIÓN (NO EMITIR):
- Se resuelve la objeción y acepta → interes_confirmado = true → current_step = 6
- Plantea otra objeción → responder una vez más → permanecer en current_step = 5
- Pide tiempo para pensarlo → ofrecer enviar información y dejar la puerta abierta → current_step = 6` },
      { t: "FINALIZACIÓN",
        variable: "cierre_completado, correo",
        condicion: "Entrega nombre y correo → ejecutar tool de registro → confirmar → fin (halt). Entrega parte → pedir solo lo faltante. Se niega → cerrar sin tool.",
        ex: `🤖 *[NOMBRE_AGENTE]*
¡Excelente decisión, *[NOMBRE]*!
Para coordinar el siguiente paso, ¿me confirmas tu *nombre completo* y tu *correo*? 📩`,
        main: `🔒 CONDICIÓN GATE: presentacion_emitida == true AND cierre_completado == false

✅ SECUENCIA OBLIGATORIA (orden estricto):
1º Emitir ÚNICAMENTE el texto de "lo que dice el agente".
2º Al recibir nombre y correo, ejecutar la tool de registro/notificación al asesor.
3º Guardar cierre_completado = true → halt.

🚫 PROHIBIDO EN ESTE PASO:
- Ejecutar la tool antes de capturar nombre y correo.
- Solicitar datos que el cliente ya entregó.
- Cerrar sin dejar definido el siguiente paso.
- Emitir cualquier mensaje después del cierre.

🔄 FUNCIÓN: Ejecuta la tool de registro/notificación al asesor.

➡️ TRANSICIÓN (NO EMITIR):
- Entrega nombre y correo → ejecutar tool → emitir confirmación breve → cierre_completado = true → halt
- Entrega solo parte → pedir únicamente lo faltante, sin repetir el mensaje completo.
- Se niega a dar datos → agradecer, dejar la puerta abierta y cerrar sin ejecutar la tool.

⛔ FIN DEL FLUJO. PROHIBIDO emitir contenido adicional tras el cierre.` },
    ],
  },
  {
    id: "agendamiento-citas", em: "📅", title: "Agendar citas",
    desc: "5 fases: ofrece horarios y reserva la cita.",
    steps: [
      { t: "BIENVENIDA", ex: "¡Hola! Con gusto te agendo. ¿Qué servicio necesitas?",
        main: "🎯 Recibir y ofrecer agendar.\n• Saluda y pregunta qué servicio necesita.\n• Si ya lo dijo, salta a DISPONIBILIDAD.\n📌 Un solo mensaje por turno; espera la respuesta.\n➡️ Cuando responda → SERVICIO." },
      { t: "SERVICIO", ex: "¿Cuál de nuestros servicios quieres reservar?",
        main: "🎯 Saber qué servicio quiere.\n• Pregunta cuál de los servicios desea reservar.\n➡️ Cuando lo elija → DISPONIBILIDAD." },
      { t: "DISPONIBILIDAD", ex: "Tengo estos horarios disponibles: [días/horas]. ¿Cuál te viene bien?",
        main: "🎯 Ofrecer horarios.\n• Muestra los horarios disponibles [días/horas] y pide que elija.\n➡️ Cuando elija → CONFIRMACIÓN." },
      { t: "CONFIRMACIÓN", ex: "Listo, te agendo para [fecha/hora]. ¿Me confirmas tu nombre?",
        main: "🎯 Agendar la cita.\n• Confirma fecha/hora y pide el nombre para la reserva.\n➡️ Cuando confirme → FINALIZACIÓN." },
      { t: "FINALIZACIÓN", ex: "¡Cita confirmada! Te esperamos en [dirección]. Cualquier cambio, escríbeme.",
        main: "🎯 Cerrar y recordar.\n• Confirma la cita: [fecha/hora] en [dirección].\n• Activa el recordatorio automático.\n✅ Fin del flujo." },
    ],
  },
  {
    id: "calificacion-leads", em: "🧲", title: "Calificar leads",
    desc: "5 fases: detecta quién está listo para comprar.",
    steps: [
      { t: "BIENVENIDA", ex: "¡Hola! Gracias por tu interés. ¿Me cuentas qué buscas?",
        main: "🎯 Recibir e invitar a contar.\n• Saluda, agradece el interés y pregunta qué busca.\n📌 Un solo mensaje por turno; espera la respuesta.\n➡️ Cuando responda → CALIFICACIÓN." },
      { t: "CALIFICACIÓN", ex: "¿Es para uso personal o para tu empresa?",
        main: "🎯 Perfilar al lead.\n• Pregunta si es uso personal o empresa / tipo de necesidad.\n➡️ Cuando responda → URGENCIA." },
      { t: "URGENCIA", ex: "¿Para cuándo lo necesitas?",
        main: "🎯 Medir la urgencia.\n• Pregunta para cuándo lo necesita.\n➡️ Cuando responda → PRESUPUESTO." },
      { t: "PRESUPUESTO", ex: "¿Tienes un presupuesto estimado en mente?",
        main: "🎯 Presupuesto y decisión.\n• Pregunta si maneja un presupuesto y si es quien decide.\n➡️ Cuando responda → DERIVAR A ASESOR." },
      { t: "DERIVAR A ASESOR", ex: "Te paso con un asesor que resolverá todo. ¿Tu nombre y correo?",
        main: "🎯 Enrutar al asesor correcto.\n• Según el perfil, pásalo a un asesor.\n• Pide nombre y correo.\n✅ Fin del flujo." },
    ],
  },
  {
    id: "atencion-cliente", em: "🎧", title: "Atención / soporte",
    desc: "5 fases: resuelve dudas, solicitudes y reclamos.",
    steps: [
      { t: "BIENVENIDA", ex: "¡Hola! Soy soporte de [tu negocio]. ¿En qué te ayudo?",
        main: "🎯 Recibir y ofrecer ayuda.\n• Saluda como soporte del negocio y pregunta en qué ayudas.\n📌 Un solo mensaje por turno; espera la respuesta.\n➡️ Cuando responda → IDENTIFICACIÓN." },
      { t: "IDENTIFICACIÓN", ex: "Para ubicar tu caso, ¿me das tu nombre o número de pedido?",
        main: "🎯 Ubicar el caso.\n• Pide nombre o número de pedido/servicio.\n➡️ Cuando lo dé → VALIDACIÓN." },
      { t: "VALIDACIÓN", ex: "Déjame revisar… un momento por favor.",
        main: "🎯 Revisar la información.\n• Confirma los datos y avisa que estás revisando.\n➡️ Cuando revises → RESOLUCIÓN." },
      { t: "RESOLUCIÓN", ex: "Esto es lo que encontré / así lo solucionamos: […]",
        main: "🎯 Resolver.\n• Da la solución o los pasos a seguir, con claridad.\n➡️ Cuando resuelvas → CIERRE." },
      { t: "CIERRE", ex: "¿Quedó resuelto? ¿Algo más en lo que pueda ayudarte?",
        main: "🎯 Cerrar.\n• Confirma si quedó resuelto y ofrece ayuda adicional.\n✅ Fin del flujo." },
    ],
  },
  {
    id: "pedidos-delivery", em: "🛵", title: "Pedidos / Delivery",
    desc: "6 fases: arma el pedido, entrega, cobra y da seguimiento.",
    steps: [
      { t: "BIENVENIDA", ex: "¡Hola! ¿Qué te gustaría pedir hoy?",
        main: "🎯 Recibir e invitar a pedir.\n• Saluda y pregunta qué le gustaría pedir.\n📌 Un solo mensaje por turno; espera la respuesta.\n➡️ Cuando responda → PEDIDO." },
      { t: "PEDIDO", ex: "Anoto tu pedido. ¿Deseas agregar algo más?",
        main: "🎯 Tomar el pedido.\n• Anota los productos y pregunta si desea agregar algo más.\n➡️ Cuando termine → DATOS DE ENTREGA." },
      { t: "DATOS DE ENTREGA", ex: "¿A qué dirección o zona lo enviamos? Así calculo el envío.",
        main: "🎯 Definir la entrega.\n• Pide dirección o zona para calcular el envío.\n➡️ Cuando la dé → RESUMEN." },
      { t: "RESUMEN", ex: "Tu pedido: […]. Productos [monto] + envío [monto] = Total [monto]. ¿Confirmas?",
        main: "🎯 Resumir y confirmar.\n• Repite el pedido y el total (productos + envío) y pide confirmación.\n• Si aplica, ofrece un complemento.\n➡️ Cuando confirme → PAGO." },
      { t: "PAGO", ex: "Para confirmar, ¿cómo prefieres pagar? [contra entrega / transferencia…]",
        main: "🎯 Cobrar.\n• Pregunta el método de pago [contra entrega / transferencia…].\n➡️ Cuando confirme el pago → SEGUIMIENTO." },
      { t: "SEGUIMIENTO", ex: "¡Pedido confirmado! Llega en [tiempo estimado]. Cualquier cosa, escríbeme.",
        main: "🎯 Confirmar y dar seguimiento.\n• Confirma el pedido y el tiempo estimado de entrega.\n• Activa el seguimiento postventa.\n✅ Fin del flujo." },
    ],
  },
];
