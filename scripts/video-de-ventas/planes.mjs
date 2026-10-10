/**
 * El VIDEO COMERCIAL DE CADA PLAN: el que sale arriba en «Ver todo lo que
 * incluye» de un plan de la landing. No es el vídeo de ventas de la marca
 * (`/demo`): dice, sin prometer de más, qué incluye ESE plan, cómo se ve y
 * cómo se configura, para que nadie compre creyendo que lleva algo que no.
 *
 * La fórmula es la misma para todos los planes, en este orden:
 *
 *   1. **Caso de uso**: la historia de Clínica Sonríe en las tres pantallas
 *      (celular, WhatsApp Web y el panel de VERDAD), grabada por
 *      `grabar-video-de-ventas.mjs` con `PLAN=<id>`: solo las escenas que el
 *      plan incluye (`escenas`) y la conversación del plan
 *      (`laConversacion(cal, { plan })`, `historia.mjs`).
 *   2. **Interfaz** y 3. **Configuración**: trozos de los videotutoriales ya
 *      publicados (`public/guia/<módulo>/demostracion.webm`), cada uno con su
 *      frase nueva. Solo módulos que el plan trae.
 *   4. **Cierre**: Verzay lo construye y lo implementa por ti.
 *
 * Lo monta `montar-video-del-plan.mjs` con la voz de las guías en tono de
 * anuncio (`VOZ_DE_VENTAS`), el avatar de Verzay narrando, el punto clave en
 * pantalla y una música suave que se aparta cuando habla.
 *
 * **Ningún vídeo de plan dice un precio**: los precios viven en la landing y
 * cambian; el vídeo tiene que poder usarse mientras las funciones no cambien.
 * `PALABRAS_PROHIBIDAS` lo comprueba sobre todo lo que se dice y se lee.
 *
 * Es DATA pura, como `historia.mjs`.
 */

/** Lo que ningún vídeo de plan puede decir ni enseñar escrito. */
export const PALABRAS_PROHIBIDAS = Object.freeze([/\$/, /\bprecios?\b/i, /\bcuesta\b/i, /\bmensual(es)?\b/i, /\bUSD\b/, /\bCOP\b/, /\bdólares?\b/i, /\bpesos\b/i, /\bgratis\b/i]);

/**
 * Plan ESENCIAL: todo lo del Básico (el agente responde, envía enlaces, toma
 * solicitudes y avisa) MÁS envío de archivos multimedia, CRM con captura de
 * datos, agenda de citas con recordatorios, y chats con creación de eventos.
 * NO trae: multiagenda, seguimientos avanzados, llamadas con IA, usuarios
 * múltiples, Google Sheets ni reportes. Nada de eso sale en su vídeo.
 */
export const PLAN_ESENCIAL = Object.freeze({
    id: "esencial",
    nombre: "Esencial",
    /** Dónde se publica: `public/videos-de-planes/` (`/planes/…` es la ruta de la página del plan). El enlace se pega en el panel de Planes. */
    archivos: Object.freeze({ video: "esencial.mp4", portada: "esencial.jpg", datos: "esencial.json" }),

    /** Las escenas de la historia de la clínica que se graban, en su orden. */
    escenas: Object.freeze(["tresPantallas", "texto", "medios", "cita", "recordatorio"]),

    /** El rótulo de arriba en cada escena del caso de uso (el número es su orden en ESTE vídeo). */
    capacidades: Object.freeze([
        { escena: "texto", titulo: "Responde y llena tu CRM", detalle: "Texto · ficha del contacto" },
        { escena: "medios", titulo: "Envía y recibe archivos", detalle: "PDF · video · imágenes" },
        { escena: "cita", titulo: "Agenda citas", detalle: "Directo en tu calendario" },
        { escena: "recordatorio", titulo: "Recuerda y confirma", detalle: "Un día antes de la cita" },
    ]),

    /** Lo que dice el narrador en el caso de uso (lo graba la historia, con sus `alDecir`). */
    narracion: Object.freeze({
        tresPantallas: {
            texto: "Imagina una clínica odontológica. La misma conversación se ve en el celular del negocio, en WhatsApp Web y en la plataforma de Verzay, al mismo tiempo.",
        },
        texto: { texto: "Laura pregunta por un blanqueamiento. El agente le responde al instante, y sus datos quedan guardados solos en tu CRM." },
        medios: { texto: "Le envía un PDF con la información, un video de la clínica, y recibe la imagen que Laura le manda." },
        cita: { texto: "Laura quiere agendar: el agente le muestra los cupos libres, ella elige uno, y la cita queda en tu calendario." },
        recordatorio: { texto: "Un día antes le llega el recordatorio. Confirma, y tú lo ves al instante." },
    }),

    /**
     * El montaje, tramo a tramo. `caso` es la grabación de la historia;
     * `guia` es un trozo de un videotutorial publicado: `desdeMs` en su
     * vídeo (el arranque de la frase de la guía que enseña lo mismo,
     * `scripts/voz-de-la-guia/<modulo>.json`) y dura lo que dure la frase
     * nueva. `tarjeta` es una pantalla propia del montaje.
     */
    tramos: Object.freeze([
        {
            tipo: "tarjeta",
            id: "apertura",
            tarjeta: "titulo",
            seccion: "Plan Esencial",
            titulo: "Todo lo que incluye",
            detalle: "Un ejemplo real, la plataforma y cómo se configura",
            texto: "Este es el plan Esencial de Verzay. Te mostramos qué incluye, cómo se ve y cómo se configura, empezando por un ejemplo práctico.",
        },
        { tipo: "caso", id: "caso", seccion: "1 · Un ejemplo práctico" },
        {
            tipo: "tarjeta",
            id: "interfaz",
            tarjeta: "seccion",
            seccion: "2",
            titulo: "Así se ve tu plataforma",
            detalle: "Chats · CRM · Agenda",
            texto: "Ahora, así se ve tu plataforma.",
        },
        {
            tipo: "guia",
            id: "chats",
            modulo: "chats",
            desdeMs: 300,
            eyebrow: "Así se ve",
            titulo: "Chats",
            detalle: "Todas tus conversaciones en una bandeja",
            texto: "En Chats tienes todas las conversaciones de WhatsApp en una sola bandeja, y entras a responder cuando quieras.",
        },
        {
            tipo: "guia",
            id: "eventos",
            modulo: "chats",
            desdeMs: 42_400,
            eyebrow: "Así se ve",
            titulo: "Crea citas y recordatorios",
            detalle: "Sin salir de la conversación",
            texto: "Desde cada conversación creas una cita o un recordatorio, sin salir del chat.",
        },
        {
            tipo: "guia",
            id: "crm",
            modulo: "leads",
            desdeMs: 300,
            eyebrow: "Así se ve",
            titulo: "Tu CRM",
            detalle: "Cada contacto con sus datos",
            texto: "En Leads, tu CRM, queda cada contacto con los datos que el agente capturó.",
        },
        {
            tipo: "guia",
            id: "agenda",
            modulo: "agenda",
            desdeMs: 23_400,
            eyebrow: "Así se ve",
            titulo: "Agenda",
            detalle: "Tus citas por día o por semana",
            texto: "Y en Agenda ves todas tus citas por día o por semana, con su estado.",
        },
        {
            tipo: "tarjeta",
            id: "configuracion",
            tarjeta: "seccion",
            seccion: "3",
            titulo: "Así se configura",
            detalle: "Agente IA · Agenda · Recordatorios",
            texto: "¿Y cómo se configura?",
        },
        {
            tipo: "guia",
            id: "perfil",
            modulo: "agente-ia",
            desdeMs: 29_600,
            eyebrow: "Así se configura",
            titulo: "Tu agente",
            detalle: "Quién es tu negocio y cómo atender",
            texto: "En Agente IA le cuentas quién es tu negocio: su nombre, sus horarios y cómo contactarlo.",
        },
        {
            tipo: "guia",
            id: "disponibilidad",
            modulo: "agenda",
            desdeMs: 40_100,
            eyebrow: "Así se configura",
            titulo: "Tus horarios",
            detalle: "Cuándo atiendes cada día",
            texto: "En Agenda marcas los horarios en que atiendes cada día.",
        },
        {
            tipo: "guia",
            id: "servicios",
            modulo: "agenda",
            desdeMs: 63_800,
            eyebrow: "Así se configura",
            titulo: "Tus servicios",
            detalle: "Con el mensaje que recibe el cliente",
            texto: "Guardas tus servicios, con el mensaje que recibe el cliente al agendar.",
        },
        {
            tipo: "guia",
            id: "recordatorios",
            modulo: "agenda",
            desdeMs: 69_600,
            eyebrow: "Así se configura",
            titulo: "Tus recordatorios",
            detalle: "Qué mensaje y cuánto antes",
            texto: "Y decides qué recordatorio le llega a tu cliente, y cuánto antes de la cita.",
        },
        {
            tipo: "tarjeta",
            id: "implementacion",
            tarjeta: "seccion",
            seccion: "4",
            titulo: "Nosotros lo implementamos",
            detalle: "No tienes que montarlo solo",
            texto: "Y lo mejor: no tienes que montarlo solo. El equipo de Verzay construye e implementa todo por ti, y te lo entrega listo para atender a tus clientes.",
        },
        {
            tipo: "tarjeta",
            id: "cierre",
            tarjeta: "cierre",
            titulo: "Plan Esencial",
            incluye: Object.freeze(["Responde por WhatsApp", "Envía archivos", "CRM con tus clientes", "Agenda de citas", "Recordatorios", "Chats y eventos"]),
            texto: "Verzay, plan Esencial: responde, envía archivos, guarda tus clientes, agenda y recuerda por ti.",
        },
    ]),
});

export const PLANES_DEL_VIDEO = Object.freeze({ esencial: PLAN_ESENCIAL });

/** El plan de `PLAN=<id>`, o un error que dice cuáles hay. */
export function elPlanDelVideo(id) {
    const plan = PLANES_DEL_VIDEO[String(id ?? "").toLowerCase()];
    if (!plan) throw new Error(`[video] no hay vídeo del plan «${id}»; hay: ${Object.keys(PLANES_DEL_VIDEO).join(", ")}`);
    return plan;
}

/** Todo lo que un plan dice o escribe en pantalla, para buscar lo prohibido. */
export function loQueDiceElPlan(plan) {
    const t = [];
    for (const n of Object.values(plan.narracion)) t.push(n.texto);
    for (const c of plan.capacidades) t.push(c.titulo, c.detalle);
    for (const x of plan.tramos) t.push(x.texto, x.titulo, x.detalle, x.eyebrow, x.seccion, ...(x.incluye ?? []));
    return t.filter(Boolean);
}

/** Las frases que dicen algo prohibido (un precio, «gratis»…). Vacío = limpio. */
export function loProhibidoDelPlan(plan) {
    return loQueDiceElPlan(plan).filter((t) => PALABRAS_PROHIBIDAS.some((re) => re.test(t)));
}
