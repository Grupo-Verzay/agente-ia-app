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
 * Los negocios del arranque: cinco teléfonos a la vez, cada uno con su
 * pregunta y su respuesta. Es lo que dice «da igual el negocio» sin decirlo.
 * `adjunto` es solo lo que pinta el teléfono (no hay archivo detrás).
 */
export const NEGOCIOS_DEL_ARRANQUE = Object.freeze([
    {
        id: "restaurante",
        negocio: "La Casona · Restaurante",
        contacto: "Andrés",
        color: "#e76f51",
        mensajes: [
            { de: "cliente", texto: "¿Tienen mesa para 4 hoy a las 8? 🍽️" },
            { de: "ia", texto: "¡Sí, Andrés! Te reservé mesa para 4 a las 8:00 p. m. ¿La quieres en la terraza?" },
        ],
    },
    {
        id: "clinica",
        negocio: "Clínica Sonríe",
        contacto: "Laura",
        color: "#2a9d8f",
        mensajes: [
            { de: "cliente", texto: "¿Cuánto cuesta el blanqueamiento dental?" },
            { de: "ia", texto: "¡Hola, Laura! Este mes tiene 30 % de descuento 😊 ¿Te envío la lista de precios?" },
        ],
    },
    {
        id: "tienda",
        negocio: "Urbana Store",
        contacto: "Camila",
        color: "#7c3aed",
        mensajes: [
            { de: "cliente", texto: "¿Hacen envíos a Medellín? 📦" },
            { de: "ia", texto: "¡Claro! Llega en 24 horas y el envío es gratis. ¿Qué talla necesitas?" },
        ],
    },
    {
        id: "consultoria",
        negocio: "Contadores Asociados",
        contacto: "Jorge",
        color: "#264653",
        mensajes: [
            { de: "cliente", adjunto: { tipo: "documento", nombre: "RUT-2026.pdf", detalle: "1 página · PDF" } },
            { de: "cliente", texto: "Necesito ayuda con mi declaración" },
            { de: "ia", texto: "Recibido, Jorge ✅ ¿Agendamos una asesoría de 20 minutos mañana?" },
        ],
    },
    {
        id: "agencia",
        negocio: "Impulso · Agencia de marketing",
        contacto: "Valentina",
        color: "#f4a261",
        mensajes: [
            { de: "cliente", texto: "¿Cuánto cuesta manejar mi Instagram?" },
            { de: "ia", texto: "Tenemos tres planes desde $890.000 al mes 📈 Te envío la propuesta:" },
            { de: "ia", adjunto: { tipo: "documento", nombre: "Propuesta Impulso.pdf", detalle: "4 páginas · PDF" } },
        ],
    },
]);

/** Los archivos que viajan en la conversación. Los genera `medios.mjs`. */
export const MEDIOS = Object.freeze({
    notaDeLaClienta: { archivo: "nota-clienta.ogg", mime: "audio/ogg; codecs=opus" },
    notaDeLaIa: { archivo: "nota-ia.ogg", mime: "audio/ogg; codecs=opus" },
    listaDePrecios: { archivo: "lista-de-precios.pdf", mime: "application/pdf", nombre: "Lista de precios · Clínica Sonríe.pdf", paginas: 2 },
    videoDeLaClinica: { archivo: "conoce-la-clinica.mp4", mime: "video/mp4", portada: "conoce-la-clinica.jpg" },
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
export function laConversacion(cal = elCalendario()) {
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
        { id: "M11", de: "cliente", tipo: "texto", texto: "¡Sí! El jueves a las 10 me sirve 🙌", en: m("seguimiento", 6) },
        {
            id: "M12",
            de: "ia",
            tipo: "texto",
            texto: `¡Listo, Laura! ✅ Te agendé tu valoración el ${cita}. Te enviaré un recordatorio el día antes.`,
            en: m("seguimiento", 6),
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
    },
    {
        nombre: "Daniela Mejía",
        numero: "573015567234",
        ultimo: { de: "ia", texto: "La ortodoncia invisible arranca en $3.900.000. ¿Te envío el plan de pagos?" },
        hace: 47,
        etapa: "Interesado",
        calificacion: "Tibio",
        etiqueta: "Ortodoncia",
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
