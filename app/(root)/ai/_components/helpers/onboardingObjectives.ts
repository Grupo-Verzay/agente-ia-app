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

export type ObjectiveStep = { t: string; ex: string; main: string };

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
      { t: "BIENVENIDA", ex: "¡Hola! 👋 Gracias por escribir a [tu negocio]. ¿Qué te interesa?",
        main: "🎯 Recibir al cliente y abrir la conversación.\n• Saluda cálido con el nombre del negocio.\n• Si ya trae una intención clara (producto, precio, cita), salta directo a ese paso.\n• Si no, haz UNA sola pregunta de apertura.\n📌 Un solo mensaje por turno; espera la respuesta.\n➡️ Cuando responda → PRODUCTO INTERÉS." },
      { t: "PRODUCTO INTERÉS", ex: "¿Qué producto o servicio buscas? Te doy los detalles.",
        main: "🎯 Saber qué producto o servicio busca.\n• Pregunta solo lo necesario para entender su necesidad.\n• No des precios aún si falta contexto.\n📌 Aplica tras la bienvenida.\n➡️ Cuando quede claro → PRESENTACIÓN." },
      { t: "PRESENTACIÓN", ex: "Te muestro las opciones, precios y beneficios.",
        main: "🎯 Presentar la mejor opción.\n• Muestra producto, precio y 2-3 beneficios clave.\n• Claro y sin abrumar.\n📌 Aplica cuando ya sabes qué busca.\n➡️ Cuando muestre interés o una duda → TOMA PEDIDO." },
      { t: "TOMA PEDIDO", ex: "¿Te lo aparto? Para cerrar necesito tu nombre y forma de pago.",
        main: "🎯 Tomar el pedido y capturar datos.\n• Invita a concretar y confirma qué se lleva.\n• Pide uno a la vez: nombre completo, luego método de pago/envío.\n📌 No repitas datos que el cliente ya dio.\n➡️ Cuando tengas el pedido → RESUME." },
      { t: "RESUME", ex: "Tu pedido: […]. Total [monto]. ¡Gracias por tu compra!",
        main: "🎯 Resumir y confirmar (paso final).\n• Repite el pedido: producto + total + entrega.\n• Agradece y confirma.\n✅ Fin del flujo." },
    ],
  },
  {
    id: "venta-consultiva", em: "🎯", title: "Venta Consultiva",
    desc: "5 fases: conexión, preguntas, propuesta y cierre.",
    steps: [
      { t: "BIENVENIDA", ex: "¡Hola! Soy el asistente de [tu negocio]. ¿En qué puedo ayudarte hoy?",
        main: "🎯 Recibir y abrir con confianza.\n• Saluda como asistente del negocio.\n• Si trae una intención clara, salta a ese paso.\n• Si no, haz UNA pregunta de apertura.\n📌 Un solo mensaje por turno; espera la respuesta.\n➡️ Cuando responda → PREGUNTA 1." },
      { t: "PREGUNTA 1", ex: "Para orientarte mejor, ¿qué estás buscando resolver?",
        main: "🎯 Descubrir qué quiere resolver.\n• Haz una pregunta abierta sobre su necesidad real.\n📌 Una pregunta a la vez.\n➡️ Cuando responda → PREGUNTA 2." },
      { t: "PREGUNTA 2", ex: "¿Y para cuándo lo necesitas o qué presupuesto manejas?",
        main: "🎯 Profundizar en el contexto.\n• Pregunta plazo, presupuesto o situación.\n📌 Una pregunta a la vez.\n➡️ Cuando responda → PRESENTACIÓN." },
      { t: "PRESENTACIÓN", ex: "Según lo que me cuentas, esto es lo que te recomiendo…",
        main: "🎯 Recomendar la solución ideal.\n• Según lo que contó, propón la opción y explica por qué encaja.\n📌 Personaliza con lo que dijo.\n➡️ Cuando reaccione → CIERRE." },
      { t: "CIERRE", ex: "¿Damos el siguiente paso? Déjame tu nombre y correo y coordinamos.",
        main: "🎯 Cerrar o agendar (paso final).\n• Si hay una duda, resuélvela reforzando el valor, sin presionar.\n• Propón el siguiente paso (compra o cita) y pide nombre y correo.\n✅ Fin del flujo." },
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
        main: "🎯 Agendar la cita.\n• Confirma fecha/hora y pide el nombre para la reserva.\n➡️ Cuando confirme → CIERRE." },
      { t: "CIERRE", ex: "¡Cita confirmada! Te esperamos en [dirección]. Cualquier cambio, escríbeme.",
        main: "🎯 Cerrar y recordar (paso final).\n• Confirma la cita: [fecha/hora] en [dirección].\n• Activa el recordatorio automático.\n✅ Fin del flujo." },
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
    desc: "5 fases: arma el pedido, entrega, resume y cobra.",
    steps: [
      { t: "BIENVENIDA", ex: "¡Hola! ¿Qué te gustaría pedir hoy?",
        main: "🎯 Recibir e invitar a pedir.\n• Saluda y pregunta qué le gustaría pedir.\n📌 Un solo mensaje por turno; espera la respuesta.\n➡️ Cuando responda → PEDIDO." },
      { t: "PEDIDO", ex: "Anoto tu pedido. ¿Deseas agregar algo más?",
        main: "🎯 Tomar el pedido.\n• Anota los productos y pregunta si desea agregar algo más.\n➡️ Cuando termine → DATOS ENTREGA." },
      { t: "DATOS ENTREGA", ex: "¿A qué dirección o zona lo enviamos? Así calculo el envío.",
        main: "🎯 Definir la entrega.\n• Pide dirección o zona para calcular el envío.\n➡️ Cuando la dé → RESUMEN." },
      { t: "RESUMEN", ex: "Tu pedido: […]. Productos [monto] + envío [monto] = Total [monto]. ¿Confirmas?",
        main: "🎯 Resumir y confirmar.\n• Repite el pedido y el total (productos + envío) y pide confirmación.\n• Si aplica, ofrece un complemento.\n➡️ Cuando confirme → PAGO." },
      { t: "PAGO", ex: "Para confirmar, ¿cómo prefieres pagar? [contra entrega / transferencia…]",
        main: "🎯 Cobrar y confirmar (paso final).\n• Pregunta el método de pago [contra entrega / transferencia…].\n• Al confirmar, cierra el pedido con el total y el tiempo estimado de entrega.\n✅ Fin del flujo." },
    ],
  },
];
