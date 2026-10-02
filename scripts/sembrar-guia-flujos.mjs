/**
 * Los DATOS DE EJEMPLO de las capturas de la guía de Crear flujos, encima de
 * `sembrar-barra.mjs` (la cuenta, su equipo y su línea de WhatsApp).
 *
 * Un negocio de ejemplo —«Café de la Montaña»— con un flujo de cada tipo, para
 * que las cuatro pastillas de la lista tengan algo que contar y el editor algo
 * que enseñar:
 *
 * - Bienvenida (Inicio): saluda y ofrece un menú de opciones.
 * - Pedido por WhatsApp (Chatbot): se lanza con «pedido» o «quiero comprar»;
 *   responde, etiqueta, avisa al asesor y deja un seguimiento por si no contesta.
 * - Cotización mayorista (IA): la IA lo lanza cuando entiende que el cliente
 *   compra al por mayor.
 * - Reactivar clientes (Flujo): lo lanzas tú; dos seguimientos espaciados.
 *
 * Y tres piezas cerradas por plan (`workflow_feature_access`), para que la
 * paleta enseñe sus candados como los vería un plan que no las incluye.
 *
 * El marco —cuenta de cliente, su menú, «Ver tutoriales» y «Soporte»— es el de
 * todas las guías (`sembrar-marco-de-la-guia.mjs`).
 *
 * Se puede correr las veces que haga falta: borra lo suyo y lo vuelve a poner.
 * El script de capturas lo vuelve a correr antes del vídeo, porque las capturas
 * crean un flujo y le agregan pasos.
 */
import { PrismaClient } from "@prisma/client";
import { MENU_DE_UN_CLIENTE, sembrarElMarco } from "./sembrar-marco-de-la-guia.mjs";

const db = new PrismaClient();

const dueno = await sembrarElMarco(db, {
    path: "/workflow",
    title: "Guía de Crear flujos",
    description: "Aprende a crear flujos automáticos para tus chats en la plataforma",
    url: "/guia/flujos",
});

/* ── Las piezas cerradas por plan ────────────────────────────────────────── */
// Sin fila = todos los planes. Con fila, solo los listados: la cuenta de la
// guía es de plan «personalizado», así que estas tres le salen con candado.
const CERRADAS = ["webhook", "ai-call", "seguimiento-ai-call"];
await db.workflowFeatureAccess.deleteMany({});
for (const featureKey of CERRADAS) {
    await db.workflowFeatureAccess.create({ data: { featureKey, allowedPlans: ["enterprise"] } });
}

/* ── Una etiqueta para el paso «Agregar tag» ────────────────────────────── */
await db.tag.deleteMany({ where: { userId: dueno.id, slug: "pedido-nuevo" } });
const etiqueta = await db.tag.create({
    data: { userId: dueno.id, name: "Pedido nuevo", slug: "pedido-nuevo", color: "#10B981" },
});

/* ── Los flujos ─────────────────────────────────────────────────────────── */
await db.intentTrigger.deleteMany({ where: { userId: dueno.id } });
await db.workflow.deleteMany({ where: { userId: dueno.id } });

const COL = 400;
/**
 * Crea un flujo con sus pasos en fila y conectados uno detrás de otro. Un paso
 * puede declarar `desde` (el índice de otro paso) y `salida` (su conector)
 * para colgar de una rama distinta.
 */
async function crearFlujo({ nombre, orden, inicio = false, embudo = false, palabras = null, pasos }) {
    const flujo = await db.workflow.create({
        data: {
            userId: dueno.id,
            name: nombre,
            description: palabras ? JSON.stringify({ matchType: "contiene", keywords: palabras }) : "",
            definition: "workflow",
            status: "DRAFT",
            isPro: true,
            order: orden,
            triggerOnNewSession: inicio,
            isFunnelStep: embudo,
        },
    });
    const creados = [];
    for (const [i, p] of pasos.entries()) {
        const fila = p.fila ?? 0;
        const columna = p.columna ?? i;
        const nodo = await db.workflowNode.create({
            data: {
                workflowId: flujo.id,
                tipo: p.tipo,
                message: p.mensaje ?? "",
                delay: p.delay ?? null,
                inactividad: p.inactividad ?? null,
                menuOptions: p.opciones ?? null,
                order: i,
                posX: p.x ?? columna * COL,
                posY: p.y ?? fila * 260,
            },
        });
        creados.push(nodo);
        if (i > 0) {
            const origen = creados[p.desde ?? i - 1];
            await db.workflowEdge.create({
                data: {
                    workflowId: flujo.id,
                    sourceId: origen.id,
                    targetId: nodo.id,
                    sourceHandle: p.salida ?? "out",
                    targetHandle: "in",
                },
            });
        }
    }
    return flujo;
}

await crearFlujo({
    nombre: "Bienvenida",
    orden: 0,
    inicio: true,
    pasos: [
        { tipo: "text", mensaje: "¡Hola! Bienvenido 👋" },
        { tipo: "menu", mensaje: "Elige una opción:", opciones: "Ver el catálogo\nHacer un pedido\nHablar con un asesor" },
        { tipo: "text", mensaje: "Este es nuestro catálogo ☕", desde: 1, salida: "opt-1", x: 1000, y: 60 },
        { tipo: "text", mensaje: "¿Qué café quieres?", desde: 1, salida: "opt-2", x: 1000, y: 230 },
        { tipo: "nodo-notify", mensaje: "Un cliente pidió hablar con un asesor.", desde: 1, salida: "opt-3", x: 1000, y: 400 },
    ],
});

await crearFlujo({
    nombre: "Pedido por WhatsApp",
    orden: 1,
    palabras: ["pedido", "quiero comprar"],
    pasos: [
        { tipo: "text", mensaje: "¡Gracias por tu pedido! 🛍️" },
        { tipo: "tag-add", mensaje: JSON.stringify({ tagId: etiqueta.id }) },
        { tipo: "notify-advisor", mensaje: JSON.stringify({ message: "Entró un pedido por WhatsApp." }) },
        { tipo: "seguimiento-text", mensaje: "¿Revisaste tu pedido?", delay: "hours-2", inactividad: true },
    ],
});

const mayorista = await crearFlujo({
    nombre: "Cotización mayorista",
    orden: 2,
    pasos: [
        { tipo: "text", mensaje: "¿Cuántos kilos necesitas?" },
        { tipo: "node_pause", mensaje: "" },
        { tipo: "nodo-notify", mensaje: "Un cliente mayorista pidió cotización." },
    ],
});
await db.intentTrigger.create({
    data: {
        userId: dueno.id,
        name: "Cotización mayorista",
        mode: "prompt",
        condition: "El cliente quiere comprar al por mayor o pregunta precios por cantidad",
        workflowId: mayorista.id,
        isActive: true,
    },
});

await crearFlujo({
    nombre: "Reactivar clientes",
    orden: 3,
    embudo: true,
    pasos: [
        { tipo: "text", mensaje: "¡Llegó la cosecha nueva! ☕" },
        { tipo: "seguimiento-text", mensaje: "¿Te separo una bolsa?", delay: "days-1", inactividad: true },
        { tipo: "seguimiento-text", mensaje: "¡Quedan pocas bolsas!", delay: "days-3", inactividad: true },
    ],
});

console.log(
    JSON.stringify({ flujos: 4, cerradas: CERRADAS.length, modulos: MENU_DE_UN_CLIENTE.length }),
);
await db.$disconnect();
