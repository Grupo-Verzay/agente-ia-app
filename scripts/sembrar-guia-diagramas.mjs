/**
 * Los DATOS DE EJEMPLO de las capturas de la guía de Diagramas, encima de
 * `sembrar-barra.mjs`.
 *
 * El marco —la cuenta de un CLIENTE, su menú y la barra de arriba con «Ver
 * tutoriales» y «Soporte»— es el MISMO en todas las guías
 * (`sembrar-marco-de-la-guia.mjs`): aquí solo se dice qué pantalla documenta,
 * y se añade lo de Diagramas:
 *
 * - seis diagramas de la cuenta, con la forma de una cuenta de verdad: uno
 *   grande que enseña los tipos de paso (la Decisión con sus tres salidas, el
 *   paso Libre con icono y con texto, una nota Idea), dos dentro de la carpeta
 *   «Ventas», uno en «Soporte», dos sueltos —así sale el chip «Sin carpeta»—,
 *   uno de solo lectura para el equipo y otro privado;
 * - dos que COMPARTE otra cuenta, «Agencia Aliada»: uno de solo lectura y
 *   otro editable, que es lo que enseñan las marcas «Compartido contigo» y
 *   «Compartido · editable».
 *
 * Las tablas (`flows`, `flow_shares`, `work_folders`, `work_folder_items`) las
 * crea la propia App la primera vez que se usan. Se crean aquí con la MISMA
 * definición (copiada de `actions/flow-actions.ts` y
 * `actions/carpetas-actions.ts`): con otra, la App encontraría una tabla que
 * no es la suya.
 */
import { PrismaClient } from "@prisma/client";
import { sembrarElMarco } from "./sembrar-marco-de-la-guia.mjs";

const db = new PrismaClient();
// El tutorial de `/diagramas` va en el marco: sin él la barra de arriba
// perdería su botón «Ver tutoriales» justo en esta pantalla.
const dueno = await sembrarElMarco(db, {
    path: "/diagramas",
    title: "Guía de Diagramas",
    description: "Aprende a crear y gestionar tus diagramas de flujo en la plataforma",
    url: "/guia/diagramas",
});

/* ------------------------------------------------------------------ */
/* Las tablas, con la definición de la App                             */
/* ------------------------------------------------------------------ */

await db.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "flows" (
        "id" TEXT PRIMARY KEY,
        "userId" TEXT NOT NULL,
        "name" TEXT NOT NULL,
        "description" TEXT,
        "nodes" JSONB NOT NULL DEFAULT '[]',
        "edges" JSONB NOT NULL DEFAULT '[]',
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT NOW(),
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT NOW()
    )`);
await db.$executeRawUnsafe(`ALTER TABLE "flows" ADD COLUMN IF NOT EXISTS "promptId" TEXT`);
await db.$executeRawUnsafe(`ALTER TABLE "flows" ADD COLUMN IF NOT EXISTS "createdById" TEXT`);
await db.$executeRawUnsafe(`ALTER TABLE "flows" ADD COLUMN IF NOT EXISTS "visibility" TEXT NOT NULL DEFAULT 'edicion'`);
// `prisma db push` crea `flows` desde el esquema, y un `@updatedAt` no deja
// default en la base: en producción la tabla la creó la App con
// `DEFAULT NOW()`, y crear un diagrama cuenta con él (no escribe la fecha).
await db.$executeRawUnsafe(`ALTER TABLE "flows" ALTER COLUMN "updatedAt" SET DEFAULT NOW()`);
await db.$executeRawUnsafe(`ALTER TABLE "flows" ALTER COLUMN "createdAt" SET DEFAULT NOW()`);
await db.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "flows_user_name_unique" ON "flows" ("userId", "name")`);
await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "flows_prompt_idx" ON "flows" ("userId", "promptId")`);
await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "flows_user_updated_idx" ON "flows" ("userId", "updatedAt" DESC)`);
await db.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "flow_shares" (
        "id" TEXT PRIMARY KEY,
        "flowId" TEXT NOT NULL,
        "accountUserId" TEXT NOT NULL,
        "sharedById" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT NOW()
    )`);
await db.$executeRawUnsafe(`ALTER TABLE "flow_shares" ADD COLUMN IF NOT EXISTS "permiso" TEXT NOT NULL DEFAULT 'lectura'`);
await db.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "flow_shares_flow_account_unique" ON "flow_shares" ("flowId", "accountUserId")`);
await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "flow_shares_account_idx" ON "flow_shares" ("accountUserId")`);
await db.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "work_folders" (
        "id" TEXT PRIMARY KEY,
        "ownerId" TEXT NOT NULL,
        "tipo" TEXT NOT NULL,
        "nombre" TEXT NOT NULL,
        "color" TEXT,
        "orden" INTEGER NOT NULL DEFAULT 0,
        "createdById" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT NOW()
    )`);
await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "work_folders_owner_tipo_idx" ON "work_folders" ("ownerId", "tipo", "orden")`);
await db.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "work_folder_items" (
        "ownerId" TEXT NOT NULL,
        "tipo" TEXT NOT NULL,
        "itemId" TEXT NOT NULL,
        "folderId" TEXT NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT NOW(),
        PRIMARY KEY ("ownerId", "tipo", "itemId")
    )`);
await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "work_folder_items_folder_idx" ON "work_folder_items" ("folderId")`);

/* ------------------------------------------------------------------ */
/* La cuenta que comparte, y otra más para la ventana de compartir     */
/* ------------------------------------------------------------------ */

const agencia = await db.user.upsert({
    where: { email: "agencia@guia.test" },
    update: { name: "Agencia Aliada", company: "Agencia Aliada" },
    create: { email: "agencia@guia.test", name: "Agencia Aliada", role: "user", status: true, company: "Agencia Aliada" },
});
await db.user.upsert({
    where: { email: "clinica@guia.test" },
    update: { name: "Clínica Sonrisa", company: "Clínica Sonrisa" },
    create: { email: "clinica@guia.test", name: "Clínica Sonrisa", role: "user", status: true, company: "Clínica Sonrisa" },
});

/* ------------------------------------------------------------------ */
/* Los diagramas                                                        */
/* ------------------------------------------------------------------ */

const paso = (id, tipo, label, content, x, y, extra = {}) => ({ id, tipo, label, content, posX: x, posY: y, size: "md", ...extra });
const linea = (de, a, sourceHandle = "out") => ({ id: `e_${de}_${a}`, sourceId: de, targetId: a, sourceHandle, targetHandle: "in" });

/**
 * Pasos en fila, cada uno unido al siguiente. Los carriles son de 120 y las
 * columnas de 160: la misma rejilla que dibuja el editor al añadir un paso.
 */
function enFila(prefijo, pasos) {
    const nodes = pasos.map(([tipo, label, content], i) => paso(`${prefijo}_${i}`, tipo, label, content, i * 160, 120));
    const edges = nodes.slice(1).map((n, i) => linea(nodes[i].id, n.id));
    return { nodes, edges };
}

/**
 * El diagrama grande: el que se abre en la sección del editor y el de la Idea
 * y el Libre. Tiene de todo lo que la guía explica —la Decisión con sus tres
 * salidas, dos pasos Libres (con icono y con texto), una nota Idea y un Fin—
 * sin ser un revoltijo: se lee de izquierda a derecha.
 */
const ESCAPARATE = (() => {
    const nodes = [
        paso("a_inicio", "inicio", "Llega un mensaje", "El cliente escribe por WhatsApp", 0, 120),
        paso("a_menu", "menu", "Bienvenida", "Ventas, soporte o agendar una cita", 160, 120),
        paso("a_decision", "intention", "¿Qué necesita?", "Según lo que elija en el menú", 320, 120),
        paso("a_cotizacion", "cotizacion", "Cotización", "Precio del plan que pidió", 560, 0),
        paso("a_cita", "cita", "Agendar visita", "Elige día y hora en la agenda", 560, 120),
        paso("a_escalar", "escalar", "Pasar a soporte", "Un asesor lo atiende por chat", 560, 240),
        paso("a_pago", "pago", "Link de pago", "Paga en línea con tarjeta", 720, 0),
        paso("a_notificar", "notificacion", "Aviso al equipo", "Lo recibe el asesor", 720, 120),
        paso("a_vip", "libre", "Cliente VIP", "Lo atiende el líder del equipo", 720, 240, {
            modo: "texto",
            dentro: "VIP",
            color: "#8b5cf6",
            largo: 150,
            icono: "estrella",
        }),
        paso("a_envio", "libre", "Envío", "Sale al día siguiente", 880, 0, {
            modo: "icono",
            icono: "camion",
            color: "#059669",
            largo: 160,
        }),
        paso("a_fin", "fin", "Fin", "Conversación resuelta", 1060, 120),
        paso("a_idea", "idea", "Idea", "💡 Revisar con el equipo: ¿atendemos **fines de semana**?", 0, 370, {
            color: "#fef3c7",
            ancho: 250,
            alto: 84,
        }),
    ];
    const edges = [
        linea("a_inicio", "a_menu"),
        linea("a_menu", "a_decision"),
        linea("a_decision", "a_cotizacion", "yes"),
        linea("a_decision", "a_cita", "variante"),
        linea("a_decision", "a_escalar", "no"),
        linea("a_cotizacion", "a_pago"),
        linea("a_pago", "a_envio"),
        linea("a_envio", "a_fin"),
        linea("a_cita", "a_notificar"),
        linea("a_notificar", "a_fin"),
        linea("a_escalar", "a_vip"),
        linea("a_vip", "a_fin"),
    ];
    return { nodes, edges };
})();

const DIAGRAMAS = [
    {
        id: "guia_atencion",
        nombre: "Atención al cliente",
        horas: 1,
        carpeta: "Ventas",
        visibilidad: "edicion",
        ...ESCAPARATE,
    },
    {
        id: "guia_ventas",
        nombre: "Proceso de ventas",
        horas: 5,
        carpeta: "Ventas",
        visibilidad: "edicion",
        ...enFila("v", [
            ["inicio", "Pide información", "Llega por un anuncio"],
            ["solicitud", "Tomar datos", "Nombre, ciudad y qué busca"],
            ["cotizacion", "Cotización", "Se la mandamos en PDF"],
            ["node_pause", "Esperar respuesta", "Hasta dos días"],
            ["pago", "Link de pago", "Paga en línea"],
            ["fin", "Venta cerrada", ""],
        ]),
    },
    {
        id: "guia_soporte",
        nombre: "Soporte postventa",
        horas: 26,
        carpeta: "Soporte",
        visibilidad: "edicion",
        ...enFila("s", [
            ["inicio", "Reporta un problema", "Escribe al número de soporte"],
            ["sheets_read", "Buscar su pedido", "En la hoja de pedidos"],
            ["escalar", "Pasar a un técnico", "Lo atiende por chat"],
            ["seguimiento", "Seguimiento", "A los tres días"],
            ["fin", "Caso cerrado", ""],
        ]),
    },
    {
        id: "guia_cobro",
        nombre: "Cobro de mensualidad",
        horas: 50,
        carpeta: null,
        visibilidad: "lectura",
        ...enFila("c", [
            ["inicio", "Vence la mensualidad", ""],
            ["pago", "Enviar el cobro", "Con el link de pago"],
            ["node_pause", "Esperar el pago", "Hasta cinco días"],
            ["notificacion", "Avisar al equipo", "Si no pagó"],
            ["fin", "Cobro cerrado", ""],
        ]),
    },
    {
        id: "guia_citas",
        nombre: "Reserva de citas",
        horas: 74,
        carpeta: null,
        visibilidad: "edicion",
        ...enFila("r", [
            ["inicio", "Quiere una cita", ""],
            ["cita", "Agendar la cita", "Elige día y hora"],
            ["seguimiento", "Recordatorio", "Un día antes"],
            ["fin", "Cita confirmada", ""],
        ]),
    },
    {
        id: "guia_campana",
        nombre: "Borrador de campaña",
        horas: 120,
        carpeta: null,
        visibilidad: "privado",
        ...enFila("b", [
            ["inicio", "Lista de clientes", ""],
            ["campana", "Promoción de temporada", "20 % en el segundo producto"],
            ["cta", "Invitar a comprar", "Con el botón del catálogo"],
        ]),
    },
];

/** Los que comparte la otra cuenta: uno de solo lectura y otro editable. */
const COMPARTIDOS = [
    {
        id: "guia_agencia_embudo",
        nombre: "Embudo aliado",
        horas: 2,
        permiso: "lectura",
        ...enFila("g", [
            ["inicio", "Prospecto nuevo", "Desde la campaña de la agencia"],
            ["menu", "Qué le interesa", "Diseño, pauta o redes"],
            ["solicitud", "Tomar sus datos", ""],
            ["notificacion", "Avisar al equipo", ""],
            ["fin", "Prospecto listo", ""],
        ]),
    },
    {
        id: "guia_agencia_guion",
        nombre: "Guion de llamadas",
        horas: 30,
        permiso: "edicion",
        ...enFila("l", [
            ["inicio", "Llamada de bienvenida", ""],
            ["paso", "Presentarse", "Quiénes somos en una frase"],
            ["cta", "Invitar a la reunión", ""],
            ["fin", "Reunión agendada", ""],
        ]),
    },
];

// Lo de una vuelta anterior (y lo que las capturas hayan creado) se va entero.
const ids = [...DIAGRAMAS, ...COMPARTIDOS].map((d) => d.id);
await db.$executeRawUnsafe(`DELETE FROM "flow_shares" WHERE "flowId" IN (SELECT "id" FROM "flows" WHERE "userId" IN ($1, $2))`, dueno.id, agencia.id);
await db.$executeRawUnsafe(`DELETE FROM "flows" WHERE "userId" IN ($1, $2)`, dueno.id, agencia.id);
await db.$executeRawUnsafe(`DELETE FROM "work_folder_items" WHERE "ownerId" = $1`, dueno.id);
await db.$executeRawUnsafe(`DELETE FROM "work_folders" WHERE "ownerId" = $1`, dueno.id);
await db.$executeRawUnsafe(`DELETE FROM "work_item_order" WHERE "ownerId" = $1`, dueno.id).catch(() => {});

const ahora = Date.now();
async function guardarElDiagrama(d, cuenta, visibilidad) {
    const cuando = new Date(ahora - d.horas * 3_600_000);
    await db.$executeRawUnsafe(
        `INSERT INTO "flows" ("id", "userId", "name", "nodes", "edges", "createdById", "visibility", "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6, $7, $8, $8)`,
        d.id,
        cuenta,
        d.nombre,
        JSON.stringify(d.nodes),
        JSON.stringify(d.edges),
        cuenta,
        visibilidad,
        cuando,
    );
}

for (const d of DIAGRAMAS) await guardarElDiagrama(d, dueno.id, d.visibilidad);
for (const d of COMPARTIDOS) {
    await guardarElDiagrama(d, agencia.id, "edicion");
    await db.$executeRawUnsafe(
        `INSERT INTO "flow_shares" ("id", "flowId", "accountUserId", "sharedById", "permiso") VALUES ($1, $2, $3, $4, $5)`,
        `share_${d.id}`,
        d.id,
        dueno.id,
        agencia.id,
        d.permiso,
    );
}

const CARPETAS = ["Ventas", "Soporte"];
const carpeta = {};
for (const [i, nombre] of CARPETAS.entries()) {
    const id = `carpeta_guia_${i}`;
    await db.$executeRawUnsafe(
        `INSERT INTO "work_folders" ("id", "ownerId", "tipo", "nombre", "orden", "createdById") VALUES ($1, $2, 'diagrama', $3, $4, $2)`,
        id,
        dueno.id,
        nombre,
        i,
    );
    carpeta[nombre] = id;
}
for (const d of DIAGRAMAS) {
    if (!d.carpeta) continue;
    await db.$executeRawUnsafe(
        `INSERT INTO "work_folder_items" ("ownerId", "tipo", "itemId", "folderId") VALUES ($1, 'diagrama', $2, $3)`,
        dueno.id,
        d.id,
        carpeta[d.carpeta],
    );
}

console.log(JSON.stringify({ diagramas: DIAGRAMAS.length, compartidos: COMPARTIDOS.length, carpetas: CARPETAS.length, ids: ids.length }));
await db.$disconnect();
