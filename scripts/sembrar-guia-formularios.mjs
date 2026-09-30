/**
 * Los DATOS DE EJEMPLO de las capturas de la guía de Mis formularios, encima de
 * `sembrar-barra.mjs` (que pone la cuenta y su equipo).
 *
 * Nombres inventados, pero con la forma de una cuenta de verdad: cuatro
 * formularios distintos, cada uno para enseñar una parte de la pantalla.
 *
 *   - «Inscripción de clientes»: la redirección a WhatsApp encendida, su enlace
 *     corto (`/f/inscripcion`) y todos los tipos que llena un cliente —texto,
 *     teléfono, opciones, archivo y la casilla de aceptación—. Es el que se
 *     abre como lo ve el cliente. SIN hoja de Google, así que sus registros
 *     salen «Sincronizado» (y lo que se envíe desde las capturas también).
 *   - «Solicitud de cotización»: con su hoja de Google Sheets y registros de
 *     los tres estados —sincronizados, pendientes y con error—, que es lo que
 *     enseñan Registros y la sección de Google Sheets.
 *   - «Encuesta de satisfacción»: tres preguntas, para el editor de un vistazo.
 *   - «Reserva de mesa»: INACTIVO, para que la cifra «Inactivos» encuentre algo.
 *
 * El marco —cuenta de cliente, su menú, «Ver tutoriales» y «Soporte»— es el de
 * todas las guías (`sembrar-marco-de-la-guia.mjs`).
 *
 * Se puede correr las veces que haga falta: borra lo suyo y lo vuelve a poner.
 * El script de capturas lo vuelve a correr antes del vídeo, porque las capturas
 * crean un formulario, desactivan otro y envían uno público, y el vídeo tiene
 * que salir del mismo punto de partida.
 */
import { PrismaClient } from "@prisma/client";
import { MENU_DE_UN_CLIENTE, sembrarElMarco } from "./sembrar-marco-de-la-guia.mjs";

const db = new PrismaClient();

const dueno = await sembrarElMarco(db, {
    path: "/mis-formularios",
    title: "Guía de Mis formularios",
    description: "Aprende a crear formularios y recibir sus respuestas en la plataforma",
    url: "/guia/formularios",
});

await db.form.deleteMany({ where: { userId: dueno.id } });

const DIA = 86_400_000;
const ahora = Date.now();
/** Una hora del día de hace `dias` días, en la hora de Bogotá (UTC-5). */
const haceDias = (dias, hora = 10, minuto = 0) => {
    const d = new Date(ahora - dias * DIA);
    d.setUTCHours(hora + 5, minuto, 0, 0);
    return d;
};
const opciones = (...labels) => labels.map((label) => ({ label, value: label }));

/**
 * Crea un formulario con sus campos y devuelve los ids de los campos por su
 * pregunta, para escribir las respuestas de sus registros.
 */
async function formulario({ campos, registros = [], ...datos }) {
    const form = await db.form.create({ data: { userId: dueno.id, ...datos } });
    const ids = {};
    for (const [i, c] of campos.entries()) {
        const campo = await db.formField.create({
            data: {
                formId: form.id,
                label: c.label,
                type: c.type,
                required: Boolean(c.required),
                placeholder: c.placeholder ?? null,
                options: c.options ?? undefined,
                order: i,
            },
        });
        ids[c.label] = campo.id;
    }
    for (const r of registros) {
        const data = {};
        for (const [label, valor] of Object.entries(r.respuestas)) data[ids[label]] = valor;
        await db.formSubmission.create({
            data: {
                formId: form.id,
                data,
                syncStatus: r.estado ?? "SYNCED",
                syncedAt: (r.estado ?? "SYNCED") === "SYNCED" ? r.fecha : null,
                syncError: r.error ?? null,
                createdAt: r.fecha,
            },
        });
    }
    return form;
}

/* ── Inscripción de clientes ────────────────────────────────────────────── */
const PERSONAS = [
    ["María Fernanda López", "3004521876", "maria.lopez@correo.co", "Asesoría", "Redes sociales"],
    ["Juan Pablo Restrepo", "3125538810", "jprestrepo@correo.co", "Instalación", "Recomendación"],
    ["Camila Andrade", "3108842216", "camila.andrade@correo.co", "Mantenimiento", "Google"],
    ["Andrés Gómez", "3202245690", "andres.gomez@correo.co", "Asesoría", "Recomendación"],
    ["Valentina Castro", "3114478832", "vale.castro@correo.co", "Instalación", "Redes sociales"],
    ["Santiago Herrera", "3157781234", "santiago.herrera@correo.co", "Asesoría", "Google"],
    ["Laura Jiménez", "3016649902", "laura.jimenez@correo.co", "Mantenimiento", "Redes sociales"],
    ["Diego Ramírez", "3183345671", "diego.ramirez@correo.co", "Instalación", "Recomendación"],
    ["Natalia Ortiz", "3007782215", "natalia.ortiz@correo.co", "Asesoría", "Redes sociales"],
    ["Felipe Vargas", "3129904412", "felipe.vargas@correo.co", "Mantenimiento", "Google"],
];
await formulario({
    title: "Inscripción de clientes",
    slug: "inscripcion-de-clientes",
    publicSlug: "inscripcion",
    description: "Déjanos tus datos y te contactamos en menos de un día hábil.",
    isActive: true,
    whatsappEnabled: true,
    whatsappNumber: "573001234567",
    whatsappMessage: "Hola, soy {{Nombre completo}}. Me acabo de inscribir para {{Servicio de interés}}.",
    createdAt: haceDias(20),
    campos: [
        { label: "Nombre completo", type: "text", required: true, placeholder: "Escribe tu nombre y apellido" },
        { label: "Teléfono", type: "phone", required: true, placeholder: "300 123 4567" },
        { label: "Correo electrónico", type: "email", placeholder: "tu@correo.com" },
        { label: "Servicio de interés", type: "select", required: true, options: opciones("Asesoría", "Instalación", "Mantenimiento") },
        { label: "¿Cómo nos conociste?", type: "radio", options: opciones("Redes sociales", "Recomendación", "Google") },
        { label: "Documento de identidad", type: "file" },
        { label: "Acepto el tratamiento de mis datos", type: "checkbox", required: true },
    ],
    registros: PERSONAS.map(([nombre, tel, correo, servicio, como], i) => ({
        fecha: haceDias(18 - i * 2, 9 + (i % 7), (i * 13) % 60),
        respuestas: {
            "Nombre completo": nombre,
            Teléfono: tel,
            "Correo electrónico": correo,
            "Servicio de interés": servicio,
            "¿Cómo nos conociste?": como,
            "Documento de identidad": "",
            "Acepto el tratamiento de mis datos": true,
        },
    })),
});

/* ── Solicitud de cotización ────────────────────────────────────────────── */
const EMPRESAS = [
    ["Distribuidora El Sol", "Carolina Mejía", "3017789245", ["Cajas de cartón", "Cinta de embalaje"], 200, 1800000],
    ["Ferretería Central", "Hernán Duque", "3006634418", ["Estibas"], 40, 2400000],
    ["Óptica Visión", "Paola Rincón", "3017735584", ["Bolsas de papel"], 500, 350000],
    ["Panadería La Espiga", "Jorge Salazar", "3145521098", ["Bolsas de papel", "Cajas de cartón"], 1000, 900000],
    ["Café del Parque", "Luisa Moreno", "3162287734", ["Vasos desechables"], 2000, 1200000],
    ["Muebles Roble", "Ricardo Peña", "3009914476", ["Cajas de cartón", "Estibas"], 60, 3100000],
    ["Tienda Natural", "Adriana Ruiz", "3118845521", ["Bolsas de papel"], 300, 280000],
    ["Farmacia Salud", "Mauricio León", "3176652290", ["Cajas de cartón"], 150, 620000],
    ["Librería Letras", "Sandra Pardo", "3024471186", ["Cinta de embalaje"], 80, 190000],
    ["Hotel El Mirador", "Camilo Rojas", "3187736654", ["Vasos desechables", "Bolsas de papel"], 1500, 1500000],
    ["Restaurante Sazón", "Diana Suárez", "3134458827", ["Vasos desechables"], 800, 540000],
    ["Almacén Moda", "Tatiana Gil", "3005528841", ["Bolsas de papel", "Cinta de embalaje"], 400, 460000],
    ["Veterinaria Huellas", "Oscar Beltrán", "3196641157", ["Cajas de cartón"], 100, 410000],
    ["Floristería Jardín", "Mónica Arias", "3042239978", ["Cajas de cartón", "Cinta de embalaje"], 120, 380000],
    ["Taller Motor", "Julián Cárdenas", "3151147703", ["Estibas"], 25, 1600000],
    ["Heladería Polar", "Natalia Vélez", "3208816652", ["Vasos desechables"], 3000, 1950000],
];
/**
 * Cuáles no llegaron a la hoja, y por qué: lo enseñan Registros y la sección
 * de Sheets. UNO con error: filtrado, queda solo y debajo hay sitio para
 * señalar su botón de reintentar sin tapar otra fila.
 */
const ESTADO_DE_LA_COTIZACION = {
    8: { estado: "ERROR", error: "The caller does not have permission" },
    14: { estado: "PENDING" },
    15: { estado: "PENDING" },
};
await formulario({
    title: "Solicitud de cotización",
    slug: "solicitud-de-cotizacion",
    description: "Cuéntanos qué necesitas y te enviamos la cotización por WhatsApp.",
    sheetsUrl: "https://docs.google.com/spreadsheets/d/1Cotizaciones-Mi-Negocio/edit",
    isActive: true,
    createdAt: haceDias(30),
    campos: [
        { label: "Empresa", type: "text", required: true },
        { label: "Persona de contacto", type: "text", required: true },
        { label: "WhatsApp", type: "phone", required: true },
        { label: "Productos", type: "multiselect", required: true, options: opciones("Cajas de cartón", "Bolsas de papel", "Vasos desechables", "Estibas", "Cinta de embalaje") },
        { label: "Cantidad", type: "number" },
        { label: "Presupuesto", type: "money" },
        { label: "Fecha de entrega", type: "date" },
        { label: "Comentarios", type: "textarea" },
    ],
    registros: EMPRESAS.map(([empresa, contacto, tel, productos, cantidad, presupuesto], i) => ({
        fecha: haceDias(27 - i * 1.7, 8 + (i % 9), (i * 17) % 60),
        ...(ESTADO_DE_LA_COTIZACION[i] ?? {}),
        respuestas: {
            Empresa: empresa,
            "Persona de contacto": contacto,
            WhatsApp: tel,
            Productos: productos,
            Cantidad: String(cantidad),
            Presupuesto: String(presupuesto),
            "Fecha de entrega": haceDias(-10 - i).toISOString().slice(0, 10),
            // Una de cada tres sin comentarios: el detalle dice «Sin respuesta».
            Comentarios: i % 3 === 0 ? "" : "Con entrega en nuestra bodega, por favor.",
        },
    })),
});

/* ── Encuesta de satisfacción ───────────────────────────────────────────── */
const CALIFICACIONES = ["Excelente", "Buena", "Excelente", "Regular", "Excelente", "Buena", "Excelente", "Buena", "Excelente"];
await formulario({
    title: "Encuesta de satisfacción",
    slug: "encuesta-de-satisfaccion",
    description: "Tu opinión nos ayuda a atenderte mejor.",
    isActive: true,
    createdAt: haceDias(40),
    campos: [
        { label: "¿Cómo calificas la atención?", type: "radio", required: true, options: opciones("Excelente", "Buena", "Regular", "Mala") },
        { label: "¿Nos recomendarías?", type: "radio", required: true, options: opciones("Sí", "No") },
        { label: "Comentarios", type: "textarea", placeholder: "Cuéntanos qué podemos mejorar" },
    ],
    registros: CALIFICACIONES.map((c, i) => ({
        fecha: haceDias(35 - i * 3, 11 + (i % 6)),
        respuestas: { "¿Cómo calificas la atención?": c, "¿Nos recomendarías?": c === "Regular" ? "No" : "Sí", Comentarios: "" },
    })),
});

/* ── Reserva de mesa (inactivo) ─────────────────────────────────────────── */
await formulario({
    title: "Reserva de mesa",
    slug: "reserva-de-mesa",
    description: "Reserva para la temporada de diciembre.",
    isActive: false,
    createdAt: haceDias(60),
    campos: [
        { label: "Nombre", type: "text", required: true },
        { label: "Fecha", type: "date", required: true },
        { label: "Hora", type: "time", required: true },
        { label: "Personas", type: "number", required: true },
    ],
    registros: [0, 1, 2].map((i) => ({
        fecha: haceDias(55 - i * 4, 18),
        respuestas: { Nombre: PERSONAS[i][0], Fecha: haceDias(50 - i * 4).toISOString().slice(0, 10), Hora: "20:00", Personas: String(2 + i * 2) },
    })),
});

console.log(
    JSON.stringify({
        formularios: 4,
        registros: PERSONAS.length + EMPRESAS.length + CALIFICACIONES.length + 3,
        modulos: MENU_DE_UN_CLIENTE.length,
    }),
);
await db.$disconnect();
