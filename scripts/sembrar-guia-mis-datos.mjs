/**
 * Los DATOS DE EJEMPLO de las capturas de la guía de Mis datos, encima de
 * `sembrar-barra.mjs` (que pone la cuenta y su equipo).
 *
 * Nombres inventados, pero con la forma de una cuenta que de verdad usa la
 * pantalla:
 *
 * - **Datos importados de Google Sheets**: clientes con su plan, su saldo y su
 *   vencimiento, y unas referencias de catálogo con su SKU. Son MÁS de 200 a
 *   propósito (`REGISTROS_POR_PAGINA`): así la tabla enseña «Cargar más» y el
 *   pie dice «200 de N», que es lo que la guía explica. Con diez filas no se
 *   vería nada de eso.
 * - **Bloques de la base de conocimiento**: horarios, pagos, envíos, garantía,
 *   planes y preguntas frecuentes, con sus categorías y uno APAGADO, para que
 *   la lista enseñe el interruptor en los dos lados y la etiqueta «Inactivo».
 *
 * Las hojas de Google que la guía importa no se siembran aquí: las sirve
 * `servidor-guia-mis-datos.cjs`, que responde en lugar de docs.google.com
 * dentro de `next start` (este equipo no sale a internet).
 *
 * El marco —cuenta de cliente, su menú, «Ver tutoriales» y «Soporte»— es el de
 * todas las guías (`sembrar-marco-de-la-guia.mjs`).
 *
 * Se puede correr las veces que haga falta: borra lo suyo y lo vuelve a
 * poner. El script de capturas lo vuelve a correr antes del vídeo, porque las
 * capturas importan, crean y borran, y el vídeo tiene que salir del mismo
 * punto de partida.
 */
import { PrismaClient } from "@prisma/client";
import { sembrarElMarco } from "./sembrar-marco-de-la-guia.mjs";

const db = new PrismaClient();

const dueno = await sembrarElMarco(db, {
    path: "/my-data",
    title: "Guía de Mis datos",
    description: "Aprende a darle a tu agente IA los datos de tu negocio en la plataforma",
    url: "/guia/mis-datos",
});

await db.externalClientData.deleteMany({ where: { userId: dueno.id } });
await db.knowledgeBlock.deleteMany({ where: { userId: dueno.id } });

/* ── Datos importados ─────────────────────────────────────────────────────── */

const NOMBRES = [
    "María Fernanda López", "Juan Pablo Restrepo", "Camila Andrade", "Andrés Gómez", "Valentina Castro",
    "Santiago Herrera", "Daniela Ríos", "Felipe Moreno", "Laura Jiménez", "Sebastián Torres",
    "Natalia Vargas", "Mateo Rojas", "Isabella Cárdenas", "Tomás Ortiz", "Mariana Silva",
    "Alejandro Pineda", "Sara Molina", "Nicolás Duarte", "Gabriela Suárez", "David Castaño",
];
const PLANES = ["Básico", "Plus", "Premium"];
const CIUDADES = ["Bogotá", "Medellín", "Cali", "Barranquilla", "Bucaramanga", "Pereira"];
const TOTAL_DE_CLIENTES = 228;
const ahora = Date.now();

const filas = [];
for (let i = 0; i < TOTAL_DE_CLIENTES; i++) {
    const nombre = NOMBRES[i % NOMBRES.length];
    const numero = `57300${String(4521876 + i * 137).padStart(7, "0")}`;
    const vence = new Date(ahora + ((i % 45) - 10) * 86_400_000);
    filas.push({
        userId: dueno.id,
        // Como lo guarda la plataforma: el número en su forma de WhatsApp. La
        // tabla enseña solo el número (`laClaveQueSeLee`).
        remoteJid: `${numero}@s.whatsapp.net`,
        source: i % 17 === 0 ? "manual" : "google_sheets",
        data: {
            NOMBRE: nombre,
            PLAN: PLANES[i % PLANES.length],
            SALDO: `$${(((i * 37) % 9) * 25_000).toLocaleString("es-CO")}`,
            VENCE: vence.toISOString().slice(0, 10),
            CIUDAD: CIUDADES[i % CIUDADES.length],
        },
        // El orden de la tabla es el de actualización: los primeros de la hoja,
        // arriba.
        updatedAt: new Date(ahora - i * 60_000),
        createdAt: new Date(ahora - i * 60_000),
    });
}

// Un puñado de referencias de catálogo: su clave es el SKU, no un teléfono.
const CATALOGO = [
    ["SKU-001", "Kit de limpieza facial", "$89.000", "24"],
    ["SKU-002", "Crema hidratante 50 ml", "$54.000", "61"],
    ["SKU-003", "Protector solar FPS 50", "$72.000", "38"],
    ["SKU-004", "Sérum vitamina C", "$96.000", "17"],
    ["SKU-005", "Tónico equilibrante", "$48.000", "42"],
    ["SKU-006", "Mascarilla de arcilla", "$39.000", "55"],
    ["SKU-007", "Contorno de ojos", "$68.000", "20"],
    ["SKU-008", "Exfoliante suave", "$45.000", "33"],
];
for (const [i, [sku, producto, precio, stock]] of CATALOGO.entries()) {
    filas.push({
        userId: dueno.id,
        remoteJid: sku,
        source: "google_sheets",
        data: { SKU: sku, PRODUCTO: producto, PRECIO: precio, STOCK: stock },
        updatedAt: new Date(ahora - (TOTAL_DE_CLIENTES + i) * 60_000),
        createdAt: new Date(ahora - (TOTAL_DE_CLIENTES + i) * 60_000),
    });
}
await db.externalClientData.createMany({ data: filas });

/* ── Base de conocimiento ────────────────────────────────────────────────── */

const BLOQUES = [
    {
        title: "Horarios de atención",
        category: "Servicios",
        keywords: ["horario", "atención", "abierto", "sábado", "domingo"],
        content:
            "Atendemos de lunes a viernes de 8:00 a. m. a 6:00 p. m. y los sábados de 9:00 a. m. a 1:00 p. m. " +
            "Los domingos y festivos respondemos por WhatsApp a partir del lunes.",
    },
    {
        title: "Métodos de pago",
        category: "Pagos",
        keywords: ["pago", "tarjeta", "transferencia", "nequi", "efectivo"],
        content:
            "Aceptamos tarjeta débito y crédito, transferencia bancaria, Nequi y efectivo contra entrega en Bogotá. " +
            "Al transferir, envía el comprobante por este chat.",
    },
    {
        title: "Envíos y entregas",
        category: "Envíos",
        keywords: ["envío", "entrega", "domicilio", "ciudad", "días"],
        content:
            "Enviamos a todo el país. En Bogotá entregamos en 24 horas; al resto de ciudades, entre 2 y 4 días hábiles. " +
            "El envío es gratis en compras desde $150.000.",
    },
    {
        title: "Garantía y devoluciones",
        category: "Políticas",
        keywords: ["garantía", "devolución", "cambio", "reembolso"],
        content:
            "Tienes 30 días para cambiar un producto sin abrir. Si llegó en mal estado, lo reponemos sin costo: " +
            "envía una foto por este chat.",
    },
    {
        title: "Plan Básico",
        category: "Planes",
        keywords: ["plan", "básico", "precio", "mensual"],
        content: "Plan Básico: $49.000 al mes. Incluye un kit mensual y asesoría por WhatsApp.",
    },
    {
        title: "Plan Premium",
        category: "Planes",
        keywords: ["plan", "premium", "precio", "mensual", "descuento"],
        content: "Plan Premium: $129.000 al mes. Incluye dos kits, envío gratis y 15 % de descuento en todo el catálogo.",
    },
    {
        title: "Cómo usar el sérum de vitamina C",
        category: "FAQs",
        keywords: ["sérum", "vitamina", "usar", "mañana", "noche"],
        content:
            "Aplica tres gotas en la mañana sobre la piel limpia, antes de la crema hidratante y del protector solar.",
    },
    {
        title: "Promoción de temporada",
        category: "Promociones",
        keywords: ["promoción", "descuento", "temporada"],
        content: "Hasta el 31 de diciembre: 20 % de descuento en kits de regalo.",
        isActive: false,
    },
];
for (const [i, b] of BLOQUES.entries()) {
    await db.knowledgeBlock.create({
        data: { userId: dueno.id, sortOrder: i, isActive: b.isActive ?? true, embedding: [], ...b },
    });
}

console.log(`Mis datos: ${filas.length} registros importados y ${BLOQUES.length} bloques de conocimiento.`);
await db.$disconnect();
