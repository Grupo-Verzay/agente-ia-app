/**
 * Los DATOS DE EJEMPLO de las capturas de la guía de Agente IA, encima de
 * `sembrar-barra.mjs` (que pone la cuenta y su equipo).
 *
 * Nombres inventados, pero con la forma de un entrenamiento de verdad: una
 * tienda de café con su perfil lleno, una bienvenida y tres pasos que avanzan
 * (entender, ofrecer, cerrar), preguntas frecuentes, productos, extras, dos
 * capturas de datos en Gestión, reglas de palabras clave —una que responde y
 * otra que escala—, las cotizaciones encendidas con sus condiciones, dos
 * versiones guardadas en el historial y conversaciones para las métricas.
 * Con un entrenamiento vacío la guía no enseñaría nada.
 *
 * Los canales: Llamadas activo (para enseñar que otro canal nace como copia
 * del de WhatsApp) y los demás apagados, con su candado.
 *
 * El marco —cuenta de cliente, su menú, «Ver tutoriales» y «Soporte»— es el de
 * todas las guías (`sembrar-marco-de-la-guia.mjs`).
 *
 * Se puede correr las veces que haga falta: borra lo suyo y lo vuelve a
 * poner. El script de capturas lo vuelve a correr antes del vídeo: las
 * capturas abren otro canal, eligen plantillas y cambian textos, y el vídeo
 * tiene que salir del mismo punto de partida.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { MENU_DE_UN_CLIENTE, sembrarElMarco } from "./sembrar-marco-de-la-guia.mjs";

const db = new PrismaClient();

const dueno = await sembrarElMarco(db, {
    path: "/ia",
    title: "Guía de Agente IA",
    description: "Aprende a entrenar tu agente de IA paso a paso en la plataforma",
    url: "/guia/agente-ia",
});

/*
 * El texto de la bienvenida es el de la plataforma, el mismo que pone el
 * editor al crear el paso: se lee de `trainingDefaults.ts` y no se copia, o
 * la captura enseñaría unas instrucciones que ya no son las de verdad.
 */
const DEFAULTS = readFileSync(path.resolve(import.meta.dirname, "..", "app/(root)/ai/_components/helpers/trainingDefaults.ts"), "utf8");
function laConstante(nombre) {
    const m = DEFAULTS.match(new RegExp(`export const ${nombre} = \`([\\s\\S]*?[^\\\\])\`;`));
    if (!m) throw new Error(`no está ${nombre} en trainingDefaults.ts`);
    return new Function(`return \`${m[1]}\`;`)();
}
const BIENVENIDA = laConstante("WELCOME_MAIN_MESSAGE_OBLIGATORIA");
const TITULO_BIENVENIDA = DEFAULTS.match(/export const WELCOME_TITLE = "([^"]+)"/)[1];

/* ── La cuenta: número para avisar al asesor y canales ─────────────────── */
await db.user.update({
    where: { id: dueno.id },
    data: {
        notificationNumber: "573001234567",
        // Llamadas activo: otro canal con su propio entrenamiento. Los demás,
        // con candado.
        onCalls: true,
        onWhatsappCloud: false,
        onTelegram: false,
        onFacebook: false,
        onInstagram: false,
    },
});

/* ── Los flujos que ejecuta el agente ──────────────────────────────────── */
await db.workflow.deleteMany({ where: { userId: dueno.id } });
const FLUJOS = ["Menú principal", "Catálogo de cafés", "Ubicación de la tienda"];
const flujos = {};
for (const [i, nombre] of FLUJOS.entries()) {
    flujos[nombre] = await db.workflow.create({
        data: { userId: dueno.id, name: nombre, definition: "{}", status: "active", order: i },
    });
}

/* ── El entrenamiento ─────────────────────────────────────────────────── */
let n = 0;
const id = (pre) => `${pre}-guia-${++n}`;
const texto = (t) => ({ id: id("el"), kind: "text", text: t });
const flujo = (nombre) => ({ id: id("el"), kind: "function", fn: "ejecutar_flujo", flowId: flujos[nombre].id, flowName: nombre, rules: [] });
const aviso = () => ({ id: id("el"), kind: "function", fn: "notificar_asesor", notificationNumber: "573001234567", rules: [] });
const nota = (t) => ({ id: id("el"), kind: "function", fn: "nota_interna", nota: t, rules: [] });
const captura = (subtype, fields) => ({ id: id("el"), kind: "function", fn: "captura_datos", subtype, fields, rules: [] });

const SECCIONES = {
    business: {
        nombre: "Café de la Montaña",
        sector: "Tienda de café de especialidad",
        ubicacion: "Calle 10 # 43-21, El Poblado, Medellín",
        horarios: "Lunes a sábado de 8:00 a. m. a 7:00 p. m. Domingos de 9:00 a. m. a 2:00 p. m.",
        telefono: "+57 300 123 4567",
        email: "hola@cafedelamontana.com",
        sitio: "https://cafedelamontana.com",
        facebook: "",
        instagram: "https://instagram.com/cafedelamontana",
        tiktok: "",
        youtube: "",
        linkedin: "",
        twitter: "",
        telegram: "",
        notas: "Trata a los clientes de tú, con calidez y sin prisa. No prometas envíos el mismo día fuera de Medellín.",
    },
    training: {
        steps: [
            {
                id: id("paso"),
                title: TITULO_BIENVENIDA,
                mainMessage: BIENVENIDA,
                welcomeType: "obligatoria",
                variableQueRecoge: "",
                condicionParaAvanzar: "",
                elements: [
                    flujo("Menú principal"),
                    texto("¡Hola! 👋 Bienvenido a Café de la Montaña. ¿Buscas café para tu casa, para tu negocio o un regalo?"),
                ],
            },
            {
                id: id("paso"),
                title: "Entender qué busca",
                mainMessage: "Pregunta para qué quiere el café y cómo lo prepara: en greca, en prensa francesa o en máquina de espresso.",
                variableQueRecoge: "nombre, uso_del_cafe",
                condicionParaAvanzar: "Sabemos su nombre y para qué lo quiere",
                elements: [texto("¿Con quién tengo el gusto? Y cuéntame cómo preparas tu café en casa ☕")],
            },
            {
                id: id("paso"),
                title: "Ofrecer el café indicado",
                mainMessage: "Recomienda uno o dos cafés del catálogo según lo que contó, con su precio y su tueste.",
                variableQueRecoge: "producto_elegido",
                condicionParaAvanzar: "Eligió un café",
                elements: [
                    flujo("Catálogo de cafés"),
                    texto("Te comparto nuestro catálogo. Para prensa francesa te recomiendo el Huila de tueste medio."),
                    nota("Si pide más de 10 bolsas es un pedido de negocio: ofrece el precio por mayor."),
                ],
            },
            {
                id: id("paso"),
                title: "Cerrar el pedido",
                mainMessage: "Confirma el pedido, la dirección de entrega y la forma de pago. Avisa a un asesor para despacharlo.",
                variableQueRecoge: "direccion, forma_de_pago",
                condicionParaAvanzar: "Pedido confirmado",
                elements: [texto("¡Perfecto! ¿A qué dirección te lo enviamos y cómo prefieres pagar?"), aviso()],
            },
        ],
    },
    faq: {
        steps: [
            { id: id("faq"), title: "¿Hacen envíos?", mainMessage: "Sí, a toda Colombia. En Medellín llega el mismo día si pides antes de las 12 m.", elements: [] },
            { id: id("faq"), title: "¿Dónde están ubicados?", mainMessage: "En El Poblado, Medellín.", elements: [flujo("Ubicación de la tienda")] },
            { id: id("faq"), title: "¿Qué formas de pago aceptan?", mainMessage: "Transferencia, Nequi, tarjeta y pago contra entrega en Medellín.", elements: [] },
        ],
    },
    products: {
        steps: [
            { id: id("prod"), title: "Café Huila 500 g", mainMessage: "Tueste medio, notas a panela y cítricos. $38.000. Ideal para prensa francesa y greca.", elements: [] },
            { id: id("prod"), title: "Café Sierra Nevada 250 g", mainMessage: "Tueste claro, notas florales. $26.000. Para métodos de filtro.", elements: [] },
            { id: id("prod"), title: "Kit de regalo", mainMessage: "Dos cafés de 250 g y una taza. $72.000. Se envía con tarjeta.", elements: [texto("Pregunta si quiere que la tarjeta lleve un mensaje.")] },
        ],
    },
    extras: {
        firmaEnabled: true,
        firmaText: "",
        firmaName: "Sofía, asesora virtual",
        steps: [
            { id: id("extra"), title: "Si dice que está caro", mainMessage: "Explica que es café de origen, tostado cada semana, y ofrece la bolsa de 250 g.", elements: [] },
            { id: id("extra"), title: "Garantía de frescura", mainMessage: "Si el café no llega fresco, lo cambiamos sin costo.", elements: [aviso()] },
        ],
    },
    management: {
        steps: [
            { id: id("gest"), title: "Pedido", mainMessage: "", elements: [captura("Pedidos", ["nombre", "direccion", "cedula", "producto"])] },
            { id: id("gest"), title: "Reclamo", mainMessage: "", elements: [captura("Reclamos", ["nombre", "numero_de_pedido", "motivo"])] },
        ],
    },
    keywords: {
        rules: [
            { id: id("regla"), keywords: ["precio", "cuánto cuesta"], response: "Nuestros cafés van desde $26.000. ¿Te comparto el catálogo?", action: "responder", matchType: "contains" },
            { id: id("regla"), keywords: ["horario"], response: "Abrimos de lunes a sábado de 8:00 a. m. a 7:00 p. m.", action: "responder", matchType: "exact" },
            { id: id("regla"), keywords: ["hablar con una persona", "asesor"], response: "", action: "escalar", matchType: "contains" },
        ],
    },
};

await db.agentPromptRevision.deleteMany({ where: { publishedBy: dueno.id } });
await db.agentPrompt.deleteMany({ where: { userId: dueno.id } });
const prompt = await db.agentPrompt.create({
    data: {
        userId: dueno.id,
        agentId: "system-prompt-ai",
        status: "published",
        version: 3,
        sections: SECCIONES,
        promptText: "",
        businessName: SECCIONES.business.nombre,
        businessSector: SECCIONES.business.sector,
    },
});

/*
 * Dos versiones guardadas: el historial enseña cómo se ve una lista, no una
 * sola fila. La más vieja, sin los extras.
 */
const DIA = 86_400_000;
const ahora = Date.now();
const REVISIONES = [
    { numero: 1, hace: 9, notas: "Primera versión", sin: ["extras", "keywords"] },
    { numero: 2, hace: 3, notas: "Agregué los productos y las reglas", sin: ["extras"] },
];
for (const r of REVISIONES) {
    const copia = structuredClone(SECCIONES);
    for (const s of r.sin) {
        if (s === "keywords") copia.keywords = { rules: [] };
        else copia[s] = { ...copia[s], steps: [] };
    }
    await db.agentPromptRevision.create({
        data: {
            promptId: prompt.id,
            revisionNumber: r.numero,
            sectionsSnapshot: copia,
            promptTextSnapshot: "",
            publishedBy: dueno.id,
            publishedAt: new Date(ahora - r.hace * DIA),
            notes: r.notas,
        },
    });
}

/* ── Las cotizaciones: encendidas, con sus condiciones ────────────────── */
await db.$executeRaw`
    CREATE TABLE IF NOT EXISTS "cotizacion_ia_ajustes" (
        "cuentaId"         TEXT PRIMARY KEY,
        "activa"           BOOLEAN NOT NULL DEFAULT false,
        "instrucciones"    TEXT NOT NULL DEFAULT '',
        "actualizadoEn"    TIMESTAMPTZ NOT NULL DEFAULT now(),
        "actualizadoPorId" TEXT
    )
`;
const CONDICIONES = "Precios con IVA incluido. Válida por 8 días. Envío gratis en Medellín por compras desde $80.000; al resto del país, según la transportadora. Pago por transferencia o Nequi.";
await db.$executeRaw`
    INSERT INTO "cotizacion_ia_ajustes" ("cuentaId", "activa", "instrucciones", "actualizadoPorId")
    VALUES (${dueno.id}, true, ${CONDICIONES}, ${dueno.id})
    ON CONFLICT ("cuentaId") DO UPDATE SET "activa" = true, "instrucciones" = ${CONDICIONES}
`;

/*
 * Las CONVERSACIONES, para las métricas: unas con el agente, otras con un
 * asesor, y leads en varios estados. Con cero, el panel de métricas sale en
 * blanco y no enseña nada.
 */
await db.instancia.deleteMany({ where: { userId: dueno.id } });
await db.instancia.create({
    data: { instanceName: "VENTAS", displayName: "Ventas", instanceId: "inst-guia-ventas", userId: dueno.id, instanceType: "waha" },
});
const asesora = await db.user.findFirst({ where: { ownerId: dueno.id } });
await db.session.deleteMany({ where: { userId: dueno.id } });
const ESTADOS = ["CALIENTE", "CALIENTE", "TIBIO", "TIBIO", "TIBIO", "FRIO", "FRIO", "FINALIZADO", "FINALIZADO", "DESCARTADO", null, null];
const NOMBRES = [
    "María Fernanda López",
    "Juan Pablo Restrepo",
    "Camila Andrade",
    "Andrés Gómez",
    "Valentina Castro",
    "Óptica Visión",
    "Ferretería Central",
    "Distribuidora El Sol",
    "Laura Ramírez",
    "Carlos Mejía",
    "Natalia Ospina",
    "Santiago Vélez",
];
for (const [i, nombre] of NOMBRES.entries()) {
    const numero = `57300${String(4521876 + i * 7919).padStart(7, "0")}`;
    await db.session.create({
        data: {
            userId: dueno.id,
            remoteJid: `${numero}@s.whatsapp.net`,
            pushName: nombre,
            instanceId: "VENTAS",
            status: true,
            leadStatus: ESTADOS[i],
            agentDisabled: i % 4 === 3,
            assignedAdvisorId: i % 3 === 0 && asesora ? asesora.id : null,
            createdAt: new Date(ahora - (i + 1) * 3_600_000),
            updatedAt: new Date(ahora - (i + 1) * 3_600_000),
        },
    });
}

console.log(
    JSON.stringify({
        pasos: SECCIONES.training.steps.length,
        preguntas: SECCIONES.faq.steps.length,
        productos: SECCIONES.products.steps.length,
        reglas: SECCIONES.keywords.rules.length,
        versiones: REVISIONES.length,
        conversaciones: NOMBRES.length,
        modulos: MENU_DE_UN_CLIENTE.length,
    }),
);
await db.$disconnect();
