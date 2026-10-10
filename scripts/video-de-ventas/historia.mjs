/**
 * La HISTORIA del video de ventas: qué negocio, qué clienta, qué se dicen y
 * qué le pasa al CRM en cada momento. Es DATA pura: la leen las cuatro piezas
 * que tienen que contar lo mismo —el teléfono del negocio, WhatsApp Web, el
 * simulador del backend que escribe en la base (y con eso el panel de verdad)
 * y el banco—. Con la conversación escrita en cada una, un día el teléfono
 * diría una cosa y el panel otra, que es justo lo contrario de «la misma
 * conversación en tres pantallas».
 *
 * # El reloj de la historia
 *
 * Nada de lo que se dice nombra una fecha: las fechas salen de `elCalendario`,
 * que las calcula a partir del día en que se graba. El navegador corre con el
 * reloj de la historia (`page.clock`), así que el panel dice «Hoy» y la agenda
 * abre en la semana de la cita, y los mensajes llevan la hora de la historia.
 * La narración y las notas de voz no dicen ningún día: son audio sintetizado y
 * guardado, y una fecha dentro se quedaría vieja.
 */

/** El negocio de la historia. */
export const NEGOCIO = Object.freeze({
    nombre: "Clínica Sonríe",
    tipo: "Clínica odontológica",
    asistente: "Sofía",
    linea: "SONRIE_PRINCIPAL",
    lineaVisible: "Clínica Sonríe",
    lineaId: "inst-sonrie-1",
    numero: "573105550142",
});

/** La clienta. El número es de mentira y no sale en pantalla entero. */
export const CLIENTA = Object.freeze({
    nombreDeWhatsapp: "Laura",
    nombre: "Laura Gómez",
    numero: "573004521188",
    jid: "573004521188@s.whatsapp.net",
});

/**
 * Los negocios del arranque: cinco tarjetas de WhatsApp a la vez, cada una
 * con su conversación, y debajo, en una línea, el cierre «y cualquier negocio
 * que venda por WhatsApp» (`CIERRE_DEL_MONTAJE`). Es lo que dice «da igual el
 * negocio» sin decirlo.
 *
 *   - `tipo` es el rótulo grande de debajo de cada tarjeta y va en el orden en
 *     que los nombra la narración (`gancho`); `detalle`, lo que cubre.
 *   - Cada una enseña un tipo de contenido DISTINTO —imagen, nota de voz,
 *     video, PDF y ubicación— para que se vea todo lo que la IA maneja
 *     (`medio` de la burbuja que lo lleva; lo comprueba el banco). Lo que
 *     ENVÍA la IA lleva `de: "ia"`: el PDF de la consultoría lo manda ella,
 *     no el cliente.
 *   - Los archivos de las tarjetas son solo lo que pinta la tarjeta: la foto
 *     del sofá, la portada de la clase y el mapa los dibuja `medios.mjs`
 *     (`MEDIOS_DEL_MONTAJE`); la nota de voz y el PDF son su burbuja, sin
 *     archivo detrás.
 */
export const NEGOCIOS_DEL_ARRANQUE = Object.freeze([
    {
        id: "tienda",
        tipo: "Tienda en línea",
        detalle: "Productos, muebles, repuestos",
        contacto: "Camila",
        color: "#7c3aed",
        medio: "imagen",
        mensajes: [
            { de: "cliente", tipo: "texto", texto: "¿Tienen este sofá en gris? 🛋️" },
            { de: "ia", tipo: "imagen", archivo: "sofa-gris", texto: "¡Sí, Camila! Te llega en 48 horas con envío gratis 🚚" },
        ],
    },
    {
        id: "clinica",
        tipo: "Clínica",
        detalle: "Salud, estética, odontología",
        contacto: "Laura",
        color: "#2a9d8f",
        medio: "nota",
        mensajes: [
            { de: "cliente", tipo: "nota", segundos: 7 },
            { de: "ia", tipo: "texto", texto: "¡Hola, Laura! Tienes hasta 6 cuotas sin interés 😊 ¿Te agendo una valoración?" },
        ],
    },
    {
        id: "cursos",
        tipo: "Cursos",
        detalle: "Academias y formación en línea",
        contacto: "Santiago",
        color: "#e76f51",
        medio: "video",
        mensajes: [
            { de: "cliente", tipo: "texto", texto: "¿Cómo son las clases del curso de Excel?" },
            { de: "ia", tipo: "video", archivo: "clase-de-excel", segundos: 42, texto: "Mira una clase por dentro 🎬" },
        ],
    },
    {
        id: "consultoria",
        tipo: "Consultoría",
        detalle: "Contable, legal, empresarial",
        contacto: "Jorge",
        color: "#264653",
        medio: "documento",
        mensajes: [
            { de: "cliente", tipo: "texto", texto: "¿Qué papeles necesito para declarar renta?" },
            { de: "ia", tipo: "documento", nombre: "Requisitos-renta.pdf", detalle: "2 páginas · PDF", texto: "Aquí tienes la lista, Jorge ✅ ¿Agendamos 20 minutos mañana?" },
        ],
    },
    {
        id: "viajes",
        tipo: "Agencia de viajes",
        detalle: "Tours, vuelos y paquetes",
        contacto: "Valentina",
        color: "#0284c7",
        medio: "ubicacion",
        mensajes: [
            { de: "cliente", tipo: "texto", texto: "¿Dónde nos recogen para el tour de mañana? 🌴" },
            { de: "ia", tipo: "ubicacion", archivo: "mapa-punto-de-encuentro", nombre: "Punto de encuentro", direccion: "Parque de la 93, Bogotá" },
        ],
    },
]);

/** El cierre del arranque: una línea debajo de las cinco tarjetas, después de la última; antes de la marca. */
export const CIERRE_DEL_MONTAJE = "y cualquier negocio que venda por WhatsApp";

/** Los archivos que pintan las tarjetas del arranque (no viajan en la conversación). */
export const MEDIOS_DEL_MONTAJE = Object.freeze({
    "sofa-gris": { archivo: "montaje-sofa-gris.jpg" },
    "clase-de-excel": { archivo: "montaje-clase-de-excel.jpg" },
    "mapa-punto-de-encuentro": { archivo: "montaje-mapa-punto-de-encuentro.jpg" },
});

/** Los archivos que viajan en la conversación. Los genera `medios.mjs`. */
export const MEDIOS = Object.freeze({
    notaDeLaClienta: { archivo: "nota-clienta.ogg", mime: "audio/ogg; codecs=opus" },
    notaDeLaIa: { archivo: "nota-ia.ogg", mime: "audio/ogg; codecs=opus" },
    listaDePrecios: { archivo: "lista-de-precios.pdf", mime: "application/pdf", nombre: "Lista de precios · Clínica Sonríe.pdf", paginas: 2 },
    videoDeLaClinica: { archivo: "conoce-la-clinica.webm", mime: "video/webm", portada: "conoce-la-clinica.jpg" },
    promoDeInstagram: { archivo: "promo-instagram.jpg", mime: "image/jpeg" },
    horarios: { archivo: "horarios.jpg", mime: "image/jpeg" },
});

/**
 * Las voces de las dos notas de voz. La clienta y la asistente tienen voz
 * propia (no la del narrador): la nota de la IA es «su propia voz», y oír al
 * narrador contestándole a la clienta se leería como que el video se inventa
 * la respuesta.
 */
export const NOTAS_DE_VOZ = Object.freeze({
    clienta: {
        voz: "coral",
        texto: "Hola, soy Laura Gómez. ¿Tienen financiación? Es que me gustaría hacérmelo este mes.",
        transcripcion: "Hola, soy Laura Gómez. ¿Tienen financiación? Es que me gustaría hacérmelo este mes.",
    },
    ia: {
        voz: "marin",
        texto: "¡Claro que sí, Laura! Tienes hasta seis cuotas sin interés. Ya te envío la lista de precios y un video de nuestras instalaciones.",
        transcripcion: "¡Claro que sí, Laura! Tienes hasta seis cuotas sin interés. Ya te envío la lista de precios y un video de nuestras instalaciones.",
    },
});

const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

/** La zona de la historia: la del negocio y la del navegador que graba. */
export const ZONA = "America/Bogota";
/** Bogotá no cambia de hora: UTC−5 todo el año. */
const DESFASE_MS = -5 * 3_600_000;

/** Un instante a las `hh:mm` de Bogotá del día `dia` (medianoche de Bogotá, en ms UTC). */
const aLas = (dia, hh, mm = 0) => dia + (hh * 60 + mm) * 60_000;

/** La medianoche de Bogotá del día de `ms`. */
function medianoche(ms) {
    const local = ms + DESFASE_MS;
    return local - (local % 86_400_000) - DESFASE_MS;
}

/** «jueves 8 de octubre». Pura, en la zona de la historia. */
export function elDia(ms) {
    const d = new Date(ms + DESFASE_MS);
    return `${DIAS[d.getUTCDay()]} ${d.getUTCDate()} de ${MESES[d.getUTCMonth()]}`;
}

/** «10:00 a. m.», como lo escribe una persona en Colombia. */
export function laHora(ms) {
    const d = new Date(ms + DESFASE_MS);
    const h = d.getUTCHours();
    const m = String(d.getUTCMinutes()).padStart(2, "0");
    return `${h % 12 === 0 ? 12 : h % 12}:${m} ${h < 12 ? "a. m." : "p. m."}`;
}

/**
 * Las fechas de la historia, a partir del instante en que se graba. La
 * conversación es un MARTES por la mañana —así la cita del jueves cae dos días
 * después y el recordatorio el miércoles—, el primer martes que llegue
 * después de hoy: nada de la historia queda en el pasado del servidor, donde
 * una cita ya vencida no saldría como pendiente.
 */
export function elCalendario(ahora = Date.now()) {
    let dia = medianoche(ahora) + 86_400_000;
    while (new Date(dia + DESFASE_MS + 12 * 3_600_000).getUTCDay() !== 2) dia += 86_400_000;
    const martes = dia;
    const miercoles = martes + 86_400_000;
    const jueves = martes + 2 * 86_400_000;
    const viernes = martes + 3 * 86_400_000;
    return {
        inicio: aLas(martes, 9, 40),
        seguimiento: aLas(martes, 11, 46),
        llamada: aLas(martes, 15, 30),
        recordatorio: aLas(miercoles, 10, 0),
        cita: aLas(jueves, 10, 0),
        finDeLaCita: aLas(jueves, 10, 45),
        cupos: [
            { dia: jueves, horas: [aLas(jueves, 10, 0), aLas(jueves, 11, 30)] },
            { dia: viernes, horas: [aLas(viernes, 15, 0), aLas(viernes, 16, 30)] },
        ],
    };
}

/**
 * La conversación principal, en orden. Cada mensaje dice quién lo manda,
 * qué es y a qué hora de la historia sale (`a`: la clave de `elCalendario` y
 * los minutos que se le suman). `efectos` es lo que el backend le hace al CRM
 * en ese momento —lo que en producción hacen la IA y sus herramientas— y lo
 * aplica `backend.mjs`, que escribe en la base como lo haría el webhook.
 */
export function laConversacion(cal = elCalendario(), { plan = null } = {}) {
    const todas = laConversacionCompleta(cal);
    return plan ? laConversacionDelPlan(todas, cal, plan) : todas;
}

/**
 * La conversación del VIDEO DE UN PLAN (`planes.mjs`): la misma historia, sin
 * lo que el plan no trae. En el Esencial no hay notas de voz con la voz de la
 * IA, ni seguimiento, ni llamada, ni paso a un asesor: Laura pide la cita en
 * el mismo chat, elige un cupo y la IA la agenda. Tampoco sale un precio
 * (`PALABRAS_PROHIBIDAS`): el vídeo no puede confundir el precio de la clínica
 * con el del plan.
 */
function laConversacionDelPlan(todas, cal, plan) {
    if (plan !== "esencial") throw new Error(`[video] la historia no tiene conversación para el plan «${plan}»`);
    const cita = `${elDia(cal.cita)} a las ${laHora(cal.cita)}`;
    const m = (clave, minutos) => cal[clave] + minutos * 60_000;
    const fuera = new Set(["M03", "M04", "M09", "M11", "M15", "M16"]);
    const cambios = {
        M02: {
            texto: "¡Hola! Soy Sofía, de Clínica Sonríe 😊 El blanqueamiento se hace en una sola sesión y este mes tiene 30 % de descuento. ¿Te cuento cómo funciona?",
            efectos: [{ ficha: { servicio: "Blanqueamiento dental" } }, { etapa: "Contactado" }, { etiqueta: "Blanqueamiento" }, { calificacion: "Tibio" }],
        },
        M08: {
            texto: "¡Sí! 🎉 Esa promo sigue vigente todo este mes. ¿Te agendo una valoración? Estos son los cupos de esta semana:",
            efectos: [{ etapa: "Interesado" }, { etiqueta: "Promo Instagram" }, { calificacion: "Caliente" }, { ficha: { origen: "Instagram" } }],
        },
        M10: { en: m("inicio", 6), seguimiento: false },
        M12: {
            texto: `¡Listo, Laura! ✅ Te agendé tu valoración el ${cita}, y te enviaré un recordatorio el día antes.`,
            en: m("inicio", 9),
        },
    };
    const elige = { id: "E01", de: "cliente", tipo: "texto", texto: `El ${elDia(cal.cita).split(" ")[0]} a las ${laHora(cal.cita)} 😊`, en: m("inicio", 9) };
    const salen = [];
    for (const x of todas) {
        if (fuera.has(x.id)) continue;
        salen.push({ ...x, ...(cambios[x.id] ?? {}) });
        if (x.id === "M10") salen.push(elige);
    }
    return salen;
}

function laConversacionCompleta(cal) {
    const cita = `${elDia(cal.cita)} a las ${laHora(cal.cita)}`;
    const m = (clave, minutos) => cal[clave] + minutos * 60_000;
    return [
        { id: "M01", de: "cliente", tipo: "texto", texto: "Hola 👋 ¿Cuánto cuesta el blanqueamiento dental?", en: m("inicio", 1) },
        {
            id: "M02",
            de: "ia",
            tipo: "texto",
            texto: "¡Hola! Soy Sofía, de Clínica Sonríe 😊 El blanqueamiento cuesta $450.000 y este mes tiene 30 % de descuento. ¿Te cuento cómo funciona?",
            en: m("inicio", 1),
            efectos: [{ ficha: { servicio: "Blanqueamiento dental" } }, { etapa: "Contactado" }, { etiqueta: "Blanqueamiento" }],
        },
        { id: "M03", de: "cliente", tipo: "nota", medio: "notaDeLaClienta", nota: "clienta", en: m("inicio", 3) },
        {
            id: "M04",
            de: "ia",
            tipo: "nota",
            medio: "notaDeLaIa",
            nota: "ia",
            en: m("inicio", 3),
            efectos: [{ nombre: CLIENTA.nombre }, { ficha: { financiacion: "Sí · hasta 6 cuotas" } }, { calificacion: "Tibio" }],
        },
        { id: "M05", de: "ia", tipo: "documento", medio: "listaDePrecios", en: m("inicio", 3) },
        { id: "M06", de: "ia", tipo: "video", medio: "videoDeLaClinica", texto: "Así es nuestra clínica ✨", en: m("inicio", 3) },
        { id: "M07", de: "cliente", tipo: "imagen", medio: "promoDeInstagram", texto: "Vi esta promo en Instagram, ¿sigue vigente?", en: m("inicio", 6) },
        {
            id: "M08",
            de: "ia",
            tipo: "texto",
            texto: "¡Sí! 🎉 Esa promo sigue vigente todo este mes. ¿Te agendo una valoración gratis para empezar?",
            en: m("inicio", 6),
            efectos: [{ etapa: "Interesado" }, { etiqueta: "Promo Instagram" }, { calificacion: "Caliente" }, { ficha: { origen: "Instagram" } }, { seguimientoProgramado: true }],
        },
        {
            id: "M09",
            de: "ia",
            tipo: "texto",
            seguimiento: true,
            texto: "Hola, Laura 😊 ¿Pudiste ver la lista de precios? Esta semana me quedan estos cupos para tu valoración:",
            en: m("seguimiento", 0),
        },
        { id: "M10", de: "ia", tipo: "imagen", medio: "horarios", en: m("seguimiento", 0) },
        // Laura no contesta, y la IA la llama: la llamada queda en la conversación
        // como la registra la plataforma (su duración la pone la grabación).
        { id: "M11", de: "ia", tipo: "llamada", en: m("llamada", 0) },
        {
            id: "M12",
            de: "ia",
            tipo: "texto",
            texto: `¡Listo, Laura! ✅ Como hablamos, te agendé tu valoración el ${cita}, y te enviaré un recordatorio el día antes.`,
            en: m("llamada", 2),
            efectos: [{ cita: true }, { etapa: "Cita agendada" }, { etiqueta: "Cita agendada" }, { ficha: { proximaCita: `${elDia(cal.cita)}, ${laHora(cal.cita)}` } }],
        },
        {
            id: "M13",
            de: "ia",
            tipo: "texto",
            recordatorio: true,
            texto: `⏰ Recordatorio: mañana ${elDia(cal.cita)} a las ${laHora(cal.cita)} tienes tu valoración en Clínica Sonríe. Responde 1 para confirmar.`,
            en: m("recordatorio", 0),
        },
        {
            id: "M14",
            de: "cliente",
            tipo: "texto",
            texto: "1 ✅ ¡Allá estaré!",
            en: m("recordatorio", 3),
            efectos: [{ citaConfirmada: true }, { etapa: "Cita confirmada" }],
        },
        {
            id: "M15",
            de: "cliente",
            tipo: "texto",
            texto: "¿Me pueden pasar con alguien? Quiero preguntar también por la ortodoncia 🦷",
            en: m("recordatorio", 6),
        },
        {
            id: "M16",
            de: "ia",
            tipo: "texto",
            texto: `¡Claro, Laura! Ya te paso con ${ASESORA.nombre}, nuestra asesora 😊`,
            en: m("recordatorio", 6),
            efectos: [{ asesor: true }, { escalado: true }],
        },
    ];
}

/** Las etapas del embudo de la clínica, en orden (las tres del sistema en su sitio). */
export const ETAPAS = Object.freeze([
    { nombre: "Nuevo", sistema: "nuevo" },
    { nombre: "Contactado", colorHex: "#3B82F6" },
    { nombre: "Interesado", colorHex: "#8B5CF6" },
    { nombre: "Cita agendada", colorHex: "#F59E0B" },
    { nombre: "Cita confirmada", colorHex: "#10B981" },
    { nombre: "Paciente", sistema: "ganado" },
    { nombre: "Perdido", sistema: "perdido" },
]);

/** Los campos de la ficha de la clínica: los que el CRM llena solo. */
/** La sección de la ficha donde la clínica agrupa sus campos (la ficha la abre plegada). */
export const SECCION_DE_LA_FICHA = "Tratamiento";

export const CAMPOS_DE_LA_FICHA = Object.freeze([
    { key: "servicio", label: "Servicio de interés", icon: "Tag" },
    { key: "financiacion", label: "Financiación", icon: "CreditCard" },
    { key: "origen", label: "Cómo nos conoció", icon: "AtSign" },
    { key: "proximaCita", label: "Próxima cita", icon: "Calendar" },
]);

/**
 * Los OTROS chats de la bandeja de la clínica: salen en la lista de WhatsApp
 * Web y en la del panel, y en las columnas del embudo. Los mismos en los dos
 * sitios, o la bandeja del panel no sería la del mismo negocio. `hace` son los
 * minutos antes de que Laura escriba.
 */
export const OTROS_CHATS = Object.freeze([
    {
        nombre: "Mariana Ruiz",
        numero: "573112048861",
        ultimo: { de: "ia", texto: "Sí, los sábados atendemos de 8:00 a. m. a 1:00 p. m. 😊" },
        hace: 8,
        etapa: "Contactado",
        calificacion: "Tibio",
        etiqueta: "Limpieza",
    },
    {
        nombre: "Pedro Castaño",
        numero: "573208845210",
        ultimo: { de: "cliente", texto: "Gracias, nos vemos el viernes 🙌" },
        hace: 26,
        etapa: "Cita agendada",
        calificacion: "Caliente",
        etiqueta: "Ortodoncia",
        asesora: true,
    },
    {
        nombre: "Daniela Mejía",
        numero: "573015567234",
        ultimo: { de: "ia", texto: "La ortodoncia invisible arranca en $3.900.000. ¿Te envío el plan de pagos?" },
        hace: 47,
        etapa: "Interesado",
        calificacion: "Tibio",
        etiqueta: "Ortodoncia",
        asesora: true,
    },
    {
        nombre: "Carlos Ramírez",
        numero: "573157708412",
        ultimo: { de: "cliente", texto: "Listo, ya hice la transferencia ✅" },
        hace: 64,
        etapa: "Paciente",
        calificacion: "Caliente",
        etiqueta: "Blanqueamiento",
    },
    {
        nombre: "Sandra López",
        numero: "573004419987",
        ultimo: { de: "cliente", texto: "Buenas, me gustaría una limpieza" },
        hace: 95,
        etapa: "Nuevo",
        calificacion: "Frío",
        etiqueta: "Limpieza",
    },
    {
        nombre: "Julián Torres",
        numero: "573126602578",
        ultimo: { de: "cliente", texto: "Muchas gracias por la atención 👏" },
        hace: 131,
        etapa: "Cita confirmada",
        calificacion: "Caliente",
        etiqueta: "Implantes",
        asesora: true,
    },
]);

/** Las etiquetas de la clínica, con su color. Las de la historia y las de los otros chats. */
export const ETIQUETAS = Object.freeze([
    { nombre: "Blanqueamiento", color: "#3B82F6" },
    { nombre: "Promo Instagram", color: "#EC4899" },
    { nombre: "Cita agendada", color: "#F59E0B" },
    { nombre: "Ortodoncia", color: "#8B5CF6" },
    { nombre: "Limpieza", color: "#10B981" },
    { nombre: "Implantes", color: "#0EA5E9" },
]);

/** La calificación como la guarda `Session.leadStatus`. */
export const CALIFICACION = Object.freeze({ Frío: "FRIO", Tibio: "TIBIO", Caliente: "CALIENTE" });

/** El jid de WhatsApp de un número. */
export const jidDe = (numero) => `${numero}@s.whatsapp.net`;

/** Las iniciales de un nombre, para los avatares del teléfono y de WhatsApp Web. */
export function lasIniciales(nombre) {
    const partes = String(nombre).trim().split(/\s+/).filter(Boolean);
    return ((partes[0]?.[0] ?? "") + (partes[1]?.[0] ?? "")).toUpperCase() || "?";
}

/**
 * Las capacidades que enseña el vídeo, en el orden en que salen: el rótulo de
 * arriba a la izquierda de cada escena. Son las universales —las de cualquier
 * negocio—, no las de una clínica.
 */
export const CAPACIDADES = Object.freeze([
    { escena: "texto", titulo: "Responde y llena tu CRM", detalle: "Texto · ficha del contacto" },
    { escena: "voz", titulo: "Escucha y responde con voz", detalle: "Notas de voz" },
    { escena: "sheets", titulo: "Sincroniza con Google Sheets", detalle: "Cada dato, en tu hoja" },
    { escena: "medios", titulo: "Envía y entiende archivos", detalle: "PDF · video · imágenes" },
    { escena: "caliente", titulo: "Califica y etiqueta", detalle: "Calificación · etiquetas · etapa" },
    { escena: "seguimiento", titulo: "Hace seguimiento", detalle: "Texto · nota de voz · archivo · llamada" },
    { escena: "llamada", titulo: "Hace llamadas con IA", detalle: "Llamada de WhatsApp" },
    { escena: "cita", titulo: "Agenda citas", detalle: "Directo en tu calendario" },
    { escena: "recordatorio", titulo: "Recuerda y confirma", detalle: "Un día antes de la cita" },
    { escena: "asesor", titulo: "Pasa a un asesor", detalle: "Cuando hace falta una persona" },
    { escena: "embudo", titulo: "Tu embudo, al día", detalle: "Cada cliente en su etapa" },
    { escena: "reportes", titulo: "Reportes y analíticas", detalle: "Todo resumido, cada semana" },
    { escena: "multiagente", titulo: "Trabaja en equipo", detalle: "Varias líneas y varios asesores" },
]);

/**
 * Las LÍNEAS del equipo de la escena de Multiagente: tres WhatsApp de la misma
 * clínica, cada uno con sus asesores atendiendo a la vez. Es una recreación
 * (un esquema, no una pantalla de la App) y la página lo dice
 * (`LO_QUE_ES_EL_VIDEO`); el embudo filtrado por la asesora que viene después
 * sí es el panel de verdad. La primera persona de Ventas es la asesora de la
 * historia: sus clientes son los que salen en ese embudo.
 */
export const LINEAS_DEL_EQUIPO = Object.freeze([
    {
        id: "ventas",
        nombre: "Ventas",
        color: "#3B82F6",
        asesores: [
            { nombre: "Andrea Rojas", chats: 4 },
            { nombre: "Felipe Gómez", chats: 3 },
            { nombre: "Valeria Díaz", chats: 5 },
            { nombre: "Santiago Peña", chats: 2 },
            { nombre: "Camila Ortiz", chats: 4 },
            { nombre: "Mateo Vargas", chats: 3 },
        ],
    },
    {
        id: "soporte",
        nombre: "Soporte",
        color: "#8B5CF6",
        asesores: [
            { nombre: "Lucía Herrera", chats: 3 },
            { nombre: "Tomás Rincón", chats: 2 },
            { nombre: "Paula Moreno", chats: 4 },
        ],
    },
    {
        id: "cobros",
        nombre: "Cobros",
        color: "#10B981",
        asesores: [
            { nombre: "Natalia Silva", chats: 3 },
            { nombre: "Esteban Cruz", chats: 2 },
        ],
    },
]);

/** La asesora que recibe a Laura cuando pide hablar con alguien. */
export const ASESORA = Object.freeze({ nombre: "Andrea", apellido: "Rojas", correo: "andrea@clinica-sonrie.test" });

/**
 * La LLAMADA con IA: lo que se oye cuando Laura contesta. Cada línea con su
 * voz (la de Sofía y la de Laura, pero habladas por teléfono).
 */
export const LA_LLAMADA = Object.freeze([
    { quien: "ia", texto: "¡Hola, Laura! Te habla Sofía, de Clínica Sonríe. ¿Pudiste ver los cupos para tu valoración?" },
    { quien: "clienta", texto: "¡Hola, Sofía! Sí, el jueves a las diez me queda perfecto." },
    { quien: "ia", texto: "¡Listo! Te la dejo agendada y te confirmo por WhatsApp." },
]);

/**
 * La hoja de Google Sheets de la clínica: las columnas y los pacientes que ya
 * estaban. La fila de Laura la escribe el vídeo con lo que dijo en el chat.
 */
export const LA_HOJA = Object.freeze({
    titulo: "Pacientes · Clínica Sonríe",
    columnas: ["Fecha", "Nombre", "Teléfono", "Servicio de interés", "Financiación"],
    filas: [
        ["Lun", "Mariana Ruiz", "+57 300 ••• 1123", "Limpieza", "No"],
        ["Lun", "Pedro Castaño", "+57 311 ••• 4410", "Ortodoncia", "Sí · 12 cuotas"],
        ["Mar", "Daniela Mejía", "+57 320 ••• 7781", "Ortodoncia", "No"],
        ["Mar", "Carlos Ramírez", "+57 315 ••• 2290", "Blanqueamiento", "Sí · 3 cuotas"],
    ],
    laura: ["Mar", "Laura Gómez", "+57 300 ••• 1188", "Blanqueamiento dental", "Sí · hasta 6 cuotas"],
});

/** El lema de la tarjeta de la marca: lo único que dice, debajo de «Verzay». */
export const LEMA_DE_LA_MARCA = Object.freeze({ antes: "Inteligencia artificial que ", resaltado: "atiende, vende y agenda", despues: " por WhatsApp" });

/** A dónde lleva el cierre: la reunión, y el WhatsApp de Verzay. */
export const LLAMADO = Object.freeze({
    agendar: "https://verzay.com/agendar-una-reunion",
    whatsapp: "573233612620",
    web: "verzay.com",
});
