/**
 * Los DATOS DE EJEMPLO de las capturas de la guía de Follow-ups IA, encima de
 * `sembrar-barra.mjs` (que pone la cuenta y su línea).
 *
 * La pantalla crea sola sus reglas y sus dos prompts la primera vez que se
 * abre, así que aquí se BORRAN —para que vuelvan los valores de fábrica— y se
 * siembra lo que la pantalla no inventa: los tres interruptores de la cuenta
 * encendidos, cuatro flujos de ejemplo (dos ya enlazados a un estado) y unos
 * archivos en la biblioteca de Frío y Tibio. Las direcciones de los archivos son
 * de `archivos.ejemplo.co`, que contesta el script de capturas.
 *
 * Se puede correr las veces que haga falta: borra lo suyo y lo vuelve a poner.
 * El script de capturas lo vuelve a correr antes del vídeo.
 */
import { PrismaClient } from "@prisma/client";
import { sembrarElMarco } from "./sembrar-marco-de-la-guia.mjs";

const db = new PrismaClient();

const dueno = await sembrarElMarco(db, {
    path: "/crm/rules",
    title: "Guía de Follow-ups IA",
    description: "Aprende a hacer seguimiento automático a tus leads en la plataforma",
    url: "/guia/follow-ups",
});

const ARCHIVOS_DE_EJEMPLO = "https://archivos.ejemplo.co";

await db.user.update({
    where: { id: dueno.id },
    data: {
        enabledSynthesizer: true,
        enabledLeadStatusClassifier: true,
        enabledCrmFollowUps: true,
        timezone: "America/Bogota",
    },
});

/* Lo que la pantalla crea sola: se borra para que vuelvan los de fábrica. */
await db.crmFollowUpRule.deleteMany({ where: { userId: dueno.id } });
await db.agentPrompt.deleteMany({
    where: { userId: dueno.id, agentId: { in: ["crm-lead-status-classifier", "crm-lead-funnel-synthesizer"] } },
});

/* Los FLUJOS de la cuenta: dos ya enlazados a un estado. */
await db.leadStatusWorkflowConfig.deleteMany({ where: { userId: dueno.id } });
await db.workflow.deleteMany({ where: { userId: dueno.id } });
const flujos = {};
for (const [i, name] of ["Bienvenida", "Oferta de la semana", "Agendar demostración", "Encuesta de salida"].entries()) {
    flujos[name] = await db.workflow.create({
        data: { userId: dueno.id, name, definition: "{}", status: "active", order: i },
    });
}
await db.leadStatusWorkflowConfig.create({
    data: { userId: dueno.id, leadStatus: "CALIENTE", workflowId: flujos["Agendar demostración"].id },
});
await db.leadStatusWorkflowConfig.create({
    data: { userId: dueno.id, leadStatus: "DESCARTADO", workflowId: flujos["Encuesta de salida"].id },
});

/* La BIBLIOTECA: unos archivos en Tibio y uno en Frío. */
await db.crmFollowUpMedia.deleteMany({ where: { userId: dueno.id } });
const ARCHIVOS = [
    { leadStatus: "TIBIO", name: "Catálogo de productos 2026", description: "Para quien preguntó por los productos.", url: `${ARCHIVOS_DE_EJEMPLO}/catalogo-2026.jpg`, mediaType: "image" },
    { leadStatus: "TIBIO", name: "Lista de precios", description: "Precios vigentes del mes.", url: `${ARCHIVOS_DE_EJEMPLO}/lista-de-precios.pdf`, mediaType: "document" },
    { leadStatus: "TIBIO", name: "Testimonio de un cliente", description: "Una clienta cuenta su experiencia.", url: `${ARCHIVOS_DE_EJEMPLO}/testimonio.mp3`, mediaType: "audio" },
    { leadStatus: "FRIO", name: "Presentación de la empresa", description: "Quiénes somos y qué hacemos.", url: `${ARCHIVOS_DE_EJEMPLO}/presentacion.pdf`, mediaType: "document" },
];
for (const [i, a] of ARCHIVOS.entries()) {
    await db.crmFollowUpMedia.create({
        data: { userId: dueno.id, ...a, createdAt: new Date(Date.now() - (ARCHIVOS.length - i) * 60_000) },
    });
}

console.log(JSON.stringify({ flujos: Object.keys(flujos).length, archivos: ARCHIVOS.length }));
await db.$disconnect();
